"use client";

import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { getClass, getWeapon, type KillMessage } from "@vertix/shared";
import Minimap from "./Minimap";
import styles from "./Hud.module.css";

const POLL_MS = 90; // HUD refresh throttle (state changes ~20Hz on the wire)
const KILLFEED_MS = 4000;
const MAX_LEADERBOARD = 8;

interface PlayerSnap {
  id: string;
  name: string;
  classId: string;
  weaponId: string;
  hp: number;
  maxHp: number;
  ammo: number;
  reloading: boolean;
  alive: boolean;
  score: number;
  kills: number;
  deaths: number;
}

interface Snapshot {
  me: PlayerSnap | null;
  board: PlayerSnap[];
  timeRemainingMs: number;
  targetScore: number;
  mode: string;
  phase: string;
  winnerId: string;
  winnerName: string;
}

interface KillEntry {
  id: number;
  killer: string;
  victim: string;
}

const EMPTY: Snapshot = {
  me: null,
  board: [],
  timeRemainingMs: 0,
  targetScore: 0,
  mode: "ffa",
  phase: "playing",
  winnerId: "",
  winnerName: "",
};

/** Read a plain snapshot out of the live Colyseus schema. */
function readSnapshot(room: Room, sessionId: string): Snapshot {
  const state = room.state as {
    players: { forEach(cb: (p: PlayerSnap, id: string) => void): void; get(id: string): PlayerSnap | undefined };
    match: {
      timeRemainingMs: number;
      targetScore: number;
      mode: string;
      phase: string;
      winnerId: string;
      winnerName: string;
    };
  };
  const board: PlayerSnap[] = [];
  state.players.forEach((p, id) => {
    board.push({
      id,
      name: p.name,
      classId: p.classId,
      weaponId: p.weaponId,
      hp: p.hp,
      maxHp: p.maxHp,
      ammo: p.ammo,
      reloading: p.reloading,
      alive: p.alive,
      score: p.score,
      kills: p.kills,
      deaths: p.deaths,
    });
  });
  board.sort((a, b) => b.score - a.score || b.kills - a.kills);
  const me = board.find((p) => p.id === sessionId) ?? null;
  return {
    me,
    board,
    timeRemainingMs: state.match.timeRemainingMs,
    targetScore: state.match.targetScore,
    mode: state.match.mode,
    phase: state.match.phase,
    winnerId: state.match.winnerId,
    winnerName: state.match.winnerName,
  };
}

function healthColor(ratio: number): string {
  if (ratio > 0.5) return "#5ed951";
  if (ratio > 0.25) return "#ffd166";
  return "#d95151";
}

/**
 * React DOM HUD overlay (T3): HP/ammo, weapon action bar, timer/objective,
 * leaderboard and kill feed — driven by the live room state. Visual effects
 * (tracers, muzzle, hitmarker, shake, round-over banner) stay in Phaser.
 */
