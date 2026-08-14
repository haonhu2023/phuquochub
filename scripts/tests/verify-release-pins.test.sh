#!/bin/bash
# Release-pin verification (2026-08-14) — behavioural tests for scripts/verify-release-pins.sh.
#
# NO real Docker, NO network, NO production access. `docker` is stubbed on PATH (same convention as
# scripts/tests/mc-docker.test.sh) so every branch can be driven deterministically, including the
# drift case that must never be reproduced against real production to test.
#
# What this pins: the checker must FAIL when `.env` names an image that is not what the container
# is actually running, because that is precisely the condition under which a plain
# `docker compose up -d` silently swaps the running release — the production incident this whole
# workstream exists to prevent.
#
# Run: bash scripts/tests/verify-release-pins.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
CHECK="$REPO_ROOT/scripts/verify-release-pins.sh"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }
[ -f "$CHECK" ] || { echo "FATAL: $CHECK not found"; exit 1; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/proj/scripts/lib" "$TMP/bin"
cp "$CHECK" "$TMP/proj/scripts/verify-release-pins.sh"
cp "$REPO_ROOT/scripts/lib/release-tag.sh" "$TMP/proj/scripts/lib/release-tag.sh"

# API_ID / WEB_ID: what `docker images -q <ref>` returns per tag.
# API_RUN / WEB_RUN: what `docker inspect <container> --format {{.Image}}` returns.
make_docker() {
  cat > "$TMP/bin/docker" <<EOF
#!/bin/bash
if [ "\$1" = "images" ]; then
  case "\$3" in
    phuquochub-api:*) printf '%s' "$1" ;;
    phuquochub-web:*) printf '%s' "$2" ;;
  esac
  exit 0
fi
if [ "\$1" = "inspect" ]; then
  case "\$2" in
    phuquoc-api-prod) printf '%s' "$3" ;;
    phuquoc-web-prod) printf '%s' "$4" ;;
  esac
  exit 0
fi
exit 0
EOF
  chmod +x "$TMP/bin/docker"
}

make_env() {
  cat > "$TMP/proj/.env" <<EOF
DB_PASSWORD=synthetic-not-a-real-secret
API_IMAGE_TAG=$1
WEB_IMAGE_TAG=$2
JWT_ACCESS_SECRET=synthetic-not-a-real-secret
EOF
  chmod 600 "$TMP/proj/.env"
}

run_check() { ( PATH="$TMP/bin:$PATH" "$TMP/proj/scripts/verify-release-pins.sh" "$TMP/proj" 2>&1 ); }

echo "== 1. happy path: both pins match the running images =="
make_docker "749e3791ac3f" "3c9fa3c53a01" "sha256:749e3791ac3f513c33f8d77f40d3fafa3d2014e7d08e5f5e2728bce5d4263721" "sha256:3c9fa3c53a01ca4728f08aeb15bfa2e8123c1877deed79327e4151d524d58aac"
make_env "img-749e3791ac3f" "c9cf9e5"
OUT=$(run_check); ST=$?
[ "$ST" -eq 0 ] && pass "exit 0 when all pins are consistent" || fail "exit $ST, expected 0"
printf '%s' "$OUT" | grep -q "all pins consistent and immutable" && pass "reports fully immutable" || fail "did not report immutable result"
printf '%s' "$OUT" | grep -q "anchor tag img-749e3791ac3f verifiably points" && pass "verifies the anchor tag claim" || fail "anchor tag not verified"

echo "== 2. THE regression: .env pin != running image (silent-swap condition) =="
# .env pins an image id that is NOT what the container runs -- the exact web incident.
make_docker "749e3791ac3f" "2a5ee2f70066" "sha256:749e3791ac3f513c33f8d77f40d3fafa3d2014e7d08e5f5e2728bce5d4263721" "sha256:3c9fa3c53a01ca4728f08aeb15bfa2e8123c1877deed79327e4151d524d58aac"
make_env "img-749e3791ac3f" "local"
OUT=$(run_check); ST=$?
[ "$ST" -eq 1 ] && pass "exit 1 on drift" || fail "exit $ST, expected 1"
printf '%s' "$OUT" | grep -q "DRIFT" && pass "names the drift" || fail "drift not named"
printf '%s' "$OUT" | grep -q "would RECREATE web" && pass "states the consequence (recreate)" || fail "consequence not stated"
printf '%s' "$OUT" | grep -q "DRIFT DETECTED" && pass "final result is a failure" || fail "final result not a failure"

echo "== 3. mutable tag warns but does not fail (current api reality) =="
make_docker "749e3791ac3f" "3c9fa3c53a01" "sha256:749e3791ac3f513c33f8d77f40d3fafa3d2014e7d08e5f5e2728bce5d4263721" "sha256:3c9fa3c53a01ca4728f08aeb15bfa2e8123c1877deed79327e4151d524d58aac"
make_env "local" "c9cf9e5"
OUT=$(run_check); ST=$?
[ "$ST" -eq 0 ] && pass "mutable tag does not fail the check" || fail "exit $ST, expected 0"
printf '%s' "$OUT" | grep -q "MUTABLE tag" && pass "warns about the mutable tag" || fail "no mutable-tag warning"
printf '%s' "$OUT" | grep -q "mutable-tag warning(s) outstanding" && pass "warning surfaces in the result line" || fail "result line omits the warning"
printf '%s' "$OUT" | grep -q "Retire at the next api deploy" && pass "states how the debt is retired" || fail "no remediation guidance"

