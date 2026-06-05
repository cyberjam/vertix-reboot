"use client";

import { useEffect, useRef } from "react";
import type { Room } from "colyseus.js";
import { WORLD, ARENA01, getClass } from "@vertix/shared";

const SIZE = 150; // minimap canvas size (px)

interface PlayerLike {
  x: number;
  y: number;
  classId: string;
  alive: boolean;
}
interface PackLike {
  x: number;
  y: number;
  active: boolean;
}

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

/**
 * Live minimap (T4) — reproduces Vertix's `#mapc`. Draws the static ARENA01
 * walls plus the live player/health-pack positions from room state onto a
 * canvas each frame. Read-only overlay (no interaction).
 */
export default function Minimap({ room, sessionId }: { room: Room; sessionId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sx = SIZE / WORLD.WIDTH;
    const sy = SIZE / WORLD.HEIGHT;
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);

      // Background + border.
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = "rgba(14, 17, 24, 0.85)";
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Static walls.
      ctx.fillStyle = "#39435c";
      for (const w of ARENA01.walls) {
        ctx.fillRect(w.x * sx, w.y * sy, w.w * sx, w.h * sy);
      }

      const state = room.state as {
        players: { forEach(cb: (p: PlayerLike, id: string) => void): void };
        healthPacks: { forEach(cb: (p: PackLike) => void): void };
      };

      // Active health packs.
      state.healthPacks.forEach((pack) => {
        if (!pack.active) return;
        ctx.fillStyle = "#2ecc71";
        ctx.beginPath();
        ctx.arc(pack.x * sx, pack.y * sy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Players (self highlighted, dead dimmed).
      state.players.forEach((p, id) => {
        const isSelf = id === sessionId;
        ctx.globalAlpha = p.alive ? 1 : 0.3;
        ctx.fillStyle = isSelf ? "#ffffff" : hex(getClass(p.classId).color);
        ctx.beginPath();
        ctx.arc(p.x * sx, p.y * sy, isSelf ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
        if (isSelf) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = "#5151d9";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [room, sessionId]);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      style={{
        position: "absolute",
        right: 12,
        bottom: 14,
        width: SIZE,
        height: SIZE,
        border: "1px solid rgba(42, 51, 70, 0.9)",
        borderRadius: 6,
      }}
    />
  );
}
