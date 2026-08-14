#!/bin/sh
# PLACE-038 — application-level rollback: redeploy a previously-tagged image.
#
# Implements the exact mechanism already rehearsed manually, repeatedly, and successfully this
# session (PLACE-031, PLACE-032, PLACE-036) -- "redeploy the previous image tag" -- now scripted
# against docker-compose.prod.yml's parameterized API_IMAGE_TAG/WEB_IMAGE_TAG. Rolls back BOTH
# services by default; pass only one of api/web to roll back independently (both images have
# been proven independently swappable in every rehearsal this session).
#
# This script does NOT touch the database. Per PLACE-037 §21/§24: container rollback alone
# cannot undo a destructive migration or real data loss -- that requires scripts/restore.sh
# against a real backup instead. All 20 migrations in this repository's history are additive
# (verified repeatedly), so an application-only rollback is expected to be sufficient today.
#
# Usage: scripts/rollback.sh <tag-to-roll-back-to> [api|web|both] [compose-project-dir]
set -eu

TAG="${1:?Usage: scripts/rollback.sh <tag-to-roll-back-to> [api|web|both] [compose-project-dir]}"
TARGET="${2:-both}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR="${3:-$(dirname "$SCRIPT_DIR")}"
COMPOSE="docker compose -f $PROJECT_DIR/docker-compose.prod.yml"
ENV_FILE="$PROJECT_DIR/.env"
# shellcheck source=lib/release-tag.sh
. "$SCRIPT_DIR/lib/release-tag.sh"

for image in "phuquochub-api:$TAG" "phuquochub-web:$TAG"; do
  case "$TARGET" in
    api) [ "$image" = "phuquochub-web:$TAG" ] && continue ;;
    web) [ "$image" = "phuquochub-api:$TAG" ] && continue ;;
  esac
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    echo "[rollback] ERROR: $image does not exist locally/on-registry. Cannot roll back to a tag" >&2
    echo "[rollback]        that was never retained -- this is exactly why deploy.sh's own note" >&2
    echo "[rollback]        to 'retain this tag' matters." >&2
    exit 1
  fi
done

echo "[rollback] Rolling back ($TARGET) to tag: $TAG"
# Web/API release drift fix (2026-08-14): each branch persists the tag it just rolled back to, for
# the same reason deploy.sh Step 9b does. A rollback that swapped the container but left `.env`
# naming the BAD release would be undone by the next plain `docker compose up -d` -- the failed
# release would silently come back. Only the service(s) actually rolled back are persisted, so a
# `web`-only rollback does not misreport the api tag.
case "$TARGET" in
  api)
    API_IMAGE_TAG="$TAG" $COMPOSE up -d --no-build api
    release_tag_set API_IMAGE_TAG "$TAG" "$ENV_FILE"
    ;;
  web)
    WEB_IMAGE_TAG="$TAG" $COMPOSE up -d --no-build web
    release_tag_set WEB_IMAGE_TAG "$TAG" "$ENV_FILE"
    ;;
  both)
    API_IMAGE_TAG="$TAG" WEB_IMAGE_TAG="$TAG" $COMPOSE up -d --no-build api web
    release_tag_set API_IMAGE_TAG "$TAG" "$ENV_FILE"
    release_tag_set WEB_IMAGE_TAG "$TAG" "$ENV_FILE"
    ;;
  *)
    echo "[rollback] ERROR: target must be api, web, or both (got: $TARGET)" >&2
    exit 1
    ;;
esac

echo "[rollback] Waiting for health checks..."
sleep 8
$COMPOSE ps

echo "[rollback] Verifying /api/health directly (matches the same check every PLACE rollback"
echo "[rollback] rehearsal this session has used) ..."
if ! $COMPOSE exec -T api node -e "require('http').get('http://127.0.0.1:4000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"; then
  echo "[rollback] WARNING: /api/health did not return 200 after rollback. Investigate before" >&2
  echo "[rollback]          considering this rollback successful." >&2
  exit 1
fi

echo "[rollback] Rollback to $TAG complete and health-verified."
echo "[rollback] Per PLACE-037 §21: this rollback is not 'done' until the same health/route"
echo "[rollback] checks from the deploy sequence pass again -- re-run any additional route checks"
echo "[rollback] now, then confirm monitoring reflects the rolled-back version."
