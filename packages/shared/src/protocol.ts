/**
 * Network message contracts between client and the Colyseus server.
 * The client only ever sends intent; the server decides all outcomes.
 */

/** Continuous client input, sent every client frame (message type "input"). */
export type InputMessage = {
  /** Monotonic sequence number (reserved for future reconciliation). */
  seq: number;
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
  /** Origin (shooter position). */
  sx: number;
  sy: number;
  /** Ray end point (hit point or max range). */
  ex: number;
  ey: number;
  /** Whether the shot hit a player. */
  hit: boolean;
};
