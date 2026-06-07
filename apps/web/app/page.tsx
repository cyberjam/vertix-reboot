"use client";

import dynamic from "next/dynamic";
import { NetProvider, useNet } from "@/game/net/NetProvider";
import MainMenu from "@/components/MainMenu";

// Phaser touches `window`, so the game canvas must be client-only (no SSR).
const PhaserGame = dynamic(() => import("@/game/PhaserGame"), {
  ssr: false,
  loading: () => <p style={{ padding: 24 }}>Loading game…</p>,
});

function Stage() {
  const { status, room, sessionId } = useNet();

  if (status === "connected" && room) {
    return (
      <main
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <PhaserGame room={room} sessionId={sessionId} />
      </main>
    );
  }

  return <MainMenu />;
}

// Primary entry point: land straight on the nickname / Enter Game screen,
// then mount the game once connected.
export default function HomePage() {
  return (
    <NetProvider>
      <Stage />
    </NetProvider>
  );
}
