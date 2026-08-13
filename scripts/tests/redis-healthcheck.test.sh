#!/bin/bash
# Redis healthcheck credential exposure fix (2026-08-13) — static tests for the `redis` service
# block in docker-compose.prod.yml.
#
# NO Docker, NO network, NO running containers. These are text-level assertions on the compose
# file, because the property under test is exactly a text-level property: whether Compose resolves
# ${REDIS_PASSWORD} at PARSE time (baking the plaintext secret into the container's stored
# Healthcheck.Test metadata, where `docker inspect` will show it) or defers it to RUNTIME via `$$`
# so only a variable REFERENCE is stored.
#
# The regression this pins is a real one that shipped to production: the healthcheck used
#   ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-...}", "--no-auth-warning", "ping"]
# which put the live password in healthcheck metadata AND in redis-cli's argv every 10 seconds.
#
# Run: bash scripts/tests/redis-healthcheck.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
COMPOSE="$REPO_ROOT/docker-compose.prod.yml"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }

if [ ! -f "$COMPOSE" ]; then
  echo "FATAL: $COMPOSE not found"; exit 1
fi

# Extract just the `redis:` service block (from "  redis:" to the next top-level service key).
redis_block() {
  awk '/^  redis:/{f=1;print;next} f&&/^  [a-z_-]+:/{exit} f{print}' "$COMPOSE"
}
BLOCK=$(redis_block)
HC_LINE=$(printf '%s\n' "$BLOCK" | grep -E '^\s*test:.*redis-cli' || true)

echo "== redis service block is locatable and has a healthcheck =="
if [ -n "$BLOCK" ]; then pass "redis service block found"; else fail "redis service block not found"; fi
if [ -n "$HC_LINE" ]; then pass "redis healthcheck test line found"; else fail "no healthcheck test line"; fi

echo "== the vulnerable form is gone =="
# `-a` immediately followed by an interpolation is the exact vulnerable pattern.
if printf '%s' "$HC_LINE" | grep -qE '"-a"'; then
  fail "healthcheck still passes the password via redis-cli -a (argv exposure)"
else
  pass "healthcheck does not use redis-cli -a"
fi

# A SINGLE-dollar ${...} in the healthcheck means Compose interpolates it at parse time -> the
# resolved secret is stored in Healthcheck.Test. Escaped $${...} is what we want instead.
if printf '%s' "$HC_LINE" | grep -qE '[^$]\$\{REDIS_PASSWORD' ; then
  fail "healthcheck uses parse-time interpolation \${REDIS_PASSWORD} (secret would be baked in)"
else
  pass "healthcheck has no parse-time \${REDIS_PASSWORD} interpolation"
fi

echo "== the safe form is present =="
if printf '%s' "$HC_LINE" | grep -q 'REDISCLI_AUTH'; then
  pass "healthcheck uses REDISCLI_AUTH (password via env, not argv)"
else
  fail "healthcheck does not use REDISCLI_AUTH"
fi

if printf '%s' "$HC_LINE" | grep -q '\$\${REDIS_PASSWORD}'; then
  pass "healthcheck defers expansion to runtime via \$\${REDIS_PASSWORD}"
else
  fail "healthcheck lacks the escaped \$\${REDIS_PASSWORD} runtime reference"
fi

if printf '%s' "$HC_LINE" | grep -q 'CMD-SHELL'; then
  pass "healthcheck uses CMD-SHELL (required for runtime shell expansion)"
else
  fail "healthcheck is not CMD-SHELL, so \$ would never expand"
fi

# redis-cli exits 0 even when the server replies with an auth error, so a bare `redis-cli ping`
# would report a WRONGPASS container as healthy. The PONG grep is what makes the check meaningful.
if printf '%s' "$HC_LINE" | grep -q 'grep -q PONG'; then
  pass "healthcheck asserts PONG (fails closed on auth error)"
else
  fail "healthcheck does not assert PONG -- auth failures would report healthy"
fi

echo "== the password is actually reachable at runtime =="
# REDISCLI_AUTH can only expand if REDIS_PASSWORD is in the container environment.
if printf '%s\n' "$BLOCK" | grep -qE '^\s*REDIS_PASSWORD:\s*\$\{REDIS_PASSWORD'; then
  pass "redis service exports REDIS_PASSWORD into the container environment"
else
  fail "redis service has no REDIS_PASSWORD environment entry -- healthcheck would auth as empty"
fi

echo "== blast radius: unrelated healthchecks untouched =="
if grep -qF 'test: ["CMD-SHELL", "pg_isready -U phuquoc -d phuquochub"]' "$COMPOSE"; then
  pass "postgres healthcheck unchanged"
else
  fail "postgres healthcheck was modified"
fi
if grep -qF 'test: ["CMD", "mc", "ready", "local"]' "$COMPOSE"; then
  pass "minio healthcheck unchanged"
else
  fail "minio healthcheck was modified"
fi
# The api service still reaches Redis over an authenticated URL; that wiring must not drift.
if grep -qF 'REDIS_URL: redis://:${REDIS_PASSWORD:-change-me-redis-password-min-16-chars}@redis:6379' "$COMPOSE"; then
  pass "api REDIS_URL wiring unchanged (authentication preserved)"
else
  fail "api REDIS_URL wiring changed"
fi

echo "== compose still parses (only if a compose binary is available) =="
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  # Synthetic values only -- never the real secrets, and output is discarded so nothing resolved
  # can reach the terminal.
  if ( cd "$REPO_ROOT" && REDIS_PASSWORD=synthetic-test-value S3_BUCKET=synthetic S3_PUBLIC_URL=http://synthetic \
       docker compose -f docker-compose.prod.yml config >/dev/null 2>&1 ); then
    pass "docker compose config parses the file"
  else
    fail "docker compose config failed to parse the file"
  fi
else
  echo "  skip: no docker compose binary available for parse validation"
fi

echo
echo "== summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
