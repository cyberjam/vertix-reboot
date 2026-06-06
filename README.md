# Vertix Reboot

**English** · [한국어](./README.ko.md)

A fast, top-down multiplayer shooter that runs in your browser. Pick a class,
drop into the arena, and fight.

![status](https://img.shields.io/badge/status-playable%20alpha-orange)
![stack](https://img.shields.io/badge/built%20with-Next.js%20%2B%20Phaser%20%2B%20Colyseus-5151d9)
![license](https://img.shields.io/badge/license-MIT-blue)
![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)

> **Gameplay GIF goes here** — a round in motion: movement, a couple of kills, a
> respawn. Show the game, not the menus.

**Status:** playable alpha — run it locally today. Hosted play is on the
[roadmap](#roadmap).

---

## Why Play

- ⚡ **Instant join** — open the page, type a name, you're in. No install, no account.
- 🔁 **Fast rounds** — respawn in seconds and keep fighting. First to 1500 points (or top score when the 4-minute clock runs out) wins, then it resets.
- 🎯 **Class-based combat** — three classes, each with its own weapons and trade-offs.
- 🌐 **Real multiplayer** — everyone shares one live arena, right in the browser.

---

## Features

- **Three classes, four weapons** — each trades HP for firepower or range:
  - **Triggerman** — machine gun. The all-rounder.
  - **Hunter** — sniper + machine pistol. Fragile, lethal at distance.
  - **Vince** — four-pellet shotgun. Close-range burst damage.
- **Switch class when you die** — pick your counter on the respawn screen.
- **Cover matters** — walls block bullets *and* line of sight.
- **Health packs** spawn around the map.
- **Live HUD** — health, ammo, round timer, leaderboard, kill feed, and a death
  screen showing who got you.
- **Minimap** and a full scoreboard (hold **Shift**).
- **Server browser** — quick-match into the best room, or browse and join by
  player count.
- **Jump** (**Space**), plus settings for camera shake and effects (saved locally).

---

## Controls

| Key | Action | | Key | Action |
|-----|--------|---|-----|--------|
| `W` `A` `S` `D` | Move | | `Q` | Switch weapon |
| Mouse | Aim | | `1` `2` `3` | Select class (on respawn) |
| Left Click | Fire | | `Space` | Jump |
| `R` | Reload | | `Shift` | Scoreboard |

---

## Roadmap

**In progress**
- Hosted play — web on Vercel, game server on Render (Docker, health check, CORS).

**Planned**
- Sound effects
- More classes, weapons, and modes (e.g. Team Deathmatch)
- Key rebinding and killstreak callouts
- Optional accounts / persistent stats (undecided)

Only what's listed under [Features](#features) is built today.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| **Client** | Next.js 15 + React 19 (UI/overlays), Phaser 3 (rendering & input), TypeScript |
| **Server** | Colyseus 0.16 authoritative game server (Node 20, TypeScript) |
| **Realtime** | WebSocket state sync (30 Hz sim, 50 ms patches) with client-side prediction & reconciliation |
| **Shared** | `@vertix/shared` — class/weapon/map data + movement sim, one source of truth for client and server |
| **Tooling** | pnpm workspaces + Turborepo |

---

## Local Development

Requires [Node.js](https://nodejs.org) ≥ 20 and [pnpm](https://pnpm.io).

```bash
corepack enable      # enable pnpm if you don't have it
pnpm install
pnpm dev             # web client + game server together
```

- Web → http://localhost:3000 (landing page links to `/play`)
- Server → `ws://localhost:2567`

Open `/play` in two tabs to test multiplayer. Run `pnpm dev:web` / `pnpm
dev:server` to start them separately, and `pnpm typecheck` / `pnpm build` to
check the workspace. Design docs live in [`docs/design`](./docs/design/README.md).

---

## Contributing

PRs welcome — fixes, balance tweaks, new weapons or classes, or just feedback
after a few rounds.

1. Branch from `dev` (e.g. `feat/your-thing`).
2. Keep gameplay **server-authoritative**: the client sends intent, the server
   decides outcomes. New classes/weapons go in `@vertix/shared`.
3. Run `pnpm typecheck` and `pnpm build`, then open a PR against `dev`.

---

## License

[MIT](./LICENSE).
