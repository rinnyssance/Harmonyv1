import React, { useEffect, useRef, useState } from "react";
import { audioEngine } from "./AudioEngine";
import { ChevronLeft, ChevronRight, HelpCircle, Keyboard, Music, Waves } from "lucide-react";

interface VirtualPianoProps {
  roomId: string;
  userColor: string;
  username: string;
  onNotePlay: (note: string, color: string, velocity?: number) => void;
  onNoteStop: (note: string) => void;
  remotePressedKeys: Map<string, { color: string; username: string }>;
  duetMode: boolean;
  duetSide: "lower" | "upper";
  highlightedPitchClasses: Set<string>;
  soundEnabled: boolean;
}

export const PIANO_NOTES = [
  { note: "C4", isBlack: false, keyLabel: "A" },
  { note: "C#4", isBlack: true, keyLabel: "W" },
  { note: "D4", isBlack: false, keyLabel: "S" },
  { note: "D#4", isBlack: true, keyLabel: "E" },
  { note: "E4", isBlack: false, keyLabel: "D" },
  { note: "F4", isBlack: false, keyLabel: "F" },
  { note: "F#4", isBlack: true, keyLabel: "T" },
  { note: "G4", isBlack: false, keyLabel: "G" },
  { note: "G#4", isBlack: true, keyLabel: "Y" },
  { note: "A4", isBlack: false, keyLabel: "H" },
  { note: "A#4", isBlack: true, keyLabel: "U" },
  { note: "B4", isBlack: false, keyLabel: "J" },
  { note: "C5", isBlack: false, keyLabel: "K" },
  { note: "C#5", isBlack: true, keyLabel: "O" },
  { note: "D5", isBlack: false, keyLabel: "L" },
  { note: "D#5", isBlack: true, keyLabel: "P" },
  { note: "E5", isBlack: false, keyLabel: ";" },
  { note: "F5", isBlack: false, keyLabel: "Z" },
  { note: "F#5", isBlack: true, keyLabel: "X" },
  { note: "G5", isBlack: false, keyLabel: "C" },
  { note: "G#5", isBlack: true, keyLabel: "V" },
  { note: "A5", isBlack: false, keyLabel: "B" },
  { note: "A#5", isBlack: true, keyLabel: "N" },
  { note: "B5", isBlack: false, keyLabel: "M" },
  { note: "C6", isBlack: false, keyLabel: "," }
];

const KEYBOARD_MAP: { [key: string]: string } = {
  a: "C4",
  w: "C#4",
  s: "D4",
  e: "D#4",
  d: "E4",
  f: "F4",
  t: "F#4",
  g: "G4",
  y: "G#4",
  h: "A4",
  u: "A#4",
  j: "B4",
  k: "C5",
  o: "C#5",
  l: "D5",
  p: "D#5",
  ";": "E5",
  z: "F5",
  x: "F#5",
  c: "G5",
  v: "G#5",
  b: "A5",
  n: "A#5",
  m: "B5",
  ",": "C6"
};

