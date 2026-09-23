#!/bin/bash
# Backup-Restore Hardening (2026-08-12) — rehearse restoring a MinIO media snapshot into an
# ISOLATED test bucket, then verify object-for-object that the restore is byte-identical.
#
# This automates the verification half of the procedure operators ran by hand on 2026-08-12. It is
# deliberately SEPARATE from scripts/backup-media.sh: the nightly job must not create and delete a
# bucket every single night.
#
# ############################################################################################
# ## NEVER point this at the production bucket. It WRITES objects into its target bucket.     ##
# ## The target must be a scratch bucket, and this script refuses to run against the          ##
# ## configured production bucket name.                                                       ##
# ############################################################################################
#
# What it does NOT do: it never reads from, writes to, or deletes anything in the production
# bucket. It works purely from a local snapshot directory produced by backup-media.sh.
#
# Usage:
#   scripts/restore-media-rehearsal.sh <snapshot-dir> [test-bucket-name]
# e.g.
#   scripts/restore-media-rehearsal.sh backups/media/media-20260812T030000Z
#
# Cleanup is automatic unless KEEP_TEST_BUCKET=1.
#
# CONNECTIVITY (Docker-Internal MinIO Backups, 2026-08-12): identical model to backup-media.sh --
# `mc` runs as an ephemeral pinned container on the compose network, reaching MinIO over Docker DNS
# at `minio:9000`. No host port, no public edge. See scripts/lib/mc-docker.sh.
#
# CREDENTIAL: this rehearsal CREATES and DELETES a scratch bucket, so it cannot use the read-only
# backup service account that backup-media.sh uses. Point MC_CONFIG_DIR at a separate config
# holding a credential permitted to manage scratch buckets -- and still never the root credential.
# The production bucket remains refused as a target regardless of which credential is supplied.
set -euo pipefail

SNAPSHOT_DIR="${1:?Usage: scripts/restore-media-rehearsal.sh <snapshot-dir> [test-bucket-name]}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MC_ALIAS="${MC_ALIAS:-phuquoc-backup}"
MEDIA_BUCKET="${MEDIA_BUCKET:-phuquochub-prod}"
# Same Docker-internal client as backup-media.sh; the snapshot dir is bind-mounted by the wrapper.
MC_BIN="${MC_BIN:-$SCRIPT_DIR/lib/mc-docker.sh}"
# Lowercase digits/hyphens only: `date -u +%Y%m%dT%H%M%SZ` produces an uppercase T/Z, which
# S3/MinIO bucket names reject outright.
TEST_BUCKET="${2:-phuquochub-restore-test-$(date -u +%Y%m%d-%H%M%S)}"

# Validate the bucket name (default or operator-supplied) BEFORE any MinIO operation. Invalid
# input fails closed -- it is never silently lowercased or otherwise rewritten, because a script
# that "fixes" a caller's typo could just as easily "fix" its way into a name the caller did not
# intend.
validate_bucket_name() {
  local bucket="$1" len
  len=${#bucket}
  if [ "$len" -lt 3 ] || [ "$len" -gt 63 ]; then
    echo "[media-rehearsal] ERROR: bucket name '$bucket' must be 3-63 characters (got $len)." >&2
    exit 1
  fi
  case "$bucket" in
    [a-z0-9]*[a-z0-9])
      case "$bucket" in
        *[!a-z0-9-]*)
          echo "[media-rehearsal] ERROR: bucket name '$bucket' may only contain lowercase" >&2
          echo "[media-rehearsal]        letters, digits, and hyphens." >&2
          exit 1
          ;;
      esac
      ;;
    *)
      echo "[media-rehearsal] ERROR: bucket name '$bucket' must start and end with a lowercase" >&2
      echo "[media-rehearsal]        letter or digit." >&2
      exit 1
      ;;
  esac
}
validate_bucket_name "$TEST_BUCKET"

# Hard guard: never write into production, whatever was passed in.
if [ "$TEST_BUCKET" = "$MEDIA_BUCKET" ]; then
  echo "[media-rehearsal] ERROR: refusing to use the production bucket ('$MEDIA_BUCKET') as the" >&2
  echo "[media-rehearsal]        restore target. Pass a scratch bucket name." >&2
  exit 1
fi

if [ ! -d "$SNAPSHOT_DIR" ]; then
  echo "[media-rehearsal] ERROR: snapshot directory $SNAPSHOT_DIR does not exist." >&2
  exit 1
fi

# Canonicalize to an absolute, symlink-resolved path BEFORE it is compared against the backup
# root or handed to the containerized mc client. mc runs inside a container where only
# MEDIA_BACKUP_DIR is bind-mounted at a matching absolute path; a relative SNAPSHOT_DIR would be
# resolved against the CONTAINER's working directory, not the host's, and silently find nothing.
SNAPSHOT_DIR=$(CDPATH= cd -P -- "$SNAPSHOT_DIR" && pwd -P)

# The wrapper bind-mounts MEDIA_BACKUP_DIR; the snapshot being restored lives under it, so point
# the mount at the snapshot's parent unless the operator has already set it explicitly. Canonicalize
# either way so the containment check below compares two real, symlink-resolved paths.
MEDIA_BACKUP_DIR="${MEDIA_BACKUP_DIR:-$(dirname -- "$SNAPSHOT_DIR")}"
if [ ! -d "$MEDIA_BACKUP_DIR" ]; then
  echo "[media-rehearsal] ERROR: MEDIA_BACKUP_DIR '$MEDIA_BACKUP_DIR' does not exist." >&2
  exit 1
