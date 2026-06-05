"use client";

import { useCallback, useEffect, useState } from "react";
import { CLASS_IDS, DEFAULT_CLASS, getClass, getWeapon } from "@vertix/shared";
import { useNet, type AvailableRoom } from "@/game/net/NetProvider";
import styles from "./ServerBrowser.module.css";

const NAME_KEY = "vertix.playerName";
const CLASS_KEY = "vertix.classId";

interface Props {
  onClose: () => void;
}

function randomGuest(): string {
  return `Guest${Math.floor(1000 + Math.random() * 9000)}`;
}

export default function ServerBrowser({ onClose }: Props) {
  const { connect, status, getRooms } = useNet();
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [classId, setClassId] = useState(DEFAULT_CLASS);

  useEffect(() => {
    const savedName = window.localStorage.getItem(NAME_KEY);
    setName(savedName && savedName.trim().length > 0 ? savedName : randomGuest());
    const savedClass = window.localStorage.getItem(CLASS_KEY);
    if (savedClass && (CLASS_IDS as readonly string[]).includes(savedClass)) {
      setClassId(savedClass);
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await getRooms();
    setRooms(list);
    setLoading(false);
  }, [getRooms]);

  useEffect(() => { void refresh(); }, [refresh]);

  const joining = status === "connecting";

  const join = (roomId?: string) => {
    const finalName = name.trim().length > 0 ? name.trim().slice(0, 15) : randomGuest();
    window.localStorage.setItem(NAME_KEY, finalName);
    window.localStorage.setItem(CLASS_KEY, classId);
    void connect({ name: finalName, classId, roomId });
  };

  const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>SERVER BROWSER</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Quick-match section */}
        <div className={styles.quickSection}>
          <div className={styles.inputRow}>
            <input
              className={styles.nameInput}
              value={name}
              maxLength={15}
              placeholder="Player Name"
              onChange={(e) => setName(e.target.value)}
            />
            <div className={styles.classPicker}>
              {CLASS_IDS.map((id) => {
                const def = getClass(id);
                const accent = hex(def.color);
                return (
                  <button
                    key={id}
                    className={`${styles.classBtn} ${id === classId ? styles.classBtnActive : ""}`}
                    style={{ ["--accent" as string]: accent }}
                    onClick={() => setClassId(id)}
                    title={`${def.name} — ${def.maxHp} HP · ${getWeapon(def.primary).name}`}
                  >
                    <span className={styles.classDot} style={{ background: accent }} />
                    {def.name}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            className={styles.quickBtn}
            onClick={() => join()}
            disabled={joining}
          >
            {joining ? "CONNECTING…" : "⚡ QUICK MATCH"}
          </button>
        </div>

        {/* Room list */}
        <div className={styles.listHeader}>
          <span>AVAILABLE ROOMS</span>
          <button className={styles.refreshBtn} onClick={refresh} disabled={loading}>
            {loading ? "…" : "↻ REFRESH"}
          </button>
        </div>

        <div className={styles.list}>
          {rooms.length === 0 && !loading && (
            <div className={styles.empty}>
              No rooms found — Quick Match will create one.
            </div>
          )}
          {rooms.map((r) => (
            <div key={r.roomId} className={styles.row}>
              <div className={styles.rowInfo}>
                <span className={styles.roomId}>#{r.roomId.slice(-4).toUpperCase()}</span>
                <span className={styles.roomMode}>{r.metadata?.mode?.toUpperCase() ?? "FFA"}</span>
                <span className={styles.roomMap}>{r.metadata?.map ?? "arena01"}</span>
              </div>
              <div className={styles.rowRight}>
                <span className={styles.players}>
                  {r.clients}/{r.maxClients}
                </span>
                <span className={`${styles.dot} ${r.clients < r.maxClients ? styles.dotOpen : styles.dotFull}`} />
                <button
                  className={styles.joinBtn}
                  onClick={() => join(r.roomId)}
                  disabled={joining || r.clients >= r.maxClients}
                >
                  JOIN
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
