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
  KILL_SCORE: 100,
  TARGET_SCORE: 1500,
  DURATION_MS: 4 * 60 * 1000,
  END_SCREEN_MS: 5000,
} as const;

// ── Weapons ────────────────────────────────────────────────────────────────

export interface WeaponDef {
  id: string;
  name: string;
  damage: number;
  magSize: number;
  fireRateMs: number;
  reloadMs: number;
  rangePx: number;
  /** true: fires while held; false: one shot per trigger press (semi-auto). */
  auto: boolean;
}

const MACHINEGUN_DEF: WeaponDef = {
  id: "machinegun",
  name: "Machine Gun",
  damage: 25,
  magSize: 24,
  fireRateMs: 90,
  reloadMs: 1500,
  rangePx: 700,
  auto: true,
};

const SNIPER_DEF: WeaponDef = {
  id: "sniper",
  name: "Sniper",
  damage: 100,
  magSize: 5,
  fireRateMs: 900,
  reloadMs: 1800,
  rangePx: 1400,
  auto: false,
};

const MACHINE_PISTOL_DEF: WeaponDef = {
  id: "machine_pistol",
  name: "Machine Pistol",
  damage: 12,
  magSize: 5,
  fireRateMs: 70,
  reloadMs: 1100,
  rangePx: 600,
  auto: true,
};

export const WEAPONS: Record<string, WeaponDef> = {
  machinegun: MACHINEGUN_DEF,
  sniper: SNIPER_DEF,
  machine_pistol: MACHINE_PISTOL_DEF,
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

export const CLASSES: Record<string, ClassDef> = {
  triggerman: TRIGGERMAN_CLASS,
  hunter: HUNTER_CLASS,
};

export const CLASS_IDS = ["triggerman", "hunter"] as const;
export const DEFAULT_CLASS = "triggerman";

export function getClass(id: string): ClassDef {
  return CLASSES[id] ?? TRIGGERMAN_CLASS;
}
