import type { RectWall } from "./maps";
import { PLAYER, WORLD, JUMP } from "./gameplay";
import { clamp } from "./math";

/** Maximum movement delta the server will honor per command (anti-speedhack). */
export const MAX_INPUT_DT_MS = 50;

export interface Vec2 {
  x: number;
  y: number;
}

/** True if a circle of radius r at (px,py) overlaps the wall. */
function overlapsWall(px: number, py: number, wall: RectWall, r: number): boolean {
  return (
    px > wall.x - r &&
    px < wall.x + wall.w + r &&
    py > wall.y - r &&
    py < wall.y + wall.h + r
  );
}

/**
 * Deterministic movement step shared by the client (prediction) and the server
 * (authoritative simulation). Applies movement, world bounds and wall
 * collision (circle vs AABB, resolved per axis so players slide along walls).
 *
 * Both sides MUST use this exact function with the same walls so that client
 * prediction reconciles against the server without drift.
 */
export function stepMovement(
  x: number,
  y: number,
  moveX: number,
  moveY: number,
  dtMs: number,
  walls: readonly RectWall[],
): Vec2 {
  let mx = moveX;
  let my = moveY;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }
  const dt = clamp(dtMs, 0, MAX_INPUT_DT_MS) / 1000;
  const distance = PLAYER.SPEED * dt;
  const r = PLAYER.RADIUS;

  // Resolve X, then Y, against walls (axis separation => sliding).
  let nx = clamp(x + mx * distance, r, WORLD.WIDTH - r);
  for (const wall of walls) {
    if (overlapsWall(nx, y, wall, r)) {
      if (mx > 0) nx = wall.x - r;
      else if (mx < 0) nx = wall.x + wall.w + r;
    }
  }

  let ny = clamp(y + my * distance, r, WORLD.HEIGHT - r);
  for (const wall of walls) {
    if (overlapsWall(nx, ny, wall, r)) {
      if (my > 0) ny = wall.y - r;
      else if (my < 0) ny = wall.y + wall.h + r;
    }
  }

  return { x: nx, y: ny };
}

export interface JumpStep {
  /** Height above the ground (px); 0 means grounded. */
  jumpY: number;
  /** Vertical velocity (px/s); positive is upward. */
  jumpVel: number;
  /** True once the hop has landed (clamped back to the ground this step). */
  grounded: boolean;
}

/**
 * Deterministic vertical-hop integration, shared by the client (local prediction)
 * and the server (replicated `jumpY`). Independent of x/y movement and hit
 * detection — gravity pulls `jumpY` back to the ground each step.
 */
export function stepJump(jumpY: number, jumpVel: number, dtMs: number): JumpStep {
  const dt = clamp(dtMs, 0, MAX_INPUT_DT_MS) / 1000;
  let vel = jumpVel - JUMP.GRAVITY * dt;
  let y = jumpY + vel * dt;
  let grounded = false;
  if (y <= 0) {
    y = 0;
    vel = 0;
    grounded = true;
  }
  return { jumpY: y, jumpVel: vel, grounded };
}
