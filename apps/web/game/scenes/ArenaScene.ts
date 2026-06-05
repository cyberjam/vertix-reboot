import Phaser from "phaser";
import { Client, type Room } from "colyseus.js";
import {
  WORLD,
  PLAYER,
  HEALTH_PACK,
  ARENA01,
  getClass,
  getWeapon,
  stepMovement,
  type InputMessage,
  type ShotMessage,
  type KillMessage,
} from "@vertix/shared";

const PLAYER_SIZE = PLAYER.RADIUS * 2;
const AIM_LINE_LENGTH = 220;
const RETICLE_RADIUS = 6;
const INTERP = 0.25; // interpolation factor for remote players
const TRACER_MS = 70;
const KILLFEED_MS = 4000;
const SCOREBOARD_ROWS = 8;
const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";

interface PlayerState {
  name: string;
  classId: string;
  weaponId: string;
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  ammo: number;
  reloading: boolean;
  alive: boolean;
  kills: number;
  deaths: number;
  score: number;
  lastSeq: number;
}

interface MatchStateView {
  mode: string;
  phase: string;
  timeRemainingMs: number;
  targetScore: number;
  winnerId: string;
  winnerName: string;
}

interface StatePlayers {
  forEach(callback: (player: PlayerState, key: string) => void): void;
  get(key: string): PlayerState | undefined;
}

interface HealthPackState {
  x: number;
  y: number;
  active: boolean;
}

interface StateHealthPacks {
  forEach(callback: (pack: HealthPackState, index: number) => void): void;
}

interface HealthPackMarker {
  circle: Phaser.GameObjects.Arc;
  plus: Phaser.GameObjects.Text;
}

interface PlayerView {
  rect: Phaser.GameObjects.Rectangle;
  muzzle: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  angle: number;
  alive: boolean;
  prevAlive: boolean;
  color: number;
}

interface Tracer {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  hit: boolean;
  until: number;
}

interface KillFeedEntry {
  killer: string;
  victim: string;
  until: number;
}

type WASDKeys = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};

/**
 * ArenaScene — top-down TPS client for the authoritative Colyseus FFA server.
 *
 * Sends only input; the server owns movement, firing, hit detection, health,
 * scoring and the round loop. The local player is predicted and reconciled
 * against the authoritative position; remote players are interpolated. Renders
 * the HUD, scoreboard, kill feed and round-result banner.
 */
export class ArenaScene extends Phaser.Scene {
  private client?: Client;
  private room?: Room;
  private mySessionId = "";

  private readonly views = new Map<string, PlayerView>();
  private readonly predicted = new Phaser.Math.Vector2();
  private readonly aimWorld = new Phaser.Math.Vector2();
  private pending: InputMessage[] = [];
  private localAim = 0;
  private seq = 0;
  private tracers: Tracer[] = [];
  private killFeed: KillFeedEntry[] = [];
  private healthPackMarkers: HealthPackMarker[] = [];

  private selectedClass = "triggerman";
  private keys!: WASDKeys;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyOne!: Phaser.Input.Keyboard.Key;
  private keyTwo!: Phaser.Input.Keyboard.Key;
  private keyThree!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private tracerGraphics!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private matchText!: Phaser.GameObjects.Text;
  private scoreboardText!: Phaser.GameObjects.Text;
  private killFeedText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private damageFlash!: Phaser.GameObjects.Rectangle;
  private prevMyHp = 0;
  private prevMyAlive = true;

  constructor() {
    super("arena");
  }

