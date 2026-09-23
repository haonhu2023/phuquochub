#!/bin/bash
# Backup-Restore Hardening (2026-08-12) — object-level backup of the production MinIO media bucket.
#
# Automates the BACKUP half of the procedure operators proved by hand on 2026-08-12:
#   bucket -> mc mirror to staging -> SHA256SUMS -> sha256sum -c -> (restore rehearsal, separate)
# The restore-rehearsal half is deliberately NOT run here: creating and deleting a test bucket every
# night is needless risk and noise. Rehearse with scripts/restore-media-rehearsal.sh, on a cadence.
#
# Runs ON THE PRODUCTION VPS via cron, after scripts/backup.sh. Produces a timestamped snapshot
# directory plus a verified SHA256 manifest, then ages snapshots out under the same
# daily 7 / weekly 4 / monthly 6 policy as the database backups.
#
# SAFETY PROPERTIES:
#   * READ-ONLY against production. `mc mirror` is used one-way, bucket -> local, and never with
#     --remove, so it can never delete a production object.
#   * Never touches MinIO's internal .minio.sys tree — object-level API only.
#   * Credentials are read from an mc alias configured out-of-band, or from env vars; they are never
#     echoed, never written into the snapshot, and never passed on a command line where `ps` sees
#     them.
#   * Staged in a temporary directory and only promoted to its final name after the manifest
#     verifies, so an interrupted run cannot leave a snapshot that looks complete.
#
# VERSIONING LIMITATION (accurate as of 2026-08-12): the production bucket is UN-VERSIONED with
# Object Lock disabled. This snapshot is therefore a point-in-time copy only. An object deleted or
# overwritten in production between two runs is recoverable ONLY from a snapshot taken before the
# change — there is no in-bucket version history to fall back on. Enabling bucket versioning is an
# Owner decision with storage-cost implications, tracked in the runbook's open items.
#
# HOW `mc` REACHES MINIO (Docker-Internal MinIO Backups, 2026-08-12). MinIO publishes NO host
# port -- it exists only as `minio:9000` inside the compose network. So `mc` does NOT run on the
# host; it runs as an ephemeral, pinned container joined to that same network, via the default
# MC_BIN below. See scripts/lib/mc-docker.sh for the full rationale and the credential boundary.
# Set MC_BIN=mc to force a native host client instead (only useful where a route actually exists).
#
# One-time VPS setup (documented, not automated — installing software is a deployment decision):
#   1. Create a READ-ONLY MinIO service account (ListBucket + GetObject on the media bucket only;
#      never the root credential, never the app's write credential).
#   2. Write its keys into $MC_CONFIG_DIR/config.json (default ~/.mc-backup), mode 0600, with the
#      alias URL set to http://minio:9000. Full steps in docs/delivery/BACKUP-RESTORE-RUNBOOK.md.
#
# Usage: scripts/backup-media.sh [compose-project-dir]
#   MC_ALIAS       (default: phuquoc-backup)  alias name inside the mounted mc config
#   MEDIA_BUCKET   (default: phuquochub-prod) source bucket
#   MEDIA_BACKUP_DIR (default: <project>/backups/media)
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR="${1:-$(dirname "$SCRIPT_DIR")}"
MC_ALIAS="${MC_ALIAS:-phuquoc-backup}"
MEDIA_BUCKET="${MEDIA_BUCKET:-phuquochub-prod}"
MEDIA_BACKUP_DIR="${MEDIA_BACKUP_DIR:-$PROJECT_DIR/backups/media}"
# Default to the Docker-internal client: on this topology a host-installed `mc` has no route.
MC_BIN="${MC_BIN:-$SCRIPT_DIR/lib/mc-docker.sh}"
export MEDIA_BACKUP_DIR PROJECT_DIR
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
SNAPSHOT_NAME="media-$TIMESTAMP"
FINAL_DIR="$MEDIA_BACKUP_DIR/$SNAPSHOT_NAME"
# Leading dot keeps an in-progress snapshot outside the media-* glob used by retention and offsite.
STAGING_DIR="$MEDIA_BACKUP_DIR/.$SNAPSHOT_NAME.partial"

