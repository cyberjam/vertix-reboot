# Game server (Colyseus). Runs the TypeScript source directly via tsx, with
# @vertix/shared consumed as TS through the pnpm workspace. Build context is the
# repo root so the workspace + lockfile are available.
FROM node:20-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Workspace manifests first (better layer caching). All package.json files
# referenced by the workspace must be present for pnpm to resolve the graph.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/game-server/package.json apps/game-server/package.json
COPY apps/web/package.json apps/web/package.json

# Install only the game-server subgraph (+ its workspace deps); skips web's
# heavy deps (next/phaser). tsx is a devDependency, so do not use --prod.
RUN pnpm install --frozen-lockfile --filter @vertix/game-server...

# Source needed at runtime (server + shared TS).
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/game-server apps/game-server

ENV NODE_ENV=production
# Render injects PORT; default for local docker runs.
ENV PORT=2567
EXPOSE 2567

CMD ["pnpm", "--filter", "@vertix/game-server", "start"]
