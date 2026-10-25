# syntax=docker/dockerfile:1
# Images for docker-compose.yml: target `api` (Node) and target `web` (Caddy with the PWA).
# CI builds both on every PR without pushing (.github/workflows/ci.yml).

# Dependencies only: `pnpm fetch` fills the store from the lockfile, so this layer
# stays cached until a manifest or the lockfile changes.
FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm fetch

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm -r build

# api with production dependencies only; @family/shared is copied in with its dist/.
# `files` in apps/api/package.json brings dist/ and drizzle/ (the migrations, read from dist/db/migrate.js).
# --legacy: the workspace links packages instead of injecting them (pnpm 10 deploy needs one or the other).
# TypeScript sources/declarations and source maps of dependencies are never loaded at runtime (~23 MB).
FROM build AS api-deploy
RUN pnpm --filter api deploy --prod --legacy /out/api \
  && find /out/api/node_modules -type f \( -name '*.ts' -o -name '*.d.cts' -o -name '*.d.mts' -o -name '*.map' \) -delete

FROM node:24-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-deploy /out/api ./
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${API_PORT:-18091}/healthz" > /dev/null || exit 1
CMD ["node", "dist/server.js"]

FROM caddy:2-alpine AS web
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