export default function Hud({ room, sessionId }: { room: Room; sessionId: string }) {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [kills, setKills] = useState<KillEntry[]>([]);
  const [showBoard, setShowBoard] = useState(false);
  const killId = useRef(0);

  // Throttled poll of the live schema (cheaper than re-rendering every frame).
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < POLL_MS) return;
      last = t;
      setSnap(readSnapshot(room, sessionId));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [room, sessionId]);

  // Kill feed (subscribe directly to the server's kill events).
  useEffect(() => {
    const dispose = room.onMessage("kill", (msg: KillMessage) => {
      const id = killId.current++;
      setKills((prev) => [...prev, { id, killer: msg.killerName, victim: msg.victimName }].slice(-6));
      window.setTimeout(() => setKills((prev) => prev.filter((k) => k.id !== id)), KILLFEED_MS);
    });
    return () => dispose();
  }, [room]);

  // Hold Shift to view the full scoreboard (Vertix's "View Stats").
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShowBoard(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShowBoard(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const { me, board } = snap;
  const ended = snap.phase === "ended";
  const seconds = Math.max(0, Math.ceil(snap.timeRemainingMs / 1000));
  const mm = Math.floor(seconds / 60);
  const ss = `${seconds % 60}`.padStart(2, "0");

  const cls = me ? getClass(me.classId) : null;
  const slots = cls ? (cls.secondary ? [cls.primary, cls.secondary] : [cls.primary]) : [];
  const hpRatio = me ? Math.max(0, Math.min(1, me.hp / me.maxHp)) : 0;

  return (
    <div className={styles.root}>
      {/* timer / objective */}
      <div className={styles.match}>
        <div className={styles.matchTimer}>
          {mm}:{ss}
        </div>
        <div className={styles.matchInfo}>
          {snap.mode.toUpperCase()} · first to {snap.targetScore}
        </div>
      </div>

      {/* leaderboard */}
      <div className={styles.leaderboard}>
        <div className={styles.leaderHeader}>LEADERBOARD</div>
        {board.slice(0, MAX_LEADERBOARD).map((p, i) => (
          <div key={p.id} className={`${styles.row} ${p.id === sessionId ? styles.rowMe : ""}`}>
            <span className={styles.rowRank}>{i + 1}</span>
            <span className={styles.rowName}>{p.name}</span>
            <span className={styles.rowScore}>{p.score}</span>
            <span className={styles.rowKd}>
              {p.kills}/{p.deaths}
            </span>
          </div>
        ))}
      </div>

      {/* kill feed */}
      <div className={styles.killfeed}>
        {kills.map((k) => (
          <div key={k.id} className={styles.killItem}>
            <span>{k.killer}</span>
            <span className={styles.killArrow}>▸</span>
            <span className={styles.killVictim}>{k.victim}</span>
          </div>
        ))}
      </div>

      {/* health + ammo */}
      {me ? (
        <div className={styles.stats}>
          <div className={styles.statLabel}>
            <span>HEALTH</span>
            <span className={styles.statValue}>{Math.max(0, Math.round(me.hp))}</span>
          </div>
          <div className={styles.healthBar}>
            <div
              className={styles.healthFill}
              style={{ width: `${hpRatio * 100}%`, background: healthColor(hpRatio) }}
            />
          </div>
          <div className={styles.statLabel}>
            <span>AMMO</span>
          </div>
          {me.reloading ? (
            <div className={styles.ammoReloading}>RELOADING…</div>
          ) : (
            <div className={styles.ammo}>
              {me.ammo}
              <span style={{ fontSize: 16, color: "#6b7a90" }}>/{getWeapon(me.weaponId).magSize}</span>
            </div>
          )}
        </div>
      ) : null}

      {/* weapon action bar */}
      {me ? (
        <div className={styles.actionBar}>
          {slots.map((weaponId) => {
            const active = weaponId === me.weaponId;
            const w = getWeapon(weaponId);
            return (
              <div key={weaponId} className={`${styles.slot} ${active ? styles.slotActive : ""}`}>
                <div className={styles.slotName}>{w.name}</div>
                <div className={styles.slotAmmo}>
                  {active ? (me.reloading ? "RELOAD" : `${me.ammo}/${w.magSize}`) : `·/${w.magSize}`}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* minimap (bottom-right) */}
      <Minimap room={room} sessionId={sessionId} />

      {/* dead state (hidden while a full-screen overlay is showing) */}
      {me && !me.alive && !ended && !showBoard ? (
        <div className={styles.dead}>☠ RESPAWNING…</div>
      ) : null}

      {/* full-screen scoreboard (Shift) and round-over screen */}
      {ended || showBoard ? (
        <div className={styles.overlay}>
          {ended ? (
            <>
              <div className={styles.winner}>
                {snap.winnerId === sessionId ? "VICTORY" : "ROUND OVER"}
              </div>
              <div className={styles.winnerSub}>Winner: {snap.winnerName || "—"}</div>
            </>
          ) : (
            <div className={styles.winnerSub}>SCOREBOARD</div>
          )}

          <StatTable board={board} sessionId={sessionId} />

          {ended ? (
            <>
              <div className={styles.nextRound}>NEXT ROUND STARTING…</div>
              <div className={styles.voteNote}>Mode voting — coming soon</div>
            </>
          ) : (
            <div className={styles.boardHint}>Release Shift to close</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Full stats table shared by the Shift scoreboard and the round-over screen. */
function StatTable({ board, sessionId }: { board: PlayerSnap[]; sessionId: string }) {
  return (
    <table className={styles.statTable}>
      <thead>
        <tr>
          <th className={styles.thRank}>#</th>
          <th className={styles.thName}>NAME</th>
          <th>SCORE</th>
          <th>KILLS</th>
          <th>DEATHS</th>
        </tr>
      </thead>
      <tbody>
        {board.map((p, i) => (
          <tr key={p.id} className={p.id === sessionId ? styles.trMe : ""}>
            <td className={styles.thRank}>{i + 1}</td>
            <td className={styles.thName}>{p.name}</td>
            <td>{p.score}</td>
            <td>{p.kills}</td>
            <td>{p.deaths}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
