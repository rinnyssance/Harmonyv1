import React, { useState } from "react";
import { User, Room } from "../types";
import { Users, Sunset, Plus, Check, Play, Shuffle, Lock, Globe2 } from "lucide-react";

interface RoomLobbyProps {
  rooms: Room[];
  onCreateRoom: (name: string, isPrivate: boolean, accessCode?: string) => Promise<void>;
  onJoinRoom: (roomId: string, username: string, color: string, accessCode?: string) => Promise<void>;
  joinError?: string;
  connectionReady: boolean;
  pendingAction: "create" | "join" | "leave" | "chat" | null;
  currentUser: User;
  setCurrentUser: React.Dispatch<React.SetStateAction<User>>;
}

const PALETTE_COLORS = [
  "#F4B07A", // Sunset Peach
  "#D69A97", // Warm Rose
  "#E8A15A", // Golden Apricot
  "#B7B0D8", // Soft Lavender
  "#81C784", // Soft Mint
  "#EE9CA7"  // Coral Pink
];

const RANDOM_USERNAMES = [
  "Misty Cloud ☁️",
  "Sunset Player 🌅",
  "Peach Horizon 🍑",
  "Twilight Keys 🎹",
  "Lavender Synth 🎼",
  "Golden Dreamer ✨",
  "Rose Composer 🌹",
  "Ambient Drifter 🌌",
  "Solar Pianist ☀️",
  "Chime Weaver 🔔"
];

