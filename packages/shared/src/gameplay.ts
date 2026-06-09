/**
 * Gameplay constants, weapons and classes shared by the authoritative server
 * and the client.
 *
 * Confirmed from Vertix.io: Triggerman 100 HP / machine gun 25 dmg, 24 mag;
 * Hunter 50 HP / fully-accurate sniper 100 dmg + machine-pistol backup
 * (12 dmg, 5 mag). Fire rate / reload / range are tuned estimates.
 */

export const WORLD = {
  WIDTH: 2000,
  HEIGHT: 2000,
} as const;

export const PLAYER = {
  RADIUS: 16,
  SPEED: 320, // px/s
  MAX_HP: 100, // default; per-class HP overrides this
} as const;

/**
 * Delay before a dead player respawns (ms). The death overlay splits this
 * window into a brief "you were eliminated" phase, then a class-selection
 * phase (see DeathOverlay.RESPAWN_PICKER_DELAY_MS) — class selection is part
 * of the respawn timer, not added on top of it.
 */
export const RESPAWN_MS = 6000;

/**
 * Jump (vertical hop). Top-down so jumping is an orthogonal vertical axis
 * (`jumpY`, px above ground) that does NOT affect x/y movement or hit
 * detection — purely a dodge-feel hop. Tuned for ~0.6s airtime, ~40px peak.
 */
export const JUMP = {
  STRENGTH: 270, // initial upward velocity (px/s)
  GRAVITY: 900, // downward acceleration (px/s^2)
  COOLDOWN_MS: 250, // delay after landing before the next jump
} as const;

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
  KILL_SCORE: 100,
  TARGET_SCORE: 1500,
  DURATION_MS: 4 * 60 * 1000,
  END_SCREEN_MS: 5000,
} as const;

// ── Weapons ────────────────────────────────────────────────────────────────

export interface WeaponDef {
  id: string;
  name: string;
  /** Damage per pellet/ray. */
  damage: number;
  magSize: number;
  fireRateMs: number;
  reloadMs: number;
  rangePx: number;
  /** true: fires while held; false: one shot per trigger press (semi-auto). */
  auto: boolean;
  /** Pellets fired per shot (shotguns); defaults to 1. */
  pellets?: number;
  /** Total spread cone in degrees for multi-pellet weapons; defaults to 0. */
  spreadDeg?: number;
}

// Calibrated values — see docs/design/05-weapon-balance.md for the full
// rationale (TTK model, role differentiation, range tiers).

const MACHINEGUN_DEF: WeaponDef = {
  id: "machinegun",
  name: "Machine Gun",
  damage: 25, // confirmed: 4 shots to kill 100 HP
  magSize: 24, // confirmed
  fireRateMs: 90, // ~11.1 rps -> TTK(100hp) = 3 * 90 = 270ms
  reloadMs: 1500,
  rangePx: 750, // versatile mid-range; covers most arena lanes
  auto: true,
};

const SNIPER_DEF: WeaponDef = {
  id: "sniper",
  name: "Sniper",
  damage: 100, // confirmed: one-shots any <=100 HP class
  magSize: 5,
  fireRateMs: 1100, // slow single fire; missing is heavily punished
  reloadMs: 2200,
  rangePx: 1700, // dominates long sightlines (near cross-map)
  auto: true, // hold-to-fire at 1100ms cadence; fireRateMs unchanged
};

const MACHINE_PISTOL_DEF: WeaponDef = {
  id: "machine_pistol",
  name: "Machine Pistol",
  damage: 12, // confirmed
  magSize: 5, // confirmed; one mag = 60 dmg, cannot kill a full 100 HP target
  fireRateMs: 60, // ~16.7 rps, fast close-range backup
  reloadMs: 1000,
  rangePx: 520, // short range; encourages Hunter to lead with the sniper
  auto: true,
};

const SHOTGUN_DEF: WeaponDef = {
  id: "shotgun",
  name: "Shotgun",
  damage: 25, // per pellet; 4 pellets => up to 100 at point blank
  magSize: 6,
  fireRateMs: 800, // pump action
  reloadMs: 1900,
  rangePx: 480, // short; pellets spread out beyond this
  auto: true, // hold-to-fire at 800ms cadence; fireRateMs unchanged
  pellets: 4, // confirmed: Vince fires a spread of 4 pellets
  spreadDeg: 16,
};

export const WEAPONS: Record<string, WeaponDef> = {
  machinegun: MACHINEGUN_DEF,
  sniper: SNIPER_DEF,
  machine_pistol: MACHINE_PISTOL_DEF,
  shotgun: SHOTGUN_DEF,
};

/** Back-compat default weapon reference. */
export const MACHINEGUN = MACHINEGUN_DEF;

export function getWeapon(id: string): WeaponDef {
  return WEAPONS[id] ?? MACHINEGUN_DEF;
}

// ── Classes ──────────────────────────────────────────────────────────────────

export interface ClassDef {
  id: string;
  name: string;
  maxHp: number;
  primary: string;
  secondary: string | null;
  color: number;
}

const TRIGGERMAN_CLASS: ClassDef = {
  id: "triggerman",
  name: "Triggerman",
  maxHp: 100,
  primary: "machinegun",
  secondary: null,
  color: 0x4ea1ff,
};

const HUNTER_CLASS: ClassDef = {
  id: "hunter",
  name: "Hunter",
  maxHp: 50,
  primary: "sniper",
  secondary: "machine_pistol",
  color: 0xc792ea,
};

const VINCE_CLASS: ClassDef = {
  id: "vince",
  name: "Vince",
  maxHp: 100,
  primary: "shotgun",
  secondary: null,
  color: 0xffa657,
};

export const CLASSES: Record<string, ClassDef> = {
  triggerman: TRIGGERMAN_CLASS,
  hunter: HUNTER_CLASS,
  vince: VINCE_CLASS,
};

export const CLASS_IDS = ["triggerman", "hunter", "vince"] as const;
export const DEFAULT_CLASS = "triggerman";

export function getClass(id: string): ClassDef {
  return CLASSES[id] ?? TRIGGERMAN_CLASS;
}
