#!/bin/bash
# PLACE-038 / Backup-Restore Hardening (2026-08-12) — nightly PostgreSQL logical backup for the
# production compose stack.
#
# Runs ON THE PRODUCTION VPS via cron against a real `docker-compose.prod.yml` deployment.
# Produces a timestamped, checksummed pg_dump and applies the Owner-approved retention policy
# (daily 7 / weekly 4 / monthly 6 — PLACE-037 §11). It never uploads anything; offsite is
# scripts/sync-offsite.sh.
#
# WHY bash and not sh: this script needs `set -o pipefail`. The previous `#!/bin/sh` version piped
# `pg_dump | gzip > file` with no pipefail, so a pg_dump failure was masked by gzip's exit 0 and
# produced a valid-looking .sql.gz containing a truncated or empty dump. That is the single most
# dangerous failure mode a backup script can have, and it is not fixable in portable POSIX sh.
#
# Format stays PLAIN SQL + gzip (unchanged, deliberately): every existing backup remains restorable,
# and the sectioned custom-format restore that the 2026-08-12 production rehearsal needed was only
# a workaround for the immutable_unaccent search_path bug — fixed properly at the source by
# migration 1720004400000, so a single-pass plain restore now works.
#
# Usage: scripts/backup.sh [compose-project-dir]
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR="${1:-$(dirname "$SCRIPT_DIR")}"
COMPOSE="docker compose -f $PROJECT_DIR/docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
PG_USER="${PG_USER:-phuquoc}"
PG_DB="${PG_DB:-phuquochub}"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BASENAME="phuquochub-$TIMESTAMP"
FINAL_FILE="$BACKUP_DIR/$BASENAME.sql.gz"
# Staging name deliberately does NOT match the phuquochub-*.sql.gz glob: an interrupted run can
# never leave behind a file that retention, restore, or the offsite sync would treat as a backup.
TMP_FILE="$BACKUP_DIR/.$BASENAME.sql.gz.partial"

mkdir -p "$BACKUP_DIR"

cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT INT TERM

echo "[backup] Confirming postgres is healthy before dumping..."
# `grep -qx`, NOT `grep -q`: Docker reports "unhealthy" for a failing container, and the substring
# "healthy" is contained in "unhealthy" — so the original `grep -q healthy` happily accepted an
# UNHEALTHY database, defeating the exact check it was written to perform. Anchoring to the whole
# line is the fix. (Found by scripts/tests/scripts.test.sh.)
if ! $COMPOSE ps postgres --format '{{.Health}}' 2>/dev/null | grep -qx healthy; then
  echo "[backup] ERROR: postgres service is not reporting healthy. Aborting -- a backup from an" >&2
  echo "[backup]        unhealthy database is not trustworthy." >&2
  exit 1
fi

echo "[backup] Dumping to $FINAL_FILE ..."
# pipefail makes a pg_dump failure fail the whole pipeline even though gzip succeeds.
$COMPOSE exec -T postgres pg_dump -U "$PG_USER" -d "$PG_DB" --format=plain | gzip > "$TMP_FILE"

# --- Validate BEFORE the file is allowed to become a real backup ------------------------------
echo "[backup] Validating archive integrity..."
if ! gzip -t "$TMP_FILE" 2>/dev/null; then
  echo "[backup] ERROR: gzip integrity check failed. Discarding partial dump." >&2
  exit 1
fi

# A dump that decompresses cleanly can still be empty or truncated. Require the structural markers
# pg_dump always emits, and a plausible size floor.
UNCOMPRESSED_BYTES=$(gzip -dc "$TMP_FILE" | wc -c | tr -d ' ')
if [ "$UNCOMPRESSED_BYTES" -lt 1024 ]; then
  echo "[backup] ERROR: dump is only ${UNCOMPRESSED_BYTES} bytes uncompressed -- refusing to publish" >&2
  echo "[backup]        an implausibly small backup." >&2
  exit 1
fi
if ! gzip -dc "$TMP_FILE" | grep -q 'PostgreSQL database dump complete'; then
  echo "[backup] ERROR: dump is missing pg_dump's completion marker -- it is truncated. Discarding." >&2
  exit 1
fi

# --- Publish atomically -------------------------------------------------------------------------
# mv within one filesystem is atomic: consumers see either no file or a fully validated one.
mv "$TMP_FILE" "$FINAL_FILE"
trap - EXIT INT TERM

# --- Integrity evidence -------------------------------------------------------------------------
# One .sha256 sidecar per backup, in `sha256sum -c` format, holding a BARE filename so the manifest
# verifies correctly regardless of the directory it is checked from (or restored into from R2).
( cd "$BACKUP_DIR" && sha256sum "$BASENAME.sql.gz" > "$BASENAME.sql.gz.sha256" )
echo "[backup] Dump complete: $(du -h "$FINAL_FILE" | cut -f1) ($UNCOMPRESSED_BYTES bytes uncompressed)"
echo "[backup] SHA256: $(cut -d' ' -f1 < "$BACKUP_DIR/$BASENAME.sql.gz.sha256")"

# --- Retention: daily 7 / weekly 4 / monthly 6 --------------------------------------------------
# Delegated to a shared, independently testable helper. The previous inline implementation was
# INVERTED: it kept a file when a NEWER file shared its week/month, so it deleted exactly the
# newest-per-week and newest-per-month files the policy exists to preserve, and enforced no caps at
# all. Verified against 20 dated fixtures: it destroyed every weekly and monthly backup, leaving a
# ~10-day recovery window instead of ~6 months.
# shellcheck source=scripts/lib/retention.sh
. "$SCRIPT_DIR/lib/retention.sh"
echo "[backup] Applying retention (daily 7 / weekly 4 / monthly 6)..."
apply_retention "$BACKUP_DIR" 'phuquochub-*.sql.gz' '.sql.gz'

echo "[backup] Local backup + retention complete."
echo "[backup] Offsite copy (R2) is a SEPARATE step -- run scripts/sync-offsite.sh, or schedule it"
echo "[backup] via cron after this script AND scripts/backup-media.sh. See that script's header."
