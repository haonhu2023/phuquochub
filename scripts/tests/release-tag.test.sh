#!/bin/bash
# Web/API release-tag governance (2026-08-14) — tests for scripts/lib/release-tag.sh and for the
# deploy/rollback/compose wiring that depends on it.
#
# NO Docker daemon, NO network, NO production access. The behavioural half runs the real helper
# against SYNTHETIC env files in a temp dir (never the real `.env`, which is never read by this
# file at all). The static half asserts on the repo's own scripts and compose file.
#
# The regression this pins shipped to production: `deploy-c9cf9e5.sh` put the web container live on
# `phuquochub-web:c9cf9e5` using a one-shot `WEB_IMAGE_TAG=... docker compose up -d` prefix, which
# left no record on the host. `.env` still said `WEB_IMAGE_TAG=local`, and `phuquochub-web:local`
# was an OLDER build lacking the c9cf9e5 map fix -- so a bare `docker compose up -d` would have
# silently rolled the site back a release. Verified with `docker compose --dry-run up -d`.
#
# Run: bash scripts/tests/release-tag.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
LIB="$REPO_ROOT/scripts/lib/release-tag.sh"
DEPLOY="$REPO_ROOT/scripts/deploy.sh"
ROLLBACK="$REPO_ROOT/scripts/rollback.sh"
COMPOSE="$REPO_ROOT/docker-compose.prod.yml"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }

for f in "$LIB" "$DEPLOY" "$ROLLBACK" "$COMPOSE"; do
  [ -f "$f" ] || { echo "FATAL: $f not found"; exit 1; }
done

# shellcheck source=../lib/release-tag.sh
. "$LIB"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# A synthetic .env shaped like production's: secret-bearing, with the tag keys in the middle.
make_env() {
  cat > "$TMP/.env" <<'EOF'
DB_PASSWORD=synthetic-not-a-real-secret
JWT_ACCESS_SECRET=synthetic-not-a-real-secret
API_IMAGE_TAG=local
WEB_IMAGE_TAG=local
S3_BUCKET=phuquochub-prod
S3_SECRET_KEY=synthetic-not-a-real-secret
EOF
  chmod 600 "$TMP/.env"
}

echo "== 1. release_tag_get reads only the requested key =="
make_env
GOT=$(release_tag_get WEB_IMAGE_TAG "$TMP/.env")
if [ "$GOT" = "local" ]; then pass "get returns the value"; else fail "get returned '$GOT', expected 'local'"; fi
# Must print ONE line only -- a helper that leaked the whole secret-bearing file would print 6.
LINES=$(release_tag_get WEB_IMAGE_TAG "$TMP/.env" | wc -l)
if [ "$LINES" -eq 1 ]; then pass "get prints exactly one line (no file leak)"; else fail "get printed $LINES lines"; fi
if release_tag_get NOPE_MISSING "$TMP/.env" >/dev/null 2>&1; then
  fail "get succeeded on a missing key"
else
  pass "get exits non-zero on a missing key"
fi

echo "== 2. release_tag_set updates in place and preserves everything else =="
make_env
BEFORE_OTHER=$(grep -v IMAGE_TAG "$TMP/.env" | sha256sum)
release_tag_set WEB_IMAGE_TAG c9cf9e5 "$TMP/.env" >/dev/null
if [ "$(release_tag_get WEB_IMAGE_TAG "$TMP/.env")" = "c9cf9e5" ]; then
  pass "set updated WEB_IMAGE_TAG"
else
  fail "set did not update WEB_IMAGE_TAG"
fi
if [ "$(release_tag_get API_IMAGE_TAG "$TMP/.env")" = "local" ]; then
  pass "set left the sibling API_IMAGE_TAG untouched"
else
  fail "set clobbered API_IMAGE_TAG"
fi
AFTER_OTHER=$(grep -v IMAGE_TAG "$TMP/.env" | sha256sum)
if [ "$BEFORE_OTHER" = "$AFTER_OTHER" ]; then
  pass "every non-tag line (the credentials) is byte-identical"
else
  fail "non-tag lines changed -- credential lines were altered"
fi
if [ "$(awk 'END{print NR}' "$TMP/.env")" -eq 6 ]; then
  pass "line count preserved (no truncation)"
else
  fail "line count changed"
fi
if [ "$(grep -c '^WEB_IMAGE_TAG=' "$TMP/.env")" -eq 1 ]; then
  pass "exactly one WEB_IMAGE_TAG line (updated, not appended)"
else
  fail "duplicate WEB_IMAGE_TAG lines"
fi

