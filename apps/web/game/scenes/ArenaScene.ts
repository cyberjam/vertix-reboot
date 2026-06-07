import Phaser from "phaser";
import { type Room } from "colyseus.js";
import { getSetting } from "@/lib/settings";
import {
  WORLD,
  PLAYER,
  HEALTH_PACK,
  JUMP,
  ARENA01,
  getClass,
  stepMovement,
  stepJump,
  type InputMessage,
  type ShotMessage,
} from "@vertix/shared";

const PLAYER_SIZE = PLAYER.RADIUS * 2;
const AIM_LINE_LENGTH = 220;
const RETICLE_RADIUS = 6;
const INTERP = 0.25; // interpolation factor for remote players
const TRACER_MS = 70;

interface PlayerState {
  name: string;
  classId: string;
  weaponId: string;
  x: number;
  y: number;
  jumpY: number;
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
  shadow: Phaser.GameObjects.Ellipse;
  muzzle: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  jumpY: number;
  targetJumpY: number;
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
  private room?: Room;
  private mySessionId = "";

  private readonly views = new Map<string, PlayerView>();
  private readonly predicted = new Phaser.Math.Vector2();
  private readonly aimWorld = new Phaser.Math.Vector2();
  private pending: InputMessage[] = [];
  private localAim = 0;
  private seq = 0;
  private tracers: Tracer[] = [];
  private healthPackMarkers: HealthPackMarker[] = [];

  private selectedClass = "triggerman";
  private localJumpY = 0;
  private localJumpVel = 0;
  private localJumpReadyAt = 0;
  private cameraAnchor!: Phaser.GameObjects.Rectangle;
  private keys!: WASDKeys;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyOne!: Phaser.Input.Keyboard.Key;
  private keyTwo!: Phaser.Input.Keyboard.Key;
  private keyThree!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private tracerGraphics!: Phaser.GameObjects.Graphics;
  private damageFlash!: Phaser.GameObjects.Rectangle;
  private prevMyHp = 0;
  private prevMyAlive = true;

  constructor() {
    super("arena");
  }

  /** Receives the live Colyseus room injected by React (NetProvider). */
  init(data: { room: Room; sessionId: string }): void {
    this.room = data.room;
    this.mySessionId = data.sessionId;
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

    // Camera follows an invisible ground anchor so jumping (vertical offset)
    // moves the body sprite without bobbing the whole view.
    this.cameraAnchor = this.add
      .rectangle(WORLD.WIDTH / 2, WORLD.HEIGHT / 2, 1, 1, 0x000000, 0)
      .setDepth(-2);
    camera.startFollow(this.cameraAnchor, true, 0.18, 0.18);

    this.keys = this.input.keyboard!.addKeys("W,A,S,D") as WASDKeys;
    this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyR = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyOne = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.keyTwo = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.keyThree = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.keyQ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);

    this.buildHud();

    // The connection is owned by React (NetProvider); the scene only wires up
    // the room's one-off event messages (tracers / kill feed).
    this.registerRoomHandlers();
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

