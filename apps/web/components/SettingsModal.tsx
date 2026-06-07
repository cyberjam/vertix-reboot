"use client";

import { useEffect, useState } from "react";
import { getSetting, setSetting } from "@/lib/settings";
import styles from "./SettingsModal.module.css";

interface Props {
  onClose: () => void;
  initialTab?: Tab;
}

const CONTROLS = [
  { keys: "W A S D", action: "Move" },
  { keys: "Mouse", action: "Aim" },
  { keys: "Left Click", action: "Fire" },
  { keys: "R", action: "Reload" },
  { keys: "Q", action: "Switch Weapon" },
  { keys: "1 / 2 / 3", action: "Select Class (on respawn)" },
  { keys: "Space", action: "Jump" },
  { keys: "Shift", action: "View Full Scoreboard" },
  { keys: "Esc", action: "Close Overlays" },
];

type Tab = "settings" | "controls";

export default function SettingsModal({ onClose, initialTab = "settings" }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [shake, setShake] = useState(true);
  const [effects, setEffects] = useState(true);
  const [fps, setFps] = useState(false);

  useEffect(() => {
    setShake(getSetting("shake"));
    setEffects(getSetting("effects"));
    setFps(getSetting("fps"));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const toggle = (key: "shake" | "effects" | "fps", value: boolean) => {
    setSetting(key, value);
    if (key === "shake") setShake(value);
    if (key === "effects") setEffects(value);
    if (key === "fps") setFps(value);
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === "settings" ? styles.tabActive : ""}`}
            onClick={() => setTab("settings")}
          >
            SETTINGS
          </button>
          <button
            className={`${styles.tab} ${tab === "controls" ? styles.tabActive : ""}`}
            onClick={() => setTab("controls")}
          >
            CONTROLS
          </button>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {tab === "settings" && (
          <div className={styles.content}>
            <Toggle
              label="Camera Shake"
              description="Shake on hit and death"
              value={shake}
              onChange={(v) => toggle("shake", v)}
            />
            <Toggle
              label="Visual Effects"
              description="Tracers, muzzle flash, hitmarker"
              value={effects}
              onChange={(v) => toggle("effects", v)}
            />
            <Toggle
              label="FPS Counter"
              description="Show frames per second in HUD"
              value={fps}
              onChange={(v) => toggle("fps", v)}
            />
            <p className={styles.note}>Settings apply immediately and persist across sessions.</p>
          </div>
        )}

        {tab === "controls" && (
          <div className={styles.content}>
            <table className={styles.keysTable}>
              <tbody>
                {CONTROLS.map(({ keys, action }) => (
                  <tr key={action}>
                    <td className={styles.keyCell}>
                      {keys.split(" / ").map((k) => (
                        <kbd key={k} className={styles.kbd}>{k}</kbd>
                      ))}
                    </td>
                    <td className={styles.actionCell}>{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleInfo}>
        <span className={styles.toggleLabel}>{label}</span>
        <span className={styles.toggleDesc}>{description}</span>
      </div>
      <button
        className={`${styles.toggleBtn} ${value ? styles.toggleOn : ""}`}
        onClick={() => onChange(!value)}
        aria-pressed={value}
      >
        {value ? "ON" : "OFF"}
      </button>
    </div>
  );
}
