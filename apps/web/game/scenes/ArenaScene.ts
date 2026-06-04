import Phaser from "phaser";
import { Client, type Room } from "colyseus.js";
import {
  WORLD,
  PLAYER,
  MACHINEGUN,
  stepMovement,
  type InputMessage,
  type ShotMessage,
} from "@vertix/shared";

const PLAYER_SIZE = PLAYER.RADIUS * 2;
const AIM_LINE_LENGTH = 220;
const RETICLE_RADIUS = 6;
const INTERP = 0.25; // interpolation factor for remote players
const TRACER_MS = 70;
const SERVER_URL = process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "ws://localhost:2567";

/** Shape of the replicated Player schema as seen on the client. */
interface PlayerState {
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
  lastSeq: number;
}

interface StatePlayers {
  forEach(callback: (player: PlayerState, key: string) => void): void;
  get(key: string): PlayerState | undefined;
}

interface PlayerView {
  rect: Phaser.GameObjects.Rectangle;
  muzzle: Phaser.GameObjects.Rectangle;
  targetX: number;
  targetY: number;
  angle: number;
  alive: boolean;
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
 * ArenaScene — top-down TPS client for the authoritative Colyseus server.
 *
 * The client sends only input; the server owns movement, firing, hit detection
 * and health. The local player is predicted immediately and reconciled every
 * frame by replaying inputs the server has not yet acknowledged on top of the
 * authoritative position. Remote players are interpolated toward their server
 * positions.
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

  private keys!: WASDKeys;
  private keyR!: Phaser.Input.Keyboard.Key;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private tracerGraphics!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;

  constructor() {
    super("arena");
  }

  create(): void {
    // Floor grid + world border (top-down).
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

    this.tracerGraphics = this.add.graphics().setDepth(1);
    this.aimGraphics = this.add.graphics().setDepth(1);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD.WIDTH, WORLD.HEIGHT);
    camera.setBackgroundColor("#0b0e14");
    camera.centerOn(WORLD.WIDTH / 2, WORLD.HEIGHT / 2);

    this.keys = this.input.keyboard!.addKeys("W,A,S,D") as WASDKeys;
    this.keyR = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    this.hudText = this.add
      .text(12, 12, "Connecting…", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#9fb3c8",
      })
      .setScrollFactor(0)
      .setDepth(10);

    // Leave the room cleanly when the scene/game is torn down.
    const leave = () => {
      void this.room?.leave();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, leave);
    this.events.once(Phaser.Scenes.Events.DESTROY, leave);

    void this.connect();
  }

  private async connect(): Promise<void> {
    this.client = new Client(SERVER_URL);
    try {
      this.room = await this.client.joinOrCreate("arena");
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
    });
    this.room.onLeave(() => this.hudText.setText("Disconnected from server"));
  }

  update(_time: number, deltaMs: number): void {
    this.drawTracers();
    if (!this.room) return;

    const players = (this.room.state as { players: StatePlayers }).players;
    this.syncViews(players);

    const me = players.get(this.mySessionId);
    if (me) this.handleLocalInput(me, deltaMs);
    this.renderViews();
    if (me) this.drawAim();
    this.updateHud(me);
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
    });

    this.views.forEach((view, id) => {
      if (!seen.has(id)) {
        view.rect.destroy();
        view.muzzle.destroy();
        this.views.delete(id);
      }
    });
  }

  private createView(id: string): PlayerView {
    const isLocal = id === this.mySessionId;
    const rect = this.add
      .rectangle(0, 0, PLAYER_SIZE, PLAYER_SIZE, isLocal ? 0x4ea1ff : 0xff7a59)
      .setDepth(2);
    const muzzle = this.add.rectangle(0, 0, 14, 6, 0xffd166).setDepth(3);
    return { rect, muzzle, targetX: 0, targetY: 0, angle: 0, alive: true };
  }

  private handleLocalInput(me: PlayerState, deltaMs: number): void {
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
      // Record this input, drop ones the server already processed, then
      // replay the rest from the authoritative position (reconciliation).
      this.pending.push(cmd);
      this.pending = this.pending.filter((c) => c.seq > me.lastSeq);
      let x = me.x;
      let y = me.y;
      for (const c of this.pending) {
        const next = stepMovement(x, y, c.moveX, c.moveY, c.dtMs);
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
      view.rect.setAlpha(view.alive ? 1 : 0.25);
      view.muzzle.setVisible(view.alive);
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

  private updateHud(me: PlayerState | undefined): void {
    if (!me) {
      this.hudText.setText("Connecting…");
      return;
    }
    const ammo = me.reloading ? "RELOADING" : `${me.ammo}/${MACHINEGUN.magSize}`;
    const dead = me.alive ? "" : "   ☠ respawning…";
    this.hudText.setText(
      `Triggerman   HP ${Math.max(0, Math.round(me.hp))}/${me.maxHp}   ` +
        `Ammo ${ammo}   Kills ${me.kills}${dead}\n` +
        "WASD move · mouse aim · hold click to fire · R reload",
    );
  }
}
