import { Room, type Client } from "@colyseus/core";

/**
 * ArenaRoom — one match instance (a single map/mode).
 *
 * Milestone 1: empty skeleton that only logs lifecycle events so we can
 * confirm clients can connect. State schema, spawning, simulation loop and
 * mode rules are added in later milestones (see docs/design/04-milestones.md).
 */
export class ArenaRoom extends Room {
  onCreate(): void {
    console.log(`[ArenaRoom] created: ${this.roomId}`);
  }

  onJoin(client: Client): void {
    console.log(`[ArenaRoom] joined: ${client.sessionId}`);
  }

  onLeave(client: Client): void {
    console.log(`[ArenaRoom] left: ${client.sessionId}`);
  }

  onDispose(): void {
    console.log(`[ArenaRoom] disposed: ${this.roomId}`);
  }
}
