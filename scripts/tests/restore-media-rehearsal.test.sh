#!/bin/bash
# Restore rehearsal default/path hardening (2026-08-13) — regression tests for two bugs in
# scripts/restore-media-rehearsal.sh:
#   1. The default test-bucket timestamp used `%Y%m%dT%H%M%SZ`, which contains uppercase T/Z --
#      not a valid S3/MinIO bucket name.
#   2. SNAPSHOT_DIR was never canonicalized to an absolute path before being handed to the
#      containerized `mc mirror` call, so a relative snapshot path silently resolved against the
#      CONTAINER's working directory instead of the host's and found nothing.
#
# NO real Docker, NO real network, NO real MinIO. MC_BIN is pointed directly at a stub `mc` on
# PATH (same pattern scripts.test.sh uses for backup-media.sh) so these tests exercise
# restore-media-rehearsal.sh's OWN logic -- bucket validation and path canonicalization -- not the
# Docker wrapper, which is already covered by mc-docker.test.sh.
#
# Run: bash scripts/tests/restore-media-rehearsal.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
REHEARSAL="$REPO_ROOT/scripts/restore-media-rehearsal.sh"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }
assert_contains() { case "$1" in *"$2"*) pass "$3" ;; *) fail "$3 -- output lacked '$2'" ;; esac; }
assert_not_contains() { case "$1" in *"$2"*) fail "$3 -- output unexpectedly had '$2'" ;; *) pass "$3" ;; esac; }
assert_status() { if [ "$1" = "$2" ]; then pass "$3"; else fail "$3 (exit $1, expected $2)"; fi; }

# ---- environment ---------------------------------------------------------------------------------
new_env() {
  ENVDIR=$(mktemp -d)
  mkdir -p "$ENVDIR/bin" "$ENVDIR/backups/media"
  CALLS="$ENVDIR/calls.log"; : > "$CALLS"
}
del_env() { [ -n "${ENVDIR:-}" ] && rm -rf "$ENVDIR"; }

# make_mc <mb-behaviour>
#   mb: ok|fail
# `mirror` always succeeds. When its destination is an existing HOST directory (the verify
# read-back step -- the restore-direction destination is a bucket path string, never a real
# directory) it copies FIXTURE_DIR's non-manifest files into it so the round-trip checksum passes.
make_mc() {
  cat > "$ENVDIR/bin/mc" <<'EOF'
#!/bin/bash
echo "mc $*" >> "$CALLS"
case "$1" in
  mb) [ "$MB_RESULT" = "ok" ] && exit 0 || exit 1 ;;
  rb) exit 0 ;;
  mirror)
    dest="${@: -1}"
    if [ -d "$dest" ]; then
      find "$FIXTURE_DIR" -maxdepth 1 -type f ! -name SHA256SUMS -exec cp {} "$dest"/ \;
    fi
    exit 0 ;;
esac
exit 0
EOF
  chmod +x "$ENVDIR/bin/mc"
}

# make_snapshot <dir> -- a valid snapshot: one object plus a verifying SHA256SUMS manifest.
make_snapshot() {
  mkdir -p "$1"
  printf 'JPEGDATA' > "$1/photo.jpg"
  ( cd "$1" && sha256sum photo.jpg > SHA256SUMS )
}

run_rehearsal() {
  ( export PATH="$ENVDIR/bin:$PATH" CALLS="$CALLS" MC_BIN="$ENVDIR/bin/mc" MB_RESULT="${MB_RESULT:-ok}" \
      FIXTURE_DIR="${FIXTURE_DIR:-}" MEDIA_BACKUP_DIR="${MEDIA_BACKUP_DIR:-}"
    bash "$REHEARSAL" "$@" 2>&1 )
}
# Same as run_rehearsal, but cds into $1 first and runs the rehearsal script with the REMAINING
# args -- used to exercise a snapshot path that is relative to the caller's cwd.
run_rehearsal_from() {
  local cwd="$1"; shift
  ( cd "$cwd" && export PATH="$ENVDIR/bin:$PATH" CALLS="$CALLS" MC_BIN="$ENVDIR/bin/mc" \
      MB_RESULT="${MB_RESULT:-ok}" FIXTURE_DIR="${FIXTURE_DIR:-}" MEDIA_BACKUP_DIR="${MEDIA_BACKUP_DIR:-}"
    bash "$REHEARSAL" "$@" 2>&1 )
}

