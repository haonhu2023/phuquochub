#!/bin/bash
# Web SSR runtime regression (2026-09-06) — the production incident this closes had two parts:
#   1. docker-compose.prod.yml's `web` service never set API_INTERNAL_URL, so every SSR/RSC fetch
#      inside the container fell through apps/web/src/lib/api.ts's fail-closed throw in
#      NODE_ENV=production.
#   2. scripts/smoke-test.sh still expected `/` -> 200, but apps/web/src/proxy.ts intentionally
#      redirects `/` -> `/vi` (307) — the smoke test's own expectation had gone stale and would not
#      have caught regression #1 either way (curl without -f treats a 3xx as a "pass" if the
#      expected code were still 200 there).
#
# NO Docker, NO network. Part A is static text assertions on docker-compose.prod.yml (same
# grep-on-source-text approach as scripts/tests/image-provenance.test.sh). Part B stubs `curl` on
# PATH (same stub-harness convention as scripts/tests/scripts.test.sh) to drive
# scripts/smoke-test.sh through both a healthy run and each of the regressions it must now catch.
#
# Run: bash scripts/tests/web-runtime-smoke.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
COMPOSE="$REPO_ROOT/docker-compose.prod.yml"
SMOKE_TEST="$REPO_ROOT/scripts/smoke-test.sh"

for f in "$COMPOSE" "$SMOKE_TEST"; do
  [ -f "$f" ] || { echo "FATAL: $f not found"; exit 1; }
done

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }
assert_status() { if [ "$1" = "$2" ]; then pass "$3"; else fail "$3 (exit $1, expected $2)"; fi; }

# ==================================================================================================
# Part A -- compose contract (static, text-level, same technique image-provenance.test.sh uses).
# ==================================================================================================
echo "== docker-compose.prod.yml: web runtime carries API_INTERNAL_URL =="

# Isolate the `web:` service block only (up to the next top-level `  <name>:` key) -- asserting on
# the whole file would let a match on an unrelated service (or the `web.build.args` NEXT_PUBLIC_*
# block just above it) pass this test for the wrong reason.
WEB_BLOCK=$(awk '/^  web:/{f=1} f{print} f && /^  [a-zA-Z]/ && !/^  web:/ && NR>1{if(c++>0) exit}' "$COMPOSE")

if printf '%s' "$WEB_BLOCK" | grep -qE '^\s*API_INTERNAL_URL:'; then
  pass "web.environment declares API_INTERNAL_URL"
else
  fail "web.environment does not declare API_INTERNAL_URL -- SSR fetches will fail-closed in production"
fi

if printf '%s' "$WEB_BLOCK" | grep -qF 'API_INTERNAL_URL: ${API_INTERNAL_URL:-http://api:4000/api}'; then
  pass "API_INTERNAL_URL defaults to the Docker-network service address (http://api:4000/api)"
else
  fail "API_INTERNAL_URL is missing or its default is not http://api:4000/api"
fi

if printf '%s' "$WEB_BLOCK" | grep -q 'NEXT_PUBLIC_API_INTERNAL_URL'; then
  fail "API_INTERNAL_URL was renamed to NEXT_PUBLIC_API_INTERNAL_URL -- Next.js would bake it into" \
       "the client bundle at build time, defeating the whole point (server-only, never public)"
else
  pass "API_INTERNAL_URL is NOT prefixed NEXT_PUBLIC_ (stays server-only, never bundled to the client)"
fi

if printf '%s' "$WEB_BLOCK" | grep -qE '^\s*NODE_ENV:\s*production'; then
  pass "web.environment still declares NODE_ENV: production (unchanged)"
else
  fail "web.environment lost NODE_ENV: production"
fi

# ==================================================================================================
# Part B -- scripts/smoke-test.sh behaviour, with a stubbed `curl` on PATH.
# ==================================================================================================
echo "== scripts/smoke-test.sh: root/locale routing checks =="

new_env() {
  ENVDIR=$(mktemp -d)
  mkdir -p "$ENVDIR/bin"
  CALLS="$ENVDIR/calls.log"
  : > "$CALLS"
}
del_env() { [ -n "${ENVDIR:-}" ] && rm -rf "$ENVDIR"; }

# make_curl <root_code> <root_location> <vi_code> <unknown_code> <place_code> <place_body>
# A stub matching only the two curl invocation shapes smoke-test.sh actually uses:
#   curl -sS -o <body> -D <headers> -w '%{http_code}' <url>   (root check)
#   curl -sS -o <body>              -w '%{http_code}' <url>   (check() helper -- /vi, unknown, place)
# It logs every requested URL (one per line) so tests can assert WHICH path was actually hit --
# this is what proves the optional place check moved to /vi/places/$SLUG, not just that some 200
# came back from somewhere.
make_curl() {
  ROOT_CODE="$1" ROOT_LOCATION="$2" VI_CODE="$3" UNKNOWN_CODE="$4" PLACE_CODE="$5" PLACE_BODY="$6"
  cat > "$ENVDIR/bin/curl" <<'STUBEOF'
#!/bin/sh
URL=""
OUT=""
HDR=""
for a in "$@"; do
  case "$PREV" in
    -o) OUT="$a" ;;
    -D) HDR="$a" ;;
  esac
  PREV="$a"
  case "$a" in
    http://*|https://*) URL="$a" ;;
  esac
