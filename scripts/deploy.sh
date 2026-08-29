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
ENV_FILE="$PROJECT_DIR/.env"
# shellcheck source=lib/release-tag.sh
. "$SCRIPT_DIR/lib/release-tag.sh"

echo "[deploy] === Step 5: build images tagged $TAG ==="
# Image provenance (2026-08-14): stamp the commit and build time INTO the images as OCI labels, so
# `docker inspect` can answer "which commit is this?" without bracketing dist/ against marker files
# -- the forensic exercise that was required when the running api image turned out to be
# unidentifiable. $TAG is the git sha/tag being released, which is exactly the revision to record.
BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker build -f "$PROJECT_DIR/apps/api/Dockerfile" -t "phuquochub-api:$TAG" "$PROJECT_DIR" \
  --build-arg "GIT_COMMIT=$TAG" \
  --build-arg "BUILD_DATE=$BUILD_DATE"
# Deploy reconciliation (fd224c1 rollout, 2026-08-10): NEXT_PUBLIC_MAP_TILE_URL's default contains
# literal `{`/`}` (the MapLibre tile template). POSIX `${VAR:-default}` parameter expansion ends at
# the FIRST unescaped `}` in `default` -- here that's the one closing `{z}` -- so embedding the
# literal inline (as this used to) silently truncated to ".../{z" and appended the remainder
# ("/{x}/{y}.png}") as plain trailing text, leaving a stray `}` in the built value. Confirmed
# reproducing: `sh -c 'echo "${U:-https://tile.openstreetmap.org/{z}/{x}/{y}.png}"'` prints
# `https://tile.openstreetmap.org/{z/{x}/{y}.png}` -- that trailing `}` is exactly what showed up
# percent-encoded (`%7D`) after MapLibre substituted a real tile y-value (`.../965.png%7D`). Fixed
# by resolving the default as a PLAIN assignment (no braces inside a `${...}` expansion) instead.
TILE_URL="${NEXT_PUBLIC_MAP_TILE_URL:-}"
if [ -z "$TILE_URL" ]; then
  TILE_URL="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
fi
# Site-URL build-arg gap (2026-08-29): unlike NEXT_PUBLIC_API_URL/NEXT_PUBLIC_MAP_TILE_URL above,
# this deliberately has NO fallback default. apps/web/Dockerfile's own ARG default
# (`http://localhost:3000`) is a *local-dev* convenience, not a safe production value: if this
# build-arg is silently omitted, metadataBase/sitemap.ts/robots.ts/JSON-LD all get baked with
# localhost URLs, and Next.js inlines NEXT_PUBLIC_* at build time -- there is no runtime override
# once the image exists. `${VAR:?msg}` fails HERE, before `docker build` is even invoked, rather
# than let that ship. The one prior deploy of `4ed9af7` got this right only because it was built by
# a one-off `deploy-c9cf9e5.sh` that passed this same build-arg by hand -- this closes that gap in
# the real, reusable deploy path. See docs/delivery/RELEASE-AND-ROLLBACK-CHECKLIST.md §2.
SITE_URL="${NEXT_PUBLIC_SITE_URL:?NEXT_PUBLIC_SITE_URL required (e.g. https://phuquochub.com) -- refusing to silently bake the Dockerfile default (http://localhost:3000) into a production web image}"

# Exact canonical-origin match (2026-08-29, hardened AGAIN after independent review): a generic
# hostname-shaped regex plus a small blocklist is the wrong tool here. This repo serves exactly
# ONE production origin -- infrastructure/caddy/Caddyfile's only non-redirect, non-media site
# block is `phuquochub.com, :8080 { ... }`; `www.phuquochub.com` 301-redirects to it; .env.example
# and CORS_ALLOWED_ORIGINS's own default both hardcode `https://phuquochub.com`. A shape+blocklist
# regex that only rejected localhost/loopback/www still ACCEPTED `https://example.com`,
# `https://evil.example`, `https://phuquochub.co` (a one-character typo), and
# `https://phuquochub.com.evil.example` -- any of which bakes a wrong-but-well-formed
# canonical/OG/sitemap/JSON-LD origin into a production image, which is exactly the failure this
# check exists to prevent. There being only one valid answer, the check is now an EXACT match
# against it, not a shape test.
#
# `grep -qE '^...$'` (the prior mechanism) was independently proven bypassable: `grep` is
# LINE-oriented, so those anchors bind to any ONE line of a multi-line value, not to the whole
# string. `NEXT_PUBLIC_SITE_URL=$'JUNK-NOT-A-URL\nhttps://phuquochub.com'` made the check pass
# (line 2 matched) while the build-arg that actually reached `docker build` was `JUNK-NOT-A-URL`
# (line 1) -- confirmed directly, exit 0, wrong value shipped. `case` does not have this problem:
# it matches the ENTIRE parameter value as one string against the pattern (POSIX pathname-matching
# semantics), so an embedded newline is just another character the exact literal pattern does not
# contain -- the whole value fails to match and falls through to the reject branch, no special
# newline handling needed.
case "$SITE_URL" in
  "https://phuquochub.com" | "https://phuquochub.com/")
    SITE_URL="https://phuquochub.com"
    ;;
  *)
    # The submitted value is deliberately NOT echoed here. It may contain newlines or other
    # control characters that, printed verbatim into a log, could forge additional log lines (log
    # injection) or otherwise mislead whoever reads the output. Stating the one valid contract is
    # enough to fix a typo without ever reproducing whatever was actually submitted.
    echo "[deploy] ERROR: NEXT_PUBLIC_SITE_URL must be exactly 'https://phuquochub.com' (a single" >&2
    echo "[deploy]        optional trailing '/' is accepted and normalized away). No other value —" >&2
    echo "[deploy]        no other domain, no http://, no www., no port/credentials/path/query/" >&2
    echo "[deploy]        fragment, no surrounding or embedded whitespace — is a valid production" >&2
    echo "[deploy]        origin for this deploy. Refusing to build." >&2
    exit 1
    ;;
