import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { PLAYER, MACHINEGUN, FFA } from "@vertix/shared";

/**
 * Replicated per-player state. Only these fields are synchronized to clients;
 * server-only weapon timers live in ArenaRoom (not replicated).
 */
export class Player extends Schema {
  @type("string") name = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") angle = 0;
  @type("number") hp: number = PLAYER.MAX_HP;
  @type("number") maxHp: number = PLAYER.MAX_HP;
  @type("number") ammo: number = MACHINEGUN.magSize;
  @type("boolean") reloading = false;
  @type("boolean") alive = true;
  @type("number") kills = 0;
  @type("number") deaths = 0;
  @type("number") score = 0;
  /** Last input sequence the server has processed (for client reconciliation). */
  @type("number") lastSeq = 0;
}

/** Replicated match (FFA round) state. */
export class MatchState extends Schema {
  @type("string") mode = "ffa";
  /** "playing" while the round is live, "ended" during the result screen. */
  @type("string") phase = "playing";
  @type("number") timeRemainingMs: number = FFA.DURATION_MS;
  @type("number") targetScore: number = FFA.TARGET_SCORE;
  @type("string") winnerId = "";
  @type("string") winnerName = "";
}

/** A health pickup at a fixed map location; toggles active on pickup/respawn. */
export class HealthPack extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("boolean") active = true;
}

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type(MatchState) match = new MatchState();
  @type([HealthPack]) healthPacks = new ArraySchema<HealthPack>();
}
