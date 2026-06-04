import { Schema, type, MapSchema } from "@colyseus/schema";
import { PLAYER, MACHINEGUN } from "@vertix/shared";

/**
 * Replicated per-player state. Only these fields are synchronized to clients;
 * server-only weapon timers live in ArenaRoom (not replicated).
 */
export class Player extends Schema {
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
}

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
