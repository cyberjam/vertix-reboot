import { Room, type Client } from "@colyseus/core";
import {
  NET,
  WORLD,
  PLAYER,
  MACHINEGUN,
  RESPAWN_MS,
  clamp,
  rayCircleDistance,
  type InputMessage,
  type ShotMessage,
} from "@vertix/shared";
import { GameState, Player } from "../schema/GameState";

type InputState = { moveX: number; moveY: number; aim: number; firing: boolean };
type Timers = { nextFireAt: number; reloadEndsAt: number; respawnAt: number };

/** How far from the arena center players spawn (keeps fights close in M3). */
const SPAWN_SPREAD = 300;

/**
 * ArenaRoom — authoritative simulation of one match.
 *
 * The server owns all movement, firing, hit detection and health. Clients send
 * only intent ("input"/"reload"); the server resolves outcomes each tick and
 * replicates state. Everyone is a Triggerman for this milestone.
 */
export class ArenaRoom extends Room<GameState> {
  private readonly inputs = new Map<string, InputState>();
  private readonly timers = new Map<string, Timers>();
  private readonly reloadQueued = new Set<string>();
  private elapsed = 0;

  onCreate(): void {
    this.setState(new GameState());
    this.setPatchRate(NET.PATCHRATE_MS);

    this.onMessage<InputMessage>("input", (client, msg) => {
      const input = this.inputs.get(client.sessionId);
      if (!input || !msg) return;
      input.moveX = clamp(Number(msg.moveX) || 0, -1, 1);
      input.moveY = clamp(Number(msg.moveY) || 0, -1, 1);
      input.aim = Number.isFinite(msg.aim) ? msg.aim : input.aim;
      input.firing = Boolean(msg.firing);
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
    this.inputs.set(client.sessionId, { moveX: 0, moveY: 0, aim: 0, firing: false });
    this.timers.set(client.sessionId, { nextFireAt: 0, reloadEndsAt: 0, respawnAt: 0 });
    console.log(`[ArenaRoom] joined: ${client.sessionId}`);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.timers.delete(client.sessionId);
    this.reloadQueued.delete(client.sessionId);
    console.log(`[ArenaRoom] left: ${client.sessionId}`);
  }

  private update(dt: number): void {
    this.elapsed += dt;
    const now = this.elapsed;

    this.state.players.forEach((player, id) => {
      const input = this.inputs.get(id);
      const timers = this.timers.get(id);
      if (!input || !timers) return;

      if (!player.alive) {
        if (now >= timers.respawnAt) this.respawn(player, timers);
        return;
      }

      this.applyMovement(player, input, dt);
      player.angle = input.aim;
      this.applyReload(id, player, timers, now);
      this.applyFiring(id, player, input, timers, now);
    });
  }

  private applyMovement(player: Player, input: InputState, dt: number): void {
    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
    }
    const distance = PLAYER.SPEED * (dt / 1000);
    player.x = clamp(player.x + mx * distance, PLAYER.RADIUS, WORLD.WIDTH - PLAYER.RADIUS);
    player.y = clamp(player.y + my * distance, PLAYER.RADIUS, WORLD.HEIGHT - PLAYER.RADIUS);
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
    input: InputState,
    timers: Timers,
    now: number,
  ): void {
    if (!input.firing || player.reloading || player.ammo <= 0 || now < timers.nextFireAt) {
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
