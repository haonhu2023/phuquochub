#!/bin/sh
# PLACE-042 -- guarded, reusable migration rollback rehearsal.
#
# Reverts the current HEAD migration using the repository's own official
# `migration:revert` command, verifies status, re-applies it with `migration:run`, and confirms
# the migration head is restored. Stops immediately (set -eu) on any non-zero exit code from any
# step -- it does not continue past a failed revert or a failed re-apply.
#
# This script exercises MIGRATION STATE ONLY (the `migrations` tracking table + whatever schema
# objects the head migration's up()/down() touch). It does NOT insert, assert, or clean up any
# table data -- proving no-data-loss for a SPECIFIC migration requires knowing what that
# migration's up()/down() actually touch (see PLACE-042's report for how this was done by hand
# for AddPlacesStatusPartialIndex1720001900000, the migration this script was first proven
# against). Generalizing a data-integrity check to any arbitrary future migration would need
# per-migration customization, which this script deliberately does not attempt.
#
# SAFETY GUARDS (do not remove):
#   - Refuses to run when NODE_ENV=production.
#   - Refuses to run unless DB_HOST resolves to localhost/127.0.0.1 -- never a real/remote DB.
#   - Contains no password/secret of any kind; relies entirely on the environment's own
#     DB_*/apps/api/src/core/database/data-source.ts dev defaults.
#
# Usage: scripts/migration-rollback-rehearsal.sh
# Run from anywhere; resolves apps/api relative to this script's own location (no machine-
# specific absolute path).
set -eu

if [ "${NODE_ENV:-development}" = "production" ]; then
  echo "[rehearsal] REFUSING to run: NODE_ENV=production. This script only runs against a local dev database." >&2
  exit 1
fi

DB_HOST_CHECK="${DB_HOST:-localhost}"
case "$DB_HOST_CHECK" in
  localhost|127.0.0.1) ;;
  *)
    echo "[rehearsal] REFUSING to run: DB_HOST='$DB_HOST_CHECK' is not localhost/127.0.0.1." >&2
    echo "[rehearsal]            This script must never run against a real/remote database." >&2
    exit 1
    ;;
esac

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
API_DIR="$(dirname "$SCRIPT_DIR")/apps/api"
cd "$API_DIR"

echo "[rehearsal] === Step 1: migration status BEFORE rehearsal ==="
npx typeorm-ts-node-commonjs migration:show -d src/core/database/data-source.ts

echo "[rehearsal] === Step 2: revert the current head migration ==="
npx typeorm-ts-node-commonjs migration:revert -d src/core/database/data-source.ts

echo "[rehearsal] === Step 3: migration status AFTER revert (one fewer [X] than Step 1) ==="
npx typeorm-ts-node-commonjs migration:show -d src/core/database/data-source.ts

echo "[rehearsal] === Step 4: re-apply the reverted migration ==="
npx typeorm-ts-node-commonjs migration:run -d src/core/database/data-source.ts

echo "[rehearsal] === Step 5: migration status AFTER re-apply (head restored) ==="
npx typeorm-ts-node-commonjs migration:show -d src/core/database/data-source.ts

echo "[rehearsal] Rollback rehearsal complete -- review the Step 1 vs Step 5 status output above:"
echo "[rehearsal] the same migration set must show [X] in both. This script does not diff that"
echo "[rehearsal] output automatically (TypeORM's migration:show format is not a documented,"
echo "[rehearsal] stable parse target); a human (or a future CI step) reads it directly."
