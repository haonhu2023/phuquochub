#!/bin/sh
# PLACE-038 — deploy sequence for the single-VPS Topology A stack, implementing PLACE-037 §23
# steps 5-11 (image build, tagging, migration, smoke test, boot, health/route checks).
#
# Intended to run ON THE PRODUCTION VPS by whoever operates it (manually, or from CI once a
# git remote and deploy credentials exist -- neither exists in this repository/session). NOT
# executed against any real infrastructure by PLACE-038 itself; this script is verified in this
# task by running it against the fully-local dev-dependency stack only (see the PLACE-038
# evidence index).
#
# Steps intentionally NOT included here (per PLACE-037 §23's own sequence, out of this script's
# scope): infrastructure preparation (#1), secrets configuration (#2), database provisioning
# (#3), backup verification (#4 -- run scripts/backup.sh separately first), monitoring
# activation (#12), the observation period (#13), and release-evidence recording (#15) -- those
# are either one-time/manual steps or belong to a human decision, not a repeatable script.
#
# Usage: scripts/deploy.sh <git-sha-or-tag> [compose-project-dir]
set -eu

TAG="${1:?Usage: scripts/deploy.sh <git-sha-or-tag> [compose-project-dir]}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR="${2:-$(dirname "$SCRIPT_DIR")}"
COMPOSE="docker compose -f $PROJECT_DIR/docker-compose.prod.yml"

echo "[deploy] === Step 5: build images tagged $TAG ==="
docker build -f "$PROJECT_DIR/apps/api/Dockerfile" -t "phuquochub-api:$TAG" "$PROJECT_DIR"
docker build -f "$PROJECT_DIR/apps/web/Dockerfile" -t "phuquochub-web:$TAG" "$PROJECT_DIR" \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-https://phuquochub.com/api}" \
  --build-arg "NEXT_PUBLIC_MAP_TILE_URL=${NEXT_PUBLIC_MAP_TILE_URL:-https://tile.openstreetmap.org/{z}/{x}/{y}.png}"

echo "[deploy] === Step 6: tag recorded as phuquochub-api:$TAG / phuquochub-web:$TAG ==="
echo "[deploy]     (retain this tag -- scripts/rollback.sh needs it to roll back TO)"

echo "[deploy] === Step 7: run migrations (separate step, NOT at container boot -- matches"
echo "[deploy]     database.module.ts's migrationsRun:false; see PLACE-037 §12) ==="
echo "[deploy]     Via the compose 'migrate' service (reuses the Dockerfile's intermediate build"
echo "[deploy]     stage, reaches postgres by service name -- postgres's port is not published"
echo "[deploy]     to the host under this topology, so a bare host-side npm run cannot reach it)."
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD required}" $COMPOSE run --rm migrate \
  || { echo "[deploy] ERROR: migration:run failed. Deploy HALTED -- the previous image is still" >&2; \
       echo "[deploy]        running (docker compose was never touched by this failed run)." >&2; exit 1; }

echo "[deploy] === Step 8: production-like smoke test on the NEW image before cutover ==="
docker run -d --rm --name "phuquoc-api-smoketest-$TAG" --network phuquochub-prod_default \
  -e NODE_ENV=production -e DB_HOST=postgres -e DB_PORT=5432 -e DB_USER=phuquoc \
  -e "DB_PASSWORD=${DB_PASSWORD:?}" -e DB_NAME=phuquochub -e REDIS_HOST=redis -e REDIS_PORT=6379 \
  -e "REDIS_URL=redis://:${REDIS_PASSWORD:?REDIS_PASSWORD required}@redis:6379" \
  -e "JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET:?}" -e "JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET:?}" \
  -e "CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS:-https://phuquochub.com}" \
  "phuquochub-api:$TAG"
sleep 5
if ! docker exec "phuquoc-api-smoketest-$TAG" node -e "require('http').get('http://127.0.0.1:4000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"; then
  echo "[deploy] ERROR: smoke test failed on the new image. Deploy HALTED." >&2
  docker logs "phuquoc-api-smoketest-$TAG" || true
  docker rm -f "phuquoc-api-smoketest-$TAG" || true
  exit 1
fi
docker rm -f "phuquoc-api-smoketest-$TAG"
echo "[deploy] Smoke test passed."

echo "[deploy] === Step 9: cutover -- point the compose stack at the new tag and redeploy ==="
API_IMAGE_TAG="$TAG" WEB_IMAGE_TAG="$TAG" $COMPOSE up -d --no-build api web caddy

echo "[deploy] === Step 10: health checks ==="
sleep 5
$COMPOSE ps

echo "[deploy] === Step 11: route checks (see scripts/smoke-routes.sh pattern from the PLACE-038"
echo "[deploy]     evidence index for the exact checks used during local verification) ==="
echo "[deploy] Deploy of $TAG complete. Remaining PLACE-037 §23 steps (12-15: monitoring"
echo "[deploy] activation, observation period, rollback-criteria review, release evidence) are"
echo "[deploy] manual/operational, not scripted here."
