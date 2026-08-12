#!/bin/bash
# PLACE-038 / Backup-Restore Hardening (2026-08-12) — offsite copy of local backups to Cloudflare R2
# (Owner-approved offsite destination, PLACE-037/038).
#
# Runs ON THE PRODUCTION VPS via cron, after BOTH scripts/backup.sh and scripts/backup-media.sh.
# Copies three trees when each is present:
#   1. PostgreSQL logical backups   BACKUP_DIR            -> r2:$R2_BUCKET/backups
#   2. MinIO media snapshots        MEDIA_BACKUP_DIR      -> r2:$R2_BUCKET/media
#   3. WAL archive (optional)       WAL_ARCHIVE_HOST_PATH -> r2:$R2_BUCKET/wal
#
# STATUS 2026-08-12: rclone is NOT installed on production and no R2 credentials exist. This script
# is written and tested but has NEVER run against a real bucket. With credentials absent it exits 0
# without doing anything, which is the intended steady state until the Owner provisions R2.
#
# ## `copy`, NOT `sync` — this is a correctness fix, not a preference ###########################
# The previous version used `rclone sync`, which DELETES destination files that no longer exist
# locally. Combined with local retention (daily 7 / weekly 4 / monthly 6), that made the offsite
# copy strictly WORSE than useless: every night, retention prunes local backups, and the next sync
# would faithfully delete those same backups from R2. The offsite archive could never hold more
# history than the local disk, which defeats the entire reason for having it — and a local
# ransomware/rm -rf event would propagate to the offsite copy on the next run.
#
# `copy` is additive: it uploads what is missing and never deletes remotely. Offsite retention is
# therefore governed by R2 lifecycle rules (an Owner/console decision, documented in the runbook),
# not by whatever happens to be on the VPS disk tonight. For immutable, checksummed backup archives
# this is the correct semantic: the remote is an append-only vault, not a mirror.
#
# One-time VPS setup (documented, not automated):
#   1. Install rclone: https://rclone.org/install/
#   2. Export R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET in the cron
#      environment. No interactive `rclone config` step is needed.
#
# Usage: scripts/sync-offsite.sh [compose-project-dir]
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR="${1:-$(dirname "$SCRIPT_DIR")}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
MEDIA_BACKUP_DIR="${MEDIA_BACKUP_DIR:-$PROJECT_DIR/backups/media}"
RCLONE_BIN="${RCLONE_BIN:-rclone}"

if [ -z "${R2_ACCOUNT_ID:-}" ] || [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ -z "${R2_BUCKET:-}" ]; then
  echo "[sync-offsite] R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET not all" >&2
  echo "[sync-offsite] set -- skipping offsite copy. Local backups are unaffected." >&2
  echo "[sync-offsite] This is the expected, safe default until real R2 credentials are supplied." >&2
  exit 0
fi

if ! command -v "$RCLONE_BIN" >/dev/null 2>&1; then
  echo "[sync-offsite] ERROR: rclone is not installed, but R2 credentials ARE configured -- so an" >&2
  echo "[sync-offsite]        offsite copy was genuinely requested and cannot be performed." >&2
  echo "[sync-offsite]        See this script's header for setup steps." >&2
  exit 1
fi

# Credentials go into the environment for the child process only; they are never echoed and never
# appear as command-line arguments (which would be visible in `ps`).
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# copy_tree <local-dir> <remote-subpath> <human label>
# --immutable makes rclone fail loudly if a file that already exists remotely has changed locally.
# For a backup vault that is exactly what we want: an archive is written once and never rewritten,
# so a modified archive means something is wrong and should be investigated, not silently uploaded.
copy_tree() {
  ct_dir="$1"; ct_remote="$2"; ct_label="$3"
  if [ ! -d "$ct_dir" ]; then
    echo "[sync-offsite] $ct_label: $ct_dir does not exist -- skipping."
    return 0
  fi
  if [ -z "$(ls -A "$ct_dir" 2>/dev/null)" ]; then
    echo "[sync-offsite] $ct_label: $ct_dir is empty -- skipping."
    return 0
  fi
  echo "[sync-offsite] $ct_label: copying $ct_dir -> r2:$R2_BUCKET/$ct_remote ..."
  "$RCLONE_BIN" copy "$ct_dir" "r2:$R2_BUCKET/$ct_remote" --checksum --immutable
}

# The media snapshots live UNDER backups/ by default, so exclude them from the database tree to
# avoid uploading the same bytes twice under two different remote prefixes.
echo "[sync-offsite] Copying PostgreSQL logical backups ..."
"$RCLONE_BIN" copy "$BACKUP_DIR" "r2:$R2_BUCKET/backups" \
  --checksum --immutable --exclude "media/**"

copy_tree "$MEDIA_BACKUP_DIR" "media" "MinIO media snapshots"

if [ -n "${WAL_ARCHIVE_HOST_PATH:-}" ]; then
  copy_tree "$WAL_ARCHIVE_HOST_PATH" "wal" "WAL archive"
else
  echo "[sync-offsite] WAL_ARCHIVE_HOST_PATH not set -- skipping WAL copy."
  echo "[sync-offsite] (WAL archiving itself is unaffected; this only governs the offsite copy.)"
fi

echo "[sync-offsite] Offsite copy complete. Nothing was deleted remotely -- retention on R2 is"
echo "[sync-offsite] governed by bucket lifecycle rules, not by this script."
