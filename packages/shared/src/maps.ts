import { WORLD } from "./gameplay";

/** Axis-aligned rectangular wall, defined by its top-left corner + size. */
export interface RectWall {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Serializable map definition. Maps are pure data so a future map editor can
 * produce/consume them as JSON without code changes.
 */
export interface MapDef {
  id: string;
  name: string;
  width: number;
  height: number;
  walls: RectWall[];
  spawnPoints: Point[];
  healthPacks: Point[];
}

/**
 * Arena01 — a Vertix-inspired 2000x2000 arena. Not a maze, not an open field:
 * an open central combat zone ringed by four pillars, four mid buildings
 * (N/S/E/W) and four diagonal cover blocks that break long sightlines and
 * create multiple flank routes between the edge spawns and the center.
 */
export const ARENA01: MapDef = {
  id: "arena01",
  name: "Arena 01",
  width: WORLD.WIDTH,
  height: WORLD.HEIGHT,
  walls: [
    // Central pillars (cover around the central combat zone).
    { x: 820, y: 820, w: 120, h: 120 },
    { x: 1060, y: 820, w: 120, h: 120 },
    { x: 820, y: 1060, w: 120, h: 120 },
    { x: 1060, y: 1060, w: 120, h: 120 },
    // Mid buildings (flank routes go above/below / around them).
    { x: 300, y: 850, w: 220, h: 300 }, // west
    { x: 1480, y: 850, w: 220, h: 300 }, // east
    { x: 850, y: 300, w: 300, h: 180 }, // north
    { x: 850, y: 1520, w: 300, h: 180 }, // south
    // Diagonal cover blocks (line-of-sight blockers between corners & center).
    { x: 500, y: 500, w: 160, h: 160 },
    { x: 1340, y: 500, w: 160, h: 160 },
    { x: 500, y: 1340, w: 160, h: 160 },
    { x: 1340, y: 1340, w: 160, h: 160 },
  ],
  spawnPoints: [
    { x: 250, y: 250 },
    { x: 1750, y: 250 },
    { x: 250, y: 1750 },
    { x: 1750, y: 1750 },
    { x: 1000, y: 200 },
    { x: 1000, y: 1800 },
    { x: 200, y: 1000 },
    { x: 1800, y: 1000 },
  ],
  healthPacks: [
    { x: 1000, y: 1000 }, // contested center
    { x: 650, y: 1000 },
    { x: 1350, y: 1000 },
    { x: 1000, y: 650 },
    { x: 1000, y: 1350 },
  ],
};

/**
 * Cow Map — the first themed map, a farm/pasture arena recreating the *feel* of
 * Vertix Online's Cow Map (no original assets/data are used; layout is our own,
 * see docs/design/07-map-cow.md for the design rationale and assumptions).
 *
 * 2000x2000 (matches WORLD). The flow: edge/corner spawns feed into perimeter
 * lanes (gated fences) and side clusters, then into a large open central
 * PASTURE that keeps long sightlines for the sniper. Two diagonal BARNS (NW
 * open toward center, SE its 180° mirror) provide close-quarters fighting and
 * cut the longest diagonals; silo clusters break the other corners. Risk/reward
 * peaks at the exposed center health pack; safer packs sit inside the barns.
 */
export const COWMAP: MapDef = {
  id: "cowmap",
  name: "Cow Map",
  width: WORLD.WIDTH,
  height: WORLD.HEIGHT,
  walls: [
    // Barn NW — corner enclosure open toward the center (CQB + diagonal blocker).
    { x: 360, y: 380, w: 380, h: 44 }, // north wall
    { x: 360, y: 380, w: 44, h: 320 }, // west wall
    { x: 520, y: 520, w: 90, h: 90 }, // interior hay bale (cover)
    // Barn SE — 180° mirror, open toward the center.
    { x: 1260, y: 1576, w: 380, h: 44 }, // south wall
    { x: 1596, y: 1300, w: 44, h: 320 }, // east wall
    { x: 1390, y: 1390, w: 90, h: 90 }, // interior hay bale (cover)
    // Silo clusters break the NE / SW diagonals.
    { x: 1500, y: 420, w: 120, h: 120 }, // NE big silo
    { x: 1360, y: 600, w: 90, h: 90 }, // NE small silo
    { x: 380, y: 1460, w: 120, h: 120 }, // SW big silo
    { x: 550, y: 1310, w: 90, h: 90 }, // SW small silo
    // Central pasture: small offset blocks for duck-behind cover without
    // closing the long N-S / E-W sightlines that reward the sniper.
    { x: 900, y: 820, w: 80, h: 80 },
    { x: 1020, y: 1100, w: 80, h: 80 },
    // Perimeter fences with gated gaps shape the edge rotation lanes.
    { x: 760, y: 300, w: 200, h: 30 }, // north (left of gate)
    { x: 1040, y: 300, w: 200, h: 30 }, // north (right of gate)
    { x: 760, y: 1670, w: 200, h: 30 }, // south (left of gate)
    { x: 1040, y: 1670, w: 200, h: 30 }, // south (right of gate)
    { x: 300, y: 760, w: 30, h: 200 }, // west (above gate)
    { x: 300, y: 1040, w: 30, h: 200 }, // west (below gate)
    { x: 1670, y: 760, w: 30, h: 200 }, // east (above gate)
    { x: 1670, y: 1040, w: 30, h: 200 }, // east (below gate)
  ],
  spawnPoints: [
    { x: 220, y: 220 }, // NW corner
    { x: 1780, y: 220 }, // NE corner
    { x: 220, y: 1780 }, // SW corner
    { x: 1780, y: 1780 }, // SE corner
    { x: 1000, y: 160 }, // N edge
    { x: 1000, y: 1840 }, // S edge
    { x: 160, y: 1000 }, // W edge
    { x: 1840, y: 1000 }, // E edge
  ],
  healthPacks: [
    { x: 1000, y: 1000 }, // center pasture — most contested, fully exposed
    { x: 480, y: 500 }, // NW barn mouth — safer, rewards holding CQB
    { x: 1520, y: 1500 }, // SE barn mouth — mirror
    { x: 1000, y: 360 }, // north lane — mid risk
    { x: 1000, y: 1640 }, // south lane — mid risk
  ],
};

export const MAPS: Record<string, MapDef> = {
  [ARENA01.id]: ARENA01,
  [COWMAP.id]: COWMAP,
};

export function getMap(id: string): MapDef {
  return MAPS[id] ?? ARENA01;
}
