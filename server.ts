import express from "express";
import path from "node:path";
import { createServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { Server, type Socket } from "socket.io";
import {
  createRoomStore,
  type HarmonyMessage,
  type HarmonyUser,
  type RoomStore,
} from "./lib/room-store.js";

const PORT = 3000;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const SAFE_COLOR = "#F4B07A";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const PIANO_NOTE = /^[A-G](?:#|b)?[0-8]$/;

function normalizedOrigin(value?: string) {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).origin;
  } catch {
    return null;
  }
}

function createOriginGuard() {
  const allowedOrigins = new Set(
    [
      process.env.APP_URL,
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ]
      .map(normalizedOrigin)
      .filter((origin): origin is string => Boolean(origin)),
  );

  return (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => {
    if (!origin) return callback(null, true);
    if (!process.env.VERCEL && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by Harmony."));
  };
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function username(value: unknown) {
  return text(value, 24) || "Sunset Guest";
}

function playerColor(value: unknown) {
  const candidate = text(value, 7);
  return HEX_COLOR.test(candidate) ? candidate : SAFE_COLOR;
}

function accessCode(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

function validRoomId(value: unknown) {
  const candidate = text(value, 64);
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate) ? candidate : "";
}

function validNote(value: unknown) {
  const candidate = text(value, 4);
  return PIANO_NOTE.test(candidate) ? candidate : "";
}

function consumeRateLimit(socket: Socket, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const buckets = (socket.data.rateLimits ??= {}) as Record<string, { count: number; resetAt: number }>;
  const bucket = buckets[key];
  if (!bucket || bucket.resetAt <= now) {
    buckets[key] = { count: 1, resetAt: now + windowMs };
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

async function configureStore(io: Server): Promise<{ store: RoomStore; storage: "redis" | "memory" }> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    if (process.env.VERCEL) {
      throw new Error("REDIS_URL is required for Harmony rooms on Vercel.");
    }
    console.warn("REDIS_URL is not set; using local in-memory room storage.");
    return { store: await createRoomStore(), storage: "memory" };
  }

  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  pubClient.on("error", (error) => console.error("Redis publisher error", error));
  subClient.on("error", (error) => console.error("Redis subscriber error", error));
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  return { store: await createRoomStore(pubClient), storage: "redis" };
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    path: "/api/socket",
    transports: ["websocket"],
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    perMessageDeflate: false,
    cors: {
      origin: createOriginGuard(),
      methods: ["GET", "POST"],
    },
  });
  const { store, storage } = await configureStore(io);

  async function connectedUsers(roomId?: string) {
    const sockets = roomId ? await io.in(roomId).fetchSockets() : await io.fetchSockets();
    return sockets.flatMap((connectedSocket) => {
      const user = connectedSocket.data.user as HarmonyUser | undefined;
      const joinedRoomId = connectedSocket.data.roomId as string | undefined;
      if (!user || !joinedRoomId || (roomId && joinedRoomId !== roomId)) return [];
      return [{ roomId: joinedRoomId, user }];
    });
  }

  async function roomList() {
    const users = await connectedUsers();
    const activeRoomIds = new Set(users.map(({ roomId }) => roomId));
    await store.pruneInactiveRooms(activeRoomIds, Date.now() - ROOM_TTL_MS);
    const rooms = await store.listRooms();
    return rooms.map(({ accessCode: _accessCode, isDefault: _isDefault, createdAt: _createdAt, ...room }) => ({
      ...room,
      users: users.filter(({ roomId }) => roomId === room.id).map(({ user }) => user),
    }));
  }

  async function publishRooms() {
    io.emit("rooms:list", await roomList());
  }

  async function publishUsers(roomId: string) {
    const users = await connectedUsers(roomId);
    io.to(roomId).emit("room:users", users.map(({ user }) => user));
  }

  function reportSocketError(socket: Socket, action: string, error: unknown) {
    console.error(`Socket action failed: ${action}`, error);
    socket.emit("server:error", "Harmony hit a temporary connection problem. Please try again.");
  }

  io.on("connection", (socket) => {
    void roomList()
      .then((rooms) => socket.emit("rooms:list", rooms))
      .catch((error) => reportSocketError(socket, "rooms:list", error));

    socket.on("room:join", (payload = {}) => {
      void (async () => {
        if (!consumeRateLimit(socket, "room:join", 20, 60_000)) {
          socket.emit("room:error", "Too many room attempts. Pause for a moment and try again.");
          return;
        }

        const previousRoomId = socket.data.roomId as string | undefined;
        const previousUser = socket.data.user as HarmonyUser | undefined;
        if (payload.roomId === "lobby") {
          if (previousRoomId) {
            await socket.leave(previousRoomId);
            if (previousUser) io.to(previousRoomId).emit("user:left", { username: previousUser.username });
            socket.data.roomId = undefined;
            socket.data.user = undefined;
            await publishUsers(previousRoomId);
          }
          await publishRooms();
          return;
        }

        const roomId = validRoomId(payload.roomId);
        const room = roomId ? await store.getRoom(roomId) : null;
        if (!room) {
          socket.emit("room:error", "That room no longer exists.");
          return;
        }
        if (room.isPrivate && room.accessCode !== accessCode(payload.accessCode)) {
          socket.emit("room:error", "That room code is not quite right.");
          return;
        }

        if (previousRoomId && previousRoomId !== roomId) {
          await socket.leave(previousRoomId);
          if (previousUser) io.to(previousRoomId).emit("user:left", { username: previousUser.username });
          await publishUsers(previousRoomId);
        }

        const user = { username: username(payload.username), color: playerColor(payload.color) };
        socket.data.roomId = roomId;
        socket.data.user = user;
        await socket.join(roomId);
        await publishUsers(roomId);
        socket.to(roomId).emit("user:joined", user);
        await publishRooms();
        socket.emit("room:joined", { roomId, accessCode: room.accessCode });
        socket.emit("chat:history", await store.getMessages(roomId));
      })().catch((error) => reportSocketError(socket, "room:join", error));
    });

    socket.on("room:create", (payload = {}) => {
      void (async () => {
        if (!consumeRateLimit(socket, "room:create", 5, 60_000)) {
          socket.emit("room:error", "Please wait before creating another room.");
          return;
        }

        const name = text(payload.name, 40);
        if (name.length < 2) {
          socket.emit("room:error", "Room names need at least two characters.");
          return;
        }
        const isPrivate = payload.isPrivate === true;
        const requestedCode = accessCode(payload.accessCode);
        const safeCode = isPrivate && requestedCode.length >= 4
          ? requestedCode
          : isPrivate
            ? String(Math.floor(100000 + Math.random() * 900000))
            : undefined;
        const room = await store.createRoom({ name, isPrivate, accessCode: safeCode });
        await publishRooms();
        socket.emit("room:created", { roomId: room.id, accessCode: safeCode });
      })().catch((error) => {
        socket.emit("room:error", error instanceof Error ? error.message : "Could not create that room.");
      });
    });

    socket.on("piano:note_on", (payload = {}) => {
      if (!consumeRateLimit(socket, "piano", 240, 10_000)) return;
      const roomId = socket.data.roomId as string | undefined;
      const user = socket.data.user as HarmonyUser | undefined;
      const note = validNote(payload.note);
      if (!roomId || !user || payload.roomId !== roomId || !note || !socket.rooms.has(roomId)) return;

      const velocity = Math.max(0, Math.min(1, Number(payload.velocity) || 0.85));
      socket.to(roomId).emit("piano:note_on", { note, velocity, ...user, socketId: socket.id });
      io.emit("global:note_played", { roomId, note, color: user.color });
      void store.incrementNotes(roomId).catch((error) => console.error("Could not increment note count", error));
    });

    socket.on("piano:note_off", (payload = {}) => {
      if (!consumeRateLimit(socket, "piano", 240, 10_000)) return;
      const roomId = socket.data.roomId as string | undefined;
      const note = validNote(payload.note);
      if (!roomId || payload.roomId !== roomId || !note || !socket.rooms.has(roomId)) return;
      socket.to(roomId).emit("piano:note_off", { note, socketId: socket.id });
    });

    socket.on("chat:send", (payload = {}) => {
      void (async () => {
        if (!consumeRateLimit(socket, "chat", 12, 10_000)) {
          socket.emit("chat:error", "You are sending messages too quickly.");
          return;
        }
        const roomId = socket.data.roomId as string | undefined;
        const user = socket.data.user as HarmonyUser | undefined;
        const safeText = text(payload.text, 280);
        if (!roomId || payload.roomId !== roomId || !user || !safeText || !socket.rooms.has(roomId)) return;

        const message: HarmonyMessage = {
          id: `${socket.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          roomId,
          ...user,
          text: safeText,
          createdAt: Date.now(),
        };
        await store.addMessage(roomId, message);
        io.to(roomId).emit("chat:message", message);
      })().catch((error) => reportSocketError(socket, "chat:send", error));
    });

    socket.on("disconnect", () => {
      const roomId = socket.data.roomId as string | undefined;
      const user = socket.data.user as HarmonyUser | undefined;
      if (!roomId) return;
      if (user) io.to(roomId).emit("user:left", { username: user.username });
      void publishUsers(roomId).catch((error) => console.error("Could not publish room users", error));
      void publishRooms().catch((error) => console.error("Could not publish rooms", error));
    });
  });

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", service: "harmony", storage });
  });

  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.use((_request, response) => response.sendFile(path.join(distPath, "index.html")));
    }

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Harmony running on http://localhost:${PORT}`);
    });
  }

  return server;
}

const harmonyServer = await startServer();
export default harmonyServer;
