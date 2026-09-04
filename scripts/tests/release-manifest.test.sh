#!/bin/bash
# Release-integrity guard (2026-09-04) — behavioural tests for scripts/lib/release-manifest.sh,
# scripts/sync-release-source.sh, and the gate wired into scripts/deploy.sh.
#
# Context: the 449c637 production incident. `migrate`/`api`/`web` in docker-compose.prod.yml all
# `build:` from the deploy host's own on-disk source tree, which is not a git checkout
# ([[migrate-builds-from-prod-tree]]). Nothing previously verified that tree actually held the
# commit a deploy claimed to release, so a forgotten source sync let `scripts/deploy.sh 449c637`
# build and tag stale code as `449c637` with no error -- 7 migrations silently never ran, and the
# tagged image never contained the translation/evidence features it was labeled with.
#
# NO real docker, NO network, NO production access. Pure filesystem fixtures under a temp dir.
#
# Run: bash scripts/tests/release-manifest.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
LIB="$REPO_ROOT/scripts/lib/release-manifest.sh"
SYNC="$REPO_ROOT/scripts/sync-release-source.sh"
DEPLOY="$REPO_ROOT/scripts/deploy.sh"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }
[ -f "$LIB" ] || { echo "FATAL: $LIB not found"; exit 1; }
[ -f "$SYNC" ] || { echo "FATAL: $SYNC not found"; exit 1; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

make_project() {
  # Args: project_dir migration_count
  pdir="$1"; count="$2"
  mkdir -p "$pdir/apps/api/src/core/database/migrations"
  i=1
  while [ "$i" -le "$count" ]; do
    touch "$pdir/apps/api/src/core/database/migrations/172000${i}0000-Fake${i}.ts"
    i=$((i + 1))
  done
}

echo "== 1. release_manifest_write / release_manifest_get round-trip =="
( . "$LIB"
  mkdir -p "$TMP/p1"
  release_manifest_write "$TMP/p1" "abc1234" "deadbeef" "53"
  [ -f "$TMP/p1/.release-manifest" ] && echo ok || echo missing
  release_manifest_get "$TMP/p1" "release_sha"
) > "$TMP/out1.txt" 2>&1
grep -q "^ok$" "$TMP/out1.txt" && pass "manifest file is written" || fail "manifest file missing"
grep -q "^abc1234$" "$TMP/out1.txt" && pass "release_manifest_get reads back the sha" || fail "get did not return the written sha"

echo "== 2. PASS: requested sha matches verified source, migration count matches =="
make_project "$TMP/p2" 53
( . "$LIB"; release_manifest_write "$TMP/p2" "449c637" "deadbeef" "53" )
OUT=$( ( . "$LIB"; release_manifest_verify "$TMP/p2" "449c637" ) 2>&1 ); ST=$?
[ "$ST" -eq 0 ] && pass "exit 0 when sha and migration count both match" || fail "exit $ST, expected 0"
echo "$OUT" | grep -q "OK: source tree verified as 449c637" && pass "reports the verified sha" || fail "success message missing"

echo "== 3. FAIL: requested sha differs from the manifest =="
OUT=$( ( . "$LIB"; release_manifest_verify "$TMP/p2" "deadsha" ) 2>&1 ); ST=$?
[ "$ST" -eq 1 ] && pass "exit 1 on sha mismatch" || fail "exit $ST, expected 1"
echo "$OUT" | grep -q "verified as 449c637 but deadsha" && echo "$OUT" | grep -q "was requested" \
  && pass "names both the verified and requested sha" || fail "mismatch not explained"

echo "== 4. FAIL: manifest missing entirely (tree never synced) =="
mkdir -p "$TMP/p3"
OUT=$( ( . "$LIB"; release_manifest_verify "$TMP/p3" "449c637" ) 2>&1 ); ST=$?
[ "$ST" -eq 1 ] && pass "exit 1 when .release-manifest does not exist" || fail "exit $ST, expected 1"
echo "$OUT" | grep -q "never been" && pass "explains the tree has no provenance" || fail "missing-manifest reason not explained"

echo "== 5. FAIL: expected migration file missing (tree drifted after sync) =="
make_project "$TMP/p4" 53
( . "$LIB"; release_manifest_write "$TMP/p4" "449c637" "deadbeef" "53" )
rm "$TMP/p4/apps/api/src/core/database/migrations/"*Fake53.ts
OUT=$( ( . "$LIB"; release_manifest_verify "$TMP/p4" "449c637" ) 2>&1 ); ST=$?
[ "$ST" -eq 1 ] && pass "exit 1 when a migration file is missing post-sync" || fail "exit $ST, expected 1"
echo "$OUT" | grep -q "recorded 53 migration file(s)" && echo "$OUT" | grep -q "currently has 52" \
  && pass "names both the recorded and actual migration counts" || fail "drift counts not explained"

echo "== 6. FAIL: no expected sha given at all =="
OUT=$( ( . "$LIB"; release_manifest_verify "$TMP/p2" "" ) 2>&1 ); ST=$?
[ "$ST" -eq 1 ] && pass "exit 1 when called with an empty expected sha" || fail "exit $ST, expected 1"

echo "== 7. sync-release-source.sh: archive checksum mismatch is refused before any file is touched =="
mkdir -p "$TMP/src7/apps/api/src/core/database/migrations"
touch "$TMP/src7/apps/api/src/core/database/migrations/1720000000000-Fake.ts"
tar -C "$TMP/src7" -czf "$TMP/archive7.tar.gz" .
cat > "$TMP/manifest7.txt" <<EOF
release_sha=449c637
archive_sha256=0000000000000000000000000000000000000000000000000000000000000000
migration_count=1
EOF
mkdir -p "$TMP/target7"
echo "sentinel" > "$TMP/target7/keepme.txt"
OUT=$(bash "$SYNC" "$TMP/archive7.tar.gz" "$TMP/manifest7.txt" "$TMP/target7" 2>&1); ST=$?
[ "$ST" -eq 1 ] && pass "exit 1 on archive checksum mismatch" || fail "exit $ST, expected 1"
echo "$OUT" | grep -q "checksum mismatch" && pass "names the checksum mismatch" || fail "mismatch not explained"
[ -f "$TMP/target7/keepme.txt" ] && pass "target directory untouched after a refused sync" || fail "target directory was modified despite the refusal"

echo "== 8. sync-release-source.sh: manifest lying about its own archive's migration count is refused =="
REAL_SHA=$(sha256sum "$TMP/archive7.tar.gz" | awk '{print $1}')
cat > "$TMP/manifest8.txt" <<EOF
release_sha=449c637
archive_sha256=$REAL_SHA
migration_count=99
EOF
mkdir -p "$TMP/target8"
OUT=$(bash "$SYNC" "$TMP/archive7.tar.gz" "$TMP/manifest8.txt" "$TMP/target8" 2>&1); ST=$?
[ "$ST" -eq 1 ] && pass "exit 1 when manifest migration_count does not match the archive" || fail "exit $ST, expected 1"
echo "$OUT" | grep -q "manifest claims 99 migration" && echo "$OUT" | grep -q "does not" && echo "$OUT" | grep -q "describe its own archive correctly" \
  && pass "explains the self-inconsistent manifest" || fail "reason not explained"

echo "== 9. sync-release-source.sh: happy path applies the archive and writes a verifiable manifest =="
if ! command -v rsync >/dev/null 2>&1; then
  echo "  skip: rsync not available on this machine (sync-release-source.sh requires it; present on"
  echo "        the actual deploy host and standard CI Linux images)"
else
  cat > "$TMP/manifest9.txt" <<EOF
release_sha=449c637
archive_sha256=$REAL_SHA
migration_count=1
EOF
  mkdir -p "$TMP/target9"
  echo "SECRET=do-not-delete" > "$TMP/target9/.env"
  mkdir -p "$TMP/target9/backups"
  echo "old-dump" > "$TMP/target9/backups/keep.sql.gz"
  echo "stale drift file" > "$TMP/target9/stale-file-not-in-release.txt"
  OUT=$(bash "$SYNC" "$TMP/archive7.tar.gz" "$TMP/manifest9.txt" "$TMP/target9" 2>&1); ST=$?
  [ "$ST" -eq 0 ] && pass "exit 0 on a fully verified sync" || fail "exit $ST, expected 0: $OUT"
  [ -f "$TMP/target9/apps/api/src/core/database/migrations/1720000000000-Fake.ts" ] && pass "release file was applied" || fail "release file missing after sync"
  [ -f "$TMP/target9/.env" ] && grep -q "do-not-delete" "$TMP/target9/.env" && pass ".env is preserved untouched" || fail ".env was lost or altered"
  [ -f "$TMP/target9/backups/keep.sql.gz" ] && pass "backups/ is preserved" || fail "backups/ was deleted"
  [ ! -f "$TMP/target9/stale-file-not-in-release.txt" ] && pass "stale pre-existing file not in the release was removed" || fail "stale file survived the sync"
  ( . "$LIB"; release_manifest_verify "$TMP/target9" "449c637" ) >/dev/null 2>&1
  [ $? -eq 0 ] && pass "the tree sync-release-source.sh just wrote passes release_manifest_verify" || fail "post-sync tree does not verify"
fi

echo "== 10. deploy.sh is wired to the gate, and all three services share one verified root =="
CODE=$(sed 's/#.*//' "$DEPLOY")
echo "$CODE" | grep -q "release_manifest_verify" && pass "deploy.sh calls release_manifest_verify" || fail "deploy.sh does not call the gate"
# The gate call must appear before Step 5's docker build lines, i.e. before ANY image is built.
GATE_LINE=$(grep -n "release_manifest_verify \"\$PROJECT_DIR\" \"\$TAG\"" "$DEPLOY" | head -1 | cut -d: -f1)
BUILD_LINE=$(grep -n "^docker build" "$DEPLOY" | head -1 | cut -d: -f1)
if [ -n "$GATE_LINE" ] && [ -n "$BUILD_LINE" ] && [ "$GATE_LINE" -lt "$BUILD_LINE" ]; then
  pass "the gate runs before the first docker build (nothing can be built from an unverified tree)"
else
  fail "the gate does not clearly precede the first build step"
fi
# migrate/api/web are all built with the same $PROJECT_DIR as build context -- a single gate on
# PROJECT_DIR therefore covers all three; assert the compose file and both docker build calls
# resolve to that one root rather than distinct per-service directories.
COMPOSE_REFS=$(grep -c '\$PROJECT_DIR/docker-compose.prod.yml' "$DEPLOY")
BUILD_CONTEXT_REFS=$(grep -c 'docker build .*"\$PROJECT_DIR"' "$DEPLOY")
[ "$COMPOSE_REFS" -ge 1 ] && [ "$BUILD_CONTEXT_REFS" -eq 2 ] \
  && pass "migrate (via compose) and both api/web docker builds all resolve to the same \$PROJECT_DIR" \
  || fail "found $COMPOSE_REFS compose ref(s) and $BUILD_CONTEXT_REFS build context ref(s), expected a single shared root"

echo
echo "== summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
