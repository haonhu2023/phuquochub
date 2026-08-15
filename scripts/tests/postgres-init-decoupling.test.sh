#!/bin/bash
# PostgreSQL init-password decoupling (2026-08-15) — static tests proving the long-running
# `postgres` service is not bound to the application's runtime DB_PASSWORD.
#
# NO Docker daemon, NO network, NO running containers, NO database is touched by this file.
# The `docker compose config` assertions are parse-only, use synthetic values, and are skipped
# entirely when no compose binary is present.
#
# THE REGRESSION THIS PINS
# ------------------------
# `postgres` used to declare `POSTGRES_PASSWORD: ${DB_PASSWORD:-...}`. POSTGRES_PASSWORD is read
# ONLY by the official entrypoint's initdb branch (`docker_verify_minimum_env` is called just
# inside `if [ -z "$DATABASE_ALREADY_EXISTS" ]`, set from `[ -s "$PGDATA/PG_VERSION" ]`), so an
# initialized production cluster never consumes it. But Compose hashes the RENDERED service, so the
# dead variable still meant: rotate the application password -> postgres service hash changes ->
# a bare `docker compose up -d` plans a RECREATE of the production database. A credential rotation
# must never be able to schedule database downtime.
#
# Run: bash scripts/tests/postgres-init-decoupling.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
COMPOSE="$REPO_ROOT/docker-compose.prod.yml"
BOOTSTRAP="$REPO_ROOT/docker-compose.bootstrap.yml"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }

for f in "$COMPOSE" "$BOOTSTRAP"; do
  if [ ! -f "$f" ]; then echo "FATAL: $f not found"; exit 1; fi
done

# Extract one service block: from "  <name>:" to the next top-level (2-space-indented) key.
service_block() {
  awk -v svc="  $1:" '$0==svc{f=1;print;next} f&&/^  [a-z_-]+:/{exit} f{print}' "$COMPOSE"
}

PG_BLOCK=$(service_block postgres)
API_BLOCK=$(service_block api)
MIGRATE_BLOCK=$(service_block migrate)
REDIS_BLOCK=$(service_block redis)
CADDY_BLOCK=$(service_block caddy)

echo "== 1. postgres service does not reference DB_PASSWORD =="
# Ignore comment lines: the block carries a long explanatory comment that names the variable.
PG_CODE=$(printf '%s\n' "$PG_BLOCK" | sed -e 's/#.*//')
if printf '%s\n' "$PG_CODE" | grep -q 'DB_PASSWORD'; then
  fail "postgres service still interpolates DB_PASSWORD"
else
  pass "postgres service has no DB_PASSWORD reference outside comments"
fi

echo "== 2. postgres has no POSTGRES_PASSWORD in normal production runtime config =="
if printf '%s\n' "$PG_CODE" | grep -qE '^\s*POSTGRES_PASSWORD\s*:'; then
  fail "postgres service still declares POSTGRES_PASSWORD"
else
  pass "postgres service declares no POSTGRES_PASSWORD key"
fi

echo "== 3. postgres did not fall back to trust auth =="
if printf '%s\n' "$PG_CODE" | grep -q 'POSTGRES_HOST_AUTH_METHOD'; then
  fail "POSTGRES_HOST_AUTH_METHOD present -- trust fallback is forbidden"
else
  pass "no POSTGRES_HOST_AUTH_METHOD escape hatch"
fi

echo "== 4. postgres keeps its non-secret identity + persistence =="
printf '%s\n' "$PG_CODE" | grep -qE '^\s*POSTGRES_USER:\s*phuquoc\s*$' \
  && pass "POSTGRES_USER retained" || fail "POSTGRES_USER missing"
printf '%s\n' "$PG_CODE" | grep -qE '^\s*POSTGRES_DB:\s*phuquochub\s*$' \
  && pass "POSTGRES_DB retained" || fail "POSTGRES_DB missing"
printf '%s\n' "$PG_CODE" | grep -q 'pg_data_prod:/var/lib/postgresql/data' \
  && pass "named data volume still mounted" || fail "pg_data_prod mount missing"
printf '%s\n' "$PG_CODE" | grep -q 'wal_archive_prod:/var/lib/postgresql/wal_archive' \
  && pass "WAL archive volume still mounted" || fail "wal_archive_prod mount missing"

echo "== 5. API still consumes DB_PASSWORD =="
printf '%s\n' "$API_BLOCK" | grep -qE '^\s*DB_PASSWORD:\s*\$\{DB_PASSWORD' \
  && pass "api still interpolates DB_PASSWORD" || fail "api lost its DB_PASSWORD"

echo "== 6. migrate still consumes DB_PASSWORD and stays profile-gated =="
printf '%s\n' "$MIGRATE_BLOCK" | grep -qE '^\s*DB_PASSWORD:\s*\$\{DB_PASSWORD' \
  && pass "migrate still interpolates DB_PASSWORD" || fail "migrate lost its DB_PASSWORD"
