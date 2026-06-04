import { createServer } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { SHARED_VERSION } from "@vertix/shared";
import { ArenaRoom } from "./rooms/ArenaRoom";

const port = Number(process.env.PORT ?? 2567);

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: createServer(),
  }),
});

// Register room handlers.
gameServer.define("arena", ArenaRoom);

void gameServer.listen(port).then(() => {
  console.log(
    `[game-server] Colyseus listening on ws://localhost:${port} (shared v${SHARED_VERSION})`,
  );
});