# =================================================================================================
echo "== default bucket name =="
new_env; make_mc
SNAP="$ENVDIR/backups/media/media-20260813-045838"; make_snapshot "$SNAP"
FIXTURE_DIR="$SNAP" MEDIA_BACKUP_DIR="$ENVDIR/backups/media" \
OUT=$(FIXTURE_DIR="$SNAP" MEDIA_BACKUP_DIR="$ENVDIR/backups/media" run_rehearsal "$SNAP")
BUCKET_LINE=$(printf '%s' "$OUT" | grep 'creating isolated test bucket')
# Extract just the bucket token (not the whole log line) before checking case: bracket ranges
# like [A-Z] are locale-collation-dependent in bash and can misfire against multibyte punctuation
# (e.g. the em dash in "Step 2/4 —") under a UTF-8 locale.
BUCKET_NAME=$(printf '%s' "$BUCKET_LINE" | grep -oE 'phuquochub-restore-test-[0-9-]+')
case "$BUCKET_NAME" in
  "") fail "could not extract the default bucket name from: $BUCKET_LINE" ;;
  *[A-Z]*) fail "default bucket name is fully lowercase -- found uppercase in: $BUCKET_NAME" ;;
  *) pass "default bucket name is fully lowercase" ;;
esac
assert_contains "$BUCKET_LINE" "phuquochub-restore-test-" "default bucket keeps the required prefix"
assert_contains "$OUT" "MINIO_RESTORE_TEST=PASS" "default-bucket run passes end to end"
del_env

# =================================================================================================
echo "== bucket name validation =="
new_env; make_mc
SNAP="$ENVDIR/backups/media/media-x"; make_snapshot "$SNAP"
OUT=$(FIXTURE_DIR="$SNAP" run_rehearsal "$SNAP" "Phuquochub-Restore-Test"); ST=$?
assert_status "$ST" 1 "uppercase bucket name is rejected"
assert_contains "$OUT" "lowercase" "rejection names the lowercase requirement"
assert_not_contains "$(cat "$CALLS")" "mc mb" "no bucket-create attempted for an invalid name"
del_env

new_env; make_mc
SNAP="$ENVDIR/backups/media/media-x"; make_snapshot "$SNAP"
OUT=$(FIXTURE_DIR="$SNAP" run_rehearsal "$SNAP" "phuquochub-prod"); ST=$?
assert_status "$ST" 1 "production bucket name is refused as a target"
assert_contains "$OUT" "refusing to use the production bucket" "production guard message shown"
assert_not_contains "$(cat "$CALLS")" "mc mb" "no bucket-create attempted against production"
del_env

new_env; make_mc
SNAP="$ENVDIR/backups/media/media-x"; make_snapshot "$SNAP"
OUT=$(FIXTURE_DIR="$SNAP" run_rehearsal "$SNAP" "ab"); ST=$?
assert_status "$ST" 1 "too-short bucket name is rejected"
del_env

# =================================================================================================
echo "== snapshot path canonicalization =="
new_env; make_mc
SNAP="$ENVDIR/backups/media/media-rel"; make_snapshot "$SNAP"
OUT=$(FIXTURE_DIR="$SNAP" MEDIA_BACKUP_DIR="$ENVDIR/backups/media" \
  run_rehearsal_from "$ENVDIR/backups" "media/media-rel")
ST=$?
assert_status "$ST" 0 "a RELATIVE snapshot path succeeds"
assert_contains "$OUT" "MINIO_RESTORE_TEST=PASS" "relative-path run passes end to end"
assert_contains "$(cat "$CALLS")" "$SNAP" "the mc client received the CANONICAL absolute path, not the relative one"
del_env

