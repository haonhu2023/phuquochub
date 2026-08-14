#!/bin/bash
# Migration profile guard (2026-08-14) — static tests for the `migrate` service block in
# docker-compose.prod.yml and its one intentional caller, scripts/deploy.sh.
#
# NO Docker daemon, NO network, NO running containers, and above all NO migration is ever run by
# this file. The `docker compose config` assertions at the end are parse-only and are skipped
# entirely when no compose binary is present.
#
# The regression this pins is a real production footgun that shipped and survived review because
# the compose file's own comment asserted the opposite of the truth ("NOT started by `docker
# compose up` (no `restart:`, not a dependency of anything)"). Neither property excludes a service
# from `docker compose up` — Compose starts every service in the DEFAULT SELECTION, and only a
# profile removes a service from it. A production `docker compose --dry-run up -d` planned
# `phuquochub-prod-migrate-1 Created/Started`, i.e. a bare `docker compose up -d` run for any
# unrelated infrastructure reason would have executed every pending TypeORM migration against the
# live database unprompted.
#
# Run: bash scripts/tests/migrate-profile.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
COMPOSE="$REPO_ROOT/docker-compose.prod.yml"
DEPLOY="$REPO_ROOT/scripts/deploy.sh"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }

for f in "$COMPOSE" "$DEPLOY"; do
  if [ ! -f "$f" ]; then echo "FATAL: $f not found"; exit 1; fi
done

# Extract one service block: from "  <name>:" to the next top-level (2-space-indented) key.
service_block() {
  awk -v svc="  $1:" '$0==svc{f=1;print;next} f&&/^  [a-z_-]+:/{exit} f{print}' "$COMPOSE"
}

MIGRATE_BLOCK=$(service_block migrate)

echo "== 1. migrate is gated behind the 'tools' profile =="
if [ -n "$MIGRATE_BLOCK" ]; then
  pass "migrate service block found"
else
  fail "migrate service block not found"
fi

# `profiles:` must be INSIDE the migrate block, not merely somewhere in the file.
if printf '%s\n' "$MIGRATE_BLOCK" | grep -qE '^\s*profiles:\s*$'; then
  pass "migrate declares a profiles: key"
else
  fail "migrate has no profiles: key -- bare 'docker compose up -d' would start it"
fi

if printf '%s\n' "$MIGRATE_BLOCK" | grep -qE '^\s*-\s*tools\s*$'; then
  pass "migrate's profile is 'tools'"
else
  fail "migrate is not assigned the 'tools' profile"
fi

echo "== 2. no OTHER service became profile-gated (blast radius) =="
# Every service that must stay in the default selection: a profile on any of these would silently
# stop 'docker compose up -d' from bringing the stack up at all.
for svc in postgres redis minio api web caddy; do
  if service_block "$svc" | grep -qE '^\s*profiles:'; then
    fail "$svc gained a profile -- it would drop out of the default 'up -d' selection"
  else
    pass "$svc has no profile (stays in the default selection)"
  fi
done

# Exactly one `profiles:` key in the whole file.
PROFILE_KEYS=$(grep -cE '^\s*profiles:\s*$' "$COMPOSE")
if [ "$PROFILE_KEYS" -eq 1 ]; then
  pass "exactly one profiles: key in the file (only migrate)"
else
  fail "expected exactly 1 profiles: key, found $PROFILE_KEYS"
fi

echo "== 3. the migrate service is otherwise UNCHANGED =="
# The guard must change WHEN it runs, never WHAT it runs. Each of these is load-bearing: a drifted
# command/target/working_dir would mean the profile change quietly altered migration behaviour.
if printf '%s\n' "$MIGRATE_BLOCK" | grep -qF 'command: ["npx", "typeorm-ts-node-commonjs", "migration:run", "-d", "src/core/database/data-source.ts"]'; then
  pass "migrate command unchanged"
else
  fail "migrate command changed"
fi
if printf '%s\n' "$MIGRATE_BLOCK" | grep -qE '^\s*target:\s*build\s*$'; then
  pass "migrate still builds the Dockerfile's intermediate 'build' stage"
else
  fail "migrate build target changed"
