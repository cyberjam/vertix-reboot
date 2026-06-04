"use client";

import { useEffect, useRef } from "react";
import type { Game } from "phaser";

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;

/**
 * Mounts a minimal Phaser 3 game with a single "boot" scene.
 *
 * Milestone 1: proves Phaser renders inside Next.js (client-only). There is
 * no gameplay, input, networking or map yet — those arrive in M3+.
 */
export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Import Phaser lazily so it only loads in the browser.
      const Phaser = (await import("phaser")).default;
      if (cancelled || !containerRef.current || gameRef.current) return;

      class BootScene extends Phaser.Scene {
        constructor() {
          super("boot");
        }

        create(): void {
          const { width, height } = this.scale;
          this.add
            .text(width / 2, height / 2, "Vertix Reboot\nPhaser boot OK", {
              fontFamily: "monospace",
              fontSize: "24px",
              color: "#4ea1ff",
              align: "center",
            })
            .setOrigin(0.5);
        }
      }

      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        parent: containerRef.current,
        backgroundColor: "#0b0e14",
        scene: [BootScene],
      });
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: GAME_WIDTH, height: GAME_HEIGHT, border: "1px solid #1c2330" }}
    />
  );
}
