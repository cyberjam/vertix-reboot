import { Room, type Client } from "@colyseus/core";
import {
  NET,
  WORLD,
  PLAYER,
  MACHINEGUN,
  RESPAWN_MS,
  FFA,
  MAX_INPUT_DT_MS,
  clamp,
  stepMovement,
  rayCircleDistance,
  type InputMessage,
  type ShotMessage,
  type KillMessage,
  type JoinOptions,
} from "@vertix/shared";
import { GameState, Player } from "../schema/GameState";

/** Latest aim/fire intent (responsive), separate from queued movement. */
type LatestInput = { aim: number; firing: boolean };
type Timers = { nextFireAt: number; reloadEndsAt: number; respawnAt: number };

/** How far from the arena center players spawn (keeps fights close in M3). */
const SPAWN_SPREAD = 300;
/** Max queued movement commands consumed per tick (anti-burst). */
const MAX_CMDS_PER_TICK = 10;
/** Hard cap on a player's pending movement queue. */
const MAX_QUEUE = 120;
const MAX_NAME_LENGTH = 16;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * ArenaRoom — authoritative simulation of one Free-For-All match.
 *
 * The server owns all movement, firing, hit detection, health and scoring.
 * Clients send only intent; the server resolves outcomes each tick, runs the
 * FFA round loop (first to target score, or time limit, then a result screen
 * and a fresh round) and replicates state.
 */
export class ArenaRoom extends Room<GameState> {
  private readonly latest = new Map<string, LatestInput>();
  private readonly queues = new Map<string, InputMessage[]>();
  private readonly timers = new Map<string, Timers>();
  private readonly reloadQueued = new Set<string>();
  private elapsed = 0;
  private matchEndAt = 0;

  // FFA rules (env-overridable for tuning / testing).
  private readonly targetScore = envNumber("FFA_TARGET_SCORE", FFA.TARGET_SCORE);
  private readonly durationMs = envNumber("FFA_DURATION_MS", FFA.DURATION_MS);
  private readonly endScreenMs = envNumber("FFA_END_SCREEN_MS", FFA.END_SCREEN_MS);

  onCreate(): void {
    this.setState(new GameState());
    this.state.match.targetScore = this.targetScore;
    this.state.match.timeRemainingMs = this.durationMs;
    this.setPatchRate(NET.PATCHRATE_MS);

    this.onMessage<InputMessage>("input", (client, msg) => {
      if (!msg) return;
      const latest = this.latest.get(client.sessionId);
      const queue = this.queues.get(client.sessionId);
      if (!latest || !queue) return;

      const cmd: InputMessage = {
        seq: Number(msg.seq) || 0,
        dtMs: clamp(Number(msg.dtMs) || 0, 0, MAX_INPUT_DT_MS),
        moveX: clamp(Number(msg.moveX) || 0, -1, 1),
        moveY: clamp(Number(msg.moveY) || 0, -1, 1),
        aim: Number.isFinite(msg.aim) ? msg.aim : latest.aim,
        firing: Boolean(msg.firing),
      };
      queue.push(cmd);
      if (queue.length > MAX_QUEUE) queue.shift();

      latest.aim = cmd.aim;
      latest.firing = cmd.firing;
    });

    this.onMessage("reload", (client) => {
      this.reloadQueued.add(client.sessionId);
    });

    this.setSimulationInterval((dt) => this.update(dt), 1000 / NET.TICKRATE);
    console.log(`[ArenaRoom] created: ${this.roomId}`);
  }

  onJoin(client: Client, options?: JoinOptions): void {
    const player = new Player();
    player.name = this.sanitizeName(options?.name, client.sessionId);
    const spawn = this.randomSpawn();
    player.x = spawn.x;
    player.y = spawn.y;
    this.state.players.set(client.sessionId, player);
    this.latest.set(client.sessionId, { aim: 0, firing: false });
    this.queues.set(client.sessionId, []);
    this.timers.set(client.sessionId, { nextFireAt: 0, reloadEndsAt: 0, respawnAt: 0 });
    console.log(`[ArenaRoom] joined: ${player.name} (${client.sessionId})`);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.latest.delete(client.sessionId);
    this.queues.delete(client.sessionId);
    this.timers.delete(client.sessionId);
    this.reloadQueued.delete(client.sessionId);
    console.log(`[ArenaRoom] left: ${client.sessionId}`);
  }

  private update(dt: number): void {
    this.elapsed += dt;
    const now = this.elapsed;
    const match = this.state.match;

    if (match.phase === "playing") {
      match.timeRemainingMs = Math.max(0, match.timeRemainingMs - dt);
    } else if (now >= this.matchEndAt) {
      this.resetMatch();
    }

    this.state.players.forEach((player, id) => {
      const latest = this.latest.get(id);
      const queue = this.queues.get(id);
      const timers = this.timers.get(id);
      if (!latest || !queue || !timers) return;

      if (!player.alive) {
        const tail = queue[queue.length - 1];
        if (tail) player.lastSeq = tail.seq;
        queue.length = 0;
        if (now >= timers.respawnAt) this.respawn(player, timers);
        return;
      }

      this.consumeMovement(player, queue);
      player.angle = latest.aim;

      // Combat only happens during a live round.
      if (match.phase === "playing") {
        this.applyReload(id, player, timers, now);
        this.applyFiring(id, player, latest.firing, timers, now);
      }
    });

    if (match.phase === "playing" && match.timeRemainingMs <= 0) {
      this.endMatch();
    }
  }

