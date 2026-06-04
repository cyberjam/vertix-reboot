import Link from "next/link";
import { SHARED_VERSION } from "@vertix/shared";

export default function HomePage() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: 16,
      }}
    >
      <h1 style={{ margin: 0 }}>Vertix Reboot</h1>
      <p style={{ opacity: 0.7 }}>
        Top-down arena shooter — scaffolding (shared v{SHARED_VERSION})
      </p>
      <Link href="/play" style={{ color: "#4ea1ff", fontSize: 20 }}>
        ▶ Play
      </Link>
    </main>
  );
}
