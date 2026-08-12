#!/bin/bash
# PLACE-038 / Backup-Restore Hardening (2026-08-12) — restore a PostgreSQL logical backup produced
# by scripts/backup.sh.
#
# ############################################################################################
# ## DESTRUCTIVE. This DROPs and RECREATEs the target database. Requires typed confirmation. ##
# ############################################################################################
#
# Usage:
#   scripts/restore.sh <path-to-backup.sql.gz> [compose-project-dir]
#
# REHEARSALS MUST NOT TARGET PRODUCTION. Set RESTORE_TARGET_DB to a scratch database name and this
# script will create and load THAT, leaving `phuquochub` untouched:
#   RESTORE_TARGET_DB=phuquochub_restore_test scripts/restore.sh backups/phuquochub-....sql.gz
# That is the supported quarterly restore-test path (PLACE-037 §11). See
# docs/delivery/BACKUP-RESTORE-RUNBOOK.md.
#
# WHAT CHANGED (2026-08-12) and why, after the real production rehearsal:
#   * psql now runs with ON_ERROR_STOP=1 AND --single-transaction. Previously neither was set, so a
#     failed statement did not stop the load and psql still exited 0 — the script could report
#     success over a half-restored database. With both, the restore is all-or-nothing.
#   * Backup integrity (gzip + SHA256 sidecar, when present) is verified BEFORE the target database
#     is dropped. Previously the database was destroyed first and the archive read afterwards, so a
#     corrupt backup meant losing the old data too.
#   * Extensions are pre-created in the fresh database. `CREATE DATABASE` clones template1, and
#     infrastructure/docker/postgres/init/01-init.sql only runs at CLUSTER init, so a recreated
#     database starts with none of them.
#   * Legacy dumps taken before migration 1720004400000 are detected and repaired in-stream (see
#     LEGACY section below).
#   * The restore is verified after loading, before success is reported.
#
# PITR: NOT automated here, and this script does not claim it. WAL archiving is enabled
# (infrastructure/docker/postgres/postgresql.prod.conf) and archives are being written, but a
# point-in-time restore requires choosing and validating a recovery target by hand. Archiving being
# active is NOT the same as PITR being proven — see the runbook's explicit status table.
set -euo pipefail

BACKUP_FILE="${1:?Usage: scripts/restore.sh <path-to-backup.sql.gz> [compose-project-dir]}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR="${2:-$(dirname "$SCRIPT_DIR")}"
COMPOSE="docker compose -f $PROJECT_DIR/docker-compose.prod.yml"
PG_USER="${PG_USER:-phuquoc}"
TARGET_DB="${RESTORE_TARGET_DB:-phuquochub}"

# Extensions the schema depends on. Order matters: postgis and unaccent must exist before the dump
# creates the FTS indexes that call into them.
REQUIRED_EXTENSIONS="postgis unaccent pg_trgm pgcrypto"

psql_admin() {
  $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d postgres "$@"
}
psql_target() {
  $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$TARGET_DB" "$@"
}

# --- 1. Validate the backup BEFORE touching anything destructive --------------------------------
if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore] ERROR: $BACKUP_FILE does not exist." >&2
  exit 1
fi

echo "[restore] Verifying archive integrity of $BACKUP_FILE ..."
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  echo "[restore] ERROR: gzip integrity check FAILED. This archive is corrupt; refusing to touch" >&2
  echo "[restore]        the database. Choose another backup." >&2
  exit 1
fi
echo "[restore]   gzip: OK"

# The sidecar is authoritative when present; a missing one is a warning, not a hard stop, because
# backups produced before this hardening have no sidecar.
SHA_FILE="$BACKUP_FILE.sha256"
if [ -f "$SHA_FILE" ]; then
  if ( cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$SHA_FILE")" >/dev/null 2>&1 ); then
    echo "[restore]   sha256: OK"
  else
    echo "[restore] ERROR: SHA256 manifest does NOT match. This archive has been altered or is" >&2
    echo "[restore]        damaged; refusing to restore it." >&2
    exit 1
  fi
else
  echo "[restore]   sha256: no .sha256 sidecar (pre-2026-08-12 backup) -- gzip check only"
fi

if ! gzip -dc "$BACKUP_FILE" | grep -q 'PostgreSQL database dump complete'; then
  echo "[restore] ERROR: archive lacks pg_dump's completion marker -- it is truncated. Refusing." >&2
  exit 1
fi
echo "[restore]   completeness marker: OK"

# --- 2. LEGACY compatibility --------------------------------------------------------------------
# Dumps taken before migration 1720004400000 contain the unqualified body
#   SELECT unaccent('unaccent', $1)
# which cannot resolve under the empty search_path pg_dump restores with, and fails when
# CREATE INDEX idx_events_fts first evaluates it. This is exactly the production rehearsal failure.
# Rather than refuse those backups, rewrite that one deterministic line in-stream. The pattern is
# emitted verbatim by pg_dump, the substitution is semantically identical (proven: 251 real values,
# 0 differences), and it is applied ONLY when the legacy pattern is actually present.
NEEDS_LEGACY_FIX=0
if gzip -dc "$BACKUP_FILE" | grep -q "SELECT unaccent('unaccent', \$1)"; then
  NEEDS_LEGACY_FIX=1
  echo "[restore]   legacy: this backup predates migration 1720004400000; immutable_unaccent will"
  echo "[restore]           be schema-qualified in-stream so the FTS indexes can be built."