done
echo "$URL" >> "__CALLS__"

case "$URL" in
  */api/health)
    # Not under test here (Part A/root-routing is this file's focus) -- always healthy so it never
    # masks the root/locale assertions the scenarios below actually exist to prove.
    [ -n "$OUT" ] && : > "$OUT"
    printf '200'
    ;;
  */vi/places/*)
    [ -n "$OUT" ] && printf '%s' "__PLACE_BODY__" > "$OUT"
    printf '%s' "__PLACE_CODE__"
    ;;
  */__smoke-test-unknown-route__)
    [ -n "$OUT" ] && : > "$OUT"
    printf '%s' "__UNKNOWN_CODE__"
    ;;
  */vi)
    [ -n "$OUT" ] && : > "$OUT"
    printf '%s' "__VI_CODE__"
    ;;
  *)
    # root ("/" or bare base URL) -- the only call that ever passes -D
    [ -n "$OUT" ] && : > "$OUT"
    if [ -n "$HDR" ]; then
      printf 'HTTP/1.1 __ROOT_CODE__\r\nLocation: __ROOT_LOCATION__\r\n\r\n' > "$HDR"
    fi
    printf '%s' "__ROOT_CODE__"
    ;;
esac
STUBEOF
  # Substitute the scripted values into the stub (avoids fighting heredoc quoting for values that
  # may themselves contain slashes/colons -- sed with a rare delimiter sidesteps that entirely).
  sed -i \
    -e "s#__CALLS__#$CALLS#g" \
    -e "s#__ROOT_CODE__#$ROOT_CODE#g" \
    -e "s#__ROOT_LOCATION__#$ROOT_LOCATION#g" \
    -e "s#__VI_CODE__#$VI_CODE#g" \
    -e "s#__UNKNOWN_CODE__#$UNKNOWN_CODE#g" \
    -e "s#__PLACE_CODE__#$PLACE_CODE#g" \
    -e "s#__PLACE_BODY__#$PLACE_BODY#g" \
    "$ENVDIR/bin/curl"
  chmod +x "$ENVDIR/bin/curl"
}

run_smoke() {
  # $1 = slug (may be empty). smoke-test.sh's own [smoke-test]-prefixed output is captured to
  # $ENVDIR/smoke.log for optional debugging, NOT mixed into the exit-code capture below.
  (PATH="$ENVDIR/bin:$PATH" sh "$SMOKE_TEST" "http://fake-host" "$1") > "$ENVDIR/smoke.log" 2>&1
  echo $?
}

# --- Scenario 1: healthy stack -- root 307 -> /vi, /vi 200, unknown 404, no slug given ------------
new_env
make_curl 307 "http://fake-host/vi" 200 404 000 ""
STATUS=$(run_smoke "")
assert_status "$STATUS" "0" "healthy stack (307 root, correct Location, /vi 200, unknown 404) -> exit 0"
del_env

# --- Scenario 2: regression -- root back to a bare 200 (the exact incident) ----------------------
new_env
make_curl 200 "http://fake-host/vi" 200 404 000 ""
STATUS=$(run_smoke "")
assert_status "$STATUS" "1" "root serving 200 instead of 307 -> exit non-zero (catches the incident's own regression)"
del_env

# --- Scenario 3: wrong redirect target (Location does not point at /vi) --------------------------
new_env
make_curl 307 "http://fake-host/en" 200 404 000 ""
STATUS=$(run_smoke "")
assert_status "$STATUS" "1" "root 307 to the wrong locale -> exit non-zero"
del_env

# --- Scenario 4: relative Location form (/vi) is also accepted, not just absolute -----------------
new_env
make_curl 307 "/vi" 200 404 000 ""
STATUS=$(run_smoke "")
assert_status "$STATUS" "0" "root 307 with a relative /vi Location -> still exit 0"
del_env

# --- Scenario 5: optional place check is locale-prefixed (/vi/places/$SLUG, not /places/$SLUG) ---
new_env
make_curl 307 "http://fake-host/vi" 200 404 200 "<html>PhuQuocHub</html>"
STATUS=$(run_smoke "dinh-cau")
assert_status "$STATUS" "0" "locale-prefixed place check passes when the stub serves /vi/places/dinh-cau"
if grep -qF '/vi/places/dinh-cau' "$CALLS"; then
  pass "smoke-test.sh actually requested /vi/places/dinh-cau (not the old unprefixed /places/dinh-cau)"
else
  fail "smoke-test.sh never requested /vi/places/dinh-cau -- calls were: $(tr '\n' ' ' < "$CALLS")"
fi
if grep -qE '(^|[^/])/places/dinh-cau' "$CALLS" | grep -v '/vi/places/'; then
  fail "smoke-test.sh also hit the old unprefixed /places/dinh-cau"
fi
del_env

echo
echo "== summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
