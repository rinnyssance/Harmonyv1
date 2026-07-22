# 🎹 Harmony

> **A place to come home to.**
>
> **Designed and built by Rinnyssance with OpenAI Codex (GPT-5.6).**

---

## Overview

Harmony is a browser-based multiplayer piano experience designed to make online music feel warm, welcoming, and genuinely social.

Most online multiplayer piano websites let people join, play a few notes, and disappear. They often feel empty, outdated, and disconnected.

Harmony was created with a different vision.

Instead of another social platform built around feeds, likes, or arguments, Harmony is designed around **shared creativity**. It is a place where musicians can meet through music first—whether they're practicing scales, improvising with strangers, or simply listening together.

The goal is simple:

> Create an online space that feels like coming home.

---

# Why Harmony Exists

When I started learning piano, I realized that practicing alone can be incredibly isolating.

I wanted a place where I could sit down, play a single note, and hear someone else somewhere in the world answer with another.

No introductions.

No pressure.

Just music.

Harmony is an attempt to build that experience.

---

# Design Philosophy

Harmony is inspired by **golden hour**—the warm, peaceful light that appears just before sunset.

Every design decision asks the same question:

> **How can software make someone feel cared for?**

Instead of bright, distracting interfaces, Harmony focuses on warmth, calm, and simplicity so musicians can relax, create, and connect.

The experience is intentionally designed to feel comfortable rather than overwhelming.

---

# Current Beta Features

## 🎹 Real-Time Multiplayer Piano

Play piano together with other musicians directly in your browser.

---

## 🌍 Public & Private Rooms

Create rooms for friends or join public spaces to meet new musicians.

---

## 💬 Live Chat

Talk while you play without leaving the room.

---

## ⌨️ Computer Keyboard Support

No piano required.

Use your computer keyboard to start playing immediately.

---

## 🎛️ MIDI Keyboard Support

Connect compatible MIDI devices for a more natural playing experience.

---

## ✨ Calm, Modern Interface

A clean UI designed around creativity instead of distraction.

---

# Planned Features

Harmony is just getting started.

Future versions may include:

- Rich user profiles
- Friends system
- Better mobile support
- Collaborative sheet music
- Live video practice rooms
- Recording and playback
- Practice statistics
- Musical achievements
- Room moderation tools
- Community events
- Jam session discovery
- AI-assisted practice tools
- Accessibility improvements
- More instruments

The long-term vision is to build a genuine online home for musicians.

---

# Technology

Harmony is built as a modern web application using technologies including:

- React
- TypeScript
- Vite
- Web Audio API
- Web MIDI API
- Supabase Auth, Postgres, and Realtime
- Vercel

---

# OpenAI Build Week

Harmony was created for the **OpenAI Build Week Challenge** using **GPT-5.6 and Codex**.

Codex accelerated development by assisting with:

- Architecture decisions
- Feature implementation
- Refactoring
- Debugging
- UI improvements
- Documentation
- Iterative development
- Rapid prototyping

Rather than generating a finished application from a single prompt, Codex served as an active development partner throughout the project.

---

# Running the Project

Harmony requires Node.js 22 or newer.

```bash
git clone https://github.com/rinnyssance/Harmonyv1.git

cd Harmonyv1

npm install

# Copy .env.example to .env.local and add your public Supabase project values.
npm run dev
```

Then open your browser to the local development server shown in the terminal.

Supabase anonymous guest sign-in must be enabled. The database migrations in
`supabase/migrations` create the room RPCs, RLS policies, permanent rooms,
Realtime authorization, and stale-room cleanup.

## Checks

```bash
npm run typecheck
npm run build
```

---

# Deploying to Vercel

1. Import this repository into Vercel and keep the Vite framework preset.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to Development,
   Preview, and Production. The existing Supabase Marketplace names
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are also
   recognized for compatibility.
3. Never add a Supabase service-role or secret key to Vercel's browser build.
4. Deploy, open the lobby, and create or join a room. The piano opens only after
   its authenticated private Realtime channel is subscribed.

---

# Project Vision

Harmony isn't trying to become another social media platform.

It's trying to become something much smaller—and much more meaningful.

A place where someone can sit down after a long day...

Play one note...

Hear another person answer...

And remember that music is one of the few languages everyone already speaks.

---

# About the Creator

**Rinnyssance**

Harmony is an independent project created by Rinnyssance to explore how thoughtful software design can foster creativity, community, and meaningful human connection through music.

---

# Built With

- ❤️ OpenAI GPT-5.6
- 🤖 OpenAI Codex
- 🎹 Passion for music
- ☀️ Inspiration from golden hour
- 🌍 A belief that the internet should have more places where people create together

---

## License

This project is licensed under the MIT License unless otherwise specified.