fi

# --- 3. Confirm the destructive action -----------------------------------------------------------
echo
echo "[restore] TARGET DATABASE: $TARGET_DB"
if [ "$TARGET_DB" = "phuquochub" ]; then
  echo "[restore] *** THIS IS THE PRODUCTION DATABASE NAME. ***"
  echo "[restore] For a rehearsal, abort and re-run with RESTORE_TARGET_DB=phuquochub_restore_test"
fi
echo "[restore] This will DROP and RECREATE '$TARGET_DB', then load: $BACKUP_FILE"
echo "[restore] All data currently in '$TARGET_DB' will be permanently lost."
printf '[restore] Type "yes" to continue: '
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "[restore] Aborted -- no changes made."
  exit 1
fi

# --- 4. Recreate the database --------------------------------------------------------------------
echo "[restore] Confirming postgres is reachable..."
# `grep -qx`, not `grep -q` -- "unhealthy" contains "healthy". See backup.sh for the full note.
if ! $COMPOSE ps postgres --format '{{.Health}}' 2>/dev/null | grep -qx healthy; then
  echo "[restore] ERROR: postgres service is not reporting healthy. Aborting." >&2
  exit 1
fi

echo "[restore] Terminating existing connections and recreating '$TARGET_DB'..."
psql_admin -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TARGET_DB' AND pid <> pg_backend_pid();" >/dev/null
psql_admin -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";"
psql_admin -c "CREATE DATABASE \"$TARGET_DB\" OWNER \"$PG_USER\";"

echo "[restore] Creating required extensions ($REQUIRED_EXTENSIONS)..."
for ext in $REQUIRED_EXTENSIONS; do
  psql_target -c "CREATE EXTENSION IF NOT EXISTS \"$ext\";" >/dev/null
done

# --- 5. Load ---------------------------------------------------------------------------------------
echo "[restore] Loading $BACKUP_FILE (single transaction, abort on first error)..."
if [ "$NEEDS_LEGACY_FIX" -eq 1 ]; then
  gzip -dc "$BACKUP_FILE" \
    | sed "s|SELECT unaccent('unaccent', \$1)|SELECT public.unaccent('public.unaccent'::regdictionary, \$1)|g" \
    | $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 --single-transaction -U "$PG_USER" -d "$TARGET_DB"
else
  gzip -dc "$BACKUP_FILE" \
    | $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 --single-transaction -U "$PG_USER" -d "$TARGET_DB"
fi

# --- 6. Verify BEFORE reporting success -----------------------------------------------------------
echo "[restore] Verifying restored database..."
TABLE_COUNT=$(psql_target -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" | tr -d '\r')
echo "[restore]   public base tables: $TABLE_COUNT"
if [ "${TABLE_COUNT:-0}" -lt 1 ]; then
  echo "[restore] ERROR: restored database has no tables. Restore did not succeed." >&2
  exit 1
fi

MIGRATION_COUNT=$(psql_target -tAc "SELECT count(*) FROM migrations;" 2>/dev/null | tr -d '\r' || echo "0")
echo "[restore]   applied migrations: $MIGRATION_COUNT"

# The FTS index is the object that actually failed in the production rehearsal, so it is the one
# worth asserting on: if immutable_unaccent were still unresolvable, this index could not exist.
for idx in idx_places_fts idx_events_fts; do
  if [ "$(psql_target -tAc "SELECT count(*) FROM pg_indexes WHERE indexname='$idx';" | tr -d '\r')" = "1" ]; then
    echo "[restore]   $idx: present"
  else
    echo "[restore] ERROR: $idx is missing from the restored database." >&2
    exit 1
  fi
done

if [ "$(psql_target -tAc "SELECT public.immutable_unaccent('Phú Quốc');" | tr -d '\r')" = "Phu Quoc" ]; then
  echo "[restore]   immutable_unaccent('Phú Quốc') = 'Phu Quoc': OK"
else
  echo "[restore] ERROR: immutable_unaccent did not behave as expected in the restored database." >&2
  exit 1
fi

echo
echo "[restore] RESTORE VERIFIED into '$TARGET_DB'."
echo "[restore] Compare row counts against expectation, e.g.:"
echo "[restore]   $COMPOSE exec -T postgres psql -U $PG_USER -d $TARGET_DB -c 'SELECT count(*) FROM places;'"
if [ "$TARGET_DB" != "phuquochub" ]; then
  echo "[restore] Rehearsal target -- drop it when finished:"
  echo "[restore]   $COMPOSE exec -T postgres psql -U $PG_USER -d postgres -c 'DROP DATABASE \"$TARGET_DB\";'"
fi
