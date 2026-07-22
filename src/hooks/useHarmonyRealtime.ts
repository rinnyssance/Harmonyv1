import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel, User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { ChatMessage, NoteEvent, Room, RoomSession, User } from "../types";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";
export type PendingAction = "create" | "join" | "leave" | "chat" | null;

interface RoomRow {
  id: string;
  name: string;
  is_private: boolean;
  note_count: number;
  active_user_count: number | string;
}

interface SessionRow {
  id: string;
  name: string;
  is_private: boolean;
  host_id: string | null;
  realtime_topic: string;
  creator_access_code: string | null;
}

interface MessageRow {
  id: string;
  room_id: string;
  username: string;
  color: string;
  text: string;
  created_at: string;
}

interface Options {
  currentUser: User;
  onRemoteNoteOn: (event: NoteEvent) => void;
  onRemoteNoteOff: (note: string) => void;
}

const friendlyError = (value: unknown) => {
  const message = value instanceof Error
    ? value.message
    : typeof value === "object" && value !== null && "message" in value
      ? String((value as { message?: unknown }).message || "")
      : String(value || "");
  if (/anonymous sign-ins are disabled/i.test(message)) return "Guest access is not enabled yet. Please try again shortly.";
  if (/fetch|network|websocket|timed out/i.test(message)) return "Harmony could not reach the room service. Check your connection and retry.";
  return message.replace(/^.*?: /, "") || "Something interrupted the room connection.";
};

const toRoom = (row: RoomRow): Room => ({
  id: row.id,
  name: row.name,
  isPrivate: row.is_private,
  notesCount: row.note_count || 0,
  activeUserCount: Number(row.active_user_count || 0),
  users: []
});

const toSession = (row: SessionRow): RoomSession => ({
  id: row.id,
  name: row.name,
  isPrivate: row.is_private,
  hostId: row.host_id,
  realtimeTopic: row.realtime_topic,
  creatorAccessCode: row.creator_access_code || undefined
});

const toMessage = (row: MessageRow): ChatMessage => ({
  id: row.id,
  roomId: row.room_id,
  username: row.username,
  color: row.color,
  text: row.text,
  createdAt: new Date(row.created_at).getTime()
});

