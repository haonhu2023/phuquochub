#!/bin/sh
# Release-pin verification (2026-08-14) -- read-only drift detector for the production image pins.
#
# WHAT IT CHECKS, and why each check exists
# -----------------------------------------
# docker-compose.prod.yml resolves `phuquochub-{api,web}:${{API,WEB}_IMAGE_TAG:-local}` from the
# production `.env`. Three things must agree, and nothing verified them together before:
#
#   1. The tag named in `.env` must still resolve to an image that exists.
#   2. That image must be the one the container is ACTUALLY running. If they diverge, the next
#      `docker compose up -d` silently recreates the service from the other image. This is exactly
#      how production ended up serving `phuquochub-web:c9cf9e5` while `.env` said `local` and
#      `:local` was an older build missing the map fix.
#   3. A pin that names a MUTABLE tag (`local`, `latest`) is a standing hazard even while it is
#      currently correct: any rebuild re-points it, and the pin silently starts meaning a
#      different image without anything in `.env` changing.
#
# Check 3 is reported as a WARNING, not a failure, because production legitimately sits in that
# state today: `phuquochub-api:local` is the only name the approved API image has ever had, and
# repointing `.env` at an immutable tag costs a container recreate (Compose's config hash includes
# the literal image string, so the tag name changing is enough to force one, even when the new tag
# points at the byte-identical image ID -- verified on production with `--dry-run`). The warning
# keeps that debt visible until the next api deploy retires it.
#
# ANCHOR TAGS: a tag of the form `img-<hex>` asserts by its own name that it points at image id
# <hex>. That is self-verifying, and unlike a commit-shaped tag it cannot imply a provenance
# nobody can prove. This script checks that claim, so a mis-tagged anchor is caught rather than
# trusted.
#
# READ-ONLY: inspects only. Starts nothing, builds nothing, recreates nothing, and writes no file.
# Reads exactly two non-secret keys from `.env` and never prints any other line of it.
#
# Usage: scripts/verify-release-pins.sh [project-dir]
# Exit:  0 = all pins consistent   1 = drift detected   2 = usage/environment error
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR="${1:-$(dirname "$SCRIPT_DIR")}"
ENV_FILE="$PROJECT_DIR/.env"
# shellcheck source=lib/release-tag.sh
. "$SCRIPT_DIR/lib/release-tag.sh"

if [ ! -f "$ENV_FILE" ]; then
  echo "[pins] ERROR: $ENV_FILE not found (pass the project dir as \$1)." >&2
  exit 2
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "[pins] ERROR: docker not available." >&2
  exit 2
fi

FAIL=0
WARN=0

# service | env key | container name
check_service() {
  svc="$1"; key="$2"; container="$3"

  tag=$(release_tag_get "$key" "$ENV_FILE" 2>/dev/null || echo "")
  if [ -z "$tag" ]; then
    echo "[pins] FAIL $svc: $key is not set in .env -- Compose would fall back to ':local'." >&2
    FAIL=$((FAIL + 1))
    return
  fi

  ref="phuquochub-$svc:$tag"
  pinned_id=$(docker images -q "$ref" 2>/dev/null || echo "")
  if [ -z "$pinned_id" ]; then
    echo "[pins] FAIL $svc: $key=$tag but image '$ref' does not exist locally." >&2
    echo "[pins]      A 'docker compose up -d' would try to pull/build it." >&2
    FAIL=$((FAIL + 1))
    return
  fi

  running_id=$(docker inspect "$container" --format '{{.Image}}' 2>/dev/null || echo "")
  if [ -z "$running_id" ]; then
    echo "[pins] FAIL $svc: container '$container' is not running -- cannot verify the pin." >&2
    FAIL=$((FAIL + 1))
    return
  fi
  # `docker images -q` prints the short id; .Image is `sha256:<64hex>`. Compare on the short form.
  running_short=$(printf '%s' "$running_id" | sed 's/^sha256://' | cut -c1-12)
  pinned_short=$(printf '%s' "$pinned_id" | cut -c1-12)

  if [ "$running_short" != "$pinned_short" ]; then
    echo "[pins] FAIL $svc: DRIFT. .env pins $ref (image $pinned_short) but $container is running" >&2
    echo "[pins]      image $running_short. A plain 'docker compose up -d' would RECREATE $svc" >&2
    echo "[pins]      from $pinned_short -- i.e. silently change the running release." >&2
    FAIL=$((FAIL + 1))
    return
  fi

  # Mutable-tag hazard (currently true for api; see the header).
  case "$tag" in
    local|latest)
      echo "[pins] WARN $svc: $key=$tag is a MUTABLE tag. It resolves correctly right now"
      echo "[pins]      (image $pinned_short), but any rebuild re-points it and the pin would"
      echo "[pins]      silently start meaning a different image. Retire at the next $svc deploy."
      WARN=$((WARN + 1))
      ;;
  esac

  # Self-verifying anchor tags: `img-<hex>` must actually point at image id <hex>.
  case "$tag" in
    img-*)
      claimed=$(printf '%s' "$tag" | sed 's/^img-//')
      if [ "$(printf '%s' "$pinned_short" | cut -c1-${#claimed})" = "$claimed" ]; then
        echo "[pins] ok   $svc: anchor tag $tag verifiably points at image $pinned_short"
      else
        echo "[pins] FAIL $svc: anchor tag $tag claims image $claimed but points at $pinned_short." >&2
        FAIL=$((FAIL + 1))
        return
      fi
      ;;
  esac

  echo "[pins] ok   $svc: .env pins $ref == running image $running_short"
}

echo "[pins] Verifying production release pins in $ENV_FILE"
check_service api "API_IMAGE_TAG" phuquoc-api-prod
check_service web "WEB_IMAGE_TAG" phuquoc-web-prod

echo "[pins] ---"
if [ "$FAIL" -ne 0 ]; then
  echo "[pins] RESULT: DRIFT DETECTED ($FAIL). Do NOT run 'docker compose up -d' until resolved --" >&2
  echo "[pins]         it would recreate the drifted service(s) from the pinned image." >&2
  exit 1
fi
if [ "$WARN" -ne 0 ]; then
  echo "[pins] RESULT: pins consistent, $WARN mutable-tag warning(s) outstanding."
else
  echo "[pins] RESULT: all pins consistent and immutable."
fi
exit 0
