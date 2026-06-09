"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { CLASS_IDS, RESPAWN_MS, getClass, getWeapon, type KillMessage } from "@vertix/shared";
import styles from "./DeathOverlay.module.css";

const POLL_MS = 80;
const SUMMARY_PHASE_MS = 2000; // killer info only for first 2s, then show class picker

// Map Phaser numeric color → CSS hex string
const CLASS_COLORS: Record<string, string> = {
  triggerman: "#4ea1ff",
  hunter: "#c792ea",
  vince: "#ffa657",
};

interface Props {
  room: Room;
  sessionId: string;
}

interface PlayerSchema {
  alive: boolean;
  name: string;
  classId: string;
}

export default function DeathOverlay({ room, sessionId }: Props) {
  const [dead, setDead] = useState(false);
  const [killerName, setKillerName] = useState("");
  const [killerClassId, setKillerClassId] = useState("");
  const [selectedClass, setSelectedClass] = useState("triggerman");
  const [countdown, setCountdown] = useState(0);
  const [showClassSelect, setShowClassSelect] = useState(false);

  const diedAtRef = useRef<number | null>(null);
  const prevAliveRef = useRef(true);
  const myNameRef = useRef("");

  // Poll room state to detect alive → false transition
  useEffect(() => {
    let raf = 0;
    let last = 0;

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < POLL_MS) return;
      last = t;

      const state = room.state as {
        players: {
          get(id: string): PlayerSchema | undefined;
          forEach(cb: (p: PlayerSchema, id: string) => void): void;
        };
      };
      const me = state.players.get(sessionId);
      if (!me) return;

      myNameRef.current = me.name;

      const wasAlive = prevAliveRef.current;
      const isAlive = me.alive;
      prevAliveRef.current = isAlive;

      if (wasAlive && !isAlive) {
        // Just died
        diedAtRef.current = Date.now();
        setSelectedClass(me.classId ?? "triggerman");
        setShowClassSelect(false);
        setDead(true);
      } else if (!wasAlive && isAlive) {
        // Respawned
        diedAtRef.current = null;
        setDead(false);
        setShowClassSelect(false);
        setKillerName("");
        setKillerClassId("");
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [room, sessionId]);

  // Countdown timer + phase transition while dead
  useEffect(() => {
    if (!dead) return;
    const id = window.setInterval(() => {
      const elapsed = diedAtRef.current ? Date.now() - diedAtRef.current : RESPAWN_MS;
      const remaining = Math.max(0, Math.ceil((RESPAWN_MS - elapsed) / 1000));
      setCountdown(remaining);
      setShowClassSelect(elapsed >= SUMMARY_PHASE_MS);
    }, 200);
    return () => clearInterval(id);
  }, [dead]);

  // Listen for the kill event to capture killer info
  useEffect(() => {
    const dispose = room.onMessage("kill", (msg: KillMessage) => {
      const state = room.state as {
        players: {
          get(id: string): PlayerSchema | undefined;
          forEach(cb: (p: PlayerSchema, id: string) => void): void;
        };
      };
      const myName = state.players.get(sessionId)?.name ?? myNameRef.current;

      if (msg.victimName === myName) {
        setKillerName(msg.killerName);
        let kClassId = "";
        state.players.forEach((p) => {
          if (p.name === msg.killerName) kClassId = p.classId;
        });
        setKillerClassId(kClassId);
      }
    });
    return () => dispose();
  }, [room, sessionId]);

  const handleSelectClass = (classId: string) => {
    setSelectedClass(classId);
    room.send("selectClass", { classId });
  };

  if (!dead) return null;

  const killerCls = killerClassId ? getClass(killerClassId) : null;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.title}>YOU WERE ELIMINATED</div>

        {killerName && (
          <div className={styles.killerLine}>
            killed by{" "}
            <span className={styles.killerName}>{killerName}</span>
            {killerCls && (
              <span className={styles.killerClass}> ({killerCls.name})</span>
            )}
          </div>
        )}

        {showClassSelect && (
          <>
            <div className={styles.pickerLabel}>SELECT CLASS FOR NEXT RESPAWN</div>
            <div className={styles.cards}>
              {CLASS_IDS.map((id) => {
                const cls = getClass(id);
                const primary = getWeapon(cls.primary);
                const secondary = cls.secondary ? getWeapon(cls.secondary) : null;
                const active = selectedClass === id;
                const color = CLASS_COLORS[id] ?? "#5151d9";
                return (
                  <button
                    key={id}
                    className={`${styles.card} ${active ? styles.cardActive : ""}`}
                    style={{ borderColor: active ? color : undefined, "--cls-color": color } as React.CSSProperties}
                    onClick={() => handleSelectClass(id)}
                  >
                    <div className={styles.cardDot} style={{ background: color }} />
                    <div className={styles.cardName}>{cls.name}</div>
                    <div className={styles.cardStat}>HP {cls.maxHp}</div>
                    <div className={styles.cardWeapon}>{primary.name}</div>
                    {secondary && (
                      <div className={styles.cardWeapon}>{secondary.name}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className={styles.countdown}>
          {countdown > 0 ? `Respawning in ${countdown}…` : "Respawning…"}
        </div>
      </div>
    </div>
  );
}