export function useHarmonyRealtime({ currentUser, onRemoteNoteOn, onRemoteNoteOff }: Options) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeSession, setActiveSession] = useState<RoomSession | null>(null);
  const [presence, setPresence] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState("");
  const authUserRef = useRef<SupabaseUser | null>(null);
  const lobbyChannelRef = useRef<RealtimeChannel | null>(null);
  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  const sessionRef = useRef<RoomSession | null>(null);
  const accessCodeRef = useRef<string | undefined>(undefined);
  const noteBatchRef = useRef(0);
  const currentUserRef = useRef(currentUser);
  const remoteOnRef = useRef(onRemoteNoteOn);
  const remoteOffRef = useRef(onRemoteNoteOff);
  remoteOnRef.current = onRemoteNoteOn;
  remoteOffRef.current = onRemoteNoteOff;
  currentUserRef.current = currentUser;

  const refreshRooms = useCallback(async () => {
    const { data, error: requestError } = await supabase.rpc("list_rooms");
    if (requestError) throw requestError;
    setRooms(((data || []) as RoomRow[]).map(toRoom));
  }, []);

  const removeRoomChannel = useCallback(async () => {
    const channel = roomChannelRef.current;
    roomChannelRef.current = null;
    if (channel) await supabase.removeChannel(channel);
    setPresence([]);
  }, []);

  const subscribeToRoom = useCallback(async (session: RoomSession) => {
    await removeRoomChannel();
    const user = authUserRef.current;
    if (!user) throw new Error("Guest authentication is not ready.");

    const { data: history, error: historyError } = await supabase
      .from("messages")
      .select("id, room_id, username, color, text, created_at")
      .eq("room_id", session.id)
      .order("created_at", { ascending: true })
      .limit(100);
    if (historyError) throw historyError;
    setMessages(((history || []) as MessageRow[]).map(toMessage));

    const channel = supabase.channel(session.realtimeTopic, {
      config: {
        private: true,
        broadcast: { self: false, ack: true },
        presence: { key: user.id }
      }
    });
    roomChannelRef.current = channel;
    channel
      .on("presence", { event: "sync" }, () => {
        const users = Object.values(channel.presenceState())
          .flat()
          .map((entry) => entry as unknown as User);
        setPresence(users);
      })
      .on("broadcast", { event: "note_on" }, ({ payload }: { payload: unknown }) => remoteOnRef.current(payload as NoteEvent))
      .on("broadcast", { event: "note_off" }, ({ payload }: { payload: { note: unknown } }) => remoteOffRef.current(String(payload.note)))
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `room_id=eq.${session.id}`
      }, ({ new: row }: { new: unknown }) => {
        const message = toMessage(row as MessageRow);
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current.slice(-99), message]);
      });

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("The room channel timed out.")), 12000);
      channel.subscribe(async (status: string, subscribeError?: Error) => {
        if (status === "SUBSCRIBED") {
          window.clearTimeout(timer);
          const tracked = await channel.track({
            username: currentUserRef.current.username.trim(),
            color: currentUserRef.current.color,
            online_at: new Date().toISOString()
          });
          if (tracked === "ok") resolve();
          else reject(new Error("Presence could not start."));
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          window.clearTimeout(timer);
          reject(subscribeError || new Error("The room channel could not connect."));
        }
      });
    });
  }, [removeRoomChannel]);

  const connect = useCallback(async () => {
    setConnectionState((state) => state === "connected" ? "reconnecting" : "connecting");
    setError("");
    try {
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        const result = await supabase.auth.signInAnonymously();
        if (result.error) throw result.error;
        session = result.data.session;
      }
      if (!session?.user) throw new Error("Guest authentication did not finish.");
      authUserRef.current = session.user;
      await supabase.realtime.setAuth(session.access_token);
      await refreshRooms();

      if (lobbyChannelRef.current) await supabase.removeChannel(lobbyChannelRef.current);
      const lobby = supabase.channel("harmony:lobby", { config: { private: true } });
      lobbyChannelRef.current = lobby;
      lobby.on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, () => {
        void refreshRooms().catch(() => undefined);
      });
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("The lobby channel timed out.")), 12000);
        lobby.subscribe((status: string, subscribeError?: Error) => {
          if (status === "SUBSCRIBED") {
            window.clearTimeout(timer);
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            window.clearTimeout(timer);
            reject(subscribeError || new Error("The lobby channel could not connect."));
          }
        });
      });

      const saved = sessionRef.current;
      if (saved) {
        const { data, error: joinError } = await supabase.rpc("join_room", {
          p_room_id: saved.id,
          p_username: currentUserRef.current.username.trim(),
          p_color: currentUserRef.current.color,
          p_access_code: accessCodeRef.current || null
        });
        if (joinError) throw joinError;
        const restored = toSession((data as SessionRow[])[0]);
        restored.creatorAccessCode = accessCodeRef.current;
        await subscribeToRoom(restored);
        sessionRef.current = restored;
        setActiveSession(restored);
      }
      setConnectionState("connected");
    } catch (caught) {
      setConnectionState("offline");
      setError(friendlyError(caught));
    }
  }, [refreshRooms, subscribeToRoom]);

  useEffect(() => {
    void connect();
    const auth = supabase.auth.onAuthStateChange((_event: string, session: { user?: SupabaseUser; access_token?: string } | null) => {
      authUserRef.current = session?.user || null;
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
    });
    const refreshTimer = window.setInterval(() => {
      if (authUserRef.current) void refreshRooms().catch(() => undefined);
    }, 15000);
    return () => {
      window.clearInterval(refreshTimer);
      auth.data.subscription.unsubscribe();
      if (lobbyChannelRef.current) void supabase.removeChannel(lobbyChannelRef.current);
      if (roomChannelRef.current) void supabase.removeChannel(roomChannelRef.current);
    };
  }, [connect, refreshRooms]);

  useEffect(() => {
    const session = activeSession;
    if (!session) return;
    const beat = () => void supabase.rpc("heartbeat_room", { p_room_id: session.id }).then(({ error: beatError }: { error: Error | null }) => {
      if (beatError) {
        setConnectionState("reconnecting");
        setError("Your room connection was interrupted. Retry to rejoin.");
      }
    });
    beat();
    const heartbeatTimer = window.setInterval(beat, 20000);
    const noteTimer = window.setInterval(() => {
      const amount = noteBatchRef.current;
      noteBatchRef.current = 0;
      if (amount) void supabase.rpc("record_room_notes", { p_room_id: session.id, p_amount: Math.min(amount, 32) });
    }, 2000);
    return () => {
      window.clearInterval(heartbeatTimer);
      window.clearInterval(noteTimer);
    };
  }, [activeSession]);

  const runRoomAction = useCallback(async (
    kind: "create" | "join",
    rpc: "create_room" | "join_room",
    params: Record<string, unknown>,
    accessCode?: string
  ) => {
    if (connectionState !== "connected") throw new Error("Wait for Harmony to finish connecting.");
    setPendingAction(kind);
    setError("");
    let attemptedSession: RoomSession | null = null;
    try {
      const { data, error: rpcError } = await supabase.rpc(rpc, params);
      if (rpcError) throw rpcError;
      const session = toSession((data as SessionRow[])[0]);
      attemptedSession = session;
      const code = session.creatorAccessCode || accessCode;
      await subscribeToRoom(session);
      accessCodeRef.current = code;
      sessionRef.current = session;
      setActiveSession(session);
      await refreshRooms();
    } catch (caught) {
      await removeRoomChannel();
      if (attemptedSession) {
        await supabase.rpc("leave_room", { p_room_id: attemptedSession.id });
      }
      const message = friendlyError(caught);
      setError(message);
      throw new Error(message);
    } finally {
      setPendingAction(null);
    }
  }, [connectionState, refreshRooms, removeRoomChannel, subscribeToRoom]);

  const createRoom = useCallback(async (name: string, isPrivate: boolean, accessCode?: string) => {
    await runRoomAction("create", "create_room", {
      p_name: name,
      p_is_private: isPrivate,
      p_username: currentUser.username.trim(),
      p_color: currentUser.color,
      p_access_code: accessCode || null
    }, accessCode);
  }, [currentUser.color, currentUser.username, runRoomAction]);

  const joinRoom = useCallback(async (roomId: string, username: string, color: string, accessCode?: string) => {
    await runRoomAction("join", "join_room", {
      p_room_id: roomId,
      p_username: username,
      p_color: color,
      p_access_code: accessCode || null
    }, accessCode);
  }, [runRoomAction]);

  const leaveRoom = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    setPendingAction("leave");
    setError("");
    try {
      const { error: leaveError } = await supabase.rpc("leave_room", { p_room_id: session.id });
      if (leaveError) throw leaveError;
      await removeRoomChannel();
      sessionRef.current = null;
      accessCodeRef.current = undefined;
      setActiveSession(null);
      setMessages([]);
      await refreshRooms();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setPendingAction(null);
    }
  }, [refreshRooms, removeRoomChannel]);

  const sendNoteOn = useCallback((event: NoteEvent) => {
    noteBatchRef.current += 1;
    return roomChannelRef.current?.send({ type: "broadcast", event: "note_on", payload: event });
  }, []);

  const sendNoteOff = useCallback((note: string) =>
    roomChannelRef.current?.send({ type: "broadcast", event: "note_off", payload: { note } }), []);

  const sendMessage = useCallback(async (text: string) => {
    const session = sessionRef.current;
    if (!session) throw new Error("Join a room before chatting.");
    setPendingAction("chat");
    setError("");
    try {
      const { error: messageError } = await supabase.rpc("send_room_message", {
        p_room_id: session.id,
        p_text: text
      });
      if (messageError) throw messageError;
    } catch (caught) {
      const message = friendlyError(caught);
      setError(message);
      throw new Error(message);
    } finally {
      setPendingAction(null);
    }
  }, []);

  return {
    rooms,
    activeSession,
    presence,
    messages,
    connectionState,
    pendingAction,
    error,
    retry: connect,
    createRoom,
    joinRoom,
    leaveRoom,
    sendNoteOn,
    sendNoteOff,
    sendMessage
  };
}
