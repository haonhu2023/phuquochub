#!/bin/sh
# REVALIDATE_INTERNAL_SECRET generation (cutover-4569d41 hardening, A2 step, 2026-09-23).
#
# WHY THIS EXISTS: env.validation.ts now requires a real value in production and
# docker-compose.prod.yml no longer defaults to the checked-in placeholder (see
# scripts/verify-revalidate-secret.sh's header) -- this is the companion script that actually
# generates and installs that value on the VPS.
#
# THE VALUE NEVER CROSSES stdout/stderr/argv/environ, so it never lands in a shell history, a
# process list (`ps`), or a session transcript:
#   - generated straight into a file, never printed
#   - awk reads it back via `getline` (a file path), never `-v`/ENVIRON -- either of those would
#     put the plaintext in this process's argv, visible to any other user via `ps -ef`
#   - the temp file is 0600 in a 0700 dir, verified with `stat` (not assumed), and shredded after
#
# THE GENERATOR IS `openssl rand -hex 32`, NOT `tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 64`.
# The tr|head form is a real bug under `set -o pipefail` (this script's own mode): `head -c 64`
# closes its stdin pipe the instant it has 64 bytes, `tr` gets SIGPIPE writing to it, `tr` exits
# 141, pipefail promotes that to the pipeline's exit status, and `set -e` kills the script right
# there -- BEFORE the .env write or the shred cleanup run, leaving a dangling unshredded secret
# file and an untouched .env. Reproduced empirically; `openssl rand -hex 32` has no pipe from an
# infinite source, so this failure mode cannot occur.
#
# THIS SCRIPT DOES NOT TOUCH docker-compose.prod.yml, does not build/run/recreate anything, and
# does not rely on that file already being uploaded -- it only edits .env's REVALIDATE_INTERNAL_
# SECRET= line, so it is safe to run as its own step ahead of runbook A3.
#
# Usage: scripts/rotate-revalidate-secret.sh [env-file]   (default: ./.env)
# Exit:  0 = written   1 = verification failed midway (see stderr)   2 = usage/environment error
set -eu

ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "[rotate-secret] ERROR: $ENV_FILE not found." >&2
  exit 2
fi
if ! command -v openssl >/dev/null 2>&1; then
  echo "[rotate-secret] ERROR: openssl not available." >&2
  exit 2
fi

umask 077
SECRET_DIR=$(mktemp -d)
SECRET_FILE=$(mktemp -p "$SECRET_DIR")
cleanup() {
  shred -u "$SECRET_FILE" 2>/dev/null || rm -f "$SECRET_FILE"
  rmdir "$SECRET_DIR" 2>/dev/null || true
}
trap cleanup EXIT

dir_mode=$(stat -c '%a' "$SECRET_DIR")
file_mode=$(stat -c '%a' "$SECRET_FILE")
if [ "$dir_mode" != "700" ] || [ "$file_mode" != "600" ]; then
  echo "[rotate-secret] ERROR: temp dir/file mode is $dir_mode/$file_mode, expected 700/600 -- stopping before writing anything." >&2
  exit 1
fi

openssl rand -hex 32 > "$SECRET_FILE"

file_mode_after_write=$(stat -c '%a' "$SECRET_FILE")
if [ "$file_mode_after_write" != "600" ]; then
  echo "[rotate-secret] ERROR: temp file mode changed to $file_mode_after_write after writing -- stopping." >&2
  exit 1
fi

awk -v secretfile="$SECRET_FILE" '
  BEGIN {
    getline secret < secretfile
    close(secretfile)
  }
  /^REVALIDATE_INTERNAL_SECRET=/ { print "REVALIDATE_INTERNAL_SECRET=" secret; found=1; next }
  { print }
  END {
    if (!found) print "REVALIDATE_INTERNAL_SECRET=" secret
  }
' "$ENV_FILE" > "$ENV_FILE.new"

chmod --reference="$ENV_FILE" "$ENV_FILE.new"
mv "$ENV_FILE.new" "$ENV_FILE"

echo "[rotate-secret] RESULT: OK -- REVALIDATE_INTERNAL_SECRET written to $ENV_FILE (value never printed)."
echo "[rotate-secret] Next: upload the new docker-compose.prod.yml (runbook A3), then run"
echo "[rotate-secret]       scripts/verify-revalidate-secret.sh config, before building/recreating anything."