esac
docker build -f "$PROJECT_DIR/apps/web/Dockerfile" -t "phuquochub-web:$TAG" "$PROJECT_DIR" \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-https://phuquochub.com/api}" \
  --build-arg "NEXT_PUBLIC_MAP_TILE_URL=$TILE_URL" \
  --build-arg "NEXT_PUBLIC_SITE_URL=$SITE_URL" \
  --build-arg "GIT_COMMIT=$TAG" \
  --build-arg "BUILD_DATE=$BUILD_DATE"

echo "[deploy] === Step 6: tag recorded as phuquochub-api:$TAG / phuquochub-web:$TAG ==="
echo "[deploy]     (retain this tag -- scripts/rollback.sh needs it to roll back TO)"

echo "[deploy] === Step 7: run migrations (separate step, NOT at container boot -- matches"
echo "[deploy]     database.module.ts's migrationsRun:false; see PLACE-037 §12) ==="
echo "[deploy]     Via the compose 'migrate' service (reuses the Dockerfile's intermediate build"
echo "[deploy]     stage, reaches postgres by service name -- postgres's port is not published"
echo "[deploy]     to the host under this topology, so a bare host-side npm run cannot reach it)."
# Migration profile guard (2026-08-14): `migrate` is now `profiles: [tools]` so that a bare
# `docker compose up -d` can no longer start it by accident (it previously would have -- see the
# service's own comment in docker-compose.prod.yml). `docker compose run` auto-enables the target
# service's own profiles, so this line would work without the flag; `--profile tools` is passed
# ANYWAY because this is the one place in the repo that intentionally runs migrations against a
# real database, and that intent should be explicit in the command rather than implied by a
# Compose convenience behaviour that a future version could narrow.
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD required}" $COMPOSE --profile tools run --rm migrate \
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
# Record what is live BEFORE the swap, so Step 9b can tell the operator the exact tag to hand to
# scripts/rollback.sh. These are plain image tags, never secrets.
PREV_API_TAG=$(release_tag_get API_IMAGE_TAG "$ENV_FILE" 2>/dev/null || echo "local")
PREV_WEB_TAG=$(release_tag_get WEB_IMAGE_TAG "$ENV_FILE" 2>/dev/null || echo "local")
API_IMAGE_TAG="$TAG" WEB_IMAGE_TAG="$TAG" $COMPOSE up -d --no-build api web caddy

echo "[deploy] === Step 9b: persist the released tag so plain Compose resolves to it ==="
# Web/API release drift fix (2026-08-14). The `VAR=... docker compose` prefix above lives only for
# the duration of that one command. Without this step the containers run the new images while
# `.env` still names the OLD tag, so the NEXT plain `docker compose up -d` -- run for any unrelated
# reason -- silently recreates api/web from the stale tag. That is exactly how production ended up
# running `phuquochub-web:c9cf9e5` with `WEB_IMAGE_TAG=local` in `.env`, where `:local` was a build
# from two releases earlier. Persisting here keeps `.env` describing what is ACTUALLY running.
#
# Deliberately placed immediately after the cutover and BEFORE the health/route checks below: the
# containers are already live at this point, so `.env` must match reality even if the smoke test
# then fails and the operator rolls back (rollback.sh rewrites these same keys).
release_tag_set API_IMAGE_TAG "$TAG" "$ENV_FILE"
release_tag_set WEB_IMAGE_TAG "$TAG" "$ENV_FILE"
echo "[deploy]     Previous tags were api=$PREV_API_TAG web=$PREV_WEB_TAG"
echo "[deploy]     To roll back: scripts/rollback.sh $PREV_WEB_TAG (retain those images!)"

echo "[deploy] === Step 10: health checks ==="
sleep 5
$COMPOSE ps

echo "[deploy] === Step 11: route checks ==="
# PLACE-040: this previously only echoed a pointer to a "scripts/smoke-routes.sh pattern" that
# was never actually committed -- "$SCRIPT_DIR/smoke-test.sh" now runs the real checks (health,
# web home, unknown-route 404, optional real-slug data check) against Caddy's local :8080
# verification address (identical routing to the real domain, no DNS/TLS required for this check).
if ! "$SCRIPT_DIR/smoke-test.sh" "http://127.0.0.1:8080" "${SMOKE_TEST_SLUG:-}"; then
  echo "[deploy] ERROR: smoke test FAILED after cutover. The new version is live but unhealthy --" >&2
  echo "[deploy]        investigate immediately, or run scripts/rollback.sh <previous-tag> now." >&2
  exit 1
fi

echo "[deploy] Deploy of $TAG complete. Remaining PLACE-037 §23 steps (12-15: monitoring"
echo "[deploy] activation, observation period, rollback-criteria review, release evidence) are"
echo "[deploy] manual/operational, not scripted here."
