import { Room, type Client } from "@colyseus/core";
import {
  NET,
  WORLD,
  PLAYER,
  RESPAWN_MS,
  FFA,
  HEALTH_PACK,
  MAX_INPUT_DT_MS,
  clamp,
  stepMovement,
  rayCircleDistance,
  rayAabbDistance,
  getMap,
  getClass,
  getWeapon,
  CLASSES,
  DEFAULT_CLASS,
  type WeaponDef,
  type MapDef,
  type Point,
  type InputMessage,
  type ShotMessage,
  type KillMessage,
  type JoinOptions,
  type SelectClassMessage,
} from "@vertix/shared";
import { GameState, Player, HealthPack } from "../schema/GameState";

type LatestInput = { aim: number; firing: boolean };
type WeaponRuntime = { ammo: number; nextFireAt: number; reloadEndsAt: number; reloading: boolean };

const MAX_CMDS_PER_TICK = 10;
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
 * The server owns movement (wall collision), firing (per-weapon mag/reload,
 * auto vs semi-auto, bullet/wall + line-of-sight blocking), hit detection,
 * health, scoring and the round loop. Players choose a class (Triggerman or
 * Hunter); class selection applies on respawn. Clients send only intent.
 */
export class ArenaRoom extends Room<GameState> {
  private readonly latest = new Map<string, LatestInput>();
  private readonly queues = new Map<string, InputMessage[]>();
  private readonly weapons = new Map<string, Map<string, WeaponRuntime>>();
  private readonly prevFiring = new Map<string, boolean>();
  private readonly respawnAt = new Map<string, number>();
  private readonly pendingClass = new Map<string, string>();
  private readonly reloadQueued = new Set<string>();
  private readonly map: MapDef = getMap(process.env.MAP_ID ?? "arena01");
  private readonly packRespawnAt: number[] = [];
  private elapsed = 0;
  private matchEndAt = 0;

  private readonly targetScore = envNumber("FFA_TARGET_SCORE", FFA.TARGET_SCORE);
  private readonly durationMs = envNumber("FFA_DURATION_MS", FFA.DURATION_MS);
  private readonly endScreenMs = envNumber("FFA_END_SCREEN_MS", FFA.END_SCREEN_MS);
  private readonly packRespawnMs = envNumber("HP_RESPAWN_MS", HEALTH_PACK.RESPAWN_MS);

  onCreate(): void {
    this.setState(new GameState());
    this.state.match.targetScore = this.targetScore;
    this.state.match.timeRemainingMs = this.durationMs;

    for (const location of this.map.healthPacks) {
      const pack = new HealthPack();
      pack.x = location.x;
      pack.y = location.y;
      pack.active = true;
      this.state.healthPacks.push(pack);
      this.packRespawnAt.push(0);
    }

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

    this.onMessage<SelectClassMessage>("selectClass", (client, msg) => {
      if (msg && typeof msg.classId === "string" && CLASSES[msg.classId]) {
        this.pendingClass.set(client.sessionId, msg.classId);
      }
    });

    this.onMessage("switchWeapon", (client) => {
      this.switchWeapon(client.sessionId);
    });

    this.setSimulationInterval((dt) => this.update(dt), 1000 / NET.TICKRATE);
    console.log(`[ArenaRoom] created: ${this.roomId} (map: ${this.map.id})`);
  }

  onJoin(client: Client, options?: JoinOptions): void {
    const id = client.sessionId;
    const player = new Player();
    player.name = this.sanitizeName(options?.name, id);
    const classId = options?.classId && CLASSES[options.classId] ? options.classId : DEFAULT_CLASS;

    this.latest.set(id, { aim: 0, firing: false });
    this.queues.set(id, []);
    this.prevFiring.set(id, false);
    this.respawnAt.set(id, 0);
    this.pendingClass.set(id, classId);

    const spawn = this.pickSpawn();
    player.x = spawn.x;
    player.y = spawn.y;
    this.state.players.set(id, player);
    this.equipClass(id, player, classId);
    console.log(`[ArenaRoom] joined: ${player.name} as ${classId} (${id})`);
  }

