import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { User, Particle, NoteEvent } from "./types";
import { LivingSky } from "./components/LivingSky";
import { RoomLobby } from "./components/RoomLobby";
import { VirtualPiano, PIANO_NOTES } from "./components/VirtualPiano";
import { MusicControls } from "./components/MusicControls";
import { SessionTools, DuetSide, GuideMode } from "./components/SessionTools";
import { RoomChat } from "./components/RoomChat";
import { WelcomeTour } from "./components/WelcomeTour";
import { audioEngine } from "./components/AudioEngine";
import { useHarmonyRealtime } from "./hooks/useHarmonyRealtime";
import { motion, AnimatePresence } from "motion/react";
import { CircleHelp, Heart, LoaderCircle, Music, Star, Sunset, Users, Volume2, VolumeX, WifiOff } from "lucide-react";

export default function App() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [remotePressedKeys, setRemotePressedKeys] = useState<Map<string, { color: string; username: string }>>(new Map());
  const [skyEnergy, setSkyEnergy] = useState(0);
  const [duetMode, setDuetMode] = useState(false);
  const [duetSide, setDuetSide] = useState<DuetSide>("lower");
  const [guideRoot, setGuideRoot] = useState("C");
  const [guideMode, setGuideMode] = useState<GuideMode>("none");
  const [midiEnabled, setMidiEnabled] = useState(false);
  const [midiStatus, setMidiStatus] = useState("No MIDI keyboard connected");
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("harmony-sound") !== "off");
  const [showTour, setShowTour] = useState(() => localStorage.getItem("harmony-tour-complete") !== "true");

  const [currentUser, setCurrentUser] = useState<User>(() => {
    const names = ["Misty Cloud", "Sunset Drifter", "Peach Horizon", "Twilight Keys", "Lavender Synth", "Golden Dreamer"];
    const colors = ["#F4B07A", "#D69A97", "#E8A15A", "#B7B0D8"];
    const saved = localStorage.getItem("harmony-profile");
    if (saved) {
      try { return JSON.parse(saved) as User; } catch { /* use a fresh guest profile */ }
    }
    return {
      username: `${names[Math.floor(Math.random() * names.length)]} ${Math.floor(100 + Math.random() * 900)}`,
      color: colors[Math.floor(Math.random() * colors.length)]
    };
  });
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

  useEffect(() => {
    localStorage.setItem("harmony-profile", JSON.stringify(currentUser));
  }, [currentUser]);

  // Helper to spawn notes rise up and fade as glowing particles
  const spawnParticle = useCallback((note: string, color: string, isBackdropSubtle: boolean = false) => {
    const noteIndex = PIANO_NOTES.findIndex((n) => n.note === note);
    const totalNotes = PIANO_NOTES.length;
    // Calculate fractional position on screen
    const ratio = noteIndex !== -1 ? (noteIndex + 1.5) / (totalNotes + 2) : Math.random();

    const x = ratio * window.innerWidth + (Math.random() * 50 - 25);
    // Start particles near bottom of screen (above piano) or floating high if backdrop-only
    const y = isBackdropSubtle 
      ? window.innerHeight * 0.7 + (Math.random() * 80)
      : window.innerHeight - 300 + (Math.random() * 20);

    const size = isBackdropSubtle 
      ? Math.random() * 3 + 2 // smaller background particles
      : Math.random() * 5.5 + 4; // bigger active keybed notes

    const newParticle: Particle = {
      id: `${note}-${Date.now()}-${Math.random()}`,
      x,
      y,
      color,
      note,
      size,
      vx: Math.random() * 0.8 - 0.4, // float slightly left/right
      vy: isBackdropSubtle 
        ? -(Math.random() * 0.6 + 0.4) // slower background drift
        : -(Math.random() * 1.6 + 1.4), // upward speed
      opacity: isBackdropSubtle ? 0.6 : 1.0,
      createdAt: Date.now()
    };

    setParticles((prev) => [...prev, newParticle]);
  }, []);

  const handleRemoteNoteOn = useCallback((event: NoteEvent) => {
    audioEngine.playNote(event.note, event.velocity || 0.85);
    setRemotePressedKeys((previous) => {
      const next = new Map(previous);
      next.set(event.note, { color: event.color, username: event.username });
      return next;
    });
    spawnParticle(event.note, event.color);
    setSkyEnergy((energy) => Math.min(1, energy + 0.18));
  }, [spawnParticle]);

  const handleRemoteNoteOff = useCallback((note: string) => {
    audioEngine.stopNote(note);
    setRemotePressedKeys((previous) => {
      const next = new Map(previous);
      next.delete(note);
      return next;
    });
  }, []);

  const {
    rooms,
    activeSession,
    presence: roomUsers,
    messages: chatMessages,
    connectionState,
    pendingAction,
    error: joinError,
    retry,
    createRoom,
    joinRoom,
    leaveRoom,
    sendNoteOn,
    sendNoteOff,
    sendMessage
  } = useHarmonyRealtime({
    currentUser,
    onRemoteNoteOn: handleRemoteNoteOn,
    onRemoteNoteOff: handleRemoteNoteOff
  });
  const activeRoomId = activeSession?.id || null;
  const activeRoomCode = activeSession?.creatorAccessCode;

  useEffect(() => {
    if (connectionState !== "connected" || activeSession || inviteAttemptedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const invitedRoom = params.get("room");
    if (!invitedRoom) return;
    inviteAttemptedRef.current = true;
    void joinRoom(invitedRoom, currentUser.username, currentUser.color, params.get("code") || undefined)
      .catch(() => { inviteAttemptedRef.current = false; });
  }, [activeSession, connectionState, currentUser.color, currentUser.username, joinRoom]);

  const handleCreateRoom = useCallback((roomName: string, isPrivate: boolean, accessCode?: string) =>
    createRoom(roomName, isPrivate, accessCode), [createRoom]);

  const handleJoinRoom = useCallback((roomId: string, username: string, color: string, accessCode?: string) =>
    joinRoom(roomId, username, color, accessCode), [joinRoom]);

  const handleLeaveRoom = useCallback(async () => {
    audioEngine.stopAll();
    setRemotePressedKeys(new Map());
    await leaveRoom();
  }, [leaveRoom]);

  // Local user plays a piano note
  const handleNotePlay = useCallback((note: string, color: string, velocity = 0.85) => {
    // Spawn particle locally
    spawnParticle(note, color);
    setSkyEnergy((energy) => Math.min(1, energy + 0.14 + velocity * 0.08));

    if (activeRoomId) void sendNoteOn({ note, velocity, color, username: currentUser.username });
  }, [activeRoomId, currentUser.username, sendNoteOn, spawnParticle]);

  const handleNoteStop = useCallback((note: string) => {
    if (activeRoomId) void sendNoteOff(note);
  }, [activeRoomId, sendNoteOff]);

  const handleSendMessage = useCallback((text: string) => sendMessage(text), [sendMessage]);

  useEffect(() => {
    if (!midiEnabled || !activeRoomId) {
      setMidiStatus("No MIDI keyboard connected");
      return;
    }

    const nav = navigator as any;
    if (!nav.requestMIDIAccess) {
      setMidiStatus("MIDI is not supported in this browser");
      setMidiEnabled(false);
      return;
    }

    let access: any;
    const activeMidiNotes = new Set<string>();
    const noteFromMidi = (number: number) => {
      const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
      return `${names[number % 12]}${Math.floor(number / 12) - 1}`;
    };
    const isAllowed = (note: string) => {
      if (!duetMode) return true;
      const index = PIANO_NOTES.findIndex((item) => item.note === note);
      return index >= 0 && (duetSide === "lower" ? index < 12 : index >= 12);
    };
    const handleMidi = (event: any) => {
      const [command, number, velocity = 0] = event.data;
      const note = noteFromMidi(number);
      if (!PIANO_NOTES.some((item) => item.note === note) || !isAllowed(note)) return;
      const kind = command & 0xf0;
      if (kind === 0x90 && velocity > 0) {
        if (activeMidiNotes.has(note)) return;
        activeMidiNotes.add(note);
        audioEngine.playNote(note, velocity / 127);
        handleNotePlay(note, currentUser.color, velocity / 127);
      } else if (kind === 0x80 || (kind === 0x90 && velocity === 0)) {
        activeMidiNotes.delete(note);
        audioEngine.stopNote(note);
        handleNoteStop(note);
      }
    };
    const bindInputs = () => {
      const inputs = Array.from(access.inputs.values()) as any[];
      inputs.forEach((input) => { input.onmidimessage = handleMidi; });
      setMidiStatus(inputs.length ? `${inputs.length} MIDI input${inputs.length === 1 ? "" : "s"} connected` : "MIDI enabled — connect a keyboard");
    };

    nav.requestMIDIAccess().then((midiAccess: any) => {
      access = midiAccess;
      bindInputs();
      access.onstatechange = bindInputs;
    }).catch(() => {
      setMidiStatus("MIDI permission was not granted");
      setMidiEnabled(false);
    });

    return () => {
      if (access) {
        access.onstatechange = null;
        for (const input of access.inputs.values()) input.onmidimessage = null;
      }
      activeMidiNotes.forEach((note) => audioEngine.stopNote(note));
    };
  }, [midiEnabled, activeRoomId, currentUser.color, duetMode, duetSide, handleNotePlay, handleNoteStop]);

  const currentRoomName = activeSession?.name || "Sunset Session";

  return (
    <div id="harmony-root" className="relative w-full min-h-screen flex flex-col justify-between overflow-x-hidden font-sans select-none">
      {/* Background Animated Living Sky */}
      <LivingSky particles={particles} setParticles={setParticles} energy={skyEnergy} />

      <WelcomeTour open={showTour} onClose={closeTour} />

      <AnimatePresence>
        {connectionState !== "connected" && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed left-1/2 top-3 z-[80] -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/15 bg-[#5E639F]/90 px-4 py-2 text-[11px] font-medium text-[#F8F6F4] shadow-lg backdrop-blur-xl"
            role="status"
          >
            {connectionState === "offline" ? <WifiOff className="h-3.5 w-3.5 text-[#F4B07A]" /> : <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#F4B07A]" />}
            <span>{connectionState === "reconnecting" ? "Returning to your room…" : connectionState === "offline" ? (joinError || "Rooms are unavailable.") : "Connecting to Harmony…"}</span>
            {connectionState === "offline" && (
              <button type="button" onClick={() => void retry()} className="rounded-full bg-[#F4B07A] px-2.5 py-1 font-semibold text-[#4F548C] hover:bg-[#E8A15A]">
                Retry
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Bar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between select-none">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
              className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#F4B07A] to-[#E8A15A] flex items-center justify-center shadow-lg cursor-pointer"
              onClick={activeRoomId ? handleLeaveRoom : undefined}
            >
              <Sunset className="w-5 h-5 text-[#6E73B8]" />
            </motion.div>
            <div>
              <h1 className="text-xl font-display font-bold tracking-widest text-[#F8F6F4] flex items-center gap-1.5">
                HARMONY
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full bg-white/10 text-[#E2D9D6] tracking-normal">
                  BETA
                </span>
              </h1>
              <p className="text-[9px] font-mono tracking-widest text-[#E2D9D6]/60 uppercase">Cooperative Piano</p>
            </div>
          </div>

          {/* Aesthetic Immersive Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 ml-6 text-xs font-sans font-medium text-[#E2D9D6]/80">
            <span className="hover:text-[#F8F6F4] transition-colors cursor-pointer relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 hover:after:w-full after:h-[1.5px] after:bg-[#F4B07A] after:transition-all">Discover</span>
            <span className="hover:text-[#F8F6F4] transition-colors cursor-pointer relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 hover:after:w-full after:h-[1.5px] after:bg-[#F4B07A] after:transition-all">Studios</span>
            <span className="hover:text-[#F8F6F4] transition-colors cursor-pointer relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 hover:after:w-full after:h-[1.5px] after:bg-[#F4B07A] after:transition-all">Instruments</span>
          </nav>
        </div>

        {/* Global info and User profile aura */}
        <div className="flex items-center gap-4 text-xs font-mono text-[#F8F6F4]">
          <button type="button" onClick={() => setShowTour(true)} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10" title="Replay the welcome tour" aria-label="Replay the welcome tour"><CircleHelp className="h-4 w-4 text-[#E2D9D6]" /></button>
          <button
            type="button"
            onClick={() => setSoundEnabled((enabled) => !enabled)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border backdrop-blur-md transition-all ${soundEnabled ? "bg-white/5 border-white/10 hover:bg-white/10" : "bg-[#D69A97]/20 border-[#D69A97]/40 text-[#F8F6F4]"}`}
            title={soundEnabled ? "Turn all sound off" : "Turn sound on"}
            aria-pressed={!soundEnabled}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-[#F4B07A]" /> : <VolumeX className="w-3.5 h-3.5 text-[#D69A97]" />}
            <span className="hidden sm:inline">SOUND {soundEnabled ? "ON" : "OFF"}</span>
          </button>
          <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
            <Users className="w-3.5 h-3.5 text-[#F4B07A]" />
            <span>{rooms.reduce((acc, room) => acc + room.activeUserCount, 0)} MUSICIANS ONLINE</span>
          </div>

          {/* Current user's glowing aura indicator */}
          <div className="flex items-center gap-2">
            <span className="hidden md:inline text-xs font-sans font-medium text-[#E2D9D6]">
              {currentUser.username || "Musician"}
            </span>
            <div 
              className="w-9 h-9 rounded-full border-2 border-[#F8F6F4] transition-all duration-300"
              style={{ 
                backgroundColor: currentUser.color,
                boxShadow: `0 0 12px ${currentUser.color}`
              }}
              title="Your Active Aura"
            />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-3 sm:px-6 py-2 flex-1 flex flex-col justify-center items-center">
        <AnimatePresence mode="wait">
          {!activeRoomId ? (
            /* Lobby Screen */
            <motion.div
              key="lobby"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full flex flex-col items-center gap-8"
            >
              {/* Brand introduction */}
              <div className="text-center max-w-2xl px-4 mt-2 mb-2">
                <motion.h2
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1, duration: 0.6 }}
                  className="text-4xl sm:text-5xl font-display font-bold text-[#F8F6F4] tracking-tight leading-none mb-3"
                >
                  Make music at <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F4B07A] to-[#E8A15A]">sunset</span> together
                </motion.h2>
                <p className="text-sm sm:text-base font-sans text-[#E2D9D6] leading-relaxed max-w-lg mx-auto">
                  Harmony is a peaceful, dreamy space where sounds float like clouds. Pick an aura, join a sunset room, and create beautiful ambient melodies.
                </p>
              </div>

              {/* Lobby component */}
              <RoomLobby
                rooms={rooms}
                onCreateRoom={handleCreateRoom}
                onJoinRoom={handleJoinRoom}
                currentUser={currentUser}
                setCurrentUser={setCurrentUser}
                joinError={joinError}
                connectionReady={connectionState === "connected"}
                pendingAction={pendingAction}
              />
            </motion.div>
          ) : (
            /* Interactive Piano Session Screen */
            <motion.div
              key="session"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full flex flex-col gap-6"
            >
              {/* Interactive Piano */}
              <VirtualPiano
                roomId={activeRoomId}
                userColor={currentUser.color}
                username={currentUser.username}
                onNotePlay={handleNotePlay}
                onNoteStop={handleNoteStop}
                remotePressedKeys={remotePressedKeys}
                duetMode={duetMode}
                duetSide={duetSide}
                highlightedPitchClasses={highlightedPitchClasses}
                soundEnabled={soundEnabled}
              />

              <SessionTools
                roomId={activeRoomId}
                accessCode={activeRoomCode}
                duetMode={duetMode}
                duetSide={duetSide}
                onDuetModeChange={setDuetMode}
                onDuetSideChange={setDuetSide}
                guideRoot={guideRoot}
                guideMode={guideMode}
                onGuideRootChange={setGuideRoot}
                onGuideModeChange={setGuideMode}
                midiEnabled={midiEnabled}
                midiStatus={midiStatus}
                onMidiToggle={() => setMidiEnabled((enabled) => !enabled)}
                soundEnabled={soundEnabled}
              />

              <RoomChat messages={chatMessages} onSendMessage={handleSendMessage} pending={pendingAction === "chat"} />

              {/* Controls and Stats */}
              <MusicControls
                currentRoomName={currentRoomName}
                roomUsers={roomUsers}
                onLeaveRoom={handleLeaveRoom}
                onPlayDemoNote={(note) => handleNotePlay(note, currentUser.color, 0.75)}
                onStopDemoNote={handleNoteStop}
                soundEnabled={soundEnabled}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer credits */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] font-mono text-[#E2D9D6]/40 select-none">
        <div className="flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-[#E8A15A] fill-current animate-pulse" />
          <span>INSPIRED BY GOLDEN HOUR SKIES & PREMIUM AMBIENT SYNTHS</span>
        </div>
        <div className="flex items-center gap-1 text-[#F8F6F4]/70 tracking-[0.18em]">
          <span>CREATED BY RINNYSSANCE</span>
        </div>
        <div className="flex items-center gap-1">
          <span>DESIGNED WITH</span>
          <Heart className="w-3 h-3 text-[#D69A97] fill-current" />
          <span>FOR CREATIVE COOPERATION</span>
        </div>
      </footer>
    </div>
  );
}