  create(): void {
    this.add
      .grid(
        WORLD.WIDTH / 2,
        WORLD.HEIGHT / 2,
        WORLD.WIDTH,
        WORLD.HEIGHT,
        64,
        64,
        0x121826,
        1,
        0x1c2638,
        1,
      )
      .setDepth(-1);
    this.add
      .rectangle(WORLD.WIDTH / 2, WORLD.HEIGHT / 2, WORLD.WIDTH, WORLD.HEIGHT)
      .setStrokeStyle(2, 0x4ea1ff, 0.5);

    this.buildMap();

    this.tracerGraphics = this.add.graphics().setDepth(1);
    this.aimGraphics = this.add.graphics().setDepth(1);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    camera.setBackgroundColor("#0b0e14");
    camera.centerOn(WORLD.WIDTH / 2, WORLD.HEIGHT / 2);

    this.keys = this.input.keyboard!.addKeys("W,A,S,D") as WASDKeys;
    this.keyR = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyOne = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.keyTwo = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.keyThree = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.keyQ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);

    this.buildHud();

    const leave = () => {
      void this.room?.leave();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, leave);
    this.events.once(Phaser.Scenes.Events.DESTROY, leave);

    void this.connect();
  }

  private buildMap(): void {
    // Walls (cover / line-of-sight blockers).
    for (const wall of ARENA01.walls) {
      this.add
        .rectangle(wall.x + wall.w / 2, wall.y + wall.h / 2, wall.w, wall.h, 0x39435c)
        .setStrokeStyle(2, 0x5a6b8c)
        .setDepth(0);
    }
    // Health pack markers are created lazily and driven by server state.
  }

  private buildHud(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const mono = (size: number) => ({
      fontFamily: "monospace",
      fontSize: `${size}px`,
      color: "#9fb3c8",
    });

    this.hudText = this.add.text(12, 12, "Connecting…", mono(15)).setScrollFactor(0).setDepth(10);

    this.matchText = this.add
      .text(width / 2, 12, "", { ...mono(15), color: "#e6e6e6", align: "center" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(10);

    this.scoreboardText = this.add
      .text(width - 12, 12, "", { ...mono(13), color: "#cdd9e5", align: "left" })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(10);

    this.killFeedText = this.add
      .text(12, 64, "", { ...mono(13), color: "#ffd166", align: "left" })
      .setScrollFactor(0)
      .setDepth(10);

    this.bannerText = this.add
      .text(width / 2, height / 2, "", {
        fontFamily: "monospace",
        fontSize: "28px",
        color: "#ffd166",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11)
      .setVisible(false);

    // Full-screen red flash when the local player takes damage.
    this.damageFlash = this.add
      .rectangle(width / 2, height / 2, width, height, 0xff3030, 0)
      .setScrollFactor(0)
      .setDepth(20);
  }

  private async connect(): Promise<void> {
    this.client = new Client(SERVER_URL);
    const name = `Guest${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      this.room = await this.client.joinOrCreate("arena", { name, classId: this.selectedClass });
    } catch (err) {
      console.error("[ArenaScene] failed to join room", err);
      this.hudText.setText(
        `Failed to connect to ${SERVER_URL}\nStart the game server: pnpm dev:server`,
      );
      return;
    }

    this.mySessionId = this.room.sessionId;
    this.room.onMessage("shot", (msg: ShotMessage) => {
      this.tracers.push({
        sx: msg.sx,
        sy: msg.sy,
        ex: msg.ex,
        ey: msg.ey,
        hit: msg.hit,
        until: this.time.now + TRACER_MS,
      });
      this.spawnMuzzle(msg.sx, msg.sy);
      if (msg.by === this.mySessionId && msg.hit) {
        this.showHitmarker();
        this.cameras.main.shake(60, 0.004);
      }
    });
    this.room.onMessage("kill", (msg: KillMessage) => {
      this.killFeed.push({
        killer: msg.killerName,
        victim: msg.victimName,
        until: this.time.now + KILLFEED_MS,
      });
      if (this.killFeed.length > 6) this.killFeed.shift();
    });
    this.room.onLeave(() => this.hudText.setText("Disconnected from server"));
  }

  update(_time: number, deltaMs: number): void {
    this.drawTracers();
    this.drawKillFeed();
    if (!this.room) return;

    const state = this.room.state as {
      players: StatePlayers;
      match: MatchStateView;
      healthPacks: StateHealthPacks;
    };
    this.syncViews(state.players);
    this.updateHealthPacks(state.healthPacks);

    const me = state.players.get(this.mySessionId);
    if (me) {
      this.handleLocalInput(me, deltaMs);
      this.trackLocalFeedback(me);
    }
    this.renderViews();
    if (me) this.drawAim();
    this.updateHud(me);
    this.updateScoreboard(state.players);
    this.updateMatchUi(state.match);
  }

  private syncViews(players: StatePlayers): void {
    const seen = new Set<string>();

    players.forEach((p, id) => {
      seen.add(id);
      let view = this.views.get(id);
      if (!view) {
        view = this.createView(id);
        this.views.set(id, view);
        view.rect.setPosition(p.x, p.y);
        if (id === this.mySessionId) {
          this.predicted.set(p.x, p.y);
          this.cameras.main.startFollow(view.rect, true, 0.18, 0.18);
        }
      }
      view.targetX = p.x;
      view.targetY = p.y;
      view.angle = p.angle;
      view.alive = p.alive;
      view.label.setText(p.name);
      view.color = getClass(p.classId).color;
      view.rect.setFillStyle(view.color);
    });

    this.views.forEach((view, id) => {
      if (!seen.has(id)) {
        view.rect.destroy();
        view.muzzle.destroy();
        view.label.destroy();
        this.views.delete(id);
      }
    });
  }

  private updateHealthPacks(packs: StateHealthPacks): void {
    packs.forEach((pack, i) => {
      let marker = this.healthPackMarkers[i];
      if (!marker) {
        const circle = this.add
          .circle(pack.x, pack.y, HEALTH_PACK.RADIUS, 0x2ecc71, 0.28)
          .setDepth(0);
        const plus = this.add
          .text(pack.x, pack.y, "✚", {
            fontFamily: "monospace",
            fontSize: "20px",
            color: "#2ecc71",
          })
          .setOrigin(0.5)
          .setDepth(0);
        marker = { circle, plus };
        this.healthPackMarkers[i] = marker;
      }
      marker.circle.setAlpha(pack.active ? 0.28 : 0.06);
      marker.plus.setVisible(pack.active);
    });
  }

  private createView(id: string): PlayerView {
    const isLocal = id === this.mySessionId;
    const rect = this.add.rectangle(0, 0, PLAYER_SIZE, PLAYER_SIZE, 0x888888).setDepth(2);
    if (isLocal) rect.setStrokeStyle(3, 0xffffff);
    const muzzle = this.add.rectangle(0, 0, 14, 6, 0xffd166).setDepth(3);
    const label = this.add
      .text(0, 0, "", { fontFamily: "monospace", fontSize: "11px", color: "#cdd9e5" })
      .setOrigin(0.5, 1)
      .setDepth(4);
    return {
      rect,
      muzzle,
      label,
      targetX: 0,
      targetY: 0,
      angle: 0,
      alive: true,
      prevAlive: true,
      color: 0x888888,
    };
  }

  private handleLocalInput(me: PlayerState, deltaMs: number): void {
    // Class selection (applies on next respawn) and weapon switching.
    if (Phaser.Input.Keyboard.JustDown(this.keyOne)) {
      this.selectedClass = "triggerman";
      this.room!.send("selectClass", { classId: "triggerman" });
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyTwo)) {
      this.selectedClass = "hunter";
      this.room!.send("selectClass", { classId: "hunter" });
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyThree)) {
      this.selectedClass = "vince";
      this.room!.send("selectClass", { classId: "vince" });
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) this.room!.send("switchWeapon");

    let mx = 0;
    let my = 0;
    if (this.keys.A.isDown) mx -= 1;
    if (this.keys.D.isDown) mx += 1;
    if (this.keys.W.isDown) my -= 1;
    if (this.keys.S.isDown) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
    }

    const pointer = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.aimWorld.set(world.x, world.y);
    this.localAim = Phaser.Math.Angle.Between(
      this.predicted.x,
      this.predicted.y,
      world.x,
      world.y,
    );

    const firing = pointer.leftButtonDown();
    this.seq += 1;
    const cmd: InputMessage = {
      seq: this.seq,
      dtMs: deltaMs,
      moveX: mx,
      moveY: my,
      aim: this.localAim,
      firing,
    };
    this.room!.send("input", cmd);
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) this.room!.send("reload");

    if (me.alive) {
      this.pending.push(cmd);
      this.pending = this.pending.filter((c) => c.seq > me.lastSeq);
      let x = me.x;
      let y = me.y;
      for (const c of this.pending) {
        const next = stepMovement(x, y, c.moveX, c.moveY, c.dtMs, ARENA01.walls);
        x = next.x;
        y = next.y;
      }
      this.predicted.set(x, y);
    } else {
      this.pending.length = 0;
      this.predicted.set(me.x, me.y);
    }
  }

  private renderViews(): void {
    this.views.forEach((view, id) => {
      if (id === this.mySessionId) {
        view.rect.setPosition(this.predicted.x, this.predicted.y);
        view.rect.setRotation(this.localAim);
        this.positionMuzzle(view, this.localAim);
      } else {
        view.rect.x = Phaser.Math.Linear(view.rect.x, view.targetX, INTERP);
        view.rect.y = Phaser.Math.Linear(view.rect.y, view.targetY, INTERP);
        view.rect.setRotation(view.angle);
        this.positionMuzzle(view, view.angle);
      }
      view.label.setPosition(view.rect.x, view.rect.y - PLAYER.RADIUS - 6);
      view.rect.setAlpha(view.alive ? 1 : 0.25);
      view.muzzle.setVisible(view.alive);
      view.label.setAlpha(view.alive ? 1 : 0.4);

      // Death burst when a player dies.
      if (view.prevAlive && !view.alive) {
        this.spawnDeathRing(view.rect.x, view.rect.y, view.color);
      }
      view.prevAlive = view.alive;
    });
  }

  private spawnDeathRing(x: number, y: number, color: number): void {
    const ring = this.add.circle(x, y, PLAYER.RADIUS, color, 0).setStrokeStyle(3, color).setDepth(5);
    this.tweens.add({
      targets: ring,
      scale: 3,
      alpha: 0,
      duration: 350,
      ease: "Cubic.Out",
      onComplete: () => ring.destroy(),
    });
  }

  private spawnMuzzle(x: number, y: number): void {
    const flash = this.add.circle(x, y, 7, 0xffe08a, 0.95).setDepth(4);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 0.4,
      duration: 70,
      onComplete: () => flash.destroy(),
    });
  }

  private showHitmarker(): void {
    const marker = this.add
      .text(this.aimWorld.x, this.aimWorld.y, "✕", {
        fontFamily: "monospace",
        fontSize: "22px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setDepth(9);
    this.tweens.add({
      targets: marker,
      alpha: 0,
      scale: 1.6,
      duration: 180,
      onComplete: () => marker.destroy(),
    });
  }

  private positionMuzzle(view: PlayerView, angle: number): void {
    const d = PLAYER.RADIUS + 4;
    view.muzzle.setPosition(
      view.rect.x + Math.cos(angle) * d,
      view.rect.y + Math.sin(angle) * d,
    );
    view.muzzle.setRotation(angle);
  }

  private trackLocalFeedback(me: PlayerState): void {
    // Red flash when taking damage (while alive).
    if (me.alive && me.hp < this.prevMyHp) {
      this.damageFlash.setAlpha(0.35);
      this.tweens.add({ targets: this.damageFlash, alpha: 0, duration: 250 });
    }
    // Camera shake on death.
    if (this.prevMyAlive && !me.alive) {
      this.cameras.main.shake(250, 0.012);
    }
    this.prevMyHp = me.hp;
    this.prevMyAlive = me.alive;
  }

  private drawAim(): void {
    const endX = this.predicted.x + Math.cos(this.localAim) * AIM_LINE_LENGTH;
    const endY = this.predicted.y + Math.sin(this.localAim) * AIM_LINE_LENGTH;

    this.aimGraphics.clear();
    this.aimGraphics.lineStyle(2, 0x4ea1ff, 0.6);
    this.aimGraphics.lineBetween(this.predicted.x, this.predicted.y, endX, endY);
    this.aimGraphics.lineStyle(1.5, 0xffffff, 0.85);
    this.aimGraphics.strokeCircle(this.aimWorld.x, this.aimWorld.y, RETICLE_RADIUS);
  }

  private drawTracers(): void {
    const now = this.time.now;
    this.tracers = this.tracers.filter((t) => t.until > now);
    this.tracerGraphics.clear();
    for (const t of this.tracers) {
      this.tracerGraphics.lineStyle(2, t.hit ? 0xff5555 : 0xffe08a, 0.9);
      this.tracerGraphics.lineBetween(t.sx, t.sy, t.ex, t.ey);
    }
  }

  private drawKillFeed(): void {
    const now = this.time.now;
    this.killFeed = this.killFeed.filter((k) => k.until > now);
    this.killFeedText.setText(this.killFeed.map((k) => `${k.killer} ▸ ${k.victim}`).join("\n"));
  }

  private updateHud(me: PlayerState | undefined): void {
    if (!me) {
      this.hudText.setText("Connecting…");
      return;
    }
    const weapon = getWeapon(me.weaponId);
    const className = getClass(me.classId).name;
    const ammo = me.reloading ? "RELOADING" : `${me.ammo}/${weapon.magSize}`;
    const dead = me.alive ? "" : "   ☠ respawning…";
    const pending =
      this.selectedClass !== me.classId ? `  (next: ${getClass(this.selectedClass).name})` : "";
    this.hudText.setText(
      `${className} [${weapon.name}]   HP ${Math.max(0, Math.round(me.hp))}/${me.maxHp}   ` +
        `Ammo ${ammo}   Score ${me.score}${dead}${pending}\n` +
        "WASD move · mouse aim · click fire · R reload · Q weapon · 1 Triggerman / 2 Hunter / 3 Vince",
    );
  }

  private updateScoreboard(players: StatePlayers): void {
    const rows: { name: string; score: number; kills: number; deaths: number; id: string }[] = [];
    players.forEach((p, id) => {
      rows.push({ name: p.name, score: p.score, kills: p.kills, deaths: p.deaths, id });
    });
    rows.sort((a, b) => b.score - a.score || b.kills - a.kills);

    const lines = ["── SCOREBOARD ──"];
    rows.slice(0, SCOREBOARD_ROWS).forEach((r, i) => {
      const marker = r.id === this.mySessionId ? "▸" : " ";
      const rank = `${i + 1}`.padStart(2);
      const name = r.name.padEnd(12).slice(0, 12);
      const score = `${r.score}`.padStart(5);
      lines.push(`${marker}${rank} ${name} ${score}  ${r.kills}/${r.deaths}`);
    });
    this.scoreboardText.setText(lines.join("\n"));
  }

  private updateMatchUi(match: MatchStateView): void {
    const seconds = Math.max(0, Math.ceil(match.timeRemainingMs / 1000));
    const mm = Math.floor(seconds / 60);
    const ss = `${seconds % 60}`.padStart(2, "0");
    this.matchText.setText(`FFA   ${mm}:${ss}   first to ${match.targetScore}`);

    if (match.phase === "ended") {
      const winner = match.winnerName.length > 0 ? match.winnerName : "—";
      this.bannerText.setText(`ROUND OVER\nWinner: ${winner}\nnext round starting…`).setVisible(true);
    } else {
      this.bannerText.setVisible(false);
    }
  }
}
