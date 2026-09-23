#!/bin/bash
# Docker-Internal MinIO Backups (2026-08-12) — run the MinIO client as an EPHEMERAL container
# joined to the production compose network, so `mc` can reach MinIO over Docker DNS.
#
# WHY THIS EXISTS. `docker-compose.prod.yml` publishes NO host ports for the `minio` service --
# only `caddy` binds 80/443. MinIO is reachable exclusively as `minio:9000` inside the compose
# network (Topology A's private-networking design, stated in the `migrate` service's own comment).
# A host-installed `mc` therefore has no route to it at all: `localhost:9000` is closed, and the
# only public path (`media.phuquochub.com`) is the object-delivery edge, which is the wrong place
# to send an authenticated backup stream. This wrapper closes that gap without opening a port.
#
# WHAT IT DELIBERATELY DOES NOT DO:
#   * does NOT publish port 9000, not even on loopback
#   * does NOT route backup traffic through media.phuquochub.com
#   * does NOT hardcode a container IP -- 172.18.x.x is assigned by Docker and changes on recreate
#   * does NOT use MINIO_ROOT_USER / MINIO_ROOT_PASSWORD, the application's write credential, or
#     the MinIO container's built-in `local` alias
#   * does NOT put any secret in argv, in the environment, or anywhere `docker inspect` can read it
#
# CREDENTIAL BOUNDARY. `mc` is given a config DIRECTORY, mounted read-only. The access/secret keys
# live in a file on the VPS (mode 0600, outside this repository); the only credential-adjacent
# thing that ever appears on a command line is that directory's PATH. This matters: `docker run
# -e MC_HOST_alias=https://KEY:SECRET@host` would place the secret in the container's environment,
# where `docker inspect` prints it in clear text for anyone in the docker group, and in the host's
# process table while the command runs. A mounted file has neither problem.
#
# Usage (drop-in replacement for `mc`):
#   scripts/lib/mc-docker.sh ls phuquoc-backup/phuquochub-prod
#   MC_BIN=scripts/lib/mc-docker.sh scripts/backup-media.sh
#
# Environment:
#   MC_CONFIG_DIR      (default: $HOME/.mc-backup)  host dir holding mc's config.json, mode 0700
#   MC_IMAGE           pinned minio/mc image -- see PINNING below
#   MEDIA_BACKUP_DIR   (default: <project>/backups/media) bind-mounted at the SAME absolute path
#   MEDIA_BACKUP_NETWORK  override the auto-derived compose network
#   COMPOSE_FILE       (default: <project>/docker-compose.prod.yml)
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR="${PROJECT_DIR:-$(dirname "$(dirname "$SCRIPT_DIR")")}"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.prod.yml}"
MEDIA_BACKUP_DIR="${MEDIA_BACKUP_DIR:-$PROJECT_DIR/backups/media}"
MC_CONFIG_DIR="${MC_CONFIG_DIR:-$HOME/.mc-backup}"

# PINNING: never `latest`. A backup tool that silently changes underneath a nightly cron is a
# supply-chain risk and a reproducibility problem. This tag is a deliberate default, NOT a
# verified-from-registry value -- this repository has no network access to confirm it resolves.
# The operator MUST verify it pulls and then pin by DIGEST (see the runbook), e.g.
#   MC_IMAGE=minio/mc@sha256:<digest>
MC_IMAGE="${MC_IMAGE:-minio/mc:RELEASE.2024-11-21T17-21-54Z}"

if [ "$#" -eq 0 ]; then
  echo "[mc-docker] ERROR: no mc arguments given." >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[mc-docker] ERROR: docker is not available on PATH." >&2
  exit 1
fi

# The config dir carries the credential. Refuse to run if it is missing, and refuse if it is
# group/world readable -- a backup credential sitting at 0644 is a finding, not a warning.
if [ ! -f "$MC_CONFIG_DIR/config.json" ]; then
  echo "[mc-docker] ERROR: no mc config at $MC_CONFIG_DIR/config.json." >&2
  echo "[mc-docker]        Create it (mode 0600) with the read-only backup service account --" >&2
  echo "[mc-docker]        see docs/delivery/BACKUP-RESTORE-RUNBOOK.md. No credential is stored" >&2
  echo "[mc-docker]        in this repository." >&2
  exit 1
fi
CONFIG_PERMS=$(stat -c '%a' "$MC_CONFIG_DIR/config.json" 2>/dev/null || echo "")
case "$CONFIG_PERMS" in
  600|400) : ;;
  "") echo "[mc-docker] WARNING: could not stat config permissions; continuing." >&2 ;;
  *)
    echo "[mc-docker] ERROR: $MC_CONFIG_DIR/config.json has mode $CONFIG_PERMS; expected 600." >&2
    echo "[mc-docker]        Run: chmod 600 $MC_CONFIG_DIR/config.json" >&2
    exit 1
    ;;
esac

# --- Network: DERIVED, never a hardcoded name or IP ------------------------------------------------
# Ask the compose project which network its own minio container is attached to. This survives a
# project rename, a container recreate, and a Docker-assigned subnet change -- all of which would
# break a literal `phuquochub-prod_default` or `172.18.0.5`.
NETWORK="${MEDIA_BACKUP_NETWORK:-}"
if [ -z "$NETWORK" ]; then
  MINIO_CID=$(docker compose -f "$COMPOSE_FILE" ps -q minio 2>/dev/null || true)
  if [ -z "$MINIO_CID" ]; then
    echo "[mc-docker] ERROR: could not find a running 'minio' container for $COMPOSE_FILE." >&2
    echo "[mc-docker]        Is the production stack up? Override with MEDIA_BACKUP_NETWORK=<name>." >&2
    exit 1
  fi
  NETWORK=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' \
    "$MINIO_CID" 2>/dev/null | sed '/^$/d' | head -n 1)
  if [ -z "$NETWORK" ]; then
    echo "[mc-docker] ERROR: could not derive the Docker network of the minio container." >&2
    exit 1
  fi
fi

mkdir -p "$MEDIA_BACKUP_DIR"

# --- Run -------------------------------------------------------------------------------------------
# --user: mc writes the mirrored objects into the bind mount. Without this they land root-owned and
#   the host-side script (find/sha256sum/rm -rf on staging) cannot clean up after itself.
# Bind mount uses the SAME absolute path inside and out, because backup-media.sh passes host paths
#   straight through to mc and then re-reads them from the host.
# Config mount is :ro -- the container must never rewrite the credential file.
# --network-alias is not needed; we are the CLIENT, resolving `minio` via Docker's embedded DNS.
exec docker run --rm \
  --network "$NETWORK" \
  --user "$(id -u):$(id -g)" \
  -v "$MEDIA_BACKUP_DIR":"$MEDIA_BACKUP_DIR" \
  -v "$MC_CONFIG_DIR":/mc-config:ro \
  --entrypoint mc \
  "$MC_IMAGE" \
  --config-dir /mc-config \
  "$@"
