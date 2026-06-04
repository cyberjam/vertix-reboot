"use client";

import { useEffect, useRef } from "react";
import type { Game } from "phaser";

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;

/**
 * Mounts the Phaser 3 game (client-only) and runs the ArenaScene:
 * top-view camera, a locally-controlled player, and WASD movement.
 */
export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Load Phaser and the scene lazily so they only run in the browser.
      const Phaser = (await import("phaser")).default;
      const { ArenaScene } = await import("./scenes/ArenaScene");
      if (cancelled || !containerRef.current || gameRef.current) return;

      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        parent: containerRef.current,
        backgroundColor: "#0b0e14",
        physics: {
          default: "arcade",
          arcade: { debug: false },
        },
        scene: [ArenaScene],
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