echo "== 3. file mode is preserved (a 0600 .env must stay 0600) =="
make_env
# Probe first: MSYS/Windows filesystems silently refuse to clear the group/other read bits, so a
# hardcoded "600" expectation would fail there for reasons that have nothing to do with the helper.
# The portable property under test is PRESERVATION -- mode after == mode before. The strict 0600
# assertion is then applied only on a filesystem that can actually represent it (i.e. production).
MODE_BEFORE=$(stat -c '%a' "$TMP/.env")
release_tag_set WEB_IMAGE_TAG abc123 "$TMP/.env" >/dev/null
MODE_AFTER=$(stat -c '%a' "$TMP/.env")
if [ "$MODE_AFTER" = "$MODE_BEFORE" ]; then
  pass "mode preserved across the rewrite ($MODE_BEFORE -> $MODE_AFTER)"
else
  fail "mode changed: $MODE_BEFORE -> $MODE_AFTER"
fi
if [ "$MODE_BEFORE" = "600" ]; then
  if [ "$MODE_AFTER" = "600" ]; then
    pass "strict: 0600 env file is still 0600"
  else
    fail "strict: 0600 env file became $MODE_AFTER"
  fi
else
  echo "  skip: filesystem cannot represent 0600 (chmod 600 produced $MODE_BEFORE) -- preservation check above still applies"
fi
# Regardless of filesystem, the rewrite must never ADD a write bit for group or other.
case "$MODE_AFTER" in
  ??[2367]|?[2367]?) fail "rewrite granted group/other write permission ($MODE_AFTER)" ;;
  *) pass "no group/other write bit added ($MODE_AFTER)" ;;
esac
if [ -z "$(find "$TMP" -maxdepth 1 -name '.release-tag.*.tmp' 2>/dev/null)" ]; then
  pass "no temp file left behind"
else
  fail "temp file leaked into the env directory"
fi

echo "== 4. appends when the key is absent =="
printf 'DB_PASSWORD=synthetic\n' > "$TMP/.env"; chmod 600 "$TMP/.env"
release_tag_set WEB_IMAGE_TAG deadbee "$TMP/.env" >/dev/null
if [ "$(release_tag_get WEB_IMAGE_TAG "$TMP/.env")" = "deadbee" ]; then
  pass "set appends a missing key"
else
  fail "set failed to append a missing key"
fi
if grep -q '^DB_PASSWORD=synthetic$' "$TMP/.env"; then
  pass "pre-existing line survived the append"
else
  fail "append destroyed existing content"
fi

echo "== 5. hostile / malformed tags are refused (no env injection) =="
make_env
# A newline in the value would forge extra environment entries; a `$` or quote could break parsing.
for bad in 'a b' 'tag$(id)' 'tag"x' '' 'a
DB_PASSWORD=pwned'; do
  if release_tag_set WEB_IMAGE_TAG "$bad" "$TMP/.env" >/dev/null 2>&1; then
    fail "accepted hostile tag: [$bad]"
  else
    pass "refused hostile tag: [$(printf '%s' "$bad" | tr '\n' '~')]"
  fi
done
if [ "$(awk 'END{print NR}' "$TMP/.env")" -eq 6 ] && ! grep -q 'pwned' "$TMP/.env"; then
  pass "env file unchanged after all rejected writes"
else
  fail "a rejected write still modified the env file"
fi
if release_tag_set WEB_IMAGE_TAG ok123 "$TMP/nonexistent.env" >/dev/null 2>&1; then
  fail "set succeeded against a nonexistent env file"
else
  pass "set refuses a nonexistent env file"
fi

echo "== 6. the helper never echoes secret values =="
make_env
OUT=$(release_tag_set WEB_IMAGE_TAG c9cf9e5 "$TMP/.env" 2>&1)
if printf '%s' "$OUT" | grep -q 'synthetic-not-a-real-secret'; then
  fail "helper output contained a secret value"
else
  pass "helper output contains no secret values"
fi
if printf '%s' "$OUT" | grep -q 'WEB_IMAGE_TAG=c9cf9e5'; then
  pass "helper confirms the non-secret tag it persisted"
else
  fail "helper gave no confirmation of the write"
fi

echo "== 7. deploy.sh persists the released tag =="
if grep -q '\. "\$SCRIPT_DIR/lib/release-tag.sh"' "$DEPLOY"; then
  pass "deploy.sh sources the release-tag helper"
else
  fail "deploy.sh does not source the helper"
fi
for k in API_IMAGE_TAG WEB_IMAGE_TAG; do
  if grep -qE "release_tag_set $k \"\\\$TAG\" \"\\\$ENV_FILE\"" "$DEPLOY"; then
    pass "deploy.sh persists $k"
  else
    fail "deploy.sh does not persist $k"
  fi
