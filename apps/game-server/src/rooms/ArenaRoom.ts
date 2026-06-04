import { Room, type Client } from "@colyseus/core";
import {
  NET,
  WORLD,
  PLAYER,
  MACHINEGUN,
  RESPAWN_MS,
  MAX_INPUT_DT_MS,
  clamp,
  stepMovement,
  rayCircleDistance,
  type InputMessage,
  type ShotMessage,
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

/**
 * ArenaRoom — authoritative simulation of one match.
 *
 * The server owns all movement, firing, hit detection and health. Clients send
 * only intent; the server resolves outcomes each tick and replicates state.
 *
 * Movement is processed as an ordered queue of per-command inputs (each with
 * its own dt), and the last processed sequence is replicated so clients can
 * predict locally and reconcile exactly against the authoritative position.
 */
export class ArenaRoom extends Room<GameState> {
  private readonly latest = new Map<string, LatestInput>();
  private readonly queues = new Map<string, InputMessage[]>();
  private readonly timers = new Map<string, Timers>();
  private readonly reloadQueued = new Set<string>();
  private elapsed = 0;

  onCreate(): void {
    this.setState(new GameState());
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

  onJoin(client: Client): void {
    const player = new Player();
    const spawn = this.randomSpawn();
    player.x = spawn.x;
    player.y = spawn.y;
    this.state.players.set(client.sessionId, player);
    this.latest.set(client.sessionId, { aim: 0, firing: false });
    this.queues.set(client.sessionId, []);
    this.timers.set(client.sessionId, { nextFireAt: 0, reloadEndsAt: 0, respawnAt: 0 });
    console.log(`[ArenaRoom] joined: ${client.sessionId}`);
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

    this.state.players.forEach((player, id) => {
      const latest = this.latest.get(id);
      const queue = this.queues.get(id);
      const timers = this.timers.get(id);
      if (!latest || !queue || !timers) return;

      if (!player.alive) {
        // Acknowledge queued inputs without moving, then respawn when due.
        const tail = queue[queue.length - 1];
        if (tail) player.lastSeq = tail.seq;
        queue.length = 0;
        if (now >= timers.respawnAt) this.respawn(player, timers);
        return;
      }

      this.consumeMovement(player, queue);
      player.angle = latest.aim;
      this.applyReload(id, player, timers, now);
      this.applyFiring(id, player, latest.firing, timers, now);
    });
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
        hitPlayer.hp = 0;
        hitPlayer.alive = false;
        hitPlayer.deaths += 1;
        const victimTimers = this.timers.get(victimId);
        if (victimTimers) victimTimers.respawnAt = this.elapsed + RESPAWN_MS;
        shooter.kills += 1;
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
}
