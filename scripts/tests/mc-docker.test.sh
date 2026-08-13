#!/bin/bash
# Docker-Internal MinIO Backups (2026-08-12) — tests for scripts/lib/mc-docker.sh and the media
# scripts' use of it.
#
# NO real Docker call, NO real network, NO MinIO. `docker` is a stub on PATH that records its argv
# so the tests can assert on exactly what WOULD have been run. That is the point: the security
# properties of this wrapper are properties of the command line it constructs.
#
# Run: bash scripts/tests/mc-docker.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
WRAPPER="$REPO_ROOT/scripts/lib/mc-docker.sh"
BACKUP_MEDIA="$REPO_ROOT/scripts/backup-media.sh"
REHEARSAL="$REPO_ROOT/scripts/restore-media-rehearsal.sh"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }
assert_contains() { case "$1" in *"$2"*) pass "$3" ;; *) fail "$3 -- lacked '$2'" ;; esac; }
assert_not_contains() { case "$1" in *"$2"*) fail "$3 -- unexpectedly contained '$2'" ;; *) pass "$3" ;; esac; }
assert_eq() { if [ "$1" = "$2" ]; then pass "$3"; else fail "$3 (got '$1', want '$2')"; fi; }

# Strip comments and blank lines. Several assertions below are of the form "this token must never
# appear" -- but the scripts legitimately NAME those tokens in their headers to explain why they
# are avoided. Asserting over raw file text would flag that documentation as a violation, so the
# checks run against EXECUTABLE lines only.
code_only() { sed 's/[[:space:]]*#.*$//' "$@" | sed '/^[[:space:]]*$/d'; }

SECRET_VALUE="s3cr3t-BACKUP-KEY-do-not-leak"

# `stat -c %a` is stubbed in every test env below. Reason: this suite must be able to exercise the
# happy path on filesystems that cannot represent Unix modes (Windows/CIFS report 644 no matter
# what `chmod 600` did), while the wrapper's permission guard stays STRICT for production Linux.
# Stubbing `stat` makes the guard's behaviour deterministic on every platform instead of depending
# on what the developer's filesystem happens to support.
CONFIG_MODE="600"

# ---- environment -------------------------------------------------------------------------------
new_env() {
  ENVDIR=$(mktemp -d)
  mkdir -p "$ENVDIR/bin" "$ENVDIR/proj/backups/media" "$ENVDIR/mcconf"
  : > "$ENVDIR/proj/docker-compose.prod.yml"
  DOCKER_LOG="$ENVDIR/docker-calls.log"; : > "$DOCKER_LOG"
  cat > "$ENVDIR/mcconf/config.json" <<EOF
{"version":"10","aliases":{"phuquoc-backup":{"url":"http://minio:9000","accessKey":"AKBACKUPONLY","secretKey":"$SECRET_VALUE","api":"S3v4","path":"on"}}}
EOF
  chmod 600 "$ENVDIR/mcconf/config.json" 2>/dev/null || true
  # Deterministic mode reporting -- see CONFIG_MODE note at the top.
  cat > "$ENVDIR/bin/stat" <<EOF
#!/bin/bash
[ "\${1:-}" = "-c" ] && [ "\${2:-}" = "%a" ] && { echo "$CONFIG_MODE"; exit 0; }
exec /usr/bin/stat "\$@"
EOF
  chmod +x "$ENVDIR/bin/stat"
  # Stub docker: records argv, answers the two discovery calls, succeeds for `run`.
  cat > "$ENVDIR/bin/docker" <<EOF
#!/bin/bash
echo "docker \$*" >> "$DOCKER_LOG"
case "\$1 \$2" in
  "compose -f") echo "minio-container-id"; exit 0 ;;
esac
case "\$1" in
  inspect) echo "phuquochub-prod_default"; exit 0 ;;
  run)     exit 0 ;;
esac
exit 0
EOF
  chmod +x "$ENVDIR/bin/docker"
}
del_env() { rm -rf "$ENVDIR"; }
run_wrapper() {
  ( export PATH="$ENVDIR/bin:$PATH" \
      PROJECT_DIR="$ENVDIR/proj" \
      MEDIA_BACKUP_DIR="$ENVDIR/proj/backups/media" \
      MC_CONFIG_DIR="$ENVDIR/mcconf" \
      HOME="$ENVDIR"
    bash "$WRAPPER" "$@" 2>&1 )
}

