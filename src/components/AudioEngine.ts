import { InstrumentPreset } from "../types";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function noteToFreq(note: string): number {
  const match = note.match(/^([A-G]#?)(\d)$/);
  if (!match) return 440;
  const name = match[1];
  const octave = parseInt(match[2], 10);
  const semitones = NOTE_NAMES.indexOf(name);
  const midi = 12 * (octave + 1) + semitones;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  {
    id: "classic-piano",
    name: "Classic Piano",
    icon: "🎹",
    description: "A clean, precisely tuned piano voice with a crisp strike and balanced natural decay",
    oscillatorType: "sine",
    filterType: "lowpass",
    cutoff: 4200,
    resonance: 0.15,
    envelope: {
      attack: 0.002,
      decay: 1.55,
      sustain: 0.035,
      release: 0.32
    },
    delayTime: 0.045,
    delayFeedback: 0.025
  },
  {
    id: "soft-felt-piano",
    name: "Soft Felt Piano",
    icon: "🕯️",
    description: "An intimate, muted piano with a warm felt attack and lingering soft release",
    oscillatorType: "triangle",
    filterType: "lowpass",
    cutoff: 1450,
    resonance: 0.35,
    envelope: {
      attack: 0.009,
      decay: 1.85,
      sustain: 0.09,
      release: 0.75
    },
    delayTime: 0.14,
    delayFeedback: 0.07
  },
  {
    id: "sunset-rhodes",
    name: "Sunset Rhodes",
    icon: "🌅",
    description: "Warm, soft digital electric piano with gentle delay",
    oscillatorType: "triangle",
    filterType: "lowpass",
    cutoff: 800,
    resonance: 1.5,
    envelope: {
      attack: 0.008,
      decay: 1.2,
      sustain: 0.2,
      release: 0.8
    },
    delayTime: 0.35,
    delayFeedback: 0.3
  },
  {
    id: "cloud-pad",
    name: "Cloud Pad",
    icon: "☁️",
    description: "Slow-swelling ambient synthesizer with lush reverb feel",
    oscillatorType: "sawtooth",
    filterType: "lowpass",
    cutoff: 550,
    resonance: 3.0,
    envelope: {
      attack: 0.4,
      decay: 2.0,
      sustain: 0.6,
      release: 1.8
    },
    delayTime: 0.5,
    delayFeedback: 0.45
  },
  {
    id: "sine-bell",
    name: "Golden Bell",
    icon: "✨",
    description: "Pure, crystalline tone with quick, shiny decay",
    oscillatorType: "sine",
    filterType: "highpass",
    cutoff: 300,
    resonance: 1.0,
    envelope: {
      attack: 0.002,
      decay: 0.6,
      sustain: 0.0,
      release: 0.5
    },
    delayTime: 0.2,
    delayFeedback: 0.25
  },
  {
    id: "dreamy-organ",
    name: "Dreamy Organ",
    icon: "🎹",
    description: "Subtle vintage organ with soft harmonic overtones",
    oscillatorType: "triangle",
    filterType: "lowpass",
    cutoff: 1200,
    resonance: 0.8,
    envelope: {
      attack: 0.05,
      decay: 0.5,
      sustain: 0.8,
      release: 0.4
    },
    delayTime: 0.4,
    delayFeedback: 0.15
  }
];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private activeVoices: Map<string, {
    oscs: OscillatorNode[];
    gains: GainNode[];
    filter: BiquadFilterNode;
  }> = new Map();

  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.35;
  private isMuted = false;
  private sustainEnabled = false;
  private sustainedNotes = new Set<string>();
  private currentPreset: InstrumentPreset = INSTRUMENT_PRESETS[0];

  constructor() {
    // Lazy-initialized on user gesture
  }

  public init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) {
      console.warn("Web Audio API not supported in this browser.");
      return;
    }
    this.ctx = new AudioCtx();
    
    // Setup master volume
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);

    // Setup dreamy echo delay line
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayFeedback = this.ctx.createGain();

    this.updateDelaySettings();

    // Route delay nodes
    if (this.delayNode && this.delayFeedback && this.masterGain) {
      this.delayNode.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode); // feedback loop
      this.masterGain.connect(this.ctx.destination);
      this.delayNode.connect(this.masterGain);
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) this.stopAll();
    if (!this.masterGain || !this.ctx) return;
    this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.015);
  }

  public setSustain(enabled: boolean) {
    this.sustainEnabled = enabled;
    if (!enabled) {
      const notesToRelease = [...this.sustainedNotes];
      this.sustainedNotes.clear();
      notesToRelease.forEach((note) => this.releaseVoice(note));
    }
  }

  public setPreset(preset: InstrumentPreset) {
    this.currentPreset = preset;
    this.updateDelaySettings();
  }

  private updateDelaySettings() {
    if (!this.ctx || !this.delayNode || !this.delayFeedback) return;
    const time = this.currentPreset.delayTime || 0.3;
    const feedback = this.currentPreset.delayFeedback || 0.25;

    this.delayNode.delayTime.setValueAtTime(time, this.ctx.currentTime);
    this.delayFeedback.gain.setValueAtTime(feedback, this.ctx.currentTime);
  }

  public playNote(note: string, velocity: number = 0.8) {
    if (this.isMuted) return;
    this.init(); // Ensure initialized
    if (!this.ctx || this.ctx.state === "suspended") {
      this.ctx?.resume();
    }
    if (!this.ctx || !this.masterGain) return;

    // Release voice if already playing to prevent stacking
    this.sustainedNotes.delete(note);
    this.releaseVoice(note);

    const freq = noteToFreq(note);
    const now = this.ctx.currentTime;

    // Create Oscillators (we can stack a sub-octave or harmonic for warmth)
    const filter = this.ctx.createBiquadFilter();
    filter.type = this.currentPreset.filterType;
    // Dynamic filter sweep based on note pitch and cutoff
    filter.frequency.setValueAtTime(this.currentPreset.cutoff + (freq * 0.2), now);
    filter.Q.setValueAtTime(this.currentPreset.resonance, now);

    const osc1 = this.ctx.createOscillator();
    osc1.type = this.currentPreset.oscillatorType;
    osc1.frequency.setValueAtTime(freq, now);

    const gainNode1 = this.ctx.createGain();
    gainNode1.gain.setValueAtTime(0.0001, now);
    // Attack phase
    gainNode1.gain.linearRampToValueAtTime(
      velocity * 0.35,
      now + this.currentPreset.envelope.attack
    );
    // Decay and Sustain phase
    gainNode1.gain.exponentialRampToValueAtTime(
      Math.max(velocity * 0.35 * this.currentPreset.envelope.sustain, 0.0001),
      now + this.currentPreset.envelope.attack + this.currentPreset.envelope.decay
    );

    // Dynamic layering: acoustic presets use only exact integer harmonics so
    // every key remains locked to its fundamental pitch.
    const oscs = [osc1];
    const gains = [gainNode1];

    if (
      this.currentPreset.id === "classic-piano" ||
      this.currentPreset.id === "soft-felt-piano" ||
      this.currentPreset.id === "sunset-rhodes" ||
      this.currentPreset.id === "cloud-pad"
    ) {
      const osc2 = this.ctx.createOscillator();
      const isAcousticPiano = this.currentPreset.id === "classic-piano" || this.currentPreset.id === "soft-felt-piano";
      // A quiet upper harmonic adds a piano-like strike; dreamy presets keep a warm sub-octave.
      osc2.type = isAcousticPiano || this.currentPreset.id === "sunset-rhodes" ? "sine" : "triangle";
      osc2.frequency.setValueAtTime(isAcousticPiano ? freq * 2 : freq * 0.5, now);

      const gainNode2 = this.ctx.createGain();
      gainNode2.gain.setValueAtTime(0.0001, now);
      const layerLevel = isAcousticPiano
        ? velocity * (this.currentPreset.id === "classic-piano" ? 0.035 : 0.022)
        : velocity * 0.2;
      gainNode2.gain.linearRampToValueAtTime(layerLevel, now + this.currentPreset.envelope.attack * 1.5);
      gainNode2.gain.exponentialRampToValueAtTime(
        Math.max(layerLevel * this.currentPreset.envelope.sustain, 0.0001),
        now + this.currentPreset.envelope.attack * 1.5 + this.currentPreset.envelope.decay
      );

      osc2.connect(gainNode2);
      gainNode2.connect(filter);
      oscs.push(osc2);
      gains.push(gainNode2);
    }

    // Connect voices to filter, filter to master AND delay
    oscs.forEach((osc, idx) => {
      osc.connect(gains[idx]);
      gains[idx].connect(filter);
    });

    filter.connect(this.masterGain);
    if (this.delayNode) {
      filter.connect(this.delayNode); // Send to delay channel
    }

    // Start oscillators
    oscs.forEach(osc => osc.start(now));

    // Save playing voice reference
    this.activeVoices.set(note, { oscs, gains, filter });
  }

  public stopNote(note: string) {
    if (!this.ctx) return;
    if (this.sustainEnabled && this.activeVoices.has(note)) {
      this.sustainedNotes.add(note);
      return;
    }
    this.releaseVoice(note);
  }

  private releaseVoice(note: string) {
    if (!this.ctx) return;
    const voice = this.activeVoices.get(note);
    if (!voice) return;

    const now = this.ctx.currentTime;
    
    // Apply Release envelope
    voice.gains.forEach(gainNode => {
      try {
        const currentVal = gainNode.gain.value;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(currentVal, now);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + this.currentPreset.envelope.release);
      } catch (e) {
        // Fallback for browsers
        gainNode.gain.setValueAtTime(0, now + this.currentPreset.envelope.release);
      }
    });

    // Stop and clean up after release time completes
    const releaseTime = this.currentPreset.envelope.release;
    voice.oscs.forEach(osc => {
      try {
        osc.stop(now + releaseTime);
      } catch (e) {}
    });

    this.activeVoices.delete(note);
  }

  public stopAll() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.activeVoices.forEach((voice) => {
      voice.gains.forEach(gainNode => {
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0.0001, now);
      });
      voice.oscs.forEach(osc => {
        try {
          osc.stop(now);
        } catch (e) {}
      });
    });
    this.activeVoices.clear();
    this.sustainedNotes.clear();
    this.sustainEnabled = false;
  }
}

export const audioEngine = new AudioEngine();