fi
if printf '%s\n' "$MIGRATE_BLOCK" | grep -qE '^\s*working_dir:\s*/repo/apps/api\s*$'; then
  pass "migrate working_dir unchanged"
else
  fail "migrate working_dir changed"
fi
if printf '%s\n' "$MIGRATE_BLOCK" | grep -qE '^\s*DB_HOST:\s*postgres\s*$'; then
  pass "migrate still targets the internal 'postgres' service by name"
else
  fail "migrate DB_HOST changed"
fi
# A profiled service must not be depended upon by a non-profiled one (Compose rejects that), and
# nothing should have been added here to work around the profile.
if printf '%s\n' "$MIGRATE_BLOCK" | grep -qE '^\s*depends_on:'; then
  fail "migrate gained depends_on -- not required by the profile guard"
else
  pass "migrate still has no depends_on"
fi
# Nothing anywhere may depend_on a profiled service.
if grep -nE '^\s*-?\s*migrate:?\s*$' "$COMPOSE" | grep -vqE ':\s*migrate:\s*$'; then
  fail "something appears to depend_on migrate -- a profiled service cannot be a dependency"
else
  pass "no service depends_on migrate"
fi

echo "== 4. the intentional migration path is explicit in deploy.sh =="
MIGRATE_CALL=$(grep -nE 'run --rm migrate' "$DEPLOY" || true)
if [ -n "$MIGRATE_CALL" ]; then
  pass "deploy.sh still invokes the migrate service"
else
  fail "deploy.sh no longer invokes the migrate service -- the intentional path is gone"
fi
if printf '%s' "$MIGRATE_CALL" | grep -q -- '--profile tools'; then
  pass "deploy.sh enables the tools profile explicitly"
else
  fail "deploy.sh does not pass --profile tools"
fi
# The flag must precede the `run` subcommand -- `--profile` is a top-level compose flag and is not
# accepted after the subcommand.
if printf '%s' "$MIGRATE_CALL" | grep -qE -- '--profile tools .*\brun\b'; then
  pass "--profile precedes the 'run' subcommand (valid flag position)"
else
  fail "--profile is not positioned before 'run'"
fi
# deploy.sh must still HALT on migration failure -- unrelated to the profile, but this is the one
# guard standing between a failed migration and a cutover to a new image.
if grep -q 'Deploy HALTED -- the previous image is still' "$DEPLOY"; then
  pass "deploy.sh still halts the deploy when migration fails"
else
  fail "deploy.sh lost its migration-failure halt"
fi

echo "== 5. no OTHER compose invocation accidentally enables the profile =="
# Only the deliberate migration call may carry --profile tools. If a cutover/rollback command ever
# picked it up, `up -d` would start migrate again and the guard would be worthless.
# Scanned surface is the OPERATIONAL scripts only (scripts/*.sh and scripts/lib/*.sh) -- deliberately
# not scripts/tests/, which necessarily contains the string in its own assertions, including this
# one. Comment lines are stripped first so the explanatory comments above the call site don't match.
STRAY=$(
  for f in "$REPO_ROOT"/scripts/*.sh "$REPO_ROOT"/scripts/lib/*.sh; do
    [ -f "$f" ] || continue
    grep -n -- '--profile tools' "$f" 2>/dev/null \
      | grep -vE '^[0-9]+:[[:space:]]*#' \
      | grep -v 'run --rm migrate' \
      | sed "s|^|${f##*/}:|"
  done
)
if [ -z "$STRAY" ]; then
  pass "no script enables the tools profile outside the migration call"
else
  fail "tools profile enabled outside the migration call: $STRAY"
fi
if grep -nE 'up -d' "$DEPLOY" | grep -q -- '--profile'; then
  fail "deploy.sh's cutover 'up -d' enables a profile -- migrate would start on cutover"
else
  pass "deploy.sh's cutover 'up -d' enables no profile"
fi

echo "== 6. adjacent hardening is untouched =="
# Redis healthcheck security fix (87990ff) -- runtime-expanded, never parse-time interpolated.
if grep -qF "test: [\"CMD-SHELL\", 'REDISCLI_AUTH=\"\$\${REDIS_PASSWORD}\" redis-cli ping | grep -q PONG']" "$COMPOSE"; then
  pass "redis healthcheck security fix preserved"
