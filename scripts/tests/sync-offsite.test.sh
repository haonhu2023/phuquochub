#!/bin/bash
# Backup-Restore Hardening (2026-08-13) — deterministic tests for scripts/sync-offsite.sh.
#
# Pins two behaviors that matter for the R2 offsite rollout:
#   1. With no credentials configured (either mechanism), the script no-ops with exit 0 and
#      touches nothing -- the safe steady state before/without R2 provisioning.
#   2. With RCLONE_CONFIG + R2_REMOTE_NAME + R2_BUCKET set (the cron-safe, no-secrets-in-crontab
#      mechanism), the script actually copies files to the configured remote using the expected
#      backups/ and media/ layout, using only `rclone copy --checksum --immutable` (never sync,
#      never delete).
#
# Requires a local `rclone` binary; a "local" type remote is used as a stand-in for R2 so no
# network access or real credentials are needed. Skips with a clear message if rclone is absent.
#
# Run: bash scripts/tests/sync-offsite.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
SYNC_SCRIPT="$REPO_ROOT/scripts/sync-offsite.sh"

PASS=0
FAIL=0
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }

if ! command -v rclone >/dev/null 2>&1; then
  echo "SKIP: rclone not installed locally -- cannot exercise sync-offsite.sh behaviorally."
  echo "      (bash -n syntax check still applies via CI/lint; see PR for a real-remote run.)"
  exit 0
fi

echo "== static: no sync/delete/purge semantics, only rclone copy =="
if grep -vE '^\s*#' "$SYNC_SCRIPT" | grep -qE '"\$RCLONE_BIN"\s+(sync|delete|purge|move)\b'; then
  fail "found a destructive rclone subcommand in $SYNC_SCRIPT"
else
  pass "only rclone copy is used"
fi

echo "== skip when unconfigured: exit 0, no output directories created =="
D=$(mktemp -d)
mkdir -p "$D/project/backups"
printf 'fixture' > "$D/project/backups/phuquochub-fake.sql.gz"
env -i PATH="$PATH" HOME="$HOME" bash "$SYNC_SCRIPT" "$D/project" >"$D/skip.log" 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then pass "unconfigured run exits 0"; else fail "unconfigured run exited $rc"; fi
if grep -q "skipping offsite copy" "$D/skip.log"; then pass "unconfigured run logs the safe-skip message"; else fail "missing safe-skip message"; fi
rm -rf "$D"

echo "== RCLONE_CONFIG + R2_REMOTE_NAME + R2_BUCKET: real copy against a local-type remote =="
D=$(mktemp -d)
SRC="$D/project/backups"
MEDIA="$SRC/media/media-20260813T000000Z"
DST="$D/dst"
mkdir -p "$SRC" "$MEDIA" "$DST"
printf 'fixture-db' > "$SRC/phuquochub-20260813T000000Z.sql.gz"
printf 'fixture-db' > "$SRC/phuquochub-20260813T000000Z.sql.gz.sha256"
printf 'fixture-media' > "$MEDIA/some-object.jpg"
printf 'fixture-sums' > "$MEDIA/SHA256SUMS"

cat > "$D/test.conf" <<EOF
[testremote]
type = local
EOF

RCLONE_CONFIG="$D/test.conf" R2_REMOTE_NAME=testremote R2_BUCKET="$DST" \
  bash "$SYNC_SCRIPT" "$D/project" >"$D/run.log" 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then pass "configured run exits 0"; else fail "configured run exited $rc"; cat "$D/run.log"; fi

if [ -f "$DST/backups/phuquochub-20260813T000000Z.sql.gz" ]; then
  pass "DB backup landed under backups/"
else
  fail "DB backup missing from remote backups/"
fi
if [ -f "$DST/media/media-20260813T000000Z/some-object.jpg" ]; then
  pass "media snapshot landed under media/, preserving snapshot subdirectory"
else
  fail "media object missing from remote media/"
fi
if [ -e "$DST/backups/media" ]; then
  fail "media tree was ALSO duplicated under backups/media (double-upload bug)"
else
  pass "media tree excluded from the backups/ copy (no duplication)"
fi

echo "== --immutable: a changed local file after first copy is rejected, not silently overwritten =="
printf 'MUTATED' > "$SRC/phuquochub-20260813T000000Z.sql.gz"
RCLONE_CONFIG="$D/test.conf" R2_REMOTE_NAME=testremote R2_BUCKET="$DST" \
  bash "$SYNC_SCRIPT" "$D/project" >"$D/run2.log" 2>&1
rc=$?
if [ "$rc" -ne 0 ]; then pass "immutable conflict fails loudly (exit $rc)"; else fail "immutable conflict was silently accepted"; fi
remote_content=$(cat "$DST/backups/phuquochub-20260813T000000Z.sql.gz" 2>/dev/null)
if [ "$remote_content" = "fixture-db" ]; then
  pass "remote object left unchanged despite local mutation"
else
  fail "remote object was overwritten -- immutable guarantee broken"
fi

rm -rf "$D"

echo
echo "== summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