echo "== 4. a lying anchor tag is caught =="
# Tag claims img-749e3791ac3f but resolves to a different image.
make_docker "deadbeef1234" "3c9fa3c53a01" "sha256:deadbeef1234000000000000000000000000000000000000000000000000dead" "sha256:3c9fa3c53a01ca4728f08aeb15bfa2e8123c1877deed79327e4151d524d58aac"
make_env "img-749e3791ac3f" "c9cf9e5"
OUT=$(run_check); ST=$?
[ "$ST" -eq 1 ] && pass "exit 1 when the anchor tag lies" || fail "exit $ST, expected 1"
printf '%s' "$OUT" | grep -q "claims image 749e3791ac3f but points at deadbeef1234" && pass "names both the claim and the truth" || fail "mismatch not explained"

echo "== 5. missing image / missing pin are caught =="
make_docker "" "3c9fa3c53a01" "sha256:749e3791ac3f513c33f8d77f40d3fafa3d2014e7d08e5f5e2728bce5d4263721" "sha256:3c9fa3c53a01ca4728f08aeb15bfa2e8123c1877deed79327e4151d524d58aac"
make_env "img-nonexistent" "c9cf9e5"
OUT=$(run_check); ST=$?
[ "$ST" -eq 1 ] && pass "exit 1 when the pinned image is absent" || fail "exit $ST, expected 1"
printf '%s' "$OUT" | grep -q "does not exist locally" && pass "explains the image is missing" || fail "missing image not explained"

make_docker "749e3791ac3f" "3c9fa3c53a01" "sha256:749e3791ac3f513c33f8d77f40d3fafa3d2014e7d08e5f5e2728bce5d4263721" "sha256:3c9fa3c53a01ca4728f08aeb15bfa2e8123c1877deed79327e4151d524d58aac"
printf 'DB_PASSWORD=synthetic\nWEB_IMAGE_TAG=c9cf9e5\n' > "$TMP/proj/.env"; chmod 600 "$TMP/proj/.env"
OUT=$(run_check); ST=$?
[ "$ST" -eq 1 ] && pass "exit 1 when a pin key is absent entirely" || fail "exit $ST, expected 1"
printf '%s' "$OUT" | grep -q "fall back to ':local'" && pass "explains the fallback hazard" || fail "fallback hazard not explained"

echo "== 6. never leaks secrets, never mutates =="
make_docker "749e3791ac3f" "3c9fa3c53a01" "sha256:749e3791ac3f513c33f8d77f40d3fafa3d2014e7d08e5f5e2728bce5d4263721" "sha256:3c9fa3c53a01ca4728f08aeb15bfa2e8123c1877deed79327e4151d524d58aac"
make_env "local" "c9cf9e5"
BEFORE=$(sha256sum "$TMP/proj/.env")
OUT=$(run_check)
AFTER=$(sha256sum "$TMP/proj/.env")
if printf '%s' "$OUT" | grep -q "synthetic-not-a-real-secret"; then
  fail "output leaked a secret value"
else
  pass "output contains no secret values"
fi
[ "$BEFORE" = "$AFTER" ] && pass ".env is not modified by the check" || fail "check mutated .env"
# A read-only checker must never INVOKE a mutating docker verb. The naive grep for this matches the
# script's own comments and the `docker compose up -d` it names inside warning text, so strip
# comment lines and echo/printf output lines first and only then look for docker in command
# position (line start, or after $( | && ; ).
CODE=$(sed 's/#.*//' "$CHECK" | grep -vE '^[[:space:]]*(echo|printf)\b')
if printf '%s\n' "$CODE" | grep -qE '(^|[;&|]|\$\()[[:space:]]*docker[[:space:]]+(run|start|stop|rm|rmi|build|tag|compose|create|exec)\b'; then
  fail "checker invokes a mutating docker verb"
else
  pass "checker only uses read-only docker verbs (images/inspect)"
fi
# ...and the read-only verbs it does use must actually be present, so the check above cannot pass
# vacuously by the script having stopped calling docker at all.
if printf '%s\n' "$CODE" | grep -qE 'docker[[:space:]]+(images|inspect)\b'; then
  pass "checker does call the read-only docker verbs"
else
  fail "checker calls no docker read verbs -- assertion above would be vacuous"
fi

echo "== 7. usage errors =="
OUT=$( ( PATH="$TMP/bin:$PATH" "$TMP/proj/scripts/verify-release-pins.sh" "$TMP/nope" 2>&1 ) ); ST=$?
[ "$ST" -eq 2 ] && pass "exit 2 when the project dir has no .env" || fail "exit $ST, expected 2"

echo
echo "== summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