export const RoomLobby: React.FC<RoomLobbyProps> = ({
  rooms,
  onCreateRoom,
  onJoinRoom,
  currentUser,
  setCurrentUser,
  joinError,
  connectionReady,
  pendingAction
}) => {
  const [newRoomName, setNewRoomName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [joinCodes, setJoinCodes] = useState<Record<string, string>>({});

  const handleRandomizeName = () => {
    const randomName = RANDOM_USERNAMES[Math.floor(Math.random() * RANDOM_USERNAMES.length)];
    setCurrentUser((prev) => ({ ...prev, username: randomName }));
  };

  const handleSelectColor = (color: string) => {
    setCurrentUser((prev) => ({ ...prev, color }));
  };

  const handleCreateRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) {
      setError("Please enter a room name.");
      return;
    }
    setError("");
    const safeCode = accessCode.replace(/\D/g, "").slice(0, 6);
    if (isPrivate && safeCode.length < 4) {
      setError("Private room codes need at least 4 digits.");
      return;
    }
    try {
      await onCreateRoom(newRoomName.trim(), isPrivate, isPrivate ? safeCode : undefined);
      setNewRoomName("");
      setIsCreating(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The room could not be created.");
    }
  };

  const handleJoin = async (roomId: string, roomIsPrivate = false) => {
    if (!currentUser.username.trim()) {
      setError("Please enter or generate a username first.");
      return;
    }
    setError("");
    if (roomIsPrivate && !joinCodes[roomId]) {
      setError("Enter the private room code first.");
      return;
    }
    try {
      await onJoinRoom(roomId, currentUser.username.trim(), currentUser.color, joinCodes[roomId]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The room could not be joined.");
    }
  };

  return (
    <div id="room-lobby" className="w-full max-w-4xl mx-auto flex flex-col md:flex-row gap-6 p-1 z-10">
      {/* Profile Settings (Left) */}
      <div className="flex-1 glass-panel p-6 rounded-[24px] text-[#F8F6F4] flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-xl bg-white/10">
              <Sunset className="w-5 h-5 text-[#F4B07A]" />
            </div>
            <h2 className="text-lg font-display font-medium tracking-tight">Your Musician Profile</h2>
          </div>

          <p className="text-xs text-[#E2D9D6] mb-6">
            Customize your identity and color. Your color will glow on the piano keys and floating notes when you play.
          </p>

          {/* Username Input */}
          <div className="mb-6">
            <label className="block text-xs font-sans font-medium text-[#E2D9D6] mb-2 uppercase tracking-wider">
              Musician Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={currentUser.username}
                onChange={(e) => setCurrentUser((prev) => ({ ...prev, username: e.target.value }))}
                maxLength={24}
                placeholder="Enter nickname..."
                className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#F4B07A]/50 transition-all text-[#F8F6F4] placeholder-white/30"
              />
              <button
                type="button"
                onClick={handleRandomizeName}
                title="Randomize Name"
                className="px-3 rounded-xl bg-white/10 hover:bg-white/15 transition-all text-[#F4B07A]"
              >
                <Shuffle className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Color Selection */}
          <div className="mb-6">
            <label className="block text-xs font-sans font-medium text-[#E2D9D6] mb-2.5 uppercase tracking-wider">
              Aura Color
            </label>
            <div className="flex flex-wrap gap-3">
              {PALETTE_COLORS.map((c) => {
                const isSelected = currentUser.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleSelectColor(c)}
                    className="w-10 h-10 rounded-full relative cursor-pointer transition-all duration-300 hover:scale-110 active:scale-95"
                    style={{
                      backgroundColor: c,
                      boxShadow: isSelected
                        ? `0 0 15px ${c}, inset 0 0 0 2px rgba(255,255,255,0.8)`
                        : `0 4px 6px rgba(0,0,0,0.1)`
                    }}
                  >
                    {isSelected && (
                      <Check className="w-4 h-4 text-white absolute inset-0 m-auto filter drop-shadow-md" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {(error || joinError) && (
          <p className="text-xs text-[#D69A97] font-medium mb-4 bg-red-500/10 py-1.5 px-3 rounded-lg border border-red-500/20">
            {error || joinError}
          </p>
        )}
      </div>

      {/* Rooms List / Active Rooms (Right) */}
      <div className="flex-[1.25] glass-panel p-6 rounded-[24px] text-[#F8F6F4] flex flex-col h-[350px] md:h-auto justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#B7B0D8]" />
              <h2 className="text-lg font-display font-medium tracking-tight">Sunset Rooms</h2>
            </div>

            <button
              onClick={() => setIsCreating(!isCreating)}
              disabled={!connectionReady || pendingAction !== null}
              className="flex items-center gap-1.5 text-xs font-sans font-semibold px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-[#F4B07A] transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Room</span>
            </button>
          </div>

          {/* New Room Form */}
          {isCreating && (
            <form onSubmit={handleCreateRoomSubmit} className="mb-4 p-3 bg-black/15 rounded-2xl border border-white/5 animate-fade-in">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  minLength={2}
                  maxLength={40}
                  placeholder="E.g. Moonlit Beach, Sunrise Piano..."
                  className="flex-1 bg-black/25 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:border-[#E8A15A]/50 transition-all text-[#F8F6F4] placeholder-white/30"
                />
                <button
                  type="submit"
                  disabled={!connectionReady || pendingAction !== null}
                  className="px-4 py-2 rounded-full btn-sunset font-semibold text-xs text-slate-800 transition-all cursor-pointer"
                >
                  {pendingAction === "create" ? "Creating…" : "Create"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setIsPrivate((value) => !value)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] border ${isPrivate ? "bg-[#D69A97]/20 border-[#D69A97]/50 text-[#F8F6F4]" : "bg-white/5 border-white/10 text-[#E2D9D6]"}`}>
                  {isPrivate ? <Lock className="w-3.5 h-3.5" /> : <Globe2 className="w-3.5 h-3.5" />}
                  {isPrivate ? "Private room" : "Public room"}
                </button>
                {isPrivate && <input inputMode="numeric" value={accessCode} onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="4–6 digit code" className="w-36 bg-black/25 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#E8A15A]/50 text-[#F8F6F4] placeholder-white/30" />}
              </div>
            </form>
          )}

          {/* Rooms List */}
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {rooms.length === 0 ? (
              <div className="py-8 text-center text-[#E2D9D6]/50 text-sm">
                No rooms available. Create a room to begin playing!
              </div>
            ) : (
              rooms.map((room) => (
                <div
                  key={room.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all duration-300"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-sans font-semibold text-[#F8F6F4]">
                      <span className="inline-flex items-center gap-1.5">{room.isPrivate && <Lock className="w-3 h-3 text-[#D69A97]" />}{room.name}</span>
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-[#E2D9D6]/60">
                      <span>{room.activeUserCount} playing</span>
                      <span>•</span>
                      <span>{room.notesCount || 0} notes shared</span>
                    </div>
                  </div>

                  <div className="ml-3 flex items-center gap-2">
                    {room.isPrivate && <input aria-label={`Code for ${room.name}`} inputMode="numeric" value={joinCodes[room.id] || ""} onChange={(e) => setJoinCodes((codes) => ({ ...codes, [room.id]: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="Code" className="w-20 bg-black/20 border border-white/10 rounded-full px-3 py-2 text-xs outline-none focus:border-[#F4B07A]/60" />}
                    <button
                      onClick={() => handleJoin(room.id, room.isPrivate)}
                      disabled={!connectionReady || pendingAction !== null}
                      className="flex items-center gap-1 px-4 py-2 rounded-full btn-sunset font-sans font-bold text-xs cursor-pointer whitespace-nowrap"
                    >
                      <span>{pendingAction === "join" ? "Joining…" : "Join"}</span>
                      <Play className="w-3 h-3 fill-current" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-[11px] text-[#E2D9D6]/40 font-mono">
          <span>COOPERATIVE HARMONY ENGINE</span>
          <span>ONLINE V2.0</span>
        </div>
      </div>
    </div>
  );
};
