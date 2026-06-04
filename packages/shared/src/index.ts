/**
 * @vertix/shared — single source of truth shared by the web client and the
 * Colyseus game server (types, game data, sim-core, network protocol).
 *
 * Milestone 1 (scaffolding) only exposes a version marker + a couple of
 * placeholder constants so both apps can verify the workspace wiring.
 * Real class/weapon/map data lands in Milestone 2.
 */

export const SHARED_VERSION = "0.0.0";

/** Networking cadence (see docs/design/03-technical-design.md §6.2). */
export const NET = {
  /** Server authoritative simulation rate (Hz). */
  TICKRATE: 30,
  /** State patch broadcast interval (ms). */
  PATCHRATE_MS: 50,
} as const;
