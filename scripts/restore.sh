#!/bin/sh
# PLACE-038 — restore a PostgreSQL logical backup produced by scripts/backup.sh.
#
# Intended to run ON A REAL VPS (production disaster recovery, or a staging/restore-test
# rehearsal per PLACE-037 §11's quarterly restore-test requirement). NOT executed against any
# real database by PLACE-038 itself.
#
# This script handles the pg_dump-based restore path only (deterministic, scriptable). A
# WAL-based point-in-time restore (PITR) to a moment between two dumps is a real capability
# (WAL archiving is already enabled -- see infrastructure/docker/postgres/postgresql.prod.conf)
# but is deliberately NOT scripted here: choosing the correct PITR target and validating the
# result requires situation-specific judgment that a blanket script would risk getting wrong
# silently. Follow PostgreSQL's own `recovery_target_time` documentation for a real PITR
# restore, using the WAL segments already archived in the wal_archive_prod volume (or its R2
# mirror, once scripts/sync-offsite.sh has been running).
#
# Usage: scripts/restore.sh <path-to-backup.sql.gz> [compose-project-dir]
#
# DESTRUCTIVE: this overwrites the target database. Requires explicit "yes" confirmation.
set -eu

BACKUP_FILE="${1:?Usage: scripts/restore.sh <path-to-backup.sql.gz> [compose-project-dir]}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR="${2:-$(dirname "$SCRIPT_DIR")}"
COMPOSE="docker compose -f $PROJECT_DIR/docker-compose.prod.yml"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore] ERROR: $BACKUP_FILE does not exist." >&2
  exit 1
fi

echo "[restore] This will DROP and RECREATE the 'phuquochub' database on the target compose"
echo "[restore] stack's postgres service, then load: $BACKUP_FILE"
echo "[restore] This is DESTRUCTIVE to any data currently in that database."
printf '[restore] Type "yes" to continue: '
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "[restore] Aborted -- no changes made."
  exit 1
fi

echo "[restore] Confirming postgres is reachable..."
if ! $COMPOSE ps postgres --format '{{.Health}}' 2>/dev/null | grep -q healthy; then
  echo "[restore] ERROR: postgres service is not reporting healthy. Aborting." >&2
  exit 1
fi

echo "[restore] Terminating existing connections and recreating the database..."
$COMPOSE exec -T postgres psql -U phuquoc -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'phuquochub' AND pid <> pg_backend_pid();"
$COMPOSE exec -T postgres psql -U phuquoc -d postgres -c "DROP DATABASE IF EXISTS phuquochub;"
$COMPOSE exec -T postgres psql -U phuquoc -d postgres -c "CREATE DATABASE phuquochub OWNER phuquoc;"

echo "[restore] Loading $BACKUP_FILE ..."
gunzip -c "$BACKUP_FILE" | $COMPOSE exec -T postgres psql -U phuquoc -d phuquochub

echo "[restore] Restore complete. Verify with: docker compose -f $PROJECT_DIR/docker-compose.prod.yml exec postgres psql -U phuquoc -d phuquochub -c 'SELECT count(*) FROM places;'"
echo "[restore] Also re-run migrations if the backup predates the currently-deployed schema:"
echo "[restore]   npm run migration:run --workspace @phuquochub/api"
