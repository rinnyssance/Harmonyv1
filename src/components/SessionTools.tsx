import React, { useEffect, useRef, useState } from "react";
import { Copy, Gauge, Link2, Music2, Piano, Radio, UsersRound } from "lucide-react";

export type DuetSide = "lower" | "upper";
export type GuideMode = "none" | "major" | "minor" | "pentatonic" | "major-chord" | "minor-chord" | "major-seven";

interface SessionToolsProps {
  roomId: string;
  accessCode?: string;
  duetMode: boolean;
  duetSide: DuetSide;
  onDuetModeChange: (enabled: boolean) => void;
  onDuetSideChange: (side: DuetSide) => void;
  guideRoot: string;
  guideMode: GuideMode;
  onGuideRootChange: (root: string) => void;
  onGuideModeChange: (mode: GuideMode) => void;
  midiEnabled: boolean;
  midiStatus: string;
  onMidiToggle: () => void;
  soundEnabled: boolean;
}

const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const SessionTools: React.FC<SessionToolsProps> = ({
  roomId,
  accessCode,
  duetMode,
  duetSide,
  onDuetModeChange,
  onDuetSideChange,
  guideRoot,
  guideMode,
  onGuideRootChange,
  onGuideModeChange,
  midiEnabled,
  midiStatus,
  onMidiToggle,
  soundEnabled
}) => {
  const [bpm, setBpm] = useState(76);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [countIn, setCountIn] = useState(0);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const countInTimerRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const click = (accent = false) => {
    if (!soundEnabled) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = audioRef.current || new AudioCtx();
    audioRef.current = ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 880 : 620;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  };

  useEffect(() => {
    if (!soundEnabled) {
      setIsMetronomeOn(false);
      setCountIn(0);
      if (countInTimerRef.current) window.clearInterval(countInTimerRef.current);
    }
  }, [soundEnabled]);

  useEffect(() => {
    if (!isMetronomeOn) return;
    let beat = 0;
    click(true);
    timerRef.current = window.setInterval(() => {
      beat = (beat + 1) % 4;
      click(beat === 0);
    }, 60000 / bpm);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isMetronomeOn, bpm, soundEnabled]);

  const startCountIn = () => {
    if (!soundEnabled) return;
    if (countIn) return;
    let beat = 1;
    setCountIn(beat);
    click(true);
    countInTimerRef.current = window.setInterval(() => {
      beat += 1;
      if (beat > 4) {
        if (countInTimerRef.current) window.clearInterval(countInTimerRef.current);
        countInTimerRef.current = null;
        setCountIn(0);
        setIsMetronomeOn(true);
        return;
      }
      setCountIn(beat);
      click(beat === 1);
    }, 60000 / bpm);
  };

  const copyInvite = async () => {
    const url = new URL(window.location.origin);
    url.searchParams.set("room", roomId);
    if (accessCode) url.searchParams.set("code", accessCode);
    await navigator.clipboard.writeText(url.toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const selectClass = "w-full bg-black/15 border border-white/10 rounded-xl px-3 py-2 text-xs text-[#F8F6F4] outline-none focus:border-[#F4B07A]/60";

  return (
    <section className="w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 z-10">
      <div className="glass-panel-light p-4 text-[#F8F6F4]">
        <div className="flex items-center gap-2 mb-3"><Gauge className="w-4 h-4 text-[#E8A15A]" /><h3 className="text-xs font-semibold">Gentle Metronome</h3></div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsMetronomeOn((v) => !v)} className={`px-3 py-2 rounded-xl text-xs font-semibold ${isMetronomeOn ? "bg-[#D69A97]/30" : "bg-white/10"}`}>{isMetronomeOn ? "Stop" : "Start"}</button>
          <button onClick={startCountIn} className="px-3 py-2 rounded-xl text-xs bg-[#F4B07A] text-[#5B5F9A] font-bold">{countIn ? `${countIn} / 4` : "4-beat count-in"}</button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[10px] text-[#E2D9D6]"><input type="range" min="45" max="160" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="flex-1 accent-[#F4B07A]" /><span className="font-mono w-12">{bpm} BPM</span></label>
      </div>

      <div className="glass-panel-light p-4 text-[#F8F6F4]">
        <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><UsersRound className="w-4 h-4 text-[#B7B0D8]" /><h3 className="text-xs font-semibold">Duet Mode</h3></div><button onClick={() => onDuetModeChange(!duetMode)} className={`w-9 h-5 rounded-full p-0.5 transition-colors ${duetMode ? "bg-[#F4B07A]" : "bg-white/15"}`}><span className={`block w-4 h-4 rounded-full bg-white transition-transform ${duetMode ? "translate-x-4" : ""}`} /></button></div>
        <div className="grid grid-cols-2 gap-2">
          {(["lower", "upper"] as DuetSide[]).map((side) => <button key={side} disabled={!duetMode} onClick={() => onDuetSideChange(side)} className={`rounded-xl py-2 text-xs capitalize disabled:opacity-40 ${duetSide === side && duetMode ? "bg-[#D69A97]/35 border border-[#D69A97]/60" : "bg-white/5 border border-white/5"}`}>{side} keys</button>)}
        </div>
        <p className="mt-2 text-[10px] text-[#E2D9D6]/55">Choose your half; your partner can take the other range.</p>
      </div>

      <div className="glass-panel-light p-4 text-[#F8F6F4]">
        <div className="flex items-center gap-2 mb-3"><Music2 className="w-4 h-4 text-[#F4B07A]" /><h3 className="text-xs font-semibold">Scale & Chord Guide</h3></div>
        <div className="grid grid-cols-[72px_1fr] gap-2">
          <select value={guideRoot} onChange={(e) => onGuideRootChange(e.target.value)} className={selectClass}>{ROOTS.map((root) => <option key={root} value={root}>{root}</option>)}</select>
          <select value={guideMode} onChange={(e) => onGuideModeChange(e.target.value as GuideMode)} className={selectClass}>
            <option value="none">Guide off</option><option value="major">Major scale</option><option value="minor">Minor scale</option><option value="pentatonic">Major pentatonic</option><option value="major-chord">Major chord</option><option value="minor-chord">Minor chord</option><option value="major-seven">Major 7 chord</option>
          </select>
        </div>
        <p className="mt-2 text-[10px] text-[#E2D9D6]/55">Matching keys glow softly without changing what you can play.</p>
      </div>

      <div className="glass-panel-light p-4 text-[#F8F6F4] flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-3"><Piano className="w-4 h-4 text-[#D69A97]" /><h3 className="text-xs font-semibold">MIDI & Invite</h3></div>
          <div className="flex gap-2">
            <button onClick={onMidiToggle} className={`flex-1 px-3 py-2 rounded-xl text-xs ${midiEnabled ? "bg-[#D69A97]/35" : "bg-white/10"}`}><Radio className="w-3 h-3 inline mr-1" />{midiEnabled ? "MIDI on" : "Connect MIDI"}</button>
            <button onClick={copyInvite} className="flex-1 px-3 py-2 rounded-xl text-xs btn-sunset"><Copy className="w-3 h-3 inline mr-1" />{copied ? "Copied" : "Invite"}</button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-[#E2D9D6]/55 flex items-center gap-1"><Link2 className="w-3 h-3" />{accessCode ? `Private room • code ${accessCode}` : midiStatus}</p>
      </div>
    </section>
  );
};