  private consumeMovement(player: Player, queue: InputMessage[]): void {
    let processed = 0;
    while (queue.length > 0 && processed < MAX_CMDS_PER_TICK) {
      const cmd = queue.shift();
      if (!cmd) break;
      const next = stepMovement(player.x, player.y, cmd.moveX, cmd.moveY, cmd.dtMs);
      player.x = next.x;
      player.y = next.y;
      player.lastSeq = cmd.seq;
      processed += 1;
    }
  }

  private applyReload(id: string, player: Player, timers: Timers, now: number): void {
    if (
      this.reloadQueued.delete(id) &&
      !player.reloading &&
      player.ammo < MACHINEGUN.magSize
    ) {
      player.reloading = true;
      timers.reloadEndsAt = now + MACHINEGUN.reloadMs;
    }
    if (player.reloading && now >= timers.reloadEndsAt) {
      player.ammo = MACHINEGUN.magSize;
      player.reloading = false;
    }
  }

  private applyFiring(
    id: string,
    player: Player,
    firing: boolean,
    timers: Timers,
    now: number,
  ): void {
    if (!firing || player.reloading || player.ammo <= 0 || now < timers.nextFireAt) {
      return;
    }

    player.ammo -= 1;
    timers.nextFireAt = now + MACHINEGUN.fireRateMs;
    this.fireHitscan(id, player);

    // Auto-reload once the magazine is empty.
    if (player.ammo <= 0) {
      player.reloading = true;
      timers.reloadEndsAt = now + MACHINEGUN.reloadMs;
    }
  }

  private fireHitscan(shooterId: string, shooter: Player): void {
    const dirX = Math.cos(shooter.angle);
    const dirY = Math.sin(shooter.angle);

    let closest: number = MACHINEGUN.rangePx;
    let victim: Player | null = null;
    let victimId = "";

    this.state.players.forEach((target, id) => {
      if (id === shooterId || !target.alive) return;
      const t = rayCircleDistance(
        shooter.x,
        shooter.y,
        dirX,
        dirY,
        target.x,
        target.y,
        PLAYER.RADIUS,
        MACHINEGUN.rangePx,
      );
      if (t !== null && t < closest) {
        closest = t;
        victim = target;
        victimId = id;
      }
    });

    if (victim !== null) {
      const hitPlayer = victim as Player;
      hitPlayer.hp -= MACHINEGUN.damage;
      if (hitPlayer.hp <= 0) {
        this.handleKill(shooterId, shooter, victimId, hitPlayer);
      }
    }

    const shot: ShotMessage = {
      sx: shooter.x,
      sy: shooter.y,
      ex: shooter.x + dirX * closest,
      ey: shooter.y + dirY * closest,
      hit: victim !== null,
    };
    this.broadcast("shot", shot);
  }

  private handleKill(
    shooterId: string,
    shooter: Player,
    victimId: string,
    victim: Player,
  ): void {
    victim.hp = 0;
    victim.alive = false;
    victim.deaths += 1;
    const victimTimers = this.timers.get(victimId);
    if (victimTimers) victimTimers.respawnAt = this.elapsed + RESPAWN_MS;

    shooter.kills += 1;
    shooter.score += FFA.KILL_SCORE;

    const kill: KillMessage = { killerName: shooter.name, victimName: victim.name };
    this.broadcast("kill", kill);

    if (shooter.score >= this.state.match.targetScore) {
      this.endMatch(shooterId);
    }
  }

  private endMatch(winnerId?: string): void {
    const match = this.state.match;
    if (match.phase !== "playing") return;

    const id = winnerId ?? this.topPlayerId();
    const winner = id ? this.state.players.get(id) : undefined;
    match.phase = "ended";
    match.winnerId = id;
    match.winnerName = winner ? winner.name : "";
    this.matchEndAt = this.elapsed + this.endScreenMs;
  }

  private topPlayerId(): string {
    let bestId = "";
    let bestScore = -1;
    this.state.players.forEach((player, id) => {
      if (player.score > bestScore) {
        bestScore = player.score;
        bestId = id;
      }
    });
    return bestId;
  }

  private resetMatch(): void {
    const match = this.state.match;
    match.phase = "playing";
    match.timeRemainingMs = this.durationMs;
    match.winnerId = "";
    match.winnerName = "";

    this.state.players.forEach((player, id) => {
      player.score = 0;
      player.kills = 0;
      player.deaths = 0;
      const timers = this.timers.get(id) ?? {
        nextFireAt: 0,
        reloadEndsAt: 0,
        respawnAt: 0,
      };
      this.respawn(player, timers);
    });
  }

  private respawn(player: Player, timers: Timers): void {
    const spawn = this.randomSpawn();
    player.x = spawn.x;
    player.y = spawn.y;
    player.hp = PLAYER.MAX_HP;
    player.ammo = MACHINEGUN.magSize;
    player.reloading = false;
    player.alive = true;
    timers.nextFireAt = 0;
    timers.reloadEndsAt = 0;
    timers.respawnAt = 0;
  }

  private randomSpawn(): { x: number; y: number } {
    return {
      x: WORLD.WIDTH / 2 + (Math.random() * 2 - 1) * SPAWN_SPREAD,
      y: WORLD.HEIGHT / 2 + (Math.random() * 2 - 1) * SPAWN_SPREAD,
    };
  }

  private sanitizeName(raw: string | undefined, sessionId: string): string {
    const trimmed = (raw ?? "").trim().slice(0, MAX_NAME_LENGTH);
    return trimmed.length > 0 ? trimmed : `Guest-${sessionId.slice(0, 4)}`;
  }
}