  onLeave(client: Client): void {
    const id = client.sessionId;
    this.state.players.delete(id);
    this.latest.delete(id);
    this.queues.delete(id);
    this.weapons.delete(id);
    this.prevFiring.delete(id);
    this.respawnAt.delete(id);
    this.pendingClass.delete(id);
    this.reloadQueued.delete(id);
    console.log(`[ArenaRoom] left: ${id}`);
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
      if (!latest || !queue) return;

      if (!player.alive) {
        const tail = queue[queue.length - 1];
        if (tail) player.lastSeq = tail.seq;
        queue.length = 0;
        if (now >= (this.respawnAt.get(id) ?? 0)) this.respawn(id, player);
        return;
      }

      this.consumeMovement(player, queue);
      player.angle = latest.aim;

      if (match.phase === "playing") {
        const weapon = getWeapon(player.weaponId);
        const runtime = this.weapons.get(id)?.get(player.weaponId);
        if (runtime) {
          this.applyReload(id, weapon, runtime, now);
          this.applyFiring(id, player, weapon, runtime, latest.firing, now);
          player.ammo = runtime.ammo;
          player.reloading = runtime.reloading;
        }
      }
      this.prevFiring.set(id, latest.firing);
    });

    this.updateHealthPacks(now, match.phase === "playing");

    if (match.phase === "playing" && match.timeRemainingMs <= 0) {
      this.endMatch();
    }
  }

  private consumeMovement(player: Player, queue: InputMessage[]): void {
    let processed = 0;
    while (queue.length > 0 && processed < MAX_CMDS_PER_TICK) {
      const cmd = queue.shift();
      if (!cmd) break;
      const next = stepMovement(player.x, player.y, cmd.moveX, cmd.moveY, cmd.dtMs, this.map.walls);
      player.x = next.x;
      player.y = next.y;
      player.lastSeq = cmd.seq;
      processed += 1;
    }
  }

  private applyReload(id: string, weapon: WeaponDef, runtime: WeaponRuntime, now: number): void {
    if (this.reloadQueued.delete(id) && !runtime.reloading && runtime.ammo < weapon.magSize) {
      runtime.reloading = true;
      runtime.reloadEndsAt = now + weapon.reloadMs;
    }
    if (runtime.reloading && now >= runtime.reloadEndsAt) {
      runtime.ammo = weapon.magSize;
      runtime.reloading = false;
    }
  }

  private applyFiring(
    id: string,
    player: Player,
    weapon: WeaponDef,
    runtime: WeaponRuntime,
    firing: boolean,
    now: number,
  ): void {
    const prev = this.prevFiring.get(id) ?? false;
    // Auto weapons fire while held; semi-auto fires once per trigger press.
    const triggered = weapon.auto ? firing : firing && !prev;
    if (!triggered || runtime.reloading || runtime.ammo <= 0 || now < runtime.nextFireAt) {
      return;
    }

    runtime.ammo -= 1;
    runtime.nextFireAt = now + weapon.fireRateMs;
    this.fireHitscan(id, player, weapon);

    if (runtime.ammo <= 0) {
      runtime.reloading = true;
      runtime.reloadEndsAt = now + weapon.reloadMs;
    }
  }

  private fireHitscan(shooterId: string, shooter: Player, weapon: WeaponDef): void {
    const dirX = Math.cos(shooter.angle);
    const dirY = Math.sin(shooter.angle);

    let maxRay: number = weapon.rangePx;
    for (const wall of this.map.walls) {
      const t = rayAabbDistance(
        shooter.x,
        shooter.y,
        dirX,
        dirY,
        wall.x,
        wall.y,
        wall.x + wall.w,
        wall.y + wall.h,
        maxRay,
      );
      if (t !== null && t < maxRay) maxRay = t;
    }

    let closest: number = maxRay;
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
        maxRay,
      );
      if (t !== null && t < closest) {
        closest = t;
        victim = target;
        victimId = id;
      }
    });

    if (victim !== null) {
      const hitPlayer = victim as Player;
      hitPlayer.hp -= weapon.damage;
      if (hitPlayer.hp <= 0) {
        this.handleKill(shooter, victimId, hitPlayer);
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

  private handleKill(shooter: Player, victimId: string, victim: Player): void {
    victim.hp = 0;
    victim.alive = false;
    victim.deaths += 1;
    this.respawnAt.set(victimId, this.elapsed + RESPAWN_MS);

    shooter.kills += 1;
    shooter.score += FFA.KILL_SCORE;

    const kill: KillMessage = { killerName: shooter.name, victimName: victim.name };
    this.broadcast("kill", kill);

    if (shooter.score >= this.state.match.targetScore) {
      // Winner is the shooter; resolve via the shared end path.
      this.endMatchWith(shooter);
    }
  }

  private switchWeapon(id: string): void {
    const player = this.state.players.get(id);
    if (!player || !player.alive) return;
    const cls = getClass(player.classId);
    if (!cls.secondary) return;

    player.weaponId = player.weaponId === cls.primary ? cls.secondary : cls.primary;
    const runtime = this.weapons.get(id)?.get(player.weaponId);
    if (runtime) {
      player.ammo = runtime.ammo;
      player.reloading = runtime.reloading;
    }
    // Require a fresh trigger press after switching (avoids an instant shot).
    this.prevFiring.set(id, true);
  }

  private endMatch(): void {
    const id = this.topPlayerId();
    const winner = id ? this.state.players.get(id) : undefined;
    this.finishMatch(id, winner?.name ?? "");
  }

  private endMatchWith(winner: Player): void {
    let winnerId = "";
    this.state.players.forEach((p, id) => {
      if (p === winner) winnerId = id;
    });
    this.finishMatch(winnerId, winner.name);
  }

  private finishMatch(winnerId: string, winnerName: string): void {
    const match = this.state.match;
    if (match.phase !== "playing") return;
    match.phase = "ended";
    match.winnerId = winnerId;
    match.winnerName = winnerName;
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
      this.respawn(id, player);
    });
  }

  private respawn(id: string, player: Player): void {
    const spawn = this.pickSpawn();
    player.x = spawn.x;
    player.y = spawn.y;
    player.alive = true;
    this.respawnAt.set(id, 0);
    // Class selection takes effect on respawn.
    const classId = this.pendingClass.get(id) ?? player.classId;
    this.equipClass(id, player, classId);
  }

  /** Apply a class: HP, loadout and fresh per-weapon ammo. */
  private equipClass(id: string, player: Player, classId: string): void {
    const cls = getClass(classId);
    player.classId = cls.id;
    player.maxHp = cls.maxHp;
    player.hp = cls.maxHp;
    player.weaponId = cls.primary;

    const runtimes = new Map<string, WeaponRuntime>();
    const ids = cls.secondary ? [cls.primary, cls.secondary] : [cls.primary];
    for (const weaponId of ids) {
      const weapon = getWeapon(weaponId);
      runtimes.set(weaponId, {
        ammo: weapon.magSize,
        nextFireAt: 0,
        reloadEndsAt: 0,
        reloading: false,
      });
    }
    this.weapons.set(id, runtimes);
    this.prevFiring.set(id, false);

    const primary = getWeapon(cls.primary);
    player.ammo = primary.magSize;
    player.reloading = false;
  }

  private updateHealthPacks(now: number, allowPickup: boolean): void {
    const packs = this.state.healthPacks;
    const pickupRadius = PLAYER.RADIUS + HEALTH_PACK.RADIUS;

    for (let i = 0; i < packs.length; i++) {
      const pack = packs[i];
      if (!pack) continue;

      if (!pack.active) {
        if (now >= (this.packRespawnAt[i] ?? 0)) pack.active = true;
        continue;
      }
      if (!allowPickup) continue;

      this.state.players.forEach((player) => {
        if (!pack.active || !player.alive || player.hp >= player.maxHp) return;
        const dist = Math.hypot(player.x - pack.x, player.y - pack.y);
        if (dist <= pickupRadius) {
          player.hp = Math.min(player.maxHp, player.hp + HEALTH_PACK.HEAL);
          pack.active = false;
          this.packRespawnAt[i] = now + this.packRespawnMs;
        }
      });
    }
  }

  /** Pick the spawn point farthest from the nearest living enemy (anti spawn-kill). */
  private pickSpawn(): Point {
    const spawns = this.map.spawnPoints;
    const center: Point = { x: WORLD.WIDTH / 2, y: WORLD.HEIGHT / 2 };

    const enemies: Point[] = [];
    this.state.players.forEach((p) => {
      if (p.alive) enemies.push({ x: p.x, y: p.y });
    });

    if (enemies.length === 0) {
      return spawns[Math.floor(Math.random() * spawns.length)] ?? center;
    }

    let best: Point = spawns[0] ?? center;
    let bestDist = -1;
    for (const s of spawns) {
      let nearest = Infinity;
      for (const e of enemies) {
        const d = Math.hypot(e.x - s.x, e.y - s.y);
        if (d < nearest) nearest = d;
      }
      if (nearest > bestDist) {
        bestDist = nearest;
        best = s;
      }
    }
    return best;
  }

  private sanitizeName(raw: string | undefined, sessionId: string): string {
    const trimmed = (raw ?? "").trim().slice(0, MAX_NAME_LENGTH);
    return trimmed.length > 0 ? trimmed : `Guest-${sessionId.slice(0, 4)}`;
  }
}
