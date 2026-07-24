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
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared-types ./packages/shared-types
COPY --from=build /repo/packages/utils ./packages/utils
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json

WORKDIR /repo/apps/api
EXPOSE 4000
# Non-root runtime user (node:20-alpine ships a "node" user out of the box).
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
