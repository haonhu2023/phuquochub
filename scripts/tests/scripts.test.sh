#!/bin/bash
# Backup-Restore Hardening (2026-08-12) — behavioural tests for backup.sh / restore.sh /
# backup-media.sh / sync-offsite.sh.
#
# NO Docker, NO network, NO real database, NO real MinIO, NO real R2. Every external command the
# scripts depend on (`docker`, `mc`, `rclone`, `sha256sum`) is replaced by a stub on PATH that
# records what it was asked to do and returns a scripted outcome. That lets us assert the things
# that actually matter for a backup system — does a failed dump get published? does a corrupt
# archive stop the restore BEFORE the drop? — without any infrastructure.
#
# Run: bash scripts/tests/scripts.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
SCRIPTS="$REPO_ROOT/scripts"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }

assert_contains() { case "$1" in *"$2"*) pass "$3" ;; *) fail "$3 -- output lacked '$2'" ;; esac; }
assert_not_contains() { case "$1" in *"$2"*) fail "$3 -- output unexpectedly had '$2'" ;; *) pass "$3" ;; esac; }
assert_status() { if [ "$1" = "$2" ]; then pass "$3"; else fail "$3 (exit $1, expected $2)"; fi; }

# --- stub harness --------------------------------------------------------------------------------
# Builds a throwaway PATH front-loaded with fake `docker` / `mc` / `rclone`.
new_env() {
  ENVDIR=$(mktemp -d)
  mkdir -p "$ENVDIR/bin" "$ENVDIR/proj" "$ENVDIR/proj/backups"
  : > "$ENVDIR/proj/docker-compose.prod.yml"
  CALLS="$ENVDIR/calls.log"; : > "$CALLS"
}
del_env() { [ -n "${ENVDIR:-}" ] && rm -rf "$ENVDIR"; }

# make_docker <health> <dump-behaviour>
#   health: healthy|unhealthy
#   dump:   ok|fail|truncated|tiny
make_docker() {
  cat > "$ENVDIR/bin/docker" <<EOF
#!/bin/bash
echo "docker \$*" >> "$CALLS"
for a in "\$@"; do
  if [ "\$a" = "ps" ]; then echo "$1"; exit 0; fi
done
case "\$*" in
  *pg_dump*)
    case "$2" in
      ok)        printf -- '-- PostgreSQL database dump\n'; for i in \$(seq 1 200); do printf 'INSERT INTO t VALUES (%d);\n' "\$i"; done; printf -- '-- PostgreSQL database dump complete\n'; exit 0 ;;
      fail)      echo "pg_dump: error: connection failed" >&2; exit 1 ;;
      truncated) printf -- '-- PostgreSQL database dump\n'; for i in \$(seq 1 200); do printf 'INSERT INTO t VALUES (%d);\n' "\$i"; done; exit 0 ;;
      tiny)      printf -- 'x\n'; exit 0 ;;
    esac ;;
  *psql*) exit 0 ;;
esac
exit 0
EOF
  chmod +x "$ENVDIR/bin/docker"
}

run_backup() { ( export PATH="$ENVDIR/bin:$PATH"; export BACKUP_DIR="$ENVDIR/proj/backups"; bash "$SCRIPTS/backup.sh" "$ENVDIR/proj" 2>&1 ); }

echo "== backup.sh =="

