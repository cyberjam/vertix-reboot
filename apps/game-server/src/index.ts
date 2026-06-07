import { createServer } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { SHARED_VERSION } from "@vertix/shared";
import { ArenaRoom } from "./rooms/ArenaRoom";

const port = Number(process.env.PORT ?? 2567);
// Cross-origin policy. Colyseus already sends permissive CORS headers on its
// matchmaking routes; this only applies to our own /health responses.
const corsOrigin = process.env.CORS_ORIGIN ?? "*";

/**
 * Plain HTTP handler attached to the same server Colyseus uses. Colyseus'
 * `attachMatchMakingRoutes` preserves this listener and only intercepts
 * `/matchmake/*`, delegating every other request (e.g. /health) back here.
 */
const httpServer = createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": corsOrigin,
    });
    res.end(JSON.stringify({ status: "ok", shared: SHARED_VERSION }));
    return;
  }
  res.writeHead(404, { "Access-Control-Allow-Origin": corsOrigin });
  res.end();
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Register room handlers.
gameServer.define("arena", ArenaRoom);

void gameServer.listen(port).then(() => {
  console.log(
    `[game-server] Colyseus listening on :${port} (shared v${SHARED_VERSION}) — health: /health`,
  );
});
