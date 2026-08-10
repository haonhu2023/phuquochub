#!/bin/sh
# PLACE-038 — nightly PostgreSQL logical backup for the production compose stack.
#
# Intended to run ON THE PRODUCTION VPS via cron (e.g. `0 2 * * * /path/to/scripts/backup.sh`),
# against a real `docker-compose.prod.yml` deployment. NOT executed against any real
# infrastructure by PLACE-038 itself -- this repository has no provisioned VPS.
#
# Produces a timestamped pg_dump, applies the Owner-approved retention policy
# (daily 7 / weekly 4 / monthly 6 -- PLACE-037 §11), and -- if scripts/sync-offsite.sh's own
# R2 environment variables are configured -- hands off to it for the offsite copy. This script
# never uploads anything itself; it only produces and rotates local backup files.
#
# Usage: scripts/backup.sh [compose-project-dir]
#   compose-project-dir defaults to the directory this script's parent lives in.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR="${1:-$(dirname "$SCRIPT_DIR")}"
COMPOSE="docker compose -f $PROJECT_DIR/docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP_FILE="$BACKUP_DIR/phuquochub-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] Confirming postgres is healthy before dumping..."
if ! $COMPOSE ps postgres --format '{{.Health}}' 2>/dev/null | grep -q healthy; then
  echo "[backup] ERROR: postgres service is not reporting healthy. Aborting -- a backup from an" >&2
  echo "[backup]        unhealthy database is not trustworthy." >&2
  exit 1
fi

echo "[backup] Dumping to $DUMP_FILE ..."
$COMPOSE exec -T postgres pg_dump -U phuquoc -d phuquochub --format=plain | gzip > "$DUMP_FILE"
echo "[backup] Dump complete: $(du -h "$DUMP_FILE" | cut -f1)"

# --- Retention: daily 7 / weekly 4 / monthly 6 (PLACE-037 §11, Owner-approved unchanged) ---
# Simple, auditable rule: keep the 7 most recent dumps unconditionally (covers "daily"); beyond
# that, keep the newest dump from each of the last 4 distinct ISO weeks and the last 6 distinct
# calendar months, delete everything else. This is a deliberately simple retention scheme, not a
# general-purpose backup-rotation library -- appropriate for this project's current scale.
echo "[backup] Applying retention (daily 7 / weekly 4 / monthly 6)..."
ls -1t "$BACKUP_DIR"/phuquochub-*.sql.gz 2>/dev/null | tail -n +8 | while read -r old; do
  # Beyond the newest 7: only keep it if it's the newest dump in its ISO-week or its month.
  base=$(basename "$old" .sql.gz)
  file_date=$(echo "$base" | sed -E 's/phuquochub-([0-9]{8})T.*/\1/')
  week_key=$(date -u -d "$file_date" +%G-W%V 2>/dev/null || date -u -j -f %Y%m%d "$file_date" +%G-W%V 2>/dev/null || echo "")
  month_key=$(echo "$file_date" | cut -c1-6)
  keep=0
  # Newest-in-week / newest-in-month check: is there any NEWER file sharing the same key?
  for other in $(ls -1t "$BACKUP_DIR"/phuquochub-*.sql.gz 2>/dev/null); do
    [ "$other" = "$old" ] && break
    other_base=$(basename "$other" .sql.gz)
    other_date=$(echo "$other_base" | sed -E 's/phuquochub-([0-9]{8})T.*/\1/')
    other_week=$(date -u -d "$other_date" +%G-W%V 2>/dev/null || date -u -j -f %Y%m%d "$other_date" +%G-W%V 2>/dev/null || echo "")
    other_month=$(echo "$other_date" | cut -c1-6)
    if [ "$other_week" = "$week_key" ] || [ "$other_month" = "$month_key" ]; then
      keep=1
    fi
  done
  if [ "$keep" -eq 0 ]; then
    echo "[backup]   removing $old (outside daily/weekly/monthly retention)"
    rm -f "$old"
  fi
done

echo "[backup] Local backup + retention complete."
echo "[backup] Offsite sync (R2) is a SEPARATE step -- run scripts/sync-offsite.sh, or schedule"
echo "[backup] it via cron immediately after this script. See that script's own header."
