# Deployment — Vercel (web) + Render (game server)

Play-on-the-internet setup for the FFA alpha. Frontend on **Vercel**, the
authoritative Colyseus server on **Render (free plan)**.

> Architecture: the browser loads the Next.js app from Vercel, then opens a
> WebSocket to the Render game server. Colyseus matchmaking is an HTTPS POST to
> `/matchmake/*` (CORS is sent by Colyseus automatically), the live match runs
> over `wss://`.

---

## 1. Deployment checklist

- [ ] Push this branch / merge to `master`.
- [ ] **Render**: create a Web Service from this repo (Docker runtime, see §3).
- [ ] Wait for the first deploy; confirm `https://<svc>.onrender.com/health`
      returns `{"status":"ok",...}`.
- [ ] **Vercel**: import the repo, set Root Directory `apps/web` (see §4).
- [ ] Set Vercel env `NEXT_PUBLIC_GAME_SERVER_URL=wss://<svc>.onrender.com`.
- [ ] Deploy web; open `/play`, enter the menu, ENTER GAME.
- [ ] Open the deployed `/play` in **two browsers**; confirm both see each
      other, can move/aim/fire, and the HUD/minimap/scoreboard update live.

## 2. What changed for deploy (kept minimal)

| File | Change |
|------|--------|
| `apps/game-server/src/index.ts` | Added a `/health` (and `/`) HTTP handler returning `200 {status:"ok"}` with a CORS header. Colyseus' `attachMatchMakingRoutes` preserves this listener and only intercepts `/matchmake/*`, so health + matchmaking coexist on one port. |
| `Dockerfile` | Lean Node 20 image; installs only the `@vertix/game-server...` workspace subgraph; runs the TS server via `tsx` (`pnpm --filter @vertix/game-server start`). |
| `.dockerignore` | Excludes `node_modules`, `.next`, `.turbo`, `.git`, env files. |
| `render.yaml` | Render Blueprint (docker runtime, `healthCheckPath: /health`, free plan). |
| `.env.example` | Documents `NEXT_PUBLIC_GAME_SERVER_URL` (web) and `PORT`/`CORS_ORIGIN` (server). |

No gameplay/network code changed. Cross-origin works because Colyseus sends
`Access-Control-Allow-Origin: *` on matchmaking, and WebSockets are not
CORS-restricted.

## 3. Render settings (game server)

- **Runtime**: Docker · **Dockerfile path**: `./Dockerfile` · **Context**: repo root
- **Plan**: Free
- **Health check path**: `/health`
- **Env vars**:
  - `NODE_ENV=production`
  - `CORS_ORIGIN=*` (optional; or your exact Vercel origin)
  - `PORT` — injected by Render automatically; the server binds to it.
- Alternatively commit-deploy via the included **`render.yaml`** Blueprint.

Public URL → `https://<svc>.onrender.com` (use `wss://<svc>.onrender.com` for the
web env var).

## 4. Vercel settings (web)

- **Root Directory**: `apps/web` (monorepo). Vercel auto-detects Next.js.
- **Install Command**: default (Vercel runs pnpm at the repo root and respects
  the workspace) — leave as auto.
- **Build Command**: default (`next build`).
- **Environment variable**:
  - `NEXT_PUBLIC_GAME_SERVER_URL=wss://<svc>.onrender.com`
  (must be set at build time — it's inlined into the client bundle.)

## 5. Expected issues / gotchas

- **Render free spins down after ~15 min idle.** The first connection after
  idle cold-starts (~30–60s) — the menu will sit on "CONNECTING…". Subsequent
  joins are instant. (Upgrade to a paid instance to keep it warm.)
- **`NEXT_PUBLIC_*` is build-time.** Changing the server URL requires a Vercel
  redeploy, not just an env edit.
- **Mixed content**: a Vercel (https) page must use `wss://` (not `ws://`), or
  the browser blocks the connection.
- **Single instance only on free**: fine for one FFA room. Horizontal scaling
  would need a Colyseus presence/driver (out of scope).
- **tsx at runtime**: the server runs TypeScript via `tsx` (no build step). This
  is intentional for the monorepo's shared TS source; it is reliable but uses a
  little more cold-start time than precompiled JS.

## 6. Local verification performed

- `docker build` exercised through the manifest-copy + `corepack` + filtered
  `pnpm install` steps (the only failure was the sandbox's TLS-intercepting
  proxy breaking corepack's download — not a Dockerfile defect; normal on Render).
- Production start command (`NODE_ENV=production pnpm --filter @vertix/game-server start`):
  - `GET /health` → `200` with `Access-Control-Allow-Origin: *`
  - `OPTIONS /matchmake/joinOrCreate/arena` → `204` with `Access-Control-Allow-Origin: *`
  - `GET /nope` → `404` (health handler coexists with matchmaking)
  - Two simultaneous clients join, see each other in shared state, and receive
    server broadcasts (`shot`) across connections.
