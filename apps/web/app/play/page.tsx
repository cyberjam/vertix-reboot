"use client";

import dynamic from "next/dynamic";

// Phaser touches `window`, so the game canvas must be client-only (no SSR).
const PhaserGame = dynamic(() => import("@/game/PhaserGame"), {
  ssr: false,
  loading: () => <p style={{ padding: 24 }}>Loading game…</p>,
});

export default function PlayPage() {
  return (
    <main
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
      }}
    >
      <PhaserGame />
    </main>
  );
}