    // The HUD readouts, scoreboard and round-over screen are React DOM overlays.
    // Phaser keeps only the full-screen damage flash here (plus the in-world VFX).
    this.damageFlash = this.add
      .rectangle(width / 2, height / 2, width, height, 0xff3030, 0)
      .setScrollFactor(0)
      .setDepth(20);
  }

  private registerRoomHandlers(): void {
    const room = this.room;
    if (!room) return;
    // Seed the selected class from the player's current server state.
    const me = (room.state as { players: StatePlayers }).players.get(this.mySessionId);
    if (me) this.selectedClass = me.classId;

    // "shot" drives the tracer/muzzle/hitmarker VFX (kept in Phaser). The kill
    // feed is rendered by the React HUD, which subscribes to "kill" itself.
    room.onMessage("shot", (msg: ShotMessage) => {
      if (getSetting("effects")) {
        this.tracers.push({
          sx: msg.sx,
          sy: msg.sy,
          ex: msg.ex,
          ey: msg.ey,
          hit: msg.hit,
          until: this.time.now + TRACER_MS,
        });
        this.spawnMuzzle(msg.sx, msg.sy);
      }
      if (msg.by === this.mySessionId && msg.hit) {
        if (getSetting("effects")) this.showHitmarker();
        if (getSetting("shake")) this.cameras.main.shake(60, 0.004);
      }
    });
  }

  update(_time: number, deltaMs: number): void {
    this.drawTracers();
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
        view.shadow.setPosition(p.x, p.y);
        view.jumpY = p.jumpY;
        if (id === this.mySessionId) {
          this.predicted.set(p.x, p.y);
          this.cameraAnchor.setPosition(p.x, p.y);
        }
      }
      view.targetX = p.x;
      view.targetY = p.y;
      view.targetJumpY = p.jumpY;
      view.angle = p.angle;
      view.alive = p.alive;
      view.label.setText(p.name);
      view.color = getClass(p.classId).color;
      view.rect.setFillStyle(view.color);
    });

    this.views.forEach((view, id) => {
      if (!seen.has(id)) {
        view.rect.destroy();
        view.shadow.destroy();
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
    const shadow = this.add
      .ellipse(0, 0, PLAYER_SIZE * 0.9, PLAYER_SIZE * 0.5, 0x000000, 0.35)
      .setDepth(1);
    const rect = this.add.rectangle(0, 0, PLAYER_SIZE, PLAYER_SIZE, 0x888888).setDepth(2);
    if (isLocal) rect.setStrokeStyle(3, 0xffffff);
    const muzzle = this.add.rectangle(0, 0, 14, 6, 0xffd166).setDepth(3);
    const label = this.add
      .text(0, 0, "", { fontFamily: "monospace", fontSize: "11px", color: "#cdd9e5" })
      .setOrigin(0.5, 1)
      .setDepth(4);
    return {
      rect,
      shadow,
      muzzle,
      label,
      targetX: 0,
      targetY: 0,
      jumpY: 0,
      targetJumpY: 0,
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
    const jumpHeld = this.keySpace.isDown;
    this.seq += 1;
    const cmd: InputMessage = {
      seq: this.seq,
      dtMs: deltaMs,
      moveX: mx,
      moveY: my,
      aim: this.localAim,
      firing,
      jump: jumpHeld,
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
      this.predictJump(deltaMs);
    } else {
      this.pending.length = 0;
      this.predicted.set(me.x, me.y);
      this.localJumpY = 0;
      this.localJumpVel = 0;
    }
  }

  /** Local prediction of the jump arc (matches the server's applyJump/stepJump). */
  private predictJump(deltaMs: number): void {
    // Held key auto-hops again once grounded and off cooldown (matches server).
    if (
      this.keySpace.isDown &&
      this.localJumpY <= 0 &&
      this.time.now >= this.localJumpReadyAt
    ) {
      this.localJumpVel = JUMP.STRENGTH;
    }
    const wasAirborne = this.localJumpY > 0;
    const step = stepJump(this.localJumpY, this.localJumpVel, deltaMs);
    this.localJumpY = step.jumpY;
    this.localJumpVel = step.jumpVel;
    if (wasAirborne && step.grounded) this.localJumpReadyAt = this.time.now + JUMP.COOLDOWN_MS;
  }

  private renderViews(): void {
    this.views.forEach((view, id) => {
      // Resolve ground position (gx,gy), jump height (jy) and aim angle.
      let gx: number;
      let gy: number;
      let jy: number;
      let angle: number;
      if (id === this.mySessionId) {
        gx = this.predicted.x;
        gy = this.predicted.y;
        jy = this.localJumpY;
        angle = this.localAim;
        this.cameraAnchor.setPosition(gx, gy);
      } else {
        gx = Phaser.Math.Linear(view.shadow.x, view.targetX, INTERP);
        gy = Phaser.Math.Linear(view.shadow.y, view.targetY, INTERP);
        view.jumpY = Phaser.Math.Linear(view.jumpY, view.targetJumpY, INTERP);
        jy = view.jumpY;
        angle = view.angle;
      }

      // Ground shadow stays on the floor and shrinks/fades as the player rises.
      const lift = Phaser.Math.Clamp(jy / 60, 0, 1);
      view.shadow.setPosition(gx, gy);
      view.shadow.setScale(1 - lift * 0.35);
      view.shadow.setAlpha((view.alive ? 0.35 : 0.12) * (1 - lift * 0.5));
      view.shadow.setVisible(view.alive);

      // Body is lifted by the jump height.
      view.rect.setPosition(gx, gy - jy);
      view.rect.setRotation(angle);
      this.positionMuzzle(view, angle);

      view.label.setPosition(view.rect.x, view.rect.y - PLAYER.RADIUS - 6);
      view.rect.setAlpha(view.alive ? 1 : 0.25);
      view.muzzle.setVisible(view.alive);
      view.label.setAlpha(view.alive ? 1 : 0.4);

      // Death burst when a player dies.
      if (view.prevAlive && !view.alive) {
        this.spawnDeathRing(gx, gy, view.color);
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
    if (this.prevMyAlive && !me.alive && getSetting("shake")) {
      this.cameras.main.shake(250, 0.012);
    }
    this.prevMyHp = me.hp;
    this.prevMyAlive = me.alive;
  }

  private drawAim(): void {
    const originX = this.predicted.x;
    const originY = this.predicted.y - this.localJumpY;
    const endX = originX + Math.cos(this.localAim) * AIM_LINE_LENGTH;
    const endY = originY + Math.sin(this.localAim) * AIM_LINE_LENGTH;

    this.aimGraphics.clear();
    this.aimGraphics.lineStyle(2, 0x4ea1ff, 0.6);
    this.aimGraphics.lineBetween(originX, originY, endX, endY);
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

}
