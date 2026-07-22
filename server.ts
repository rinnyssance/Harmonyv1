import express from "express";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    path: "/api/socket",
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // room structure: { [roomId: string]: { id: string, name: string, users: { [socketId: string]: { username: string, color: string } } } }
  const rooms: {
    [roomId: string]: {
      id: string;
      name: string;
      users: {
        [socketId: string]: {
          username: string;
          color: string;
        }
      };
      notesCount: number;
      isPrivate: boolean;
      accessCode?: string;
      messages: Array<{
        id: string;
        roomId: string;
        username: string;
        color: string;
        text: string;
        createdAt: number;
      }>;
    }
  } = {
    "sunset-lounge": {
      id: "sunset-lounge",
      name: "Sunset Lounge 🌅",
      users: {},
      notesCount: 0,
      isPrivate: false,
      messages: []
    },
    "lavender-clouds": {
      id: "lavender-clouds",
      name: "Lavender Clouds ☁️",
      users: {},
      notesCount: 0,
      isPrivate: false,
      messages: []
    },
    "golden-hour": {
      id: "golden-hour",
      name: "Golden Hour 🎹",
      users: {},
      notesCount: 0,
      isPrivate: false,
      messages: []
    }
  };

  const roomList = () => Object.values(rooms).map(({ accessCode, messages, ...room }) => room);
  const publishRooms = () => io.emit("rooms:list", roomList());

  io.on("connection", (socket) => {
    // Send initial list of rooms
    socket.emit("rooms:list", roomList());

    socket.on("room:join", ({ roomId, username, color, accessCode }) => {
      if (roomId !== "lobby" && !rooms[roomId]) {
        socket.emit("room:error", "That room no longer exists.");
        return;
      }

      if (roomId !== "lobby" && rooms[roomId].isPrivate && rooms[roomId].accessCode !== accessCode) {
        socket.emit("room:error", "That room code is not quite right.");
        return;
      }

      // Leave previous rooms
      socket.rooms.forEach(r => {
        if (r !== socket.id) {
          socket.leave(r);
          if (rooms[r] && rooms[r].users[socket.id]) {
            delete rooms[r].users[socket.id];
            io.to(r).emit("room:users", Object.values(rooms[r].users));
          }
        }
      });

      if (roomId === "lobby") {
        publishRooms();
        return;
      }

      // Join new room
      socket.join(roomId);
      rooms[roomId].users[socket.id] = { username, color };

      // Broadcast room users and update rooms list for everyone
      io.to(roomId).emit("room:users", Object.values(rooms[roomId].users));
      socket.to(roomId).emit("user:joined", { username, color });
      publishRooms();
      socket.emit("room:joined", { roomId, accessCode: rooms[roomId].accessCode });
      socket.emit("chat:history", rooms[roomId].messages);
    });

    socket.on("room:create", ({ name, isPrivate = false, accessCode }) => {
      const baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "sunset-room";
      let id = baseId;
      let suffix = 2;
      while (rooms[id]) id = `${baseId}-${suffix++}`;
      const safeCode = isPrivate
        ? String(accessCode || Math.floor(1000 + Math.random() * 9000)).replace(/\D/g, "").slice(0, 6)
        : undefined;
      if (!rooms[id]) {
        rooms[id] = {
          id,
          name,
          users: {},
          notesCount: 0,
          isPrivate,
          accessCode: safeCode,
          messages: []
        };
      }
      publishRooms();
      socket.emit("room:created", { roomId: id, accessCode: safeCode });
    });

    socket.on("piano:note_on", ({ roomId, note, velocity, color, username }) => {
      if (rooms[roomId]) {
        rooms[roomId].notesCount++;
      }
      // Broadcast to other users in the room
      socket.to(roomId).emit("piano:note_on", { note, velocity, color, username, socketId: socket.id });
      // Also broadcast as a global pulse for background sky particles
      io.emit("global:note_played", { roomId, note, color });
    });

    socket.on("piano:note_off", ({ roomId, note }) => {
      socket.to(roomId).emit("piano:note_off", { note, socketId: socket.id });
    });

    socket.on("chat:send", ({ roomId, text }) => {
      const room = rooms[roomId];
      const user = room?.users[socket.id];
      const safeText = String(text || "").trim().slice(0, 280);
      if (!room || !user || !socket.rooms.has(roomId) || !safeText) return;

      const message = {
        id: `${socket.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        roomId,
        username: user.username,
        color: user.color,
        text: safeText,
        createdAt: Date.now()
      };
      room.messages.push(message);
      if (room.messages.length > 100) room.messages.shift();
      io.to(roomId).emit("chat:message", message);
    });

    socket.on("disconnect", () => {
      Object.keys(rooms).forEach(roomId => {
        if (rooms[roomId].users[socket.id]) {
          const user = rooms[roomId].users[socket.id];
          delete rooms[roomId].users[socket.id];
          io.to(roomId).emit("room:users", Object.values(rooms[roomId].users));
          socket.to(roomId).emit("user:left", { username: user.username });
        }
      });
      publishRooms();
    });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/rooms", (req, res) => {
    res.json(roomList());
  });

  // Vercel imports and owns the HTTP server lifecycle. Local development and
  // production previews still configure Vite/static serving and listen here.
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.use((req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  return server;
}

const harmonyServer = await startServer();
export default harmonyServer;
