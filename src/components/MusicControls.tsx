import React, { useState, useEffect, useRef } from "react";
import { User, InstrumentPreset } from "../types";
import { audioEngine, INSTRUMENT_PRESETS } from "./AudioEngine";
import { Music, Volume2, UserCheck, Play, Square, Sparkles, LogOut, Info } from "lucide-react";

interface MusicControlsProps {
  currentRoomName: string;
  roomUsers: User[];
  onLeaveRoom: () => void;
  onPlayDemoNote: (note: string) => void;
  onStopDemoNote: (note: string) => void;
  soundEnabled: boolean;
}

// A beautiful sunset pentatonic melody sequence
const SUNSET_MELODY = [
  { note: "C4", dur: 600, delay: 0 },
  { note: "E4", dur: 600, delay: 600 },
  { note: "G4", dur: 600, delay: 1200 },
  { note: "A4", dur: 1200, delay: 1800 },
  { note: "G4", dur: 600, delay: 3000 },
  { note: "C5", dur: 600, delay: 3600 },
  { note: "A4", dur: 600, delay: 4200 },
  { note: "G4", dur: 1200, delay: 4800 },
  // High chords
  { note: "E5", dur: 800, delay: 6000 },
  { note: "G5", dur: 800, delay: 6800 },
  { note: "A5", dur: 1600, delay: 7600 },
  // Smooth descend
  { note: "E5", dur: 600, delay: 9200 },
  { note: "C5", dur: 600, delay: 9800 },
  { note: "A4", dur: 600, delay: 10400 },
  { note: "G4", dur: 1600, delay: 11000 }
];

export const MusicControls: React.FC<MusicControlsProps> = ({
  currentRoomName,
  roomUsers,
  onLeaveRoom,
  onPlayDemoNote,
  onStopDemoNote,
  soundEnabled
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string>(INSTRUMENT_PRESETS[0].id);
  const [volume, setVolume] = useState<number>(35);
  const [isPlayingDemo, setIsPlayingDemo] = useState(false);
  const demoTimeouts = useRef<number[]>([]);

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = INSTRUMENT_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      audioEngine.setPreset(preset);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseInt(e.target.value, 10);
    setVolume(vol);
    audioEngine.setVolume(vol / 100);
  };

  // Autoplay sunset melody
  const startDemo = () => {
    if (isPlayingDemo || !soundEnabled) return;
    setIsPlayingDemo(true);
    
    const timeouts: number[] = [];

    const playSequence = () => {
      SUNSET_MELODY.forEach((m) => {
        const playId = window.setTimeout(() => {
          onPlayDemoNote(m.note);
          
          // Stop note
          const stopId = window.setTimeout(() => {
            onStopDemoNote(m.note);
          }, m.dur);
          timeouts.push(stopId);

        }, m.delay);
        timeouts.push(playId);
      });

      // Loop after completing (13 seconds)
      const loopId = window.setTimeout(() => {
        playSequence();
      }, 13000);
      timeouts.push(loopId);
    };

    playSequence();
    demoTimeouts.current = timeouts;
  };

  const stopDemo = () => {
    demoTimeouts.current.forEach((t) => clearTimeout(t));
    demoTimeouts.current = [];
    setIsPlayingDemo(false);
    audioEngine.stopAll();
  };

  // Clean up demo timeouts on unmount
  useEffect(() => {
    if (!soundEnabled && isPlayingDemo) stopDemo();
  }, [soundEnabled]);

  useEffect(() => {
    return () => {
      demoTimeouts.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const activePreset = INSTRUMENT_PRESETS.find((p) => p.id === selectedPreset);

  return (
    <div id="music-controls" className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5 z-10 p-1">
      {/* Synthesizer Presets */}
      <div className="glass-panel p-5 rounded-[22px] text-[#F8F6F4] flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-[#F4B07A]/15 text-[#F4B07A]">
              <Music className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-display font-medium tracking-tight">Sound Aura Preset</h3>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {INSTRUMENT_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePresetChange(p.id)}
                className={`flex flex-col items-start p-3 rounded-xl border transition-all duration-300 text-left cursor-pointer ${
                  selectedPreset === p.id
                    ? "bg-[#F4B07A]/15 border-[#F4B07A] text-[#F8F6F4]"
                    : "bg-white/5 border-white/5 hover:bg-white/10 text-[#E2D9D6]"
                }`}
              >
                <span className="text-lg mb-1">{p.icon}</span>
                <span className="text-xs font-sans font-semibold leading-none">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        {activePreset && (
          <p className="text-[11px] text-[#E2D9D6]/60 mt-3 font-sans leading-relaxed">
            {activePreset.description}
          </p>
        )}
      </div>

      {/* Volume & Melody controls */}
      <div className="glass-panel p-5 rounded-[22px] text-[#F8F6F4] flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[#D69A97]/15 text-[#D69A97]">
                <Volume2 className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-display font-medium tracking-tight">Instrument Settings</h3>
            </div>
            
            <button
              onClick={isPlayingDemo ? stopDemo : startDemo}
              disabled={!soundEnabled}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-sans font-semibold transition-all duration-300 cursor-pointer ${
                isPlayingDemo
                  ? "bg-rose-500/30 text-rose-200 border border-rose-500/50"
                  : soundEnabled ? "btn-sunset" : "bg-white/5 text-[#E2D9D6]/40 cursor-not-allowed"
              }`}
            >
              {isPlayingDemo ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop Demo</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current animate-pulse" />
                  <span>Autoplay Sunset</span>
                </>
              )}
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-[#E2D9D6] mb-1.5">
                <span>Master Volume</span>
                <span className="font-mono text-[11px]">{volume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className="w-full accent-[#F4B07A] bg-white/10 rounded-lg cursor-pointer h-1.5 appearance-none"
              />
            </div>

            <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex gap-2 items-start">
              <Sparkles className="w-3.5 h-3.5 text-[#E8A15A] shrink-0 mt-0.5" />
              <p className="text-[10px] text-[#E2D9D6]/60 leading-normal">
                {isPlayingDemo 
                  ? "Melody looping. Other players hear and see notes float up like sunset dust particles!" 
                  : "Press keys with mouse or type on your computer keyboard to trigger gorgeous chime ripples."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Session presence / Room exit */}
      <div className="glass-panel p-5 rounded-[22px] text-[#F8F6F4] flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[#B7B0D8]/15 text-[#B7B0D8]">
                <UserCheck className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-display font-medium tracking-tight">Active Musicians</h3>
            </div>
            
            <button
              onClick={onLeaveRoom}
              className="flex items-center gap-1 text-[11px] font-sans font-medium text-[#D69A97] hover:text-[#F4B07A] transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Leave Room</span>
            </button>
          </div>

          <div className="text-xs font-semibold text-[#F4B07A] mb-2.5 truncate font-display">
            {currentRoomName}
          </div>

          <div className="space-y-1.5 max-h-[85px] overflow-y-auto pr-1">
            {roomUsers.map((user, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-1.5 px-2 rounded-xl bg-white/5 border border-white/5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full ring-2 ring-white/10"
                    style={{ backgroundColor: user.color }}
                  />
                  <span className="text-xs font-sans text-[#F8F6F4] truncate max-w-[120px]">
                    {user.username}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-[#E2D9D6]/50">ACTIVE</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
