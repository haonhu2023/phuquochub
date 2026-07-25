#!/bin/sh
# PLACE-038 — offsite sync of local backups (pg_dump files + WAL archive) to Cloudflare R2
# (Owner-approved offsite destination, PLACE-037/038).
#
# Intended to run ON THE PRODUCTION VPS via cron, immediately after scripts/backup.sh, using
# `rclone` (not `aws s3`) because rclone is a single static binary with no runtime dependency
# tree -- simpler and more auditable to install on a fresh VPS than the full AWS CLI, and R2 is
# explicitly rclone-compatible via its S3-compatible API.
#
# NOT executed against any real R2 bucket by PLACE-038 itself -- no R2 credentials exist in this
# repository or session; this script exits early and loudly if they are not configured.
#
# One-time VPS setup (documented here, not automated -- installing a package is an infra
# decision that belongs to the real deployment, not to this repository):
#   1. Install rclone: https://rclone.org/install/
#   2. Configure a remote named "r2" pointing at the R2 bucket, using the env vars below
#      (rclone can read S3-compatible credentials directly from environment variables --
#      RCLONE_CONFIG_R2_TYPE=s3, RCLONE_CONFIG_R2_PROVIDER=Cloudflare,
#      RCLONE_CONFIG_R2_ACCESS_KEY_ID, RCLONE_CONFIG_R2_SECRET_ACCESS_KEY,
#      RCLONE_CONFIG_R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com --
#      no `rclone config` interactive step needed if these are all set).
#
# Usage: scripts/sync-offsite.sh [compose-project-dir]
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR="${1:-$(dirname "$SCRIPT_DIR")}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"

if [ -z "${R2_ACCOUNT_ID:-}" ] || [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ -z "${R2_BUCKET:-}" ]; then
  echo "[sync-offsite] R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET not all" >&2
  echo "[sync-offsite] set -- skipping offsite sync. Local backups in $BACKUP_DIR are unaffected." >&2
  echo "[sync-offsite] This is the expected, safe default until real R2 credentials are supplied." >&2
  exit 0
fi

if ! command -v rclone >/dev/null 2>&1; then
  echo "[sync-offsite] ERROR: rclone is not installed. See this script's header for setup steps." >&2
  exit 1
fi

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

echo "[sync-offsite] Syncing $BACKUP_DIR -> r2:$R2_BUCKET/backups ..."
rclone sync "$BACKUP_DIR" "r2:$R2_BUCKET/backups" --checksum

# Also mirror the WAL archive volume's current contents -- best-effort, since it's already
# durable locally via the volume itself; this is redundancy for the "gần 0 RPO" target
# (PLACE-037 §11 / deployment.md §11.1), not the primary WAL-durability mechanism.
if [ -n "${WAL_ARCHIVE_HOST_PATH:-}" ] && [ -d "$WAL_ARCHIVE_HOST_PATH" ]; then
  echo "[sync-offsite] Syncing $WAL_ARCHIVE_HOST_PATH -> r2:$R2_BUCKET/wal ..."
  rclone sync "$WAL_ARCHIVE_HOST_PATH" "r2:$R2_BUCKET/wal" --checksum
else
  echo "[sync-offsite] WAL_ARCHIVE_HOST_PATH not set -- skipping WAL mirror (dump backup already synced)."
fi

echo "[sync-offsite] Offsite sync complete."
