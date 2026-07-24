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
# next.config.mjs sets output:'standalone' (PLACE-026) — produces a self-contained
# server.js + pruned node_modules under .next/standalone.
RUN npm run build --workspace=@phuquochub/web

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
USER node
CMD ["node", "apps/web/server.js"]
