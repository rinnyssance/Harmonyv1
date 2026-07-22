import React, { useEffect, useRef, useState } from "react";
import { Particle } from "../types";

interface LivingSkyProps {
  particles: Particle[];
  setParticles: React.Dispatch<React.SetStateAction<Particle[]>>;
  energy: number;
}

export const LivingSky: React.FC<LivingSkyProps> = ({ particles, setParticles, energy }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const particlesRef = useRef<Particle[]>([]);

  // Sync ref with state
  useEffect(() => {
    particlesRef.current = particles;
  }, [particles]);

  // Handle Resize using ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Particle Animation Loop inside Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const draw = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      // Get current particles and update them
      const now = Date.now();
      const updatedParticles: Particle[] = [];

      particlesRef.current.forEach((p) => {
        const age = now - p.createdAt;
        const lifespan = 4500; // 4.5 seconds

        if (age < lifespan) {
          // Update physics
          const updatedP = {
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy - 0.012, // subtle upward draft acceleration
            opacity: 1 - age / lifespan, // linear fade out
          };

          // Draw glowing particle
          ctx.save();
          ctx.beginPath();
          ctx.arc(updatedP.x, updatedP.y, updatedP.size, 0, Math.PI * 2);
          
          // Setup glow effect matching active player color
          ctx.shadowBlur = updatedP.size * 2.5;
          ctx.shadowColor = updatedP.color;
          ctx.fillStyle = updatedP.color;
          ctx.globalAlpha = updatedP.opacity;
          ctx.fill();

          // Add a tiny star-like point at the center
          ctx.beginPath();
          ctx.arc(updatedP.x, updatedP.y, updatedP.size * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.shadowBlur = 0;
          ctx.globalAlpha = updatedP.opacity * 1.2;
          ctx.fill();

          // Render very soft floating note symbol above it sometimes
          if (updatedP.size > 5 && age % 250 < 20) {
            ctx.font = "11px sans-serif";
            ctx.fillStyle = "#FFFFFF";
            ctx.globalAlpha = updatedP.opacity * 0.4;
            ctx.fillText("♩", updatedP.x + 8, updatedP.y - 4);
          }

          ctx.restore();
          updatedParticles.push(updatedP);
        }
      });

      // Update parent state periodically if count changes (but avoid infinite react state loop)
      if (updatedParticles.length !== particlesRef.current.length) {
        setParticles(updatedParticles);
      } else {
        // Just update local ref to keep animation smooth without constant react re-renders
        particlesRef.current = updatedParticles;
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrameId);
  }, [dimensions, setParticles]);

  return (
    <div
      ref={containerRef}
      id="living-sky-container"
      className="absolute inset-0 overflow-hidden select-none pointer-events-none z-0 bg-gradient-to-b from-[#6E73B8] via-[#B7B0D8] to-[#F4B07A]"
    >
      <div
        className="absolute inset-0 transition-opacity duration-700 bg-[radial-gradient(circle_at_50%_85%,rgba(232,161,90,.72),rgba(214,154,151,.24)_34%,transparent_68%)]"
        style={{ opacity: 0.16 + energy * 0.52 }}
      />
      <div
        className="absolute left-1/2 bottom-[7%] -translate-x-1/2 rounded-full bg-[#FFE3B5] blur-[2px] transition-all duration-500"
        style={{ width: 68 + energy * 38, height: 68 + energy * 38, opacity: 0.12 + energy * 0.3, boxShadow: `0 0 ${70 + energy * 100}px rgba(244,176,122,.75)` }}
      />
      {/* Dynamic drifting clouds inspired by sunset photography */}
      {/* Cloud 1 */}
      <div
        id="cloud-1"
        className="absolute top-[15%] left-[5%] w-[350px] h-[120px] rounded-full blur-[40px] bg-gradient-to-r from-[#D69A97]/40 to-[#F4B07A]/20 cloud-anim-slow opacity-80"
        style={{ animationDelay: "0s", animationDuration: `${20 - energy * 6}s`, opacity: 0.68 + energy * 0.22 }}
      />
      {/* Cloud 2 */}
      <div
        id="cloud-2"
        className="absolute top-[35%] right-[8%] w-[420px] h-[150px] rounded-full blur-[55px] bg-gradient-to-r from-[#B7B0D8]/50 via-[#D69A97]/30 to-[#F4B07A]/20 cloud-anim-medium opacity-75"
        style={{ animationDelay: "-4s", animationDuration: `${14 - energy * 4}s`, opacity: 0.62 + energy * 0.25 }}
      />
      {/* Cloud 3 */}
      <div
        id="cloud-3"
        className="absolute bottom-[20%] left-[20%] w-[380px] h-[130px] rounded-full blur-[45px] bg-gradient-to-r from-[#6E73B8]/30 via-[#B7B0D8]/40 to-[#F4B07A]/30 cloud-anim-fast opacity-65"
        style={{ animationDelay: "-8s", animationDuration: `${9 - energy * 2}s`, opacity: 0.55 + energy * 0.28 }}
      />
      {/* Cloud 4 */}
      <div
        id="cloud-4"
        className="absolute top-[5%] right-[25%] w-[250px] h-[90px] rounded-full blur-[35px] bg-gradient-to-r from-[#FFFFFF]/15 to-[#B7B0D8]/30 cloud-anim-slow opacity-50"
        style={{ animationDelay: "-12s" }}
      />

      {/* Interactive Floating Notes Particle Layer */}
      <canvas
        ref={canvasRef}
        id="sky-particles-canvas"
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0 z-10 block"
      />

      {/* Gentle horizontal horizon glow line */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/35 to-transparent blur-[2px] transition-all duration-500" style={{ height: 2 + energy * 8, opacity: 0.35 + energy * 0.55 }} />
    </div>
  );
};
