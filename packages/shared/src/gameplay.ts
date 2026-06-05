/**
 * Gameplay constants shared by the authoritative server and the client.
 *
 * Confirmed from Vertix.io: Triggerman has 100 HP and a machine gun dealing
 * 25 damage with a 24-round magazine. Fire rate / reload / range are tuned
 * estimates (see docs/design/01-game-analysis.md) and can be re-calibrated.
 */

export const WORLD = {
  WIDTH: 2000,
  HEIGHT: 2000,
} as const;

export const PLAYER = {
  RADIUS: 16,
  SPEED: 320, // px/s
  MAX_HP: 100, // Triggerman
} as const;

export const TRIGGERMAN = {
  id: "triggerman",
  name: "Triggerman",
  maxHp: 100,
  weapon: "machinegun",
} as const;

export const MACHINEGUN = {
  id: "machinegun",
  damage: 25,
  magSize: 24,
  fireRateMs: 90, // ~11 rounds/s (automatic)
  reloadMs: 1500,
  rangePx: 700,
} as const;

/** Delay before a dead player respawns (ms). */
export const RESPAWN_MS = 2000;

/**
 * Health pack pickups. Estimated from Vertix.io (map pickups, no passive
 * regen): instant +50 heal on contact, then the pack respawns after a cooldown.
 */
export const HEALTH_PACK = {
  HEAL: 50,
  RADIUS: 18,
  RESPAWN_MS: 15000,
} as const;

/**
 * Free-For-All match rules. Confirmed from Vertix.io: first to 1500 points
 * (≈15 kills at 100/kill) over a ~4 minute round.
 */
export const FFA = {
  /** Points awarded per kill. */
  KILL_SCORE: 100,
  /** Score that ends the round (first to reach it wins). */
  TARGET_SCORE: 1500,
  /** Round length (ms). */
  DURATION_MS: 4 * 60 * 1000,
  /** How long the end-of-round screen shows before the next round (ms). */
  END_SCREEN_MS: 5000,
} as const;
