import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { User, Room, Particle, ChatMessage } from "./types";
import { LivingSky } from "./components/LivingSky";
import { RoomLobby } from "./components/RoomLobby";
import { VirtualPiano, PIANO_NOTES } from "./components/VirtualPiano";
import { MusicControls } from "./components/MusicControls";
import { SessionTools, DuetSide, GuideMode } from "./components/SessionTools";
import { RoomChat } from "./components/RoomChat";
import { WelcomeTour } from "./components/WelcomeTour";
import { audioEngine } from "./components/AudioEngine";
import { motion, AnimatePresence } from "motion/react";
import { CircleHelp, Heart, LoaderCircle, Music, Star, Sunset, Users, Volume2, VolumeX, WifiOff } from "lucide-react";

type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";

export default function App() {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomUsers, setRoomUsers] = useState<User[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [remotePressedKeys, setRemotePressedKeys] = useState<Map<string, { color: string; username: string }>>(new Map());
  const [skyEnergy, setSkyEnergy] = useState(0);
  const [activeRoomCode, setActiveRoomCode] = useState<string | undefined>();
  const [joinError, setJoinError] = useState("");
  const [duetMode, setDuetMode] = useState(false);
  const [duetSide, setDuetSide] = useState<DuetSide>("lower");
  const [guideRoot, setGuideRoot] = useState("C");
  const [guideMode, setGuideMode] = useState<GuideMode>("none");
  const [midiEnabled, setMidiEnabled] = useState(false);
  const [midiStatus, setMidiStatus] = useState("No MIDI keyboard connected");
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("harmony-sound") !== "off");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showTour, setShowTour] = useState(() => localStorage.getItem("harmony-tour-complete") !== "true");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  // Current user settings with random presets
  const [currentUser, setCurrentUser] = useState<User>({
    username: "",
    color: "#F4B07A" // default sunset peach
  });

  const socketRef = useRef<Socket | null>(null);
  const inviteAttemptedRef = useRef(false);
  const closeTour = useCallback(() => setShowTour(false), []);

  const highlightedPitchClasses = useMemo(() => {
    if (guideMode === "none") return new Set<string>();
    const roots = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const intervals: Record<Exclude<GuideMode, "none">, number[]> = {
      major: [0, 2, 4, 5, 7, 9, 11],
      minor: [0, 2, 3, 5, 7, 8, 10],
      pentatonic: [0, 2, 4, 7, 9],
      "major-chord": [0, 4, 7],
      "minor-chord": [0, 3, 7],
      "major-seven": [0, 4, 7, 11]
    };
    const rootIndex = roots.indexOf(guideRoot);
    return new Set(intervals[guideMode].map((step) => roots[(rootIndex + step) % 12]));
  }, [guideMode, guideRoot]);

  useEffect(() => {
    const timer = window.setInterval(() => setSkyEnergy((energy) => Math.max(0, energy - 0.035)), 180);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    audioEngine.setMuted(!soundEnabled);
    localStorage.setItem("harmony-sound", soundEnabled ? "on" : "off");
  }, [soundEnabled]);

  // Initialize random username once on client load
  useEffect(() => {
    const RANDOM_PRESETS = [
      "Misty Cloud â˜ï¸",
      "Sunset Drifter ðŸŒ…",
      "Peach Horizon ðŸ‘",
      "Twilight Keys ðŸŽ¹",
      "Lavender Synth ðŸŽ¼",
      "Golden Dreamer âœ¨"
    ];
    const COLORS = ["#F4B07A", "#D69A97", "#E8A15A", "#B7B0D8"];
    const randomUser = RANDOM_PRESETS[Math.floor(Math.random() * RANDOM_PRESETS.length)];
    const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    
    setCurrentUser({
      username: randomUser,
      color: randomColor
    });
  }, []);

  // Set up WebSocket listeners
  useEffect(() => {
    const socket = io({ path: "/api/socket" });
    socketRef.current = socket;
    let intentionalCleanup = false;

    socket.on("connect", () => {
      setConnectionState("connected");
      console.log("Connected to Harmony socket server");
      const params = new URLSearchParams(window.location.search);
      const invitedRoom = params.get("room");
      if (activeRoomId && currentUser.username) {
        socket.emit("room:join", {
          roomId: activeRoomId,
          username: currentUser.username,
          color: currentUser.color,
          accessCode: activeRoomCode
        });
      } else if (invitedRoom && currentUser.username && !inviteAttemptedRef.current) {
        inviteAttemptedRef.current = true;
        socket.emit("room:join", {
          roomId: invitedRoom,
          username: currentUser.username,
          color: currentUser.color,
          accessCode: params.get("code") || undefined
        });
      }
    });

    socket/o7ï[h‘éì¶»§q«^t           <div
                    className="absolute z-20"
                    style={{
                      width: "64%",
                      height: "64%",
                      right: "-32%",
                      top: 0,
                    }}
                  >
                    {(() => {
                      const bkLocalActive = localPressed.has(blackKey.note);
                      const bkRemoteActive = remotePressedKeys.get(blackKey.note);
                      const bkActive = bkLocalActive || !!bkRemoteActive;
                      const bkHighlighted = isGuideNote(blackKey.note);
                      const bkAllowed = isNoteAllowed(blackKey.note);
                      const bkActiveColor = bkLocalActive ? userColor : bkRemoteActive?.color || "#D69A97";
                      const bkActiveUser = bkRemoteActive ? bkRemoteActive.username : (bkLocalActive ? "You" : "");

                      return (
                        <button
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleMouseDown(blackKey.note);
                          }}
                          onMouseEnter={(e) => {
                            e.stopPropagation();
                            handleMouseEnter(blackKey.note);
                          }}
                          onMouseLeave={(e) => {
                            e.stopPropagation();
                            handleMouseLeave(blackKey.note);
                          }}
                          onMouseUp={(e) => {
                            e.stopPropagation();
                            handleMouseUp(blackKey.note);
                          }}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleMouseDown(blackKey.note);
                          }}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleMouseUp(blackKey.note);
                          }}
                          className={`w-full h-full rounded-b-[6px] flex flex-col justify-end items-center pb-2.5 cursor-pointer outline-none transition-all duration-150 border-x border-b border-black/40 select-none ${
                            bkActive
                              ? "shadow-inner border-t-[3px] border-[#6E73B8]/30"
                              : "bg-[#2D3346] hover:bg-[#394056] shadow-[0_4px_4px_rgba(0,0,0,0.4)]"
                          } ${duetMode && !bkAllowed ? "opacity-55" : ""}`}
                          style={{
                            backgroundColor: bkActive ? "#D69A97" : bkHighlighted ? "#4A4E70" : undefined,
                            boxShadow: bkActive
                              ? `0 0 20px ${bkActiveColor}, 0 4px 5px rgba(0,0,0,0.2)`
                              : undefined,
                          }}
                        >
                          {/* Inner reflection edge */}
                          <div className="absolute inset-x-0.5 top-0 h-[4px] bg-white/15 rounded-b-xs pointer-events-none" />
                          {bkHighlighted && !bkActive && <span className="absolute bottom-9 w-1.5 h-1.5 rounded-full bg-[#F4B07A] shadow-[0_0_8px_#F4B07A]" />}

                          {/* Remote playing indicator on black key */}
                          {bkRemoteActive && (
                            <div className="absolute top-6 left-0.5 right-0.5 flex flex-col items-center pointer-events-none">
                              <span className="text-[7.5px] font-sans px-1 py-0.5 rounded-sm bg-black/80 text-[#F8F6F4] scale-90 truncate max-w-[40px]">
                                {bkActiveUser}
                              </span>
                            </div>
                          )}

                          {/* Keyboard label for black key */}
                          {showLabels && (
                            <div className="flex flex-col items-center pointer-events-none">
                              <span className="text-[9px] font-mono font-medium text-[#E2D9D6]/65">
                                {blackKey.keyLabel}
                              </span>
                              <span className="text-[7px] font-sans font-medium text-[#E2D9D6]/35 leading-tight">
                                {blackKey.note}
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