fi
MEDIA_BACKUP_DIR=$(CDPATH= cd -P -- "$MEDIA_BACKUP_DIR" && pwd -P)
export MEDIA_BACKUP_DIR

# Refuse a snapshot that resolves outside the bind-mounted backup root -- via `..` traversal or a
# symlink -- since the containerized mc client can only ever see paths under MEDIA_BACKUP_DIR, and
# a path that escapes it has no business being fed to a restore rehearsal in the first place.
case "$SNAPSHOT_DIR" in
  "$MEDIA_BACKUP_DIR" | "$MEDIA_BACKUP_DIR"/*) : ;;
  *)
    echo "[media-rehearsal] ERROR: snapshot directory $SNAPSHOT_DIR resolves outside the media" >&2
    echo "[media-rehearsal]        backup root $MEDIA_BACKUP_DIR -- refusing." >&2
    exit 1
    ;;
esac

if [ ! -f "$SNAPSHOT_DIR/SHA256SUMS" ]; then
  echo "[media-rehearsal] ERROR: $SNAPSHOT_DIR has no SHA256SUMS manifest -- refusing to rehearse" >&2
  echo "[media-rehearsal]        against an unverifiable snapshot." >&2
  exit 1
fi

if ! command -v "$MC_BIN" >/dev/null 2>&1; then
  echo "[media-rehearsal] ERROR: MinIO client '$MC_BIN' not found on PATH." >&2
  exit 1
fi

echo "[media-rehearsal] Step 1/4 — verifying the local snapshot manifest ..."
if ! ( cd "$SNAPSHOT_DIR" && sha256sum -c SHA256SUMS >/dev/null 2>&1 ); then
  echo "[media-rehearsal] ERROR: snapshot manifest does not verify. This backup is damaged." >&2
  exit 1
fi
echo "[media-rehearsal]   local manifest: OK"

cleanup() {
  if [ "${KEEP_TEST_BUCKET:-0}" = "1" ]; then
    echo "[media-rehearsal] KEEP_TEST_BUCKET=1 -- leaving $MC_ALIAS/$TEST_BUCKET in place."
    return
  fi
  echo "[media-rehearsal] Cleaning up test bucket $MC_ALIAS/$TEST_BUCKET ..."
  "$MC_BIN" rb --force "$MC_ALIAS/$TEST_BUCKET" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "[media-rehearsal] Step 2/4 — creating isolated test bucket $TEST_BUCKET ..."
if ! "$MC_BIN" mb "$MC_ALIAS/$TEST_BUCKET" >/dev/null 2>&1; then
  echo "[media-rehearsal] ERROR: could not create test bucket." >&2
  exit 1
fi

echo "[media-rehearsal] Step 3/4 — restoring snapshot into the test bucket ..."
# Manifest is snapshot metadata, not a media object; keep it out of the restored bucket.
if ! "$MC_BIN" mirror --quiet --exclude 'SHA256SUMS' "$SNAPSHOT_DIR" "$MC_ALIAS/$TEST_BUCKET" >/dev/null 2>&1; then
  echo "[media-rehearsal] ERROR: restore into test bucket failed." >&2
  exit 1
fi

echo "[media-rehearsal] Step 4/4 — verifying restored objects are byte-identical ..."
# MUST live under MEDIA_BACKUP_DIR, not /tmp: the mc client runs in a container and only
# MEDIA_BACKUP_DIR is bind-mounted at a shared absolute path. A /tmp scratch dir would be written
# INSIDE the container and the host would read back an empty directory -- the verification would
# then be comparing nothing against nothing. Leading dot keeps it out of the `media-*` glob that
# retention and the offsite sync walk.
VERIFY_DIR=$(mktemp -d "$MEDIA_BACKUP_DIR/.restore-verify-XXXXXX")
trap 'rm -rf "$VERIFY_DIR"; cleanup' EXIT INT TERM
if ! "$MC_BIN" mirror --quiet "$MC_ALIAS/$TEST_BUCKET" "$VERIFY_DIR" >/dev/null 2>&1; then
  echo "[media-rehearsal] ERROR: could not read back the restored objects." >&2
  exit 1
fi

# Re-verify the ORIGINAL manifest against what came back out of the test bucket: snapshot -> bucket
# -> download must reproduce every checksum exactly.
cp "$SNAPSHOT_DIR/SHA256SUMS" "$VERIFY_DIR/SHA256SUMS"
if ( cd "$VERIFY_DIR" && sha256sum -c SHA256SUMS >/dev/null 2>&1 ); then
  OBJECTS=$(grep -c . "$SNAPSHOT_DIR/SHA256SUMS" || echo 0)
  echo "[media-rehearsal]   round-trip checksums: OK ($OBJECTS object(s))"
  echo
  echo "[media-rehearsal] MINIO_RESTORE_TEST=PASS"
else
  echo "[media-rehearsal] ERROR: restored objects do NOT match the snapshot checksums." >&2
  echo "[media-rehearsal] MINIO_RESTORE_TEST=FAIL" >&2
  exit 1
fi

echo "[media-rehearsal] Production bucket '$MEDIA_BUCKET' was never accessed by this script."