new_env; make_docker healthy ok
OUT=$(run_backup); ST=$?
assert_status "$ST" 0 "healthy DB + good dump exits 0"
COUNT=$(ls -1 "$ENVDIR/proj/backups"/phuquochub-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" = "1" ]; then pass "exactly one backup published"; else fail "expected 1 backup, got $COUNT"; fi
SHACOUNT=$(ls -1 "$ENVDIR/proj/backups"/*.sha256 2>/dev/null | wc -l | tr -d ' ')
if [ "$SHACOUNT" = "1" ]; then pass "SHA256 manifest written"; else fail "expected 1 manifest, got $SHACOUNT"; fi
( cd "$ENVDIR/proj/backups" && sha256sum -c ./*.sha256 >/dev/null 2>&1 ) && pass "manifest verifies against the archive" || fail "manifest does not verify"
del_env

new_env; make_docker unhealthy ok
OUT=$(run_backup); ST=$?
assert_status "$ST" 1 "unhealthy DB aborts non-zero"
assert_contains "$OUT" "not reporting healthy" "unhealthy abort is explained"
LEFT=$(ls -1 "$ENVDIR/proj/backups" 2>/dev/null | wc -l | tr -d ' ')
if [ "$LEFT" = "0" ]; then pass "no artifact created when DB is unhealthy"; else fail "left $LEFT file(s) behind"; fi
del_env

# The single most important test in this file: the old script masked pg_dump failure behind gzip.
new_env; make_docker healthy fail
OUT=$(run_backup); ST=$?
assert_status "$ST" 1 "pg_dump failure propagates through the gzip pipe (pipefail)"
LEFT=$(ls -1 "$ENVDIR/proj/backups"/phuquochub-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "$LEFT" = "0" ]; then pass "failed dump leaves NO valid-looking .sql.gz"; else fail "published $LEFT bogus backup(s)"; fi
PARTIAL=$(ls -1a "$ENVDIR/proj/backups" | grep -c partial || true)
if [ "$PARTIAL" = "0" ]; then pass "staging file cleaned up on failure"; else fail "left staging file behind"; fi
del_env

new_env; make_docker healthy truncated
OUT=$(run_backup); ST=$?
assert_status "$ST" 1 "truncated dump (no completion marker) is rejected"
assert_contains "$OUT" "truncated" "truncation is named in the error"
LEFT=$(ls -1 "$ENVDIR/proj/backups"/phuquochub-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "$LEFT" = "0" ]; then pass "truncated dump not published"; else fail "published a truncated backup"; fi
del_env

new_env; make_docker healthy tiny
OUT=$(run_backup); ST=$?
assert_status "$ST" 1 "implausibly small dump is rejected"
del_env

new_env; make_docker healthy ok
OUT=$(run_backup)
assert_not_contains "$OUT" "PGPASSWORD" "no password material in output"
assert_not_contains "$OUT" "phuquoc:" "no credential-looking token in output"
del_env

echo "== restore.sh =="

# restore.sh reads a typed confirmation; feed it on stdin.
run_restore() { ( export PATH="$ENVDIR/bin:$PATH"; printf '%s\n' "${2:-yes}" | bash "$SCRIPTS/restore.sh" "$1" "$ENVDIR/proj" 2>&1 ); }

new_env; make_docker healthy ok
OUT=$(run_restore "$ENVDIR/proj/backups/does-not-exist.sql.gz"); ST=$?
assert_status "$ST" 1 "missing backup aborts"
assert_contains "$OUT" "does not exist" "missing backup is named"
assert_not_contains "$OUT" "DROP DATABASE" "no destructive step attempted for a missing backup"
del_env

new_env; make_docker healthy ok
printf 'this is not gzip' > "$ENVDIR/proj/backups/corrupt.sql.gz"
OUT=$(run_restore "$ENVDIR/proj/backups/corrupt.sql.gz"); ST=$?
assert_status "$ST" 1 "corrupt archive aborts"
assert_contains "$OUT" "gzip integrity check FAILED" "integrity failure is explicit"
# The whole point: integrity is checked BEFORE anything destructive runs.
assert_not_contains "$(cat "$CALLS")" "DROP DATABASE" "database NOT dropped when archive is corrupt"
del_env

new_env; make_docker healthy ok
( printf -- '-- dump\n'; printf 'SELECT 1;\n'; printf -- '-- PostgreSQL database dump complete\n' ) | gzip > "$ENVDIR/proj/backups/good.sql.gz"
( cd "$ENVDIR/proj/backups" && sha256sum good.sql.gz > good.sql.gz.sha256 )
printf 'tampered' | gzip >> "$ENVDIR/proj/backups/good.sql.gz" 2>/dev/null || true
OUT=$(run_restore "$ENVDIR/proj/backups/good.sql.gz"); ST=$?
assert_status "$ST" 1 "archive not matching its SHA256 manifest aborts"
assert_not_contains "$(cat "$CALLS")" "DROP DATABASE" "database NOT dropped when checksum mismatches"
del_env

new_env; make_docker healthy ok
( printf -- '-- dump\n'; printf 'SELECT 1;\n'; printf -- '-- PostgreSQL database dump complete\n' ) | gzip > "$ENVDIR/proj/backups/ok.sql.gz"
OUT=$(run_restore "$ENVDIR/proj/backups/ok.sql.gz" "no"); ST=$?
assert_status "$ST" 1 "declining the confirmation aborts"
assert_contains "$OUT" "Aborted" "abort is reported"
assert_not_contains "$(cat "$CALLS")" "DROP DATABASE" "database NOT dropped without confirmation"
del_env

new_env; make_docker healthy ok
( printf -- '-- dump\n'; printf 'SELECT 1;\n'; printf -- '-- PostgreSQL database dump complete\n' ) | gzip > "$ENVDIR/proj/backups/ok.sql.gz"
OUT=$(run_restore "$ENVDIR/proj/backups/ok.sql.gz")
CALLTXT=$(cat "$CALLS")
assert_contains "$CALLTXT" "ON_ERROR_STOP=1" "psql invoked with ON_ERROR_STOP=1"
assert_contains "$CALLTXT" "--single-transaction" "load runs in a single transaction"
assert_contains "$CALLTXT" "CREATE EXTENSION IF NOT EXISTS \"postgis\"" "postgis pre-created"
assert_contains "$CALLTXT" "CREATE EXTENSION IF NOT EXISTS \"unaccent\"" "unaccent pre-created"
# Extensions must exist before the dump is loaded, or the FTS indexes cannot build.
EXT_LINE=$(printf '%s' "$CALLTXT" | grep -n 'CREATE EXTENSION' | head -1 | cut -d: -f1)
LOAD_LINE=$(printf '%s' "$CALLTXT" | grep -n -- '--single-transaction' | head -1 | cut -d: -f1)
if [ -n "$EXT_LINE" ] && [ -n "$LOAD_LINE" ] && [ "$EXT_LINE" -lt "$LOAD_LINE" ]; then
  pass "extensions created BEFORE the dump is loaded"
else
  fail "extension/load ordering wrong (ext line $EXT_LINE, load line $LOAD_LINE)"
fi
del_env

new_env; make_docker healthy ok
( printf -- '-- dump\n'; printf "AS \$_\$ SELECT unaccent('unaccent', \$1) \$_\$;\n"; printf -- '-- PostgreSQL database dump complete\n' ) | gzip > "$ENVDIR/proj/backups/legacy.sql.gz"
OUT=$(run_restore "$ENVDIR/proj/backups/legacy.sql.gz")
assert_contains "$OUT" "predates migration 1720004400000" "legacy dump is detected and announced"
del_env

new_env; make_docker healthy ok
( printf -- '-- dump\n'; printf 'SELECT 1;\n'; printf -- '-- PostgreSQL database dump complete\n' ) | gzip > "$ENVDIR/proj/backups/ok.sql.gz"
OUT=$(RESTORE_TARGET_DB=phuquochub_restore_test run_restore "$ENVDIR/proj/backups/ok.sql.gz")
assert_not_contains "$OUT" "THIS IS THE PRODUCTION DATABASE NAME" "rehearsal target does not raise the production warning"
del_env

echo "== backup-media.sh =="

# make_mc <ls-behaviour> <mirror-behaviour>
make_mc() {
  cat > "$ENVDIR/bin/mc" <<EOF
#!/bin/bash
echo "mc \$*" >> "$CALLS"
case "\$1" in
  ls)     [ "$1" = "ok" ] && exit 0 || exit 1 ;;
  mirror)
    [ "$2" = "fail" ] && exit 1
    dest=\$(eval echo "\\\${\$#}")
    mkdir -p "\$dest"
    [ "$2" = "empty" ] || printf 'JPEGDATA' > "\$dest/photo.jpg"
    exit 0 ;;
esac
exit 0
EOF
  chmod +x "$ENVDIR/bin/mc"
}
run_media() { ( export PATH="$ENVDIR/bin:$PATH"; export MEDIA_BACKUP_DIR="$ENVDIR/proj/backups/media"; bash "$SCRIPTS/backup-media.sh" "$ENVDIR/proj" 2>&1 ); }

new_env
OUT=$(run_media); ST=$?
assert_status "$ST" 1 "missing mc binary aborts"
assert_contains "$OUT" "not found on PATH" "missing mc is explained"
del_env

new_env; make_mc fail ok
OUT=$(run_media); ST=$?
assert_status "$ST" 1 "unreachable bucket / bad alias aborts"
assert_not_contains "$OUT" "SECRET" "no credential material in the error path"
del_env

new_env; make_mc ok fail
OUT=$(run_media); ST=$?
assert_status "$ST" 1 "mirror failure aborts"
LEFT=$(ls -1 "$ENVDIR/proj/backups/media" 2>/dev/null | wc -l | tr -d ' ')
if [ "$LEFT" = "0" ]; then pass "failed mirror leaves no snapshot"; else fail "left $LEFT snapshot(s)"; fi
del_env

new_env; make_mc ok empty
OUT=$(run_media); ST=$?
assert_status "$ST" 1 "empty mirror is rejected by default (ambiguous with auth failure)"
assert_contains "$OUT" "ALLOW_EMPTY_MEDIA_BACKUP=1" "override is documented in the error"
del_env

new_env; make_mc ok ok
OUT=$(run_media); ST=$?
assert_status "$ST" 0 "healthy media backup exits 0"
SNAP=$(ls -1d "$ENVDIR/proj/backups/media"/media-* 2>/dev/null | head -1)
if [ -n "$SNAP" ] && [ -f "$SNAP/SHA256SUMS" ]; then pass "snapshot published with SHA256SUMS"; else fail "snapshot or manifest missing"; fi
( cd "$SNAP" && sha256sum -c SHA256SUMS >/dev/null 2>&1 ) && pass "media manifest verifies" || fail "media manifest does not verify"
assert_not_contains "$(cat "$CALLS")" "--remove" "mc mirror never invoked with --remove (cannot delete production objects)"
PARTIAL=$(ls -1a "$ENVDIR/proj/backups/media" | grep -c partial || true)
if [ "$PARTIAL" = "0" ]; then pass "no staging directory left behind"; else fail "staging directory leaked"; fi
del_env

echo "== sync-offsite.sh =="

run_offsite() { ( export PATH="$ENVDIR/bin:$PATH"; export BACKUP_DIR="$ENVDIR/proj/backups"; export MEDIA_BACKUP_DIR="$ENVDIR/proj/backups/media"; bash "$SCRIPTS/sync-offsite.sh" "$ENVDIR/proj" 2>&1 ); }

new_env
OUT=$( unset R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET
       export PATH="$ENVDIR/bin:$PATH"
       bash "$SCRIPTS/sync-offsite.sh" "$ENVDIR/proj" 2>&1 ); ST=$?
assert_status "$ST" 0 "no R2 credentials = safe no-op, exit 0"
assert_contains "$OUT" "skipping offsite copy" "no-op is explained"
del_env

# Credentials present but rclone absent: that IS a real failure, because a copy was requested.
new_env
OUT=$(R2_ACCOUNT_ID=a R2_ACCESS_KEY_ID=b R2_SECRET_ACCESS_KEY=c R2_BUCKET=d run_offsite); ST=$?
assert_status "$ST" 1 "credentials set but rclone missing = clear failure"
assert_contains "$OUT" "rclone is not installed" "missing rclone is named"
del_env

new_env
cat > "$ENVDIR/bin/rclone" <<EOF
#!/bin/bash
echo "rclone \$*" >> "$CALLS"
exit 0
EOF
chmod +x "$ENVDIR/bin/rclone"
printf 'x' | gzip > "$ENVDIR/proj/backups/phuquochub-20260812T020000Z.sql.gz"
mkdir -p "$ENVDIR/proj/backups/media/media-20260812T030000Z"; printf 'x' > "$ENVDIR/proj/backups/media/media-20260812T030000Z/photo.jpg"
OUT=$(R2_ACCOUNT_ID=a R2_ACCESS_KEY_ID=b R2_SECRET_ACCESS_KEY=c R2_BUCKET=d run_offsite); ST=$?
CALLTXT=$(cat "$CALLS")
assert_status "$ST" 0 "offsite copy succeeds with rclone present"
# The correctness fix: never `sync`, which would delete offsite history as local retention prunes.
assert_not_contains "$CALLTXT" "rclone sync" "NEVER uses 'rclone sync' (would delete offsite history)"
assert_contains "$CALLTXT" "rclone copy" "uses additive 'rclone copy'"
assert_contains "$CALLTXT" "/backups" "database backups included"
assert_contains "$CALLTXT" "/media" "media snapshots included"
assert_contains "$CALLTXT" "--immutable" "existing archives are protected from silent rewrite"
assert_not_contains "$CALLTXT" "wal" "WAL skipped when WAL_ARCHIVE_HOST_PATH is unset"
# Secrets must never be echoed, even with credentials configured.
assert_not_contains "$OUT" "R2_SECRET_ACCESS_KEY=" "secret value never printed"
del_env

echo
echo "scripts.test.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
