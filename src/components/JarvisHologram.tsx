"use client";

import { useEffect, useRef } from "react";

export type HologramMode = "idle" | "listening" | "thinking" | "speaking" | "alert";

type JarvisHologramProps = {
  mode: HologramMode;
  audioLevel?: number;
};

const MODE_LABELS: Record<HologramMode, string> = {
  idle: "รอเรียก",
  listening: "กำลังฟัง",
  thinking: "กำลังคิด",
  speaking: "กำลังพูด",
  alert: "แจ้งเตือน",
};

function modeEnergy(mode: HologramMode, time: number) {
  if (mode === "idle") return 0.26 + Math.sin(time * 1.8) * 0.05;
  if (mode === "listening") return 0.52 + Math.sin(time * 8) * 0.18;
  if (mode === "thinking") return 0.58 + Math.sin(time * 5.4) * 0.12;
  if (mode === "speaking") return 0.72 + Math.sin(time * 15) * 0.2 + Math.sin(time * 31) * 0.08;
  return 0.86 + Math.sin(time * 10) * 0.16;
}

function strokeCircle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number, color = "56, 214, 255") {
  ctx.strokeStyle = `rgba(${color}, ${alpha})`;
  ctx.lineWidth = Math.max(1, radius * 0.008);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

export function JarvisHologram({ mode, audioLevel = 0 }: JarvisHologramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  const audioLevelRef = useRef(audioLevel);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const targetCanvas = canvas;
    const targetCtx = ctx;
    let frameId = 0;
    let start = performance.now();

    function resize() {
      const rect = targetCanvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      targetCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
      targetCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
      targetCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(now: number) {
      const canvas = targetCanvas;
      const ctx = targetCtx;
      const t = (now - start) / 1000;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const currentMode = modeRef.current;
      const level = Math.min(1, Math.max(0, audioLevelRef.current));
      const energy = Math.min(1, modeEnergy(currentMode, t) + (currentMode === "speaking" || currentMode === "listening" ? level * 0.42 : 0));
      const cx = width / 2;
      const cy = height * 0.48;
      const base = Math.min(width, height) * 0.31;
      const cyan = "56, 214, 255";
      const amber = "255, 177, 69";

      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.65);
      bg.addColorStop(0, `rgba(34, 177, 255, ${0.18 + energy * 0.08})`);
      bg.addColorStop(0.38, "rgba(4, 34, 56, 0.58)");
      bg.addColorStop(1, "rgba(1, 8, 18, 0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * (currentMode === "speaking" ? 0.65 : currentMode === "thinking" ? 0.42 : 0.18));
      for (let i = 0; i < 5; i += 1) {
        const radius = base * (0.72 + i * 0.18 + energy * 0.03);
        ctx.setLineDash(i % 2 ? [4, 10] : []);
        strokeCircle(ctx, 0, 0, radius, 0.5 - i * 0.07, i === 3 && currentMode === "thinking" ? amber : cyan);
      }
      ctx.setLineDash([]);
      ctx.restore();

      for (let i = 0; i < 3; i += 1) {
        const orbit = base * (1.18 + i * 0.22);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * (0.22 + i * 0.04) + i * 0.9);
        ctx.scale(1.72, 0.42 + i * 0.08);
        ctx.strokeStyle = `rgba(${i === 1 && currentMode !== "idle" ? amber : cyan}, ${0.26 - i * 0.04})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, orbit, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const waveY = cy;
      const waveWidth = width * 0.84;
      ctx.strokeStyle = `rgba(${cyan}, ${0.62 + energy * 0.22})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i <= 180; i += 1) {
        const p = i / 180;
        const x = cx - waveWidth / 2 + waveWidth * p;
        const distance = Math.abs(p - 0.5) * 2;
        const envelope = Math.max(0.06, 1 - distance);
        const speakingBoost = currentMode === "speaking" || currentMode === "listening" ? 1 + level * 1.35 : 0.35;
        const y =
          waveY +
          Math.sin(i * 0.55 + t * 12) * base * 0.12 * envelope * energy * speakingBoost +
          Math.sin(i * 1.7 + t * 25) * base * 0.035 * envelope * speakingBoost;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 0.68);
      core.addColorStop(0, `rgba(255, 255, 255, ${0.78 + energy * 0.2})`);
      core.addColorStop(0.16, `rgba(${cyan}, ${0.68 + energy * 0.18})`);
      core.addColorStop(0.55, `rgba(${cyan}, ${0.16 + energy * 0.08})`);
      core.addColorStop(1, "rgba(56, 214, 255, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, base * (0.34 + energy * 0.05), 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 44; i += 1) {
        const angle = i * 0.73 + t * (currentMode === "thinking" ? 1.6 : 0.45);
        const radius = base * (0.78 + ((i * 17) % 44) / 80);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const pulse = 0.35 + Math.sin(t * 4 + i) * 0.25;
        ctx.fillStyle = `rgba(${i % 9 === 0 ? amber : cyan}, ${pulse})`;
        ctx.beginPath();
        ctx.arc(x, y, i % 9 === 0 ? 2.2 : 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (currentMode === "alert") {
        for (let i = 0; i < 3; i += 1) {
          const progress = (t * 1.4 + i * 0.32) % 1;
          strokeCircle(ctx, cx, cy, base * (0.8 + progress * 1.25), (1 - progress) * 0.48, amber);
        }
      }

      ctx.strokeStyle = `rgba(${cyan}, 0.28)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, height * 0.08);
      ctx.lineTo(cx, height * 0.9);
      ctx.stroke();

      const platformY = height * 0.84;
      for (let i = 0; i < 5; i += 1) {
        ctx.save();
        ctx.translate(cx, platformY);
        ctx.scale(1, 0.22);
        strokeCircle(ctx, 0, 0, base * (0.42 + i * 0.18), 0.3 - i * 0.04);
        ctx.restore();
      }

      frameId = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      start = 0;
    };
  }, []);

  return (
    <section className={`hologram-panel hologram-${mode}`} aria-label={`Jarvis hologram ${MODE_LABELS[mode]}`}>
      <canvas ref={canvasRef} />
      <div className="hologram-caption">
        <span />
        {MODE_LABELS[mode]}
      </div>
    </section>
  );
}
