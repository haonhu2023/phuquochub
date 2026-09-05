#!/bin/sh
# Creates a checksum-verified release source archive from an exact git commit, for
# scripts/sync-release-source.sh to apply on a deploy tree that is not a git checkout (see
# scripts/lib/release-manifest.sh for why that tree needs this at all).
#
# Run this on a real, trusted git checkout (a developer machine or CI) -- never on the deploy
# host, which is exactly the untrusted side of this problem.
#
# Usage: scripts/create-release-archive.sh <git-sha-or-ref> [output-dir]
set -eu

REF="${1:?Usage: scripts/create-release-archive.sh <git-sha-or-ref> [output-dir]}"
OUT_DIR="${2:-.}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$SCRIPT_DIR")

cd "$REPO_ROOT"
SHA=$(git rev-parse "$REF")
ARCHIVE="$OUT_DIR/phuquochub-source-$SHA.tar.gz"
MANIFEST="$OUT_DIR/release-manifest-$SHA.txt"

# core.autocrlf=false is not optional: this repo has no .gitattributes, so on a checkout with
# autocrlf=true (the common Windows Git default) `git archive` silently rewrites every LF to CRLF
# in the exported tarball, while `git show`/`git cat-file` do not -- found the hard way when a
# CRLF-corrupted archive would have shipped shebang scripts that fail to exec on Linux ("bad
# interpreter"). Forcing it off makes the archive byte-identical to the real git blobs regardless
# of which machine generates it.
git -c core.autocrlf=false archive --format=tar.gz -o "$ARCHIVE" "$SHA"

ARCHIVE_SHA256=$(sha256sum "$ARCHIVE" | awk '{print $1}')
MIGRATION_COUNT=$(git ls-tree -r --name-only "$SHA" -- apps/api/src/core/database/migrations \
  | grep -cE '/[0-9]+-[^/]+\.ts$')

{
  echo "release_sha=$SHA"
  echo "archive_sha256=$ARCHIVE_SHA256"
  echo "migration_count=$MIGRATION_COUNT"
  echo "generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$MANIFEST"

echo "[create-release-archive] wrote $ARCHIVE"
echo "[create-release-archive] wrote $MANIFEST:"
cat "$MANIFEST"
echo "[create-release-archive] Transfer both files to the deploy host, then run"
echo "[create-release-archive] scripts/sync-release-source.sh $ARCHIVE $MANIFEST <project-dir> there."
