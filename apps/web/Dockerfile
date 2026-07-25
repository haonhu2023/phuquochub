# PLACE-026 (OD2-2..9) — reproducible production build for @phuquochub/web (Next.js standalone).
# Build context MUST be the monorepo root (npm workspaces hoist deps there):
#   docker build -f apps/web/Dockerfile -t phuquochub-web .

FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/utils/package.json packages/utils/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm ci

FROM deps AS build
COPY packages/shared-types packages/shared-types
COPY packages/config packages/config
COPY apps/web apps/web
RUN npm run build --workspace=@phuquochub/shared-types
# PLACE-038: NEXT_PUBLIC_* variables are inlined by Next.js into the client bundle at BUILD
# time, not read at container runtime -- docker-compose.prod.yml previously set them only as
# a runtime `environment:` value, which had NO effect (verified: the built image's client
# bundle already had `localhost:4000/api` hardcoded regardless of that runtime override).
# Accept them as build args, defaulting to the existing local-dev values so an unmodified
# `docker build` still behaves exactly as before.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ARG NEXT_PUBLIC_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MAP_TILE_URL=$NEXT_PUBLIC_MAP_TILE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
# next.config.mjs sets output:'standalone' (PLACE-026) — produces a self-contained
# server.js + pruned node_modules under .next/standalone.
RUN npm run build --workspace=@phuquochub/web

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# PLACE-036: --chown=node:node (Next.js's own documented Docker pattern) -- Next.js 16's
# runtime tries to write to .next/cache on request (a code path Next 14 never exercised
# here); without this, root-owned copied files under the non-root USER node below fail
# with EACCES + an unhandled rejection on first request.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
USER node
# PLACE-038: native container healthcheck, matching the pattern already used for
# postgres/redis/minio in docker-compose.prod.yml. Uses Node itself (no curl/wget in the
# alpine base image) to avoid adding a new package just for this check.
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "apps/web/server.js"]
