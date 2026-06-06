"use client";

import { useEffect, useState } from "react";
import { CLASS_IDS, DEFAULT_CLASS, getClass, getWeapon } from "@vertix/shared";
import { useNet } from "@/game/net/NetProvider";
import ServerBrowser from "./ServerBrowser";
import SettingsModal from "./SettingsModal";
import styles from "./MainMenu.module.css";

const NAME_KEY = "vertix.playerName";
const CLASS_KEY = "vertix.classId";

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

function randomGuest(): string {
  return `Guest${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * Vertix-style entry menu: nickname (persisted) + class selection, then ENTER
 * GAME hands the chosen options to the NetProvider, which joins the room.
 */
export default function MainMenu() {
  const { connect, status, error } = useNet();
  const [name, setName] = useState("");
  const [classId, setClassId] = useState<string>(DEFAULT_CLASS);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"settings" | "controls">("settings");

  // Restore persisted choices on mount (client-only to avoid SSR mismatch).
  useEffect(() => {
    const savedName = window.localStorage.getItem(NAME_KEY);
    setName(savedName && savedName.trim().length > 0 ? savedName : randomGuest());
    const savedClass = window.localStorage.getItem(CLASS_KEY);
    if (savedClass && (CLASS_IDS as readonly string[]).includes(savedClass)) {
      setClassId(savedClass);
    }
  }, []);

  const connecting = status === "connecting";

  const enter = () => {
    const finalName = name.trim().length > 0 ? name.trim().slice(0, 15) : randomGuest();
    window.localStorage.setItem(NAME_KEY, finalName);
    window.localStorage.setItem(CLASS_KEY, classId);
    void connect({ name: finalName, classId });
  };

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>VERTIX</h1>
      <p className={styles.subtitle}>Reboot · Top-down Arena Shooter</p>

      <div className={styles.panel}>
        <p className={styles.header}>Main Menu</p>

        <input
          className={styles.nameInput}
          value={name}
          maxLength={15}
          placeholder="Player Name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") enter();
          }}
        />

        <p className={styles.header}>Select Class</p>
        <div className={styles.classGrid}>
          {CLASS_IDS.map((id) => {
            const def = getClass(id);
            const accent = hex(def.color);
            const primary = getWeapon(def.primary).name;
            const secondary = def.secondary ? getWeapon(def.secondary).name : null;
            return (
              <div
                key={id}
                className={`${styles.classCard} ${
                  id === classId ? styles.classCardActive : ""
                }`}
                style={{ ["--accent" as string]: accent }}
                onClick={() => setClassId(id)}
              >
                <div className={styles.classDot} style={{ background: accent }} />
                <div className={styles.className}>{def.name}</div>
                <div className={styles.classMeta}>
                  {def.maxHp} HP
                  <br />
                  {primary}
                  {secondary ? ` + ${secondary}` : ""}
                </div>
              </div>
            );
          })}
        </div>

        <button className={styles.enterButton} onClick={enter} disabled={connecting}>
          {connecting ? "CONNECTING…" : "ENTER GAME"}
        </button>

        {error ? <p className={styles.error}>{error}</p> : null}

        <button
          className={styles.browserBtn}
          onClick={() => setShowBrowser(true)}
          disabled={connecting}
        >
          Browse Servers
        </button>

        <div className={styles.menuLinks}>
          <button
            className={styles.menuLink}
            onClick={() => { setSettingsTab("settings"); setShowSettings(true); }}
          >
            SETTINGS
          </button>
          <span className={styles.menuDivider}>·</span>
          <button
            className={styles.menuLink}
            onClick={() => { setSettingsTab("controls"); setShowSettings(true); }}
          >
            CONTROLS
          </button>
        </div>
      </div>

      {showBrowser && <ServerBrowser onClose={() => setShowBrowser(false)} />}
      {showSettings && (
        <SettingsModal initialTab={settingsTab} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
