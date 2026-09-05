#!/bin/sh
# Applies a checksum-verified release source archive (from scripts/create-release-archive.sh) onto
# a deploy tree that is not a git checkout ([[migrate-builds-from-prod-tree]]), and records what it
# applied in PROJECT_DIR/.release-manifest so scripts/deploy.sh can refuse to build a mismatched
# release (scripts/lib/release-manifest.sh). This is now the ONLY supported way to update that
# tree before a release -- a manual/ad hoc copy leaves no manifest, so deploy.sh's gate will
# correctly refuse to build from it.
#
# Replaces the tree's tracked files with the exact verified snapshot (rsync --delete) so no stale
# file from a previous manual edit can survive alongside the new release, while preserving the
# runtime-only files that are never part of the git tree: .env (secrets) and backups/ (nightly
# dump destination) and .offsite-backup.lock.
#
# Usage: scripts/sync-release-source.sh <archive.tar.gz> <manifest.txt> <project-dir>
set -eu

ARCHIVE="${1:?Usage: scripts/sync-release-source.sh <archive.tar.gz> <manifest.txt> <project-dir>}"
MANIFEST="${2:?Usage: scripts/sync-release-source.sh <archive.tar.gz> <manifest.txt> <project-dir>}"
PROJECT_DIR="${3:?Usage: scripts/sync-release-source.sh <archive.tar.gz> <manifest.txt> <project-dir>}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib/release-manifest.sh
. "$SCRIPT_DIR/lib/release-manifest.sh"

[ -f "$ARCHIVE" ] || { echo "[sync-release-source] ERROR: archive not found: $ARCHIVE" >&2; exit 1; }
[ -f "$MANIFEST" ] || { echo "[sync-release-source] ERROR: manifest not found: $MANIFEST" >&2; exit 1; }
[ -d "$PROJECT_DIR" ] || { echo "[sync-release-source] ERROR: project dir not found: $PROJECT_DIR" >&2; exit 1; }

RELEASE_SHA=$(awk -F= '$1=="release_sha"{print $2}' "$MANIFEST")
EXPECTED_ARCHIVE_SHA256=$(awk -F= '$1=="archive_sha256"{print $2}' "$MANIFEST")
EXPECTED_MIGRATION_COUNT=$(awk -F= '$1=="migration_count"{print $2}' "$MANIFEST")

[ -n "$RELEASE_SHA" ] || { echo "[sync-release-source] ERROR: manifest has no release_sha." >&2; exit 1; }
[ -n "$EXPECTED_ARCHIVE_SHA256" ] || { echo "[sync-release-source] ERROR: manifest has no archive_sha256." >&2; exit 1; }

echo "[sync-release-source] Verifying archive checksum against manifest for $RELEASE_SHA ..."
ACTUAL_ARCHIVE_SHA256=$(sha256sum "$ARCHIVE" | awk '{print $1}')
if [ "$ACTUAL_ARCHIVE_SHA256" != "$EXPECTED_ARCHIVE_SHA256" ]; then
  echo "[sync-release-source] REFUSING: archive checksum mismatch." >&2
  echo "[sync-release-source]   expected: $EXPECTED_ARCHIVE_SHA256" >&2
  echo "[sync-release-source]   actual:   $ACTUAL_ARCHIVE_SHA256" >&2
  exit 1
fi

STAGING_DIR=$(mktemp -d)
trap 'rm -rf "$STAGING_DIR"' EXIT
tar -xzf "$ARCHIVE" -C "$STAGING_DIR"

ACTUAL_MIGRATION_COUNT=$(find "$STAGING_DIR/apps/api/src/core/database/migrations" -maxdepth 1 -name '*.ts' 2>/dev/null | wc -l | tr -d ' ')
if [ -n "$EXPECTED_MIGRATION_COUNT" ] && [ "$ACTUAL_MIGRATION_COUNT" != "$EXPECTED_MIGRATION_COUNT" ]; then
  echo "[sync-release-source] REFUSING: manifest claims $EXPECTED_MIGRATION_COUNT migration file(s)" >&2
  echo "[sync-release-source]   for $RELEASE_SHA but the verified archive actually contains" >&2
  echo "[sync-release-source]   $ACTUAL_MIGRATION_COUNT. Refusing to apply a manifest that does not" >&2
  echo "[sync-release-source]   describe its own archive correctly." >&2
  exit 1
fi

echo "[sync-release-source] Archive verified. Applying $RELEASE_SHA ($ACTUAL_MIGRATION_COUNT migrations) onto $PROJECT_DIR ..."
rsync -a --delete \
  --exclude='.env' \
  --exclude='backups/' \
  --exclude='.offsite-backup.lock' \
  "$STAGING_DIR/" "$PROJECT_DIR/"

release_manifest_write "$PROJECT_DIR" "$RELEASE_SHA" "$ACTUAL_ARCHIVE_SHA256" "$ACTUAL_MIGRATION_COUNT"
echo "[sync-release-source] Done. $PROJECT_DIR/.release-manifest now records $RELEASE_SHA."
