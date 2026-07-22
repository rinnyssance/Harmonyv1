export interface User {
  username: string;
  color: string;
}

export interface Room {
  id: string;
  name: string;
  notesCount: number;
  users: User[];
  isPrivate?: boolean;
}

export interface NoteEvent {
  note: string;
  velocity: number;
  color: string;
  username: string;
  socketId?: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  username: string;
  color: string;
  text: string;
  createdAt: number;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  color: string;
  note: string;
  size: number;
  vx: number;
  vy: number;
  opacity: number;
  createdAt: number;
}

export interface InstrumentPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  oscillatorType: OscillatorType;
  filterType: BiquadFilterType;
  cutoff: number;
  resonance: number;
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  delayTime?: number;
  delayFeedback?: number;
}
