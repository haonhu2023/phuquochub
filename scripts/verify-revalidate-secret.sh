#!/bin/sh
# REVALIDATE_INTERNAL_SECRET wiring verification (cutover-4569d41 hardening, 2026-09-23).
#
# WHAT IT CHECKS, and why each check exists
# ------------------------------------------
# docker-compose.prod.yml used to default REVALIDATE_INTERNAL_SECRET to a literal checked into
# the tracked compose file when .env left it unset -- a value anyone reading the repo already
# knows, defeating the api<->web shared-secret auth entirely (see env.validation.ts and
# apps/web/.../route.ts for the two-sided fix). This script proves the fix actually holds, in two
# modes, at the two points in the runbook where it matters:
#
#   config  -- BEFORE recreating containers (right after uploading the new compose file + .env,
#              runbook A3). Resolves `docker compose config` and checks each service's declared
#              value: present, >=16 chars, and not the known placeholder. Equality between
#              services is NOT a meaningful check here -- both services reference the exact same
#              `${REVALIDATE_INTERNAL_SECRET}` variable in the compose file, so at this layer they
#              are equal by construction; a real divergence can only happen at the runtime layer
#              below (e.g. only one container actually got recreated).
#   runtime -- AFTER recreating containers (runbook D). Reads REVALIDATE_INTERNAL_SECRET out of
#              the two RUNNING containers directly and checks they match each other and neither is
#              the placeholder -- this is the check that would catch a partial/failed recreate.
#
# NEVER PRINTS THE SECRET: every check compares SHA-256 digests or yes/no facts, never the value.
# Digests are computed with `printf '%s'`, not `echo`/`printenv` alone -- `printenv` (and plain
# `echo "$var"`) appends a trailing newline, which changes the hash and made an earlier version of
# this check report "different from placeholder" even when the value silently WAS the placeholder.
# `$(...)` command substitution strips that trailing newline before the value is ever hashed here.
#
# READ-ONLY: inspects only. Never touches .env, never starts/recreates/builds anything.
#
# Usage: scripts/verify-revalidate-secret.sh config   [compose-file]
#        scripts/verify-revalidate-secret.sh runtime  [api-container] [web-container]
# Exit:  0 = OK   1 = FAIL (flags above name which check)   2 = usage/environment error
set -eu

PLACEHOLDER='change-me-revalidate-secret-min-16-chars'

sha() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }

mode="${1:-}"
case "$mode" in
  config)
    compose_file="${2:-docker-compose.prod.yml}"
    if ! command -v docker >/dev/null 2>&1; then
      echo "[revalidate-secret] ERROR: docker not available." >&2
      exit 2
    fi
    cfg=$(docker compose -f "$compose_file" config)

    extract() {
      # $1 = service name -- isolates that service's own block (from its "  <name>:" header to the
      # next top-level "  <key>:" header). Never assumes which occurrence-by-order belongs to which
      # service -- `docker compose config` emits services alphabetically, verified empirically, but
      # this scopes by the actual header regardless.
      printf '%s\n' "$cfg" | awk -v svc="  $1:" '
        $0 == svc { inblock=1; next }
        inblock && /^  [A-Za-z0-9_-]+:$/ { inblock=0 }
        inblock && /REVALIDATE_INTERNAL_SECRET:/ {
          sub(/^ *REVALIDATE_INTERNAL_SECRET: */, "")
          print
          exit
        }
      '
    }

    api_val=$(extract api)
    web_val=$(extract web)
    ;;
  runtime)
    api_container="${2:-phuquoc-api-prod}"
    web_container="${3:-phuquoc-web-prod}"
    if ! command -v docker >/dev/null 2>&1; then
      echo "[revalidate-secret] ERROR: docker not available." >&2
      exit 2
    fi
    api_val=$(docker exec "$api_container" printenv REVALIDATE_INTERNAL_SECRET 2>/dev/null || echo "")
    web_val=$(docker exec "$web_container" printenv REVALIDATE_INTERNAL_SECRET 2>/dev/null || echo "")
    ;;
  *)
    echo "[revalidate-secret] Usage: $0 config [compose-file] | runtime [api-container] [web-container]" >&2
    exit 2
    ;;
esac

report() { echo "[revalidate-secret] $1=$2"; }

api_present=no; [ -n "$api_val" ] && api_present=yes
web_present=no; [ -n "$web_val" ] && web_present=yes
api_len_ok=no; [ "${#api_val}" -ge 16 ] && api_len_ok=yes
web_len_ok=no; [ "${#web_val}" -ge 16 ] && web_len_ok=yes
api_hash=$(sha "$api_val")
web_hash=$(sha "$web_val")
placeholder_hash=$(sha "$PLACEHOLDER")
equal=no; [ "$api_hash" = "$web_hash" ] && equal=yes
api_is_placeholder=no; [ "$api_hash" = "$placeholder_hash" ] && api_is_placeholder=yes
web_is_placeholder=no; [ "$web_hash" = "$placeholder_hash" ] && web_is_placeholder=yes

report api_present "$api_present"
report web_present "$web_present"
report api_len_ge_16 "$api_len_ok"
report web_len_ge_16 "$web_len_ok"
report api_equals_web "$equal"
report api_is_placeholder "$api_is_placeholder"
report web_is_placeholder "$web_is_placeholder"

FAIL=0
[ "$api_present" = yes ] || FAIL=$((FAIL + 1))
[ "$web_present" = yes ] || FAIL=$((FAIL + 1))
[ "$api_len_ok" = yes ] || FAIL=$((FAIL + 1))
[ "$web_len_ok" = yes ] || FAIL=$((FAIL + 1))
[ "$equal" = yes ] || FAIL=$((FAIL + 1))
[ "$api_is_placeholder" = no ] || FAIL=$((FAIL + 1))
[ "$web_is_placeholder" = no ] || FAIL=$((FAIL + 1))

if [ "$FAIL" -ne 0 ]; then
  echo "[revalidate-secret] RESULT: STOP -- $FAIL check(s) failed. See flags above (never the value)." >&2
  exit 1
fi
echo "[revalidate-secret] RESULT: OK"
exit 0
