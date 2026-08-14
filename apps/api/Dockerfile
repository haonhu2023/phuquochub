# PLACE-026 (OD2-2..9) — reproducible production build for @phuquochub/api.
# Build context MUST be the monorepo root (npm workspaces hoist deps there):
#   docker build -f apps/api/Dockerfile -t phuquochub-api .
#
# Multi-stage: (1) install deps incl. native-module build tools for bcrypt,
# (2) build shared packages + api, (3) lean runtime with prod-only deps.

FROM node:20-alpine AS base
# bcrypt (native addon) needs a C/C++ toolchain to compile on musl (alpine).
RUN apk add --no-cache python3 make g++
WORKDIR /repo

FROM base AS deps
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/utils/package.json packages/utils/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm ci

FROM deps AS build
COPY packages/shared-types packages/shared-types
COPY packages/utils packages/utils
COPY packages/config packages/config
COPY apps/api apps/api
RUN npm run build --workspace=@phuquochub/shared-types
RUN npm run build --workspace=@phuquochub/utils
RUN npm run build --workspace=@phuquochub/api

FROM node:20-alpine AS runtime
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production

# Image provenance (2026-08-14). Production ran an API image whose source commit could NOT be
# determined from the image at all: it carried no version metadata, and the only tag pointing at it
# was the MUTABLE `phuquochub-api:local`. Recovering even an approximate answer took bracketing the
# image against per-commit marker files in `dist/`. These labels make that unnecessary for every
# future build -- `docker inspect` answers "which commit is this?" directly.
#
# Declared in the FINAL stage on purpose: labels are per-stage, so setting them on `build` would
# not reach the shipped image. They carry no runtime cost and change no behaviour -- a label is
# metadata only, which is why this is safe to add to an image-producing path.
#
# `unknown` defaults keep a bare `docker build` working; scripts/deploy.sh passes the real values.
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.title="phuquochub-api" \
      org.opencontainers.image.revision="$GIT_COMMIT" \
      org.opencontainers.image.created="$BUILD_DATE"
WORKDIR /repo
# PLACE-038: --chown=node:node applied defensively for consistency with the proven-necessary
# fix in apps/web/Dockerfile (PLACE-036). No direct evidence the API writes to its own
# filesystem at runtime today (unlike Next.js's .next/cache), but no evidence it never will
# either -- this removes that open question at zero cost rather than leaving it unverified.
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages/shared-types ./packages/shared-types
COPY --from=build --chown=node:node /repo/packages/utils ./packages/utils
COPY --from=build --chown=node:node /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /repo/apps/api/package.json ./apps/api/package.json

WORKDIR /repo/apps/api
EXPOSE 4000
# Non-root runtime user (node:20-alpine ships a "node" user out of the box).
USER node
# PLACE-038: native container healthcheck, matching the pattern already used for
# postgres/redis/minio in docker-compose.prod.yml. /api/health is @Public()+@SkipThrottle(),
# safe to call repeatedly without auth or rate-limit impact.
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
