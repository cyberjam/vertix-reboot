# Vertix Reboot

A browser-based multiplayer arena shooter you can jump into in seconds. Pick a
name, pick a class, and you're in the match — no installs, no accounts.

Vertix Reboot is an open-source reimagining of the kind of fast, top-down
browser shooter that [Vertix Online](https://en.wikipedia.org/wiki/Vertix.io)
made fun: short rounds, instant respawns, simple controls, and friends dropping
in from a link. It's built from scratch on a modern stack and is still in active
development.

![status](https://img.shields.io/badge/status-playable%20alpha-orange)
![stack](https://img.shields.io/badge/built%20with-Next.js%20%2B%20Phaser%20%2B%20Colyseus-5151d9)
![license](https://img.shields.io/badge/license-MIT-blue)
![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)

> **Gameplay GIF / screenshot goes here.**
> _Drop a short clip of a round in progress — movement, a couple of kills, a
> respawn. This is the first thing people see; show the game, not the menus._

---

## About

It's a free-for-all top-down shooter that runs in the browser. You spawn into an
arena with everyone else, fight, die, respawn a couple of seconds later, and
keep going until someone hits the score limit or the round timer runs out. Then
it resets and you go again.

**Why build it?** The "open a link and you're instantly in a match" browser
shooter is a great format that doesn't get made much anymore. This is an attempt
to rebuild that feel on a stack that's pleasant to work on and easy to
contribute to — server-authoritative netcode, a typed shared core, and a clean
React/Phaser client.

**The goal** is a small, honest game that's genuinely fun to play with a few
friends for ten minutes: quick to join, quick to learn, quick to replay. Not a
platform, not a storefront — just the loop.

---

## Features

Everything below is implemented and playable when you run it locally.

- **Instant play.** Open `/play`, type a name, pick a class, hit **Enter Game**.
  No login, no download. Your name and class are remembered for next time.
- **Three classes, four weapons.** Each plays differently:
  - **Triggerman** — 100 HP, machine gun. The all-rounder.
  - **Hunter** — 50 HP, sniper + machine pistol. Fragile, deadly at range.
  - **Vince** — 100 HP, four-pellet shotgun. Close-range burst damage.
- **Fast respawn.** Get killed, optionally swap to a different class, and you're
  back in the fight about two seconds later.
- **Server-authoritative netcode.** The server owns all movement, shooting and
  hit detection — but your own movement is predicted locally and reconciled, so
  it stays responsive instead of rubber-banding.
- **Cover and line of sight.** Walls block both bullets and sight; you can't
  shoot through them, and you can't be shot through them.
- **Health packs** placed around the map, with respawn cooldowns.
- **Free-for-all rounds.** 100 points per kill; first to 1500 points — or the
  highest score when the 4-minute timer ends — wins. Then the round resets.
- **Full HUD.** Health, ammo, round timer, live leaderboard and a kill feed.
- **Minimap** showing walls, players and active health packs.
- **Scoreboard** on hold-**Shift**, and a death overlay that shows who killed
  you, lets you switch class, and counts down to respawn.
- **Jump** (**Space**) — a quick vertical hop.
- **Server browser.** Quick-match into the best room, or browse open rooms and
  join one by player count.
- **Settings.** Toggle camera shake and visual effects, view the controls
  reference; preferences persist in your browser.

### Controls

| Key | Action |
|-----|--------|
| `W` `A` `S` `D` | Move |
| Mouse | Aim |
| Left Click | Fire |
| `R` | Reload |
| `Q` | Switch weapon |
| `1` / `2` / `3` | Select class (applies on respawn) |
| `Space` | Jump |
| `Shift` | View full scoreboard |
| `Esc` | Close overlays |

---

## Roadmap

### In progress

- **Public hosted build** — so you can play in the browser without running
  anything yourself. Web on Vercel, the game server on Render, with a Docker
  image, health check and CORS for production.

### Planned

- Sound effects
- More classes and weapons
- More modes (e.g. Team Deathmatch)
- Key rebinding
- Killstreak callouts ("Double Kill", etc.)
- Optional accounts / persistent stats (still being decided)

Implemented features live under [Features](#features); anything not listed there
isn't built yet.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript — UI, menus and overlays. [Phaser 3](https://phaser.io) for in-game rendering and input. |
| **Backend** | [Colyseus](https://colyseus.io) 0.16 authoritative game server (Node 20, TypeScript). |
| **Realtime** | WebSocket state sync via Colyseus schema (30 Hz simulation, 50 ms patch rate). `colyseus.js` on the client with movement prediction + reconciliation. |
| **Shared core** | `@vertix/shared` — class/weapon/map data and the deterministic movement simulation, imported by both client and server as a single source of truth. |
| **Tooling** | pnpm workspaces + Turborepo monorepo. |
| **Deployment** | Vercel (web) + Render (game server) — _planned, see Roadmap._ |

---

## Local Development

**Prerequisites:** [Node.js](https://nodejs.org) ≥ 20 and
[pnpm](https://pnpm.io) (via `corepack`).

```bash
# 1. enable pnpm if you don't have it
corepack enable

# 2. install dependencies
pnpm install

# 3. run the web client and game server together
pnpm dev
```

- Web client → http://localhost:3000 (the landing page links to `/play`)
- Game server → `ws://localhost:2567`

Run them separately if you prefer:

```bash
pnpm dev:web      # Next.js client only  (:3000)
pnpm dev:server   # Colyseus server only (:2567)
```

**Try multiplayer:** open `/play` in two browser tabs (or two browsers) and
you'll see both players in the same arena.

**Checks:**

```bash
pnpm typecheck    # type-check every package
pnpm build        # build everything
```

The design docs live in [`docs/design`](./docs/design/README.md).

---

## Deployment

Hosted play isn't live yet — it's the current focus on the Roadmap. The intended
setup is the web client on **Vercel** (root `apps/web`) and the authoritative
game server on **Render** as a Docker service, with the client pointed at the
server via `NEXT_PUBLIC_GAME_SERVER_URL` (use `wss://` from an HTTPS page).
Production config (Dockerfile, health check, CORS) is landing alongside it.

---

## Contributing

This is a small indie project and contributions are welcome — bug fixes,
gameplay tweaks, new weapons or classes, or just trying it and reporting what
felt off.

1. Fork the repo and branch from `dev` (e.g. `feat/your-thing`).
2. Make your change. Keep gameplay **server-authoritative** — the client sends
   intent, the server decides outcomes.
3. Run `pnpm typecheck` and `pnpm build` before opening a PR.
4. Open a pull request against `dev`.

If you're adding a class or weapon, define it in `@vertix/shared` so the client
and server stay in sync from one place.

---

## License

Released under the MIT License.
