/**
 * Network message contracts between client and the Colyseus server.
 * The client only ever sends intent; the server decides all outcomes.
 */

/** Continuous client input, sent every client frame (message type "input"). */
export type InputMessage = {
  /** Monotonic sequence number, used for client prediction reconciliation. */
  seq: number;
  /** Duration (ms) this input covers, used for deterministic movement. */
  dtMs: number;
  /** Movement intent on each axis, each in the range [-1, 1]. */
  moveX: number;
  moveY: number;
  /** Aim angle in radians. */
  aim: number;
  /** Whether the fire button is held (Triggerman fires automatically). */
  firing: boolean;
};

/** Server -> all clients: a shot was fired (message type "shot"). For VFX only. */
export type ShotMessage = {
  /** Shooter session id (so a client can recognise its own shots). */
  by: string;
  /** Origin (shooter position). */
  sx: number;
  sy: number;
  /** Ray end point (hit point or max range). */
  ex: number;
  ey: number;
  /** Whether the shot hit a player. */
  hit: boolean;
};

/** Server -> all clients: a kill happened (message type "kill"). For the kill feed. */
export type KillMessage = {
  killerName: string;
  victimName: string;
};

/** Options a client may pass when joining a room. */
export type JoinOptions = {
  /** Display name shown on the scoreboard / above the player. */
  name?: string;
  /** Initial class id (applied at spawn). */
  classId?: string;
};

/** Client -> server: choose a class (takes effect on next respawn). */
export type SelectClassMessage = {
  classId: string;
};
