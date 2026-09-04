# Release-source-manifest helpers (2026-09-04) -- closes the gap found during the 449c637
# recovery incident: `docker-compose.prod.yml`'s `migrate`/`api`/`web` services all `build:` from
# the production VPS's own on-disk source tree ([[migrate-builds-from-prod-tree]]), which is not a
# git checkout. Nothing previously verified that tree actually held the commit a deploy claimed to
# release -- `scripts/deploy.sh <sha>` tagged whatever was already on disk as `<sha>` with no check
# in between, so a forgotten source sync silently shipped stale code under the right-looking tag.
#
# A `.release-manifest` file at the project root now records which git commit the tree was last
# verified to hold, plus how many migration files it had at that moment. `release_manifest_verify`
# is the fail-closed gate: it refuses to let a build proceed unless the manifest's sha matches the
# tag being deployed AND the migrations directory still has exactly as many files as when the tree
# was synced (so a manifest that has gone stale relative to a since-edited tree is caught too).
#
# This is deliberately NOT a git-based check -- the whole point is that this tree has no `.git`.
# The manifest is the tree's only durable memory of "what commit is this," so
# `scripts/sync-release-source.sh` (the only script that should ever write it) is also the only
# supported way to update this source tree before a release.
#
# Format: plain KEY=VALUE lines, no secrets, one entry per line -- same convention as `.env`, safe
# to print/log in full.

# Atomically write PROJECT_DIR/.release-manifest.
# Args: project_dir release_sha archive_sha256 migration_count
release_manifest_write() {
  rm_dir="$1"; rm_sha="$2"; rm_archive_sha="$3"; rm_mig_count="$4"
  rm_file="$rm_dir/.release-manifest"
  rm_tmp="$rm_dir/.release-manifest.$$.tmp"

  ( umask 022
    {
      echo "release_sha=$rm_sha"
      echo "archive_sha256=$rm_archive_sha"
      echo "migration_count=$rm_mig_count"
      echo "synced_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    } > "$rm_tmp"
  ) || { rm -f "$rm_tmp"; return 1; }

  mv -f "$rm_tmp" "$rm_file"
}

# Read one key from PROJECT_DIR/.release-manifest. Args: project_dir key
release_manifest_get() {
  rmg_dir="$1"; rmg_key="$2"
  rmg_file="$rmg_dir/.release-manifest"
  [ -f "$rmg_file" ] || return 1
  awk -v k="$rmg_key" '
    index($0, k "=") == 1 { print substr($0, length(k) + 2); found = 1 }
    END { exit(found ? 0 : 1) }
  ' "$rmg_file"
}

# Fail-closed gate: does PROJECT_DIR's source tree provably match EXPECTED_SHA right now?
# Args: project_dir expected_sha
# Exit: 0 = verified match   1 = mismatch/missing/stale (message on stderr explains which)
release_manifest_verify() {
  rmv_dir="$1"; rmv_expected="$2"
  rmv_file="$rmv_dir/.release-manifest"

  if [ -z "$rmv_expected" ]; then
    echo "[release-manifest] REFUSING: no expected release sha given to verify against." >&2
    return 1
  fi
  if [ ! -f "$rmv_file" ]; then
    echo "[release-manifest] FAIL: $rmv_file does not exist -- this source tree has never been" >&2
    echo "[release-manifest]      through scripts/sync-release-source.sh, so its provenance is" >&2
    echo "[release-manifest]      unproven. Run that script for $rmv_expected before deploying." >&2
    return 1
  fi

  rmv_recorded_sha=$(release_manifest_get "$rmv_dir" "release_sha" 2>/dev/null || echo "")
  if [ -z "$rmv_recorded_sha" ]; then
    echo "[release-manifest] FAIL: $rmv_file has no release_sha entry (corrupt manifest)." >&2
    return 1
  fi
  if [ "$rmv_recorded_sha" != "$rmv_expected" ]; then
    echo "[release-manifest] FAIL: source tree is verified as $rmv_recorded_sha but $rmv_expected" >&2
    echo "[release-manifest]      was requested. Refusing to build a mismatched release. Run" >&2
    echo "[release-manifest]      scripts/sync-release-source.sh for $rmv_expected first." >&2
    return 1
  fi

  rmv_recorded_count=$(release_manifest_get "$rmv_dir" "migration_count" 2>/dev/null || echo "")
  rmv_actual_count=$(find "$rmv_dir/apps/api/src/core/database/migrations" -maxdepth 1 -name '*.ts' 2>/dev/null | wc -l | tr -d ' ')
  if [ -z "$rmv_recorded_count" ] || [ "$rmv_recorded_count" != "$rmv_actual_count" ]; then
    echo "[release-manifest] FAIL: manifest recorded $rmv_recorded_count migration file(s) for" >&2
    echo "[release-manifest]      $rmv_recorded_sha but the tree currently has $rmv_actual_count." >&2
    echo "[release-manifest]      The tree has drifted since it was last synced/verified -- a" >&2
    echo "[release-manifest]      missing or extra migration file must never be built silently." >&2
    return 1
  fi

  echo "[release-manifest] OK: source tree verified as $rmv_recorded_sha ($rmv_actual_count migrations)."
  return 0
}
