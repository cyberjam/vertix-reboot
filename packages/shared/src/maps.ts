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

export const MAPS: Record<string, MapDef> = {
  [ARENA01.id]: ARENA01,
};

export function getMap(id: string): MapDef {
  return MAPS[id] ?? ARENA01;
}
