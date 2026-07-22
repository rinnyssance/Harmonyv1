import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel, User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { ChatMessage, Room, User } from "../types";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";
export type RoomConnection = {
  room_id: string;
  name: string;
  is_private: boolean;
  host_id: string;
  scale_key: string;
  scale_type: string;
  realtime_key: string;
  access_code?: string | null;
};
export type NotePayload = { note: string; velocity?: number; color: string; username: string; userId: string };

const mapRoom = (row: any): Room => ({ id: row.id, name: row.name, notesCount: 0, users: [], isPrivate: row.is_private });
const mapMessage = (row: any): ChatMessage => ({ id: row.id, roomId: row.room_id, username: row.username, color: row.color, text: row.text, createdAt: new Date(row.created_at).getTime() });

export function useHarmonyRealtime(currentUser: User, onRemoteNoteOn: (payload: NotePayload) => void, onRemoteNoteOff: (note: string) => void) {
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [room, setRoom] = useState<RoomConnection | null>(null);
  const [roomUsers, setRoomUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const channelRef = useRef<RealtimeChannel | null>(null);

  const loadRooms = useCallback(async () => {
    const { data, error: queryError } = await supabase.from("rooms").select("id,name,is_private,created_at").order("created_at", { ascending: false });
    if (queryError) throw queryError;
    setRooms((data ?? []).map(mapRoom));
  }, []);

  const loadMessages = useCallback(async (roomId: string) => {
    const { data, error: queryError } = await supabase.from("messages").select("id,room_id,username,color,text,created_at").eq("room_id", roomId).order("created_at").limit(100);
    if (queryError) throw queryError;
    setMessages((data ?? []).map(mapMessage));
  }, []);

  useEffect(() => {
    let active = true;
    const start = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      let user = sessionData.session?.user ?? null;
      if (!user) {
        const { data, error: authError } = await supabase.auth.signInAnonymously();
        if (authError) throw authError;
        user = data.user;
      }
      if (!active || !user) return;
      setAuthUser(user);
      setConnectionState("connected");
      await loadRooms();
    };
    start().catch((reason: Error) => { if (active) { setError(reason.message); setConnectionState("offline"); } });
    const listChannel = supabase.channel("harmony-room-list").on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, () => { loadRooms().catch(() => undefined); }).subscribe();
    return () => { active = false; void supabase.removeChannel(listChannel); };
  }, [loadRooms]);

  const connect = useCallback(async (connection: RoomConnection) => {
    if (!authUser) throw new Error("Still connecting to Harmony.");
    if (channelRef.current) await supabase.removeChannel(channelRef.current);
    setRoom(connection);
    setMessages([]);
    await loadMessages(connection.room_id);

    const channel = supabase.channel(`room:${connection.realtime_key}`, {
      config: { broadcast: { self: false }, presence: { key: authUser.id } },
    });
    channel
      .on("broadcast", { event: "note_on" }, ({ payload }) => onRemoteNoteOn(payload as NotePayload))
      .on("broadcast", { event: "note_off" }, ({ payload }) => onRemoteNoteOff((payload as { note: string }).note))
      .on("broadcast", { event: "messages_changed" }, () => { loadMessages(connection.room_id).catch(() => undefined); })
      .on("broadcast", { event: "room_deleted" }, () => { setRoom(null); setRoomUsers([]); setMessages([]); void loadRooms(); })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<User & { userId: string }>();
        setRoomUsers(Object.values(state).flat().map(({ username, color }) => ({ username, color })));
      });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setConnectionState("connected");
        await channel.track({ userId: authUser.id, username: currentUser.username, color: currentUser.color });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnectionState("reconnecting");
      } else if (status === "CLOSED") {
        setConnectionState("offline");
      }
    });
    channelRef.current = channel;
  }, [authUser, currentUser.color, currentUser.username, loadMessages, loadRooms, onRemoteNoteOff, onRemoteNoteOn]);

  const createRoom = useCallback(async (name: string, isPrivate: boolean, accessCode?: string) => {
    if (!authUser) throw new Error("Still connecting to Harmony.");
    setError("");
    const { data, error: rpcError } = await supabase.rpc("create_room", { room_name: name, private_room: isPrivate, member_name: currentUser.username, member_color: currentUser.color, supplied_access_code: accessCode ?? null });
    if (rpcError) throw rpcError;
    const created = data?.[0];
    if (!created) throw new Error("Room could not be created.");
    await loadRooms();
    await connect({ room_id: created.room_id, name, is_private: isPrivate, host_id: authUser.id, scale_key: "C", scale_type: "major", realtime_key: created.realtime_key, access_code: created.access_code });
  }, [authUser, connect, currentUser.color, currentUser.username, loadRooms]);

  const joinRoom = useCallback(async (roomId: string, username: string, color: string, accessCode?: string) => {
    setError("");
    const { data, error: rpcError } = await supabase.rpc("join_room", { target_room_id: roomId, member_name: username, member_color: color, supplied_access_code: accessCode ?? null });
    if (rpcError) throw rpcError;
    const joined = data?.[0];
    if (!joined) throw new Error("Room not found.");
    await connect(joined as RoomConnection);
  }, [connect]);

  const leaveRoom = useCallback(async () => {
    const roomId = room?.room_id;
    if (channelRef.current) await supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    if (roomId) await supabase.rpc("leave_room", { target_room_id: roomId });
    setRoom(null); setRoomUsers([]); setMessages([]); setError("");
    await loadRooms();
  }, [loadRooms, room?.room_id]);

  const sendNoteOn = useCallback((payload: Omit<NotePayload, "userId">) => {
    if (!channelRef.current || !authUser) return;
    void channelRef.current.send({ type: "broadcast", event: "note_on", payload: { ...payload, userId: authUser.id } });
  }, [authUser]);
  const sendNoteOff = useCallback((note: string) => { void channelRef.current?.send({ type: "broadcast", event: "note_off", payload: { note } }); }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!room || !authUser) return;
    const { error: insertError } = await supabase.from("messages").insert({ room_id: room.room_id, user_id: authUser.id, username: currentUser.username, color: currentUser.color, text: text.trim().slice(0, 500) });
    if (insertError) throw insertError;
    await loadMessages(room.room_id);
    await channelRef.current?.send({ type: "broadcast", event: "messages_changed", payload: {} });
  }, [authUser, currentUser.color, currentUser.username, loadMessages, room]);

  const clearMessages = useCallback(async () => {
    if (!room) return;
    const { error: rpcError } = await supabase.rpc("clear_room_messages", { target_room_id: room.room_id });
    if (rpcError) throw rpcError;
    setMessages([]);
    await channelRef.current?.send({ type: "broadcast", event: "messages_changed", payload: {} });
  }, [room]);

  const deleteRoom = useCallback(async () => {
    if (!room) return;
    await channelRef.current?.send({ type: "broadcast", event: "room_deleted", payload: {} });
    const { error: rpcError } = await supabase.rpc("delete_room", { target_room_id: room.room_id });
    if (rpcError) throw rpcError;
    await leaveRoom();
  }, [leaveRoom, room]);

  return { rooms, room, roomUsers, messages, error, setError, connectionState, authUser, createRoom, joinRoom, leaveRoom, sendNoteOn, sendNoteOff, sendMessage, clearMessages, deleteRoom };
}