mkdir -p "$MEDIA_BACKUP_DIR"

cleanup() {
  # Remove staging on ANY non-success exit so a failed run never leaves a half-mirrored tree.
  [ -d "$STAGING_DIR" ] && rm -rf "$STAGING_DIR"
}
trap cleanup EXIT INT TERM

if ! command -v "$MC_BIN" >/dev/null 2>&1; then
  echo "[backup-media] ERROR: MinIO client '$MC_BIN' not found on PATH." >&2
  echo "[backup-media]        See this script's header for one-time setup." >&2
  exit 1
fi

# Confirm the alias resolves and the bucket is reachable BEFORE creating any staging state.
# Output is discarded: `mc` can echo endpoint/credential detail on failure.
echo "[backup-media] Checking access to $MC_ALIAS/$MEDIA_BUCKET ..."
if ! "$MC_BIN" ls "$MC_ALIAS/$MEDIA_BUCKET" >/dev/null 2>&1; then
  echo "[backup-media] ERROR: cannot list $MC_ALIAS/$MEDIA_BUCKET. Is the alias configured and the" >&2
  echo "[backup-media]        bucket name correct? (No credential detail is printed by design.)" >&2
  exit 1
fi

mkdir -p "$STAGING_DIR"

echo "[backup-media] Mirroring $MC_ALIAS/$MEDIA_BUCKET -> staging ..."
# One-way, additive. NO --remove: this command must never be able to delete a production object.
if ! "$MC_BIN" mirror --quiet "$MC_ALIAS/$MEDIA_BUCKET" "$STAGING_DIR" >/dev/null 2>&1; then
  echo "[backup-media] ERROR: mc mirror failed. Discarding partial snapshot." >&2
  exit 1
fi

OBJECT_COUNT=$(find "$STAGING_DIR" -type f | wc -l | tr -d ' ')
echo "[backup-media] Mirrored $OBJECT_COUNT object(s)."

# An empty mirror is ambiguous: it means either a genuinely empty bucket or a silent auth/prefix
# failure. Treat it as an error unless the operator asserts the bucket really is empty.
if [ "$OBJECT_COUNT" -eq 0 ] && [ "${ALLOW_EMPTY_MEDIA_BACKUP:-0}" != "1" ]; then
  echo "[backup-media] ERROR: mirrored 0 objects. Refusing to publish an empty snapshot." >&2
  echo "[backup-media]        If the bucket is genuinely empty, re-run with ALLOW_EMPTY_MEDIA_BACKUP=1." >&2
  exit 1
fi

echo "[backup-media] Generating SHA256 manifest ..."
# Paths are recorded RELATIVE to the snapshot root so the manifest verifies after the directory is
# renamed, moved, or pulled back down from offsite storage.
( cd "$STAGING_DIR" && find . -type f ! -name 'SHA256SUMS' -print0 | sort -z \
    | xargs -0 -r sha256sum > SHA256SUMS )

echo "[backup-media] Verifying manifest ..."
if ! ( cd "$STAGING_DIR" && sha256sum -c SHA256SUMS >/dev/null 2>&1 ); then
  echo "[backup-media] ERROR: manifest verification FAILED against the freshly mirrored files." >&2
  echo "[backup-media]        Discarding snapshot rather than publishing an unverified one." >&2
  exit 1
fi
echo "[backup-media]   manifest: OK ($OBJECT_COUNT object(s))"

# Promote atomically. Consumers see either nothing or a fully verified snapshot.
mv "$STAGING_DIR" "$FINAL_DIR"
trap - EXIT INT TERM

echo "[backup-media] Snapshot complete: $FINAL_DIR ($(du -sh "$FINAL_DIR" | cut -f1))"

# --- Retention: same policy and same implementation as the database backups --------------------
# shellcheck source=scripts/lib/retention.sh
. "$SCRIPT_DIR/lib/retention.sh"
echo "[backup-media] Applying retention (daily 7 / weekly 4 / monthly 6)..."
apply_retention "$MEDIA_BACKUP_DIR" 'media-*' ''

echo "[backup-media] Media backup + retention complete."
echo "[backup-media] Production bucket was READ ONLY throughout; no object was modified or removed."
