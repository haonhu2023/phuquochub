#!/bin/sh
# PLACE-040 -- consolidated smoke test for the single-VPS Topology A stack, through Caddy.
#
# scripts/deploy.sh's own Step 11 previously only echoed a pointer comment to a
# "scripts/smoke-routes.sh pattern from the PLACE-038 evidence index" that was never actually
# committed as a script -- this file closes that gap by turning the ad hoc curl/wget commands
# used during PLACE-038's manual verification (see its evidence index, section "Web->API
# end-to-end data-fetching verification") into one reusable, exit-code-driven script that
# deploy.sh and rollback.sh can both call directly instead of duplicating checks inline.
#
# Uses the Caddyfile's own documented local :8080 test address by default (infrastructure/caddy/
# Caddyfile -- "phuquochub.com, :8080 { ... }", identical routing logic, no DNS/TLS required) so
# this can run safely from the VPS itself immediately after any deploy/rollback, before or
# without real DNS being live.
#
# Usage: scripts/smoke-test.sh [base-url] [known-place-slug]
#   base-url          defaults to http://127.0.0.1:8080
#                     pass https://phuquochub.com to run this against the real public domain
#   known-place-slug  optional -- a real, published place slug (e.g. dinh-cau) to verify actual
#                     seeded data renders; skipped if not provided (no data is assumed to exist)
#
# Exit code 0 = all checks passed. Non-zero = at least one check failed -- do not consider the
# deploy/rollback that invoked this successful.
set -eu

BASE_URL="${1:-http://127.0.0.1:8080}"
SLUG="${2:-}"
TMP_BODY=$(mktemp)
trap 'rm -f "$TMP_BODY"' EXIT

FAIL=0

check() {
  DESC="$1"
  URL="$2"
  EXPECT="$3"
  # Deploy reconciliation (fd224c1 rollout, 2026-08-10): `-f`/`--fail` makes curl exit non-zero on
  # ANY HTTP >=400 response while still writing `%{http_code}` for the completed transfer -- this
  # script deliberately checks for an EXPECTED 404 (below), so `-f` was actively wrong here. The
  # `||` fallback curl (no `-f`) then ran a SECOND time, also succeeded, and its output landed in
  # the SAME captured subshell stdout as the first curl's already-written code -- e.g. "404" + "404"
  # = "404404", never equal to any real EXPECT value. Confirmed reproducing on the real VPS. This
  # script's own `[ "$CODE" != "$EXPECT" ]` below is what judges pass/fail -- curl only needs to
  # report the code it saw, once, regardless of what that code is.
  CODE=$(curl -sS -o "$TMP_BODY" -w '%{http_code}' "$URL" 2>/dev/null || echo "000")
  if [ "$CODE" != "$EXPECT" ]; then
    echo "[smoke-test] FAIL: $DESC -> $URL returned $CODE (expected $EXPECT)" >&2
    FAIL=1
  else
    echo "[smoke-test] OK:   $DESC -> $CODE"
  fi
}

echo "[smoke-test] Target: $BASE_URL"

# 1. API health -- combined liveness+readiness (DB + Redis), matches HealthController.
check "API health (/api/health)" "$BASE_URL/api/health" 200

# 2. Web home page renders.
check "Web home (/)" "$BASE_URL/" 200

# 3. An unknown top-level route correctly 404s (PLACE-035 confirmed this on the current baseline;
#    NOTE this deliberately does NOT use a /places/<bogus-slug> path -- PLACE-035/036 documented a
#    pre-existing, unrelated quirk there that returns 200, not 404; asserting on it here would
#    fail a healthy deploy for a known, already-accepted reason).
check "Unknown route -> 404" "$BASE_URL/__smoke-test-unknown-route__" 404

# 4. Optional: a real seeded place renders real content through the full web->API path.
if [ -n "$SLUG" ]; then
  check "Place detail (/places/$SLUG)" "$BASE_URL/places/$SLUG" 200
  if ! grep -qi "PhuQuocHub" "$TMP_BODY"; then
    echo "[smoke-test] FAIL: /places/$SLUG did not contain the expected site title -- possible" >&2
    echo "[smoke-test]       fallback/error page instead of real data" >&2
    FAIL=1
  fi
else
  echo "[smoke-test] SKIP: no known-place-slug argument given -- real-data check not run"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "[smoke-test] One or more checks FAILED. Do not consider this deploy/rollback successful." >&2
  exit 1
fi
echo "[smoke-test] All checks passed."
