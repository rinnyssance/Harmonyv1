import { useEffect, useRef, useState } from "react";
import { ChevronRight, Keyboard, MessageCircle, Music2, Sparkles, UsersRound, X } from "lucide-react";

interface WelcomeTourProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    eyebrow: "Find your people",
    title: "Choose an aura and join a room",
    body: "Pick a musician name and color, then join a public sunset room or create a private one for friends.",
    icon: UsersRound
  },
  {
    eyebrow: "Play naturally",
    title: "Use the keys, MIDI, or touch",
    body: "Play with your computer keyboard, tap the piano, or connect a MIDI controller. Hold Space for sustain.",
    icon: Keyboard
  },
  {
    eyebrow: "Create together",
    title: "Shape a shared sunset",
    body: "Try duet mode, scale guides, chat, and the metronome. Every note adds light and movement to the sky.",
    icon: Music2
  }
] as const;

export function WelcomeTour({ open, onClose }: WelcomeTourProps) {
  const [step, setStep] = useState(0);
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);
  const current = STEPS[step];
  const Icon = current.icon;

  useEffect(() => {
    if (!open) return;
    setStep(0);
    nextButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const finish = () => {
    localStorage.setItem("harmony-tour-complete", "true");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#474B85]/55 backdrop-blur-md p-4" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="relative w-full max-w-lg overflow-hidden rounded-[30px] border border-white/20 bg-gradient-to-br from-[#777CC1]/95 via-[#A79FCE]/95 to-[#D89C91]/95 p-6 sm:p-8 text-[#F8F6F4] shadow-[0_30px_90px_rgba(54,47,100,.45)]">
        <button onClick={finish} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Close welcome tour"><X className="h-4 w-4" /></button>
        <div className="mb-7 flex items-center gap-2 text-[10px] font-mono tracking-[0.2em] text-[#F8F6F4]/65"><Sparkles className="h-3.5 w-3.5 text-[#FFD39E]" />WELCOME TO HARMONY</div>
        <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl border border-white/20 bg-white/12 shadow-[0_10px_30px_rgba(244,176,122,.2)]"><Icon className="h-7 w-7 text-[#FFE0B9]" /></div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#FFE0B9]">{current.eyebrow}</p>
        <h2 id="tour-title" className="mb-3 font-display text-3xl font-semibold tracking-tight">{current.title}</h2>
        <p className="min-h-16 text-sm leading-6 text-[#F8F6F4]/80">{current.body}</p>
        <div className="mt-8 flex items-center justify-between gap-4">
          <div className="flex gap-2" aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((_, index) => <span key={index} className={`h-1.5 rounded-full transition-all ${index === step ? "w-7 bg-[#FFE0B9]" : "w-1.5 bg-white/25"}`} />)}</div>
          <div className="flex items-center gap-2">
            <button onClick={finish} className="px-3 py-2 text-xs text-[#F8F6F4]/60 hover:text-white">Skip</button>
            <button ref={nextButtonRef} onClick={() => step === STEPS.length - 1 ? finish() : setStep((value) => value + 1)} className="btn-sunset flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold text-[#555A97]">
              {step === STEPS.length - 1 ? "Start playing" : "Next"}<ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-center gap-1.5 text-[9px] text-[#F8F6F4]/45"><MessageCircle className="h-3 w-3" />You can replay this tour from the header.</div>
      </div>
    </div>
  );
}
