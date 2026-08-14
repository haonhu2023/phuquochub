#!/bin/sh
# Web/API release-tag state helper (2026-08-14).
#
# WHY THIS EXISTS
# ---------------
# docker-compose.prod.yml resolves the application images as
#   image: phuquochub-web:${WEB_IMAGE_TAG:-local}
#   image: phuquochub-api:${API_IMAGE_TAG:-local}
# so the tag that a bare `docker compose up -d` resolves to comes from the environment Compose
# reads -- in production, the project-directory `.env`. Every deploy path in this repo used to
# pass the tag as a ONE-SHOT shell prefix instead:
#   WEB_IMAGE_TAG="$TAG" docker compose ... up -d --no-build web
# That override lives exactly as long as the command does. It correctly creates the container from
# the right image, but it leaves NO record anywhere on the host, so the very next Compose
# invocation falls back to whatever `.env` says. Production drifted this way: the web container
# ran `phuquochub-web:c9cf9e5` while `.env` still said `WEB_IMAGE_TAG=local`, and
# `phuquochub-web:local` pointed at an OLDER build that predates the c9cf9e5 map fix. A bare
# `docker compose up -d`, run for any unrelated reason, would have silently rolled the site back a
# release. Proven with `docker compose --dry-run up -d` (planned `phuquoc-web-prod Recreate`).
#
# The fix is to make the deploy/rollback paths PERSIST the tag they just put live, so that `.env`
# always describes what is actually running.
#
# SECRET SAFETY (this file edits a secret-bearing `.env`)
# ------------------------------------------------------
# `.env` holds DB/JWT/S3 credentials. This helper therefore:
#   - never prints the file, and never prints any line other than the one tag it was asked for;
#   - rewrites the file wholesale through awk but changes ONLY the single matching KEY= line,
#     leaving every other byte untouched;
#   - writes to a temp file in the SAME directory (so the final `mv` is atomic -- a reader either
#     sees the old complete file or the new one, never a half-written one);
#   - creates that temp under `umask 077` and then copies the original's exact mode, so a 0600
#     `.env` stays 0600 and never widens even momentarily;
#   - refuses any tag value outside [A-Za-z0-9._-], so a hostile/typo'd tag cannot inject a
#     newline and forge additional environment entries.
#
# ROLLBACK WITHOUT COPYING SECRETS: callers record only the PREVIOUS TAG VALUE (a non-secret
# string) before calling release_tag_set. Restoring is another release_tag_set with that value --
# there is never any need to copy the secret-bearing `.env` into a backup artifact.
#
# Usage (POSIX sh):
#   . scripts/lib/release-tag.sh
#   release_tag_get WEB_IMAGE_TAG /path/.env          # prints value, exit 1 if key absent
#   release_tag_set WEB_IMAGE_TAG c9cf9e5 /path/.env  # atomic in-place update (appends if absent)

# Accept only characters that are legal in a Docker tag. Rejects empty, and rejects anything with a
# newline/space/quote/`$` that could break out of the KEY=VALUE line.
release_tag_valid() {
  case "$1" in
    '') return 1 ;;
    *[!A-Za-z0-9._-]*) return 1 ;;
    *) return 0 ;;
  esac
}

# Print the current value of KEY from ENVFILE. Exit 1 if the file or the key is absent.
# Prints ONLY that value -- never any other line of the file.
release_tag_get() {
  rt_key="$1"; rt_env="$2"
  [ -f "$rt_env" ] || return 1
  awk -v k="$rt_key" '
    index($0, k "=") == 1 { print substr($0, length(k) + 2); found = 1 }
    END { exit(found ? 0 : 1) }
  ' "$rt_env"
}

# Atomically set KEY=VALUE in ENVFILE, preserving every other line and the file mode.
release_tag_set() {
  rt_key="$1"; rt_val="$2"; rt_env="$3"

  if ! release_tag_valid "$rt_val"; then
    echo "[release-tag] REFUSING: '$rt_val' is not a valid image tag ([A-Za-z0-9._-] only)." >&2
    return 1
  fi
  if [ ! -f "$rt_env" ]; then
    echo "[release-tag] REFUSING: env file '$rt_env' does not exist." >&2
    return 1
  fi

  rt_dir=$(dirname "$rt_env")
  rt_tmp="$rt_dir/.release-tag.$$.tmp"

  # 077 so the temp file is never world/group readable, not even for the instant before chmod.
  ( umask 077
    awk -v k="$rt_key" -v v="$rt_val" '
      index($0, k "=") == 1 && !done { print k "=" v; done = 1; next }
      { print }
      END { if (!done) print k "=" v }
    ' "$rt_env" > "$rt_tmp"
  ) || { rm -f "$rt_tmp"; return 1; }

  # Match the original mode exactly (a 0600 .env must stay 0600).
  chmod --reference="$rt_env" "$rt_tmp" 2>/dev/null || chmod 600 "$rt_tmp"

  # Refuse to install a result that lost or gained lines -- a corrupted awk pass must never be
  # allowed to truncate a file full of credentials.
  rt_before=$(awk 'END{print NR}' "$rt_env")
  rt_after=$(awk 'END{print NR}' "$rt_tmp")
  if [ "$rt_after" -lt "$rt_before" ]; then
    echo "[release-tag] REFUSING: rewrite would drop lines ($rt_before -> $rt_after). Aborted." >&2
    rm -f "$rt_tmp"
    return 1
  fi

  mv -f "$rt_tmp" "$rt_env" || { rm -f "$rt_tmp"; return 1; }
  echo "[release-tag] $rt_key=$rt_val persisted to $rt_env"
}
