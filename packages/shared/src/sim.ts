import { PLAYER, WORLD } from "./gameplay";
import { clamp } from "./math";

/** Maximum movement delta the server will honor per command (anti-speedhack). */
export const MAX_INPUT_DT_MS = 50;

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Deterministic movement step shared by the client (prediction) and the server
 * (authoritative simulation). Given a position and a movement command, returns
 * the new clamped position.
 *
 * Both sides MUST use this exact function so that client-side prediction can be
 * reconciled against the server without drift.
 */
export function stepMovement(
  x: number,
  y: number,
  moveX: number,
  moveY: number,
  dtMs: number,
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
  return {
    x: clamp(x + mx * distance, PLAYER.RADIUS, WORLD.WIDTH - PLAYER.RADIUS),
    y: clamp(y + my * distance, PLAYER.RADIUS, WORLD.HEIGHT - PLAYER.RADIUS),
  };
}
