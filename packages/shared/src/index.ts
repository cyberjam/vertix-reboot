/**
 * @vertix/shared — single source of truth shared by the web client and the
 * Colyseus game server (gameplay constants, network protocol, math helpers).
 */

export const SHARED_VERSION = "0.0.0";

/** Networking cadence (see docs/design/03-technical-design.md §6.2). */
export const NET = {
  /** Server authoritative simulation rate (Hz). */
  TICKRATE: 30,
  /** State patch broadcast interval (ms). */
  PATCHRATE_MS: 50,
} as const;

export * from "./gameplay";
export * from "./protocol";
export * from "./math";