done
# The persist must come AFTER the cutover -- persisting a tag that never went live would be worse
# than not persisting at all.
CUTOVER_LINE=$(grep -n 'up -d --no-build api web caddy' "$DEPLOY" | head -1 | cut -d: -f1)
PERSIST_LINE=$(grep -n 'release_tag_set WEB_IMAGE_TAG' "$DEPLOY" | head -1 | cut -d: -f1)
if [ -n "$CUTOVER_LINE" ] && [ -n "$PERSIST_LINE" ] && [ "$PERSIST_LINE" -gt "$CUTOVER_LINE" ]; then
  pass "deploy.sh persists AFTER the cutover (line $PERSIST_LINE > $CUTOVER_LINE)"
else
  fail "deploy.sh persist ordering is wrong (cutover=$CUTOVER_LINE persist=$PERSIST_LINE)"
fi

echo "== 8. rollback.sh restores the previous tag =="
if grep -q '\. "\$SCRIPT_DIR/lib/release-tag.sh"' "$ROLLBACK"; then
  pass "rollback.sh sources the release-tag helper"
else
  fail "rollback.sh does not source the helper"
fi
if [ "$(grep -c 'release_tag_set API_IMAGE_TAG "\$TAG" "\$ENV_FILE"' "$ROLLBACK")" -eq 2 ]; then
  pass "rollback.sh persists API tag in both api and both branches"
else
  fail "rollback.sh API persist branches incorrect"
fi
if [ "$(grep -c 'release_tag_set WEB_IMAGE_TAG "\$TAG" "\$ENV_FILE"' "$ROLLBACK")" -eq 2 ]; then
  pass "rollback.sh persists WEB tag in both web and both branches"
else
  fail "rollback.sh WEB persist branches incorrect"
fi
# A web-only rollback must not rewrite the api tag.
WEB_BRANCH=$(awk '/^  web\)/{f=1;next} f&&/;;/{exit} f{print}' "$ROLLBACK")
if printf '%s' "$WEB_BRANCH" | grep -q 'API_IMAGE_TAG'; then
  fail "web-only rollback branch also rewrites API_IMAGE_TAG"
else
  pass "web-only rollback does not touch API_IMAGE_TAG"
fi

echo "== 9. compose still resolves tags from the environment (mechanism intact) =="
if grep -qF 'image: phuquochub-web:${WEB_IMAGE_TAG:-local}' "$COMPOSE"; then
  pass "web image is still WEB_IMAGE_TAG-parameterized"
else
  fail "web image parameterization changed"
fi
if grep -qF 'image: phuquochub-api:${API_IMAGE_TAG:-local}' "$COMPOSE"; then
  pass "api image is still API_IMAGE_TAG-parameterized"
else
  fail "api image parameterization changed"
fi
# The `:-local` default must stay -- it is what keeps a fresh local `docker compose up --build`
# convenient. Production correctness comes from `.env`, not from changing this default to a
# historical production commit baked into source.
if grep -qE 'image: phuquochub-(web|api):[a-f0-9]{7}' "$COMPOSE"; then
  fail "a production commit SHA was hardcoded into the compose file"
else
  pass "no production commit SHA hardcoded in compose"
fi

echo "== 10. adjacent hardening preserved =="
if awk '/^  migrate:/{f=1;print;next} f&&/^  [a-z_-]+:/{exit} f{print}' "$COMPOSE" | grep -qE '^\s*-\s*tools\s*$'; then
  pass "migrate profile guard still present"
else
  fail "migrate profile guard was lost"
fi
if grep -qF "test: [\"CMD-SHELL\", 'REDISCLI_AUTH=\"\$\${REDIS_PASSWORD}\" redis-cli ping | grep -q PONG']" "$COMPOSE"; then
  pass "redis healthcheck security fix preserved"
else
  fail "redis healthcheck changed"
fi
CADDY_BLOCK=$(awk '/^  caddy:/{f=1;print;next} f&&/^  [a-z_-]+:/{exit} f{print}' "$COMPOSE")
for p in '"80:80"' '"443:443"' '"127.0.0.1:8080:8080"'; do
  if printf '%s\n' "$CADDY_BLOCK" | grep -qF "$p"; then
    pass "caddy still publishes $p"
  else
    fail "caddy port $p changed"
  fi
done

echo "== 11. no secret value may be written into any release-state file =="
# The only key names these scripts ever persist must be the two image tags.
KEYS=$( { grep -oE 'release_tag_set [A-Z_]+' "$DEPLOY" "$ROLLBACK" || true; } | awk '{print $2}' | sort -u | tr '\n' ' ')
if [ "$KEYS" = "API_IMAGE_TAG WEB_IMAGE_TAG " ]; then
  pass "scripts persist only the two image-tag keys ($KEYS)"
else
  fail "scripts persist unexpected keys: $KEYS"
fi
for s in PASSWORD SECRET TOKEN KEY; do
  if grep -qE "release_tag_set [A-Z_]*$s" "$DEPLOY" "$ROLLBACK"; then
    fail "a $s-bearing key is persisted via release_tag_set"
  else
    pass "no $s-bearing key persisted"
  fi
done

echo
echo "== summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