new_env; make_mc
SNAP="$ENVDIR/backups/media/media-abs"; make_snapshot "$SNAP"
OUT=$(FIXTURE_DIR="$SNAP" MEDIA_BACKUP_DIR="$ENVDIR/backups/media" run_rehearsal "$SNAP"); ST=$?
assert_status "$ST" 0 "an ABSOLUTE snapshot path still succeeds"
assert_contains "$OUT" "MINIO_RESTORE_TEST=PASS" "absolute-path run passes end to end"
del_env

# =================================================================================================
echo "== snapshot must stay inside the backup root =="
new_env; make_mc
mkdir -p "$ENVDIR/backups/media"
OUTSIDE="$ENVDIR/outside-root/media-escape"; make_snapshot "$OUTSIDE"
OUT=$(FIXTURE_DIR="$OUTSIDE" MEDIA_BACKUP_DIR="$ENVDIR/backups/media" run_rehearsal "$OUTSIDE"); ST=$?
assert_status "$ST" 1 "a snapshot directory outside the backup root is refused"
assert_contains "$OUT" "resolves outside the media" "escape is explained"
assert_not_contains "$(cat "$CALLS")" "mc mb" "no bucket-create attempted for an out-of-root snapshot"
del_env

new_env; make_mc
mkdir -p "$ENVDIR/backups/media"
SECRET="$ENVDIR/secret-outside"; make_snapshot "$SECRET"
ln -s "$SECRET" "$ENVDIR/backups/media/evil-link" 2>/dev/null
if [ -L "$ENVDIR/backups/media/evil-link" ]; then
  OUT=$(FIXTURE_DIR="$SECRET" MEDIA_BACKUP_DIR="$ENVDIR/backups/media" run_rehearsal "$ENVDIR/backups/media/evil-link"); ST=$?
  assert_status "$ST" 1 "a symlink escaping the backup root is refused"
  assert_contains "$OUT" "resolves outside the media" "symlink escape is explained"
  assert_not_contains "$(cat "$CALLS")" "mc mb" "no bucket-create attempted through a symlink escape"
else
  # This sandbox cannot create real symlinks (no admin/Developer Mode privilege on Windows --
  # `ln -s` on a directory silently falls back to something `-L` does not recognize). The
  # containment check the symlink would have exercised is the exact same `cd -P`/`pwd -P` physical
  # resolution proven by the '..'-traversal case above, so skip rather than false-fail here; this
  # path must be re-verified on a real POSIX host (the production Linux VPS) before relying on it.
  echo "  SKIP: symlink escape check -- this environment cannot create real symlinks"
fi
del_env

new_env; make_mc
mkdir -p "$ENVDIR/backups/media"
OUTSIDE="$ENVDIR/other/media-traverse"; make_snapshot "$OUTSIDE"
OUT=$(FIXTURE_DIR="$OUTSIDE" MEDIA_BACKUP_DIR="$ENVDIR/backups/media" run_rehearsal "$ENVDIR/backups/media/../../other/media-traverse"); ST=$?
assert_status "$ST" 1 "a '..'-traversal escaping the backup root is refused"
del_env

# =================================================================================================
echo "== cleanup trap still fires on failure =="
new_env; MB_RESULT=fail make_mc
SNAP="$ENVDIR/backups/media/media-fail"; make_snapshot "$SNAP"
OUT=$(MB_RESULT=fail FIXTURE_DIR="$SNAP" MEDIA_BACKUP_DIR="$ENVDIR/backups/media" run_rehearsal "$SNAP"); ST=$?
assert_status "$ST" 1 "bucket-creation failure aborts the rehearsal"
assert_contains "$(cat "$CALLS")" "mc rb --force" "cleanup trap still ran mc rb after the failure"
del_env

echo
echo "restore-media-rehearsal.test.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
