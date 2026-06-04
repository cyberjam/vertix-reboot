import Phaser from "phaser";

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const PLAYER_SIZE = 28;
const PLAYER_SPEED = 320; // px/s (arcade velocity is already time-based)
const AIM_LINE_LENGTH = 220; // px, length of the aim guide line
const RETICLE_RADIUS = 6; // px, crosshair circle at the cursor

type WASDKeys = {
  W: Phaser.Input.Keyboard.Key;
  A: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
};

/**
 * ArenaScene — top-down arena with a single locally-controlled player.
 *
 * Scope: top-view camera that follows the player, WASD movement, mouse aim
 * (player rotates toward the cursor) and an aim guide line + reticle. No
 * networking, weapons or wall collision yet (those arrive in later milestones).
 */
export class ArenaScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private playerBody!: Phaser.Physics.Arcade.Body;
  private muzzle!: Phaser.GameObjects.Rectangle;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private keys!: WASDKeys;

  constructor() {
    super("arena");
  }

  create(): void {
    // World + physics bounds (top-down plane).
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Floor grid so the camera movement is visible.
    this.add
      .grid(
        WORLD_WIDTH / 2,
        WORLD_HEIGHT / 2,
        WORLD_WIDTH,
        WORLD_HEIGHT,
        64,
        64,
        0x121826,
        1,
        0x1c2638,
        1,
      )
      .setDepth(-1);

    // World border.
    this.add
      .rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT)
      .setStrokeStyle(2, 0x4ea1ff, 0.5);

    // Aim guide line + reticle, redrawn every frame.
    this.aimGraphics = this.add.graphics().setDepth(1);

    // Player: a rectangle driven by an arcade physics body.
    this.player = this.add
      .rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, PLAYER_SIZE, PLAYER_SIZE, 0x4ea1ff)
      .setDepth(2);
    this.physics.add.existing(this.player);
    this.playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.playerBody.setCollideWorldBounds(true);

    // Muzzle marker showing the facing direction; positioned each frame.
    this.muzzle = this.add
      .rectangle(this.player.x, this.player.y, 14, 6, 0xffd166)
      .setDepth(3);

    // Top-view camera follows the player.
    const camera = this.cameras.main;
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    camera.setBackgroundColor("#0b0e14");
    camera.startFollow(this.player, true, 0.15, 0.15);

    // WASD input.
    this.keys = this.input.keyboard!.addKeys("W,A,S,D") as WASDKeys;

    // Fixed on-screen hint (does not scroll with the world).
    this.add
      .text(12, 12, "WASD to move · mouse to aim", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#9fb3c8",
      })
      .setScrollFactor(0)
      .setDepth(10);
  }

  update(): void {
    this.updateMovement();
    this.updateAim();
  }

  private updateMovement(): void {
    const direction = new Phaser.Math.Vector2(0, 0);
    if (this.keys.A.isDown) direction.x -= 1;
    if (this.keys.D.isDown) direction.x += 1;
    if (this.keys.W.isDown) direction.y -= 1;
    if (this.keys.S.isDown) direction.y += 1;

    // Normalize so diagonal movement is not faster, then apply speed.
    direction.normalize().scale(PLAYER_SPEED);
    this.playerBody.setVelocity(direction.x, direction.y);
  }

  private updateAim(): void {
    // Convert the cursor (screen space) to world space under the following camera.
    const pointer = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

    const angle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      world.x,
      world.y,
    );

    // Rotate the character toward the cursor.
    this.player.setRotation(angle);

    // Keep the muzzle marker at the front of the player, facing the cursor.
    const muzzleDistance = PLAYER_SIZE / 2 + 4;
    this.muzzle.setPosition(
      this.player.x + Math.cos(angle) * muzzleDistance,
      this.player.y + Math.sin(angle) * muzzleDistance,
    );
    this.muzzle.setRotation(angle);

    // Draw the aim guide line from the player toward the cursor + a reticle.
    const aimEndX = this.player.x + Math.cos(angle) * AIM_LINE_LENGTH;
    const aimEndY = this.player.y + Math.sin(angle) * AIM_LINE_LENGTH;

    this.aimGraphics.clear();
    this.aimGraphics.lineStyle(2, 0x4ea1ff, 0.6);
    this.aimGraphics.lineBetween(this.player.x, this.player.y, aimEndX, aimEndY);
    this.aimGraphics.lineStyle(1.5, 0xffffff, 0.85);
    this.aimGraphics.strokeCircle(world.x, world.y, RETICLE_RADIUS);
  }
}