# =================================================================================================
echo "== command construction: private, pinned, DNS-addressed =="
new_env
OUT=$(run_wrapper ls phuquoc-backup/phuquochub-prod)
CALLS=$(cat "$DOCKER_LOG")

assert_contains "$CALLS" "--network phuquochub-prod_default" "joins the DERIVED production compose network"
assert_contains "$CALLS" "docker compose -f $ENVDIR/proj/docker-compose.prod.yml ps -q minio" "derives the network from the compose project"
assert_contains "$CALLS" "--rm" "container is ephemeral (--rm)"
assert_contains "$CALLS" "--config-dir /mc-config" "mc is pointed at the mounted config dir"
assert_contains "$CALLS" "$ENVDIR/mcconf:/mc-config:ro" "credential dir is mounted READ-ONLY"
assert_contains "$CALLS" "$ENVDIR/proj/backups/media:$ENVDIR/proj/backups/media" "backup dir bind-mounted at the SAME absolute path"

# No host port publishing, in any form.
assert_not_contains "$CALLS" "-p " "never publishes a port (-p)"
assert_not_contains "$CALLS" "--publish" "never publishes a port (--publish)"
assert_not_contains "$CALLS" "9000:9000" "no 9000 port mapping"
assert_not_contains "$CALLS" "127.0.0.1:" "no loopback publishing"
assert_not_contains "$CALLS" "--network host" "does not fall back to host networking"

# No hardcoded addressing.
assert_not_contains "$CALLS" "172.18." "no fixed container IP"
assert_not_contains "$CALLS" "media.phuquochub.com" "never routes backups via the public edge"
assert_not_contains "$CALLS" "localhost:9000" "never targets localhost"

# Pinned image, never latest.
assert_contains "$CALLS" "minio/mc:RELEASE." "uses a PINNED minio/mc release tag"
assert_not_contains "$CALLS" "minio/mc:latest" "never uses minio/mc:latest"
assert_not_contains "$CALLS" "mc latest" "no 'latest' anywhere in the invocation"
del_env

# =================================================================================================
echo "== credential boundary =="
new_env
OUT=$(run_wrapper ls phuquoc-backup/phuquochub-prod)
CALLS=$(cat "$DOCKER_LOG")

assert_not_contains "$CALLS" "$SECRET_VALUE" "secret NEVER appears in the docker argv"
assert_not_contains "$OUT" "$SECRET_VALUE" "secret NEVER appears in wrapper output"
assert_not_contains "$CALLS" "AKBACKUPONLY" "access key never appears in argv either"
# -e / --env would land the secret in `docker inspect` and the host process table.
assert_not_contains "$CALLS" "MC_HOST_" "does not pass credentials via MC_HOST_* env"
assert_not_contains "$CALLS" "MINIO_ROOT_USER" "never references MINIO_ROOT_USER"
assert_not_contains "$CALLS" "MINIO_ROOT_PASSWORD" "never references MINIO_ROOT_PASSWORD"
assert_not_contains "$CALLS" " -e " "passes no -e environment variables at all"
del_env

echo "== source files never reference root credentials or the built-in local alias =="
SRC=$(code_only "$WRAPPER" "$BACKUP_MEDIA" "$REHEARSAL")
assert_not_contains "$SRC" "MINIO_ROOT_USER" "no MINIO_ROOT_USER in any media script"
assert_not_contains "$SRC" "MINIO_ROOT_PASSWORD" "no MINIO_ROOT_PASSWORD in any media script"
assert_not_contains "$SRC" "minioadmin" "no default root credential referenced"
assert_not_contains "$SRC" "mc ready local" "does not reuse the container's built-in 'local' alias"
# This one is deliberately checked against RAW text: the endpoint belongs in the operator's config
# file, so the repository's only legitimate mention of it is documentation.
assert_contains "$(cat "$WRAPPER" "$BACKUP_MEDIA")" "http://minio:9000" "documents Docker DNS addressing (minio:9000)"

