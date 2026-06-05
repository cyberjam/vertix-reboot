"use client";

import { useEffect, useRef } from "react";
import type { Game } from "phaser";
import type { Room } from "colyseus.js";

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;

interface PhaserGameProps {
  room: Room;
  sessionId: string;
}

/**
 * Mounts the Phaser 3 game (client-only) and runs the ArenaScene with the live
 * Colyseus `room` injected as scene data. The connection itself is owned by the
 * NetProvider; the scene only renders, predicts and sends input.
 */
export default function PhaserGame({ room, sessionId }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Load Phaser and the scene lazily so they only run in the browser.
      const Phaser = (await import("phaser")).default;
      const { ArenaScene } = await import("./scenes/ArenaScene");
      if (cancelled || !containerRef.current || gameRef.current) return;

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        parent: containerRef.current,
        backgroundColor: "#0b0e14",
        physics: {
          default: "arcade",
          arcade: { debug: false },
        },
      });
      // Autostart the scene with the injected room/sessionId.
      game.scene.add("arena", ArenaScene, true, { room, sessionId });
      gameRef.current = game;
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [room, sessionId]);

  return (
    <div
      ref={containerRef}
      style={{ width: GAME_WIDTH, height: GAME_HEIGHT, border: "1px solid #1c2330" }}
    />
  );
}