else
  fail "redis healthcheck changed"
fi
if grep -qF 'test: ["CMD-SHELL", "pg_isready -U phuquoc -d phuquochub"]' "$COMPOSE"; then
  pass "postgres healthcheck unchanged"
else
  fail "postgres healthcheck changed"
fi
if grep -qF 'test: ["CMD", "mc", "ready", "local"]' "$COMPOSE"; then
  pass "minio healthcheck unchanged"
else
  fail "minio healthcheck changed"
fi
# Caddy: sole public ingress, and 8080 must stay loopback-only.
CADDY_BLOCK=$(service_block caddy)
if printf '%s\n' "$CADDY_BLOCK" | grep -qF '"127.0.0.1:8080:8080"'; then
  pass "caddy's 8080 verification port is still loopback-only"
else
  fail "caddy's 8080 mapping changed -- must never be host-wide"
fi
for p in '"80:80"' '"443:443"'; do
  if printf '%s\n' "$CADDY_BLOCK" | grep -qF "$p"; then
    pass "caddy still publishes $p"
  else
    fail "caddy no longer publishes $p"
  fi
done
if printf '%s\n' "$CADDY_BLOCK" | grep -qF './infrastructure/caddy/Caddyfile:/etc/caddy/Caddyfile:ro'; then
  pass "caddy still mounts the hardened Caddyfile read-only"
else
  fail "caddy Caddyfile mount changed"
fi
# Topology A: no service other than caddy may publish a host port.
for svc in postgres redis minio api web migrate; do
  if service_block "$svc" | grep -qE '^\s*ports:'; then
    fail "$svc publishes host ports -- violates Topology A"
  else
    pass "$svc publishes no host ports"
  fi
done

echo "== 7. backup scheduling/configuration untouched by this change =="
# This change must not reach the backup surface at all. Assert the scripts still exist and that
# the compose file introduces no backup-related service or schedule.
for s in backup.sh backup-media.sh sync-offsite.sh restore.sh; do
  if [ -f "$REPO_ROOT/scripts/$s" ]; then
    pass "scripts/$s present"
  else
    fail "scripts/$s missing"
  fi
done
if grep -qiE '^\s*(cron|schedule|backup):' "$COMPOSE"; then
  fail "compose file gained a backup/cron service"
else
  pass "compose file declares no backup/cron service"
fi

echo "== 8. compose parses and resolves the profile correctly (needs a compose binary) =="
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  # Synthetic values only -- never real secrets. All resolved output is discarded.
  cfg() { ( cd "$REPO_ROOT" && REDIS_PASSWORD=synthetic-test-value DB_PASSWORD=synthetic-test-value \
            S3_BUCKET=synthetic S3_PUBLIC_URL=http://synthetic \
            docker compose -f docker-compose.prod.yml "$@" 2>/dev/null ); }

  if cfg config >/dev/null; then
    pass "docker compose config parses the file"
  else
    fail "docker compose config failed to parse the file"
  fi

  DEFAULT_SVCS=$(cfg config --services | sort | tr '\n' ' ')
  if printf '%s' "$DEFAULT_SVCS" | grep -qw migrate; then
    fail "migrate is STILL in the default service selection: $DEFAULT_SVCS"
  else
    pass "migrate is absent from the default service selection"
  fi
  for svc in postgres redis minio api web caddy; do
    if printf '%s' "$DEFAULT_SVCS" | grep -qw "$svc"; then
      pass "$svc remains in the default service selection"
    else
      fail "$svc dropped out of the default service selection"
    fi
  done

  PROFILED_SVCS=$(cfg --profile tools config --services | sort | tr '\n' ' ')
  if printf '%s' "$PROFILED_SVCS" | grep -qw migrate; then
    pass "migrate reappears when --profile tools is enabled"
  else
    fail "migrate is unreachable even with --profile tools"
  fi

  if cfg config --profiles | grep -qx tools; then
    pass "'tools' is a declared profile"
  else
    fail "'tools' profile not declared"
  fi
else
  echo "  skip: no docker compose binary available for parse validation"
fi

echo
echo "== summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