# =================================================================================================
echo "== fail closed =="
new_env
rm -f "$ENVDIR/mcconf/config.json"
OUT=$(run_wrapper ls phuquoc-backup/phuquochub-prod); ST=$?
assert_eq "$ST" "1" "missing credential config -> non-zero"
assert_contains "$OUT" "no mc config" "missing config is explained"
assert_eq "$(grep -c 'docker run' "$DOCKER_LOG" || true)" "0" "no container started without a credential"
del_env

CONFIG_MODE=644; new_env; CONFIG_MODE=600
OUT=$(run_wrapper ls phuquoc-backup/phuquochub-prod); ST=$?
assert_eq "$ST" "1" "world-readable credential -> refuses to run"
assert_contains "$OUT" "expected 600" "insecure permissions are named"
assert_eq "$(grep -c 'docker run' "$DOCKER_LOG" || true)" "0" "no container started with an insecure credential"
del_env

new_env
cat > "$ENVDIR/bin/docker" <<EOF
#!/bin/bash
echo "docker \$*" >> "$DOCKER_LOG"
case "\$1 \$2" in "compose -f") exit 0 ;; esac   # no container id -> stack not up
exit 0
EOF
chmod +x "$ENVDIR/bin/docker"
OUT=$(run_wrapper ls phuquoc-backup/phuquochub-prod); ST=$?
assert_eq "$ST" "1" "minio container not found -> non-zero"
assert_contains "$OUT" "could not find a running 'minio' container" "explains the stack is down"
assert_eq "$(grep -c 'docker run' "$DOCKER_LOG" || true)" "0" "no container started when the network cannot be derived"
del_env

new_env
OUT=$(run_wrapper); ST=$?
assert_eq "$ST" "2" "no mc arguments -> usage error"
del_env

# =================================================================================================
echo "== media scripts wire the wrapper in by default =="
assert_contains "$(cat "$BACKUP_MEDIA")" 'MC_BIN="${MC_BIN:-$SCRIPT_DIR/lib/mc-docker.sh}"' \
  "backup-media.sh defaults MC_BIN to the Docker wrapper"
assert_contains "$(cat "$REHEARSAL")" 'MC_BIN="${MC_BIN:-$SCRIPT_DIR/lib/mc-docker.sh}"' \
  "restore-media-rehearsal.sh uses the SAME connectivity model"
assert_contains "$(cat "$BACKUP_MEDIA")" "export MEDIA_BACKUP_DIR" \
  "backup-media.sh exports MEDIA_BACKUP_DIR so the wrapper mounts the right path"
# The rehearsal's read-back dir must sit inside the bind mount, not /tmp.
assert_contains "$(cat "$REHEARSAL")" 'mktemp -d "$MEDIA_BACKUP_DIR/.restore-verify-XXXXXX"' \
  "rehearsal verify dir lives inside the bind-mounted tree"
assert_not_contains "$(grep -n 'VERIFY_DIR=' "$REHEARSAL")" 'VERIFY_DIR=$(mktemp -d)' \
  "rehearsal does NOT use an unmounted /tmp scratch dir"

echo "== production-object safety is unchanged =="
BM=$(code_only "$BACKUP_MEDIA")
assert_not_contains "$BM" "--remove" "backup mirror never passes --remove"
assert_not_contains "$BM" "mc rm" "backup never deletes objects"
assert_contains "$BM" 'mirror --quiet "$MC_ALIAS/$MEDIA_BUCKET" "$STAGING_DIR"' "mirror direction is bucket -> local"
assert_contains "$BM" "ALLOW_EMPTY_MEDIA_BACKUP" "empty-bucket guard retained"
assert_contains "$BM" "sha256sum -c" "manifest verified before publication"
assert_contains "$BM" "apply_retention" "retention still applied"
RH=$(code_only "$REHEARSAL")
assert_contains "$RH" 'if [ "$TEST_BUCKET" = "$MEDIA_BUCKET" ]; then' "rehearsal still refuses the production bucket"

echo
echo "mc-docker.test.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