export const VirtualPiano: React.FC<VirtualPianoProps> = ({
  roomId,
  userColor,
  username,
  onNotePlay,
  onNoteStop,
  remotePressedKeys,
  duetMode,
  duetSide,
  highlightedPitchClasses,
  soundEnabled
}) => {
  const [localPressed, setLocalPressed] = useState<Set<string>>(new Set());
  const [showLabels, setShowLabels] = useState(true);
  const [sustainOn, setSustainOn] = useState(false);
  const [mobileOctave, setMobileOctave] = useState<4 | 5>(4);
  const isMouseDown = useRef(false);
  const lastActiveNote = useRef<string | null>(null);
  const pianoScrollRef = useRef<HTMLDivElement | null>(null);
  const isNoteAllowed = (note: string) => {
    if (!duetMode) return true;
    const index = PIANO_NOTES.findIndex((item) => item.note === note);
    return duetSide === "lower" ? index < 12 : index >= 12;
  };
  const isGuideNote = (note: string) => highlightedPitchClasses.has(note.replace(/\d/g, ""));

  // Keyboard controls listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore typing in input fields
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.repeat) return; // Prevent key repeat events from multiple triggers

      if (e.code === "Space") {
        e.preventDefault();
        if (soundEnabled) {
          setSustainOn(true);
          audioEngine.setSustain(true);
        }
        return;
      }

      const key = e.key.toLowerCase();
      const mappedNote = KEYBOARD_MAP[key];

      if (mappedNote && isNoteAllowed(mappedNote)) {
        setLocalPressed((prev) => {
          const next = new Set(prev);
          if (!next.has(mappedNote)) {
            next.add(mappedNote);
            audioEngine.playNote(mappedNote, 0.85);
            onNotePlay(mappedNote, userColor);
          }
          return next;
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setSustainOn(false);
        audioEngine.setSustain(false);
        return;
      }
      const key = e.key.toLowerCase();
      const mappedNote = KEYBOARD_MAP[key];

      if (mappedNote) {
        setLocalPressed((prev) => {
          const next = new Set(prev);
          if (next.has(mappedNote)) {
            next.delete(mappedNote);
            audioEngine.stopNote(mappedNote);
            onNoteStop(mappedNote);
          }
          return next;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [userColor, onNotePlay, onNoteStop, duetMode, duetSide, soundEnabled]);

  useEffect(() => {
    if (!soundEnabled) {
      setSustainOn(false);
      audioEngine.setSustain(false);
    }
  }, [soundEnabled]);

  // Clean up all notes if component unmounts
  useEffect(() => {
    return () => {
      audioEngine.setSustain(false);
      audioEngine.stopAll();
    };
  }, []);

  // Handle Mouse Events for Click and Drag sliding play
  const handleKeyTrigger = (note: string) => {
    if (!isNoteAllowed(note)) return;
    if (lastActiveNote.current === note) return;

    // Release last active key if sliding
    if (lastActiveNote.current) {
      const prev = lastActiveNote.current;
      setLocalPressed((p) => {
        const next = new Set(p);
        next.delete(prev);
        return next;
      });
      audioEngine.stopNote(prev);
      onNoteStop(prev);
    }

    setLocalPressed((prev) => {
      const next = new Set(prev);
      next.add(note);
      return next;
    });
    audioEngine.playNote(note, 0.9);
    onNotePlay(note, userColor);
    lastActiveNote.current = note;
  };

  const handleKeyRelease = (note: string) => {
    setLocalPressed((prev) => {
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
    audioEngine.stopNote(note);
    onNoteStop(note);
    if (lastActiveNote.current === note) {
      lastActiveNote.current = null;
    }
  };

  const handleMouseDown = (note: string) => {
    isMouseDown.current = true;
    handleKeyTrigger(note);
  };

  const handleMouseEnter = (note: string) => {
    if (isMouseDown.current) {
      handleKeyTrigger(note);
    }
  };

  const handleMouseLeave = (note: string) => {
    if (isMouseDown.current) {
      handleKeyRelease(note);
    }
  };

  const handleMouseUp = (note: string) => {
    isMouseDown.current = false;
    handleKeyRelease(note);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isMouseDown.current) {
        isMouseDown.current = false;
        if (lastActiveNote.current) {
          handleKeyRelease(lastActiveNote.current);
        }
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  // Separate white and black keys for relative placement in a beautiful layout
  const whiteKeys = PIANO_NOTES.filter((n) => !n.isBlack);
  
  // Quick lookup of matching black key that follows a white key index
  const getOverlappingBlackKey = (whiteNote: string) => {
    const index = PIANO_NOTES.findIndex((n) => n.note === whiteNote);
    if (index === -1) return null;
    const nextNote = PIANO_NOTES[index + 1];
    return nextNote && nextNote.isBlack ? nextNote : null;
  };

  const toggleSustain = () => {
    if (!soundEnabled) return;
    setSustainOn((enabled) => {
      audioEngine.setSustain(!enabled);
      return !enabled;
    });
  };

  const scrollToOctave = (octave: 4 | 5) => {
    const viewport = pianoScrollRef.current;
    if (!viewport) return;
    setMobileOctave(octave);
    viewport.scrollTo({ left: octave === 4 ? 0 : viewport.scrollWidth - viewport.clientWidth, behavior: "smooth" });
  };

  return (
    <div id="virtual-piano-wrapper" className="w-full flex flex-col items-center">
      {/* Help info & toggle bar */}
      <div className="w-full max-w-5xl flex items-center justify-between px-4 py-3 mb-4 glass-panel rounded-2xl text-[#F8F6F4]">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-[#F4B07A]" />
          <span className="text-sm font-sans font-medium tracking-tight">Interactive Keybed</span>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={toggleSustain}
            disabled={!soundEnabled}
            aria-pressed={sustainOn}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-sans font-medium transition-all disabled:opacity-40 ${sustainOn ? "bg-[#D69A97]/35 border border-[#D69A97]/60 text-white" : "bg-white/10 text-[#E2D9D6] hover:bg-white/15"}`}
          >
            <Waves className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sustain</span>
            <span className="font-mono text-[9px] opacity-55">SPACE</span>
          </button>
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-sans font-medium transition-all duration-300 ${
              showLabels
                ? "bg-[#F4B07A] text-[#6E73B8] font-semibold"
                : "bg-white/10 text-[#E2D9D6] hover:bg-white/15"
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>{showLabels ? "Hide Key Hints" : "Show Key Hints"}</span>
          </button>
          
          <div className="hidden sm:flex items-center gap-1 text-xs text-[#E2D9D6]">
            <HelpCircle className="w-3.5 h-3.5 text-[#D69A97]" />
            <span>Slide or drag mouse across keys to play smoothly</span>
          </div>
        </div>
      </div>

      <div className="sm:hidden w-full max-w-5xl mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/8 px-3 py-2 text-[#F8F6F4] backdrop-blur-md">
        <button type="button" onClick={() => scrollToOctave(4)} className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs" aria-label="Show lower octave"><ChevronLeft className="w-3.5 h-3.5" />Lower</button>
        <span className="text-[10px] font-mono tracking-wider text-[#E2D9D6]/70">OCTAVE {mobileOctave}</span>
        <button type="button" onClick={() => scrollToOctave(5)} className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs" aria-label="Show upper octave">Upper<ChevronRight className="w-3.5 h-3.5" /></button>
      </div>

      {/* Main Piano keybed */}
      <div
        ref={pianoScrollRef}
        id="piano-keybed-container"
        className="piano-scroll relative w-full max-w-5xl h-[280px] bg-black/40 p-4 rounded-[28px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border border-white/10 glass-panel-heavy overflow-x-auto overflow-y-hidden select-none"
      >
        {duetMode && (
          <div className="absolute inset-x-4 top-3 z-30 flex pointer-events-none text-[9px] font-mono tracking-[0.18em] text-[#F8F6F4]/75">
            <div className={`w-1/2 text-center ${duetSide === "lower" ? "text-[#F4B07A]" : ""}`}>{duetSide === "lower" ? "YOUR LOWER RANGE" : "PARTNER LOWER RANGE"}</div>
            <div className={`w-1/2 text-center border-l border-white/15 ${duetSide === "upper" ? "text-[#F4B07A]" : ""}`}>{duetSide === "upper" ? "YOUR UPPER RANGE" : "PARTNER UPPER RANGE"}</div>
          </div>
        )}
        <div className="relative flex min-w-[880px] lg:min-w-full h-full justify-center">
          {whiteKeys.map((wk, i) => {
            const isLocalActive = localPressed.has(wk.note);
            const remoteActive = remotePressedKeys.get(wk.note);
            const isActive = isLocalActive || !!remoteActive;
            const isHighlighted = isGuideNote(wk.note);
            const isAllowed = isNoteAllowed(wk.note);
            
            // Set glowing color
            const activeColor = isLocalActive ? userColor : remoteActive?.color || "#F4B07A";
            const activeUser = remoteActive ? remoteActive.username : (isLocalActive ? "You" : "");

            // Look for optional black key to render on top
            const blackKey = getOverlappingBlackKey(wk.note);

            return (
              <div
                key={wk.note}
                className="relative flex-1 group"
                style={{ height: "100%" }}
              >
                {/* White Key */}
                <button
                  onMouseDown={() => handleMouseDown(wk.note)}
                  onMouseEnter={() => handleMouseEnter(wk.note)}
                  onMouseLeave={() => handleMouseLeave(wk.note)}
                  onMouseUp={() => handleMouseUp(wk.note)}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    handleMouseDown(wk.note);
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    handleMouseUp(wk.note);
                  }}
                  className={`w-full h-full rounded-b-[12px] flex flex-col justify-end items-center pb-4 transition-all duration-150 relative cursor-pointer outline-none select-none ${
                    isActive
                      ? "shadow-inner border-t-[4px] border-[#6E73B8]/30"
                      : "bg-[#FAF8F5] hover:bg-[#F2EFEA] shadow-[0_6px_0px_#C8C2BC,0_12px_15px_rgba(0,0,0,0.25)] border-t border-white"
                  } ${duetMode && !isAllowed ? "opacity-55" : ""}`}
                  style={{
                    backgroundColor: isActive ? "#F4B07A" : isHighlighted ? "#FFF0D8" : undefined,
                    boxShadow: isActive 
                      ? `inset 0 -12px 24px rgba(255,255,255,0.4), 0 0 25px ${activeColor}, 0 4px 6px rgba(0,0,0,0.15)`
                      : undefined,
                  }}
                >
                  {/* Subtle inner reflection edge */}
                  <div className="absolute inset-x-1.5 top-0 h-[6px] bg-white/45 rounded-b-sm pointer-events-none" />
                  {isHighlighted && !isActive && <span className="absolute bottom-12 w-2 h-2 rounded-full bg-[#E8A15A]/75 shadow-[0_0_10px_#E8A15A]" />}

                  {/* Remote playing label details inside key */}
                  {remoteActive && (
                    <div className="absolute top-12 left-1 right-1 flex flex-col items-center pointer-events-none">
                      <div 
                        className="w-2.5 h-2.5 rounded-full animate-ping mb-1" 
                        style={{ backgroundColor: activeColor }}
                      />
                      <span className="text-[9px] font-sans font-medium px-1.5 py-0.5 rounded-md bg-black/60 text-[#F8F6F4] max-w-full truncate">
                        {activeUser}
                      </span>
                    </div>
                  )}

                  {/* Local playing label */}
                  {isLocalActive && !remoteActive && (
                    <span className="absolute top-12 text-[9px] font-sans font-medium px-1.5 py-0.5 rounded-md bg-[#6E73B8]/80 text-[#F8F6F4] pointer-events-none">
                      You
                    </span>
                  )}

                  {/* Visual Keyboard mappings */}
                  {showLabels && (
                    <div className="flex flex-col items-center gap-0.5 pointer-events-none">
                      <span className="text-[10px] font-mono font-medium text-black/45 tracking-wider">
                        {wk.keyLabel}
                      </span>
                      <span className="text-[9px] font-sans font-semibold text-black/30">
                        {wk.note}
                      </span>
                    </div>
                  )}
                </button>

                {/* Overlapping Black Key (absolutely positioned on top) */}
                {blackKey && (
                  <div
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