printf '%s\n' "$MIGRATE_BLOCK" | grep -qE '^\s*-\s*tools\s*$' \
  && pass "migrate still profile-gated on [tools]" || fail "migrate profile guard lost"

echo "== 7. release-tag governance intact =="
grep -qE '^\s*image:\s*phuquochub-web:\$\{WEB_IMAGE_TAG:-local\}' "$COMPOSE" \
  && pass "web image tag parameterized" || fail "web image pin changed"
grep -qE '^\s*image:\s*phuquochub-api:\$\{API_IMAGE_TAG:-local\}' "$COMPOSE" \
  && pass "api image tag parameterized" || fail "api image pin changed"

echo "== 8. redis healthcheck hardening intact =="
printf '%s\n' "$REDIS_BLOCK" | grep -q 'REDISCLI_AUTH' \
  && pass "redis healthcheck still uses REDISCLI_AUTH" || fail "redis healthcheck hardening lost"
if printf '%s\n' "$REDIS_BLOCK" | grep -qE 'redis-cli\s+-a\s'; then
  fail "redis healthcheck exposes the password via -a in argv"
else
  pass "redis healthcheck does not pass the password in argv"
fi

echo "== 9. caddy service unchanged (no postgres-adjacent edits leaked) =="
printf '%s\n' "$CADDY_BLOCK" | grep -q 'caddy:2-alpine' \
  && pass "caddy image unchanged" || fail "caddy image changed"

echo "== 10. no bootstrap secret is hardcoded anywhere =="
if grep -qE '^\s*POSTGRES_PASSWORD:\s*[^$[:space:]]' "$BOOTSTRAP"; then
  fail "bootstrap overlay hardcodes a literal password"
else
  pass "bootstrap overlay uses a variable, not a literal"
fi
if grep -qE 'POSTGRES_BOOTSTRAP_PASSWORD:?-' "$BOOTSTRAP"; then
  fail "bootstrap variable has a default -- it must fail closed when unset"
else
  pass "bootstrap variable has no default (fails closed when unset)"
fi
grep -q 'POSTGRES_BOOTSTRAP_PASSWORD' "$BOOTSTRAP" \
  && pass "bootstrap overlay defines the explicit bootstrap variable" \
  || fail "bootstrap overlay missing POSTGRES_BOOTSTRAP_PASSWORD"

echo "== 11. explicit fresh-init procedure is documented =="
RUNBOOK="$REPO_ROOT/docs/delivery/DATABASE-ROLLBACK-RECOVERY-RUNBOOK.md"
if [ -f "$RUNBOOK" ] && grep -qi 'fresh cluster bootstrap' "$RUNBOOK"; then
  pass "fresh-init procedure documented in the recovery runbook"
else
  fail "fresh-init procedure not documented in $RUNBOOK"
fi
grep -q 'docker-compose.bootstrap.yml' "$COMPOSE" \
  && pass "compose points operators at the bootstrap overlay" \
  || fail "compose does not reference the bootstrap overlay"

echo "== 12. parse-only compose assertions (synthetic values) =="
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  # Synthetic, non-secret values. Rendered config is piped into a comparator and never displayed.
  render() {
    ( cd "$REPO_ROOT" && DB_PASSWORD="$1" REDIS_PASSWORD=synthetic-redis \
        JWT_ACCESS_SECRET=synthetic-access JWT_REFRESH_SECRET=synthetic-refresh \
        docker compose -f docker-compose.prod.yml --profile tools config 2>/dev/null )
  }
  R1=$(render synthetic-password-one)
  R2=$(render synthetic-password-two)
  if [ -z "$R1" ] || [ -z "$R2" ]; then
    echo "  skip: compose config produced no output"
  else
    pg_of() { printf '%s\n' "$1" | awk '/^  postgres:/{f=1;print;next} f&&/^  [a-z_-]+:/{exit} f{print}'; }
    api_of() { printf '%s\n' "$1" | awk '/^  api:/{f=1;print;next} f&&/^  [a-z_-]+:/{exit} f{print}'; }
    if [ "$(pg_of "$R1")" = "$(pg_of "$R2")" ]; then
      pass "rendered postgres service is IDENTICAL across two different DB_PASSWORD values"
    else
      fail "rendered postgres service still varies with DB_PASSWORD"
    fi
    if [ "$(api_of "$R1")" = "$(api_of "$R2")" ]; then
      fail "rendered api service did NOT change with DB_PASSWORD -- api lost the credential"
    else
      pass "rendered api service DOES vary with DB_PASSWORD (credential still delivered)"
    fi
    if printf '%s\n' "$(pg_of "$R1")" | grep -qE '^\s*POSTGRES_PASSWORD:'; then
      fail "rendered postgres service still contains POSTGRES_PASSWORD"
    else
      pass "rendered postgres service contains no POSTGRES_PASSWORD"
    fi
  fi
else
  echo "  skip: docker compose not available (static assertions above still ran)"
fi

echo
echo "postgres-init-decoupling: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
