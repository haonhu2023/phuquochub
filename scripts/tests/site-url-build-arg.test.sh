#!/bin/bash
# Site-URL build-arg gap (2026-08-29) — tests that scripts/deploy.sh's web image build always
# passes NEXT_PUBLIC_SITE_URL, and fails BEFORE any `docker build` runs if it is missing/blank.
#
# NO real Docker build. `docker` is replaced by a stub on PATH (same technique as
# scripts/tests/scripts.test.sh) that records its argv to a log file and exits 0/1 as scripted --
# nothing is ever actually built. Real deploy.sh is executed unmodified; it is never sourced or
# reimplemented here.
#
# THE BUG this closes: apps/web/Dockerfile declares `ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000`
# as a *local-dev* convenience default. deploy.sh's web `docker build` call already passed
# --build-arg for NEXT_PUBLIC_API_URL and NEXT_PUBLIC_MAP_TILE_URL but never for
# NEXT_PUBLIC_SITE_URL -- an unmodified `docker build` from deploy.sh therefore silently baked
# `http://localhost:3000` into metadataBase/sitemap.ts/robots.ts/JSON-LD in a PRODUCTION image, and
# because Next.js inlines NEXT_PUBLIC_* at build time, nothing at runtime could ever correct it.
# The one deploy of commit 4ed9af7 that shipped correctly did NOT go through this script -- it went
# through a one-off `deploy-c9cf9e5.sh` that happened to pass the build-arg by hand.
#
# Run: bash scripts/tests/site-url-build-arg.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
DEPLOY="$REPO_ROOT/scripts/deploy.sh"
WEB_DF="$REPO_ROOT/apps/web/Dockerfile"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }

for f in "$DEPLOY" "$WEB_DF"; do
  [ -f "$f" ] || { echo "FATAL: $f not found"; exit 1; }
done

# ------------------------------------------------------------------------------------------------
echo "== static: deploy.sh's web build block =="
# Same block-extraction technique as image-provenance.test.sh: from the web `docker build` line to
# the next blank line.
WEB_BLOCK=$(awk '/docker build .*apps\/web\/Dockerfile/,/^$/' "$DEPLOY")

if printf '%s\n' "$WEB_BLOCK" | grep -qE -- '--build-arg "NEXT_PUBLIC_SITE_URL=\$SITE_URL"'; then
  pass "web build passes --build-arg NEXT_PUBLIC_SITE_URL=\$SITE_URL"
else
  fail "web build does not pass NEXT_PUBLIC_SITE_URL as a build-arg"
fi

# Must come from the environment via a variable, never a hardcoded domain literal on the
# --build-arg line itself (the API/tile args are allowed a hardcoded FALLBACK -- see below -- but
# SITE_URL must not silently default to anything, hardcoded or otherwise).
if printf '%s\n' "$WEB_BLOCK" | grep -qE -- '--build-arg "NEXT_PUBLIC_SITE_URL=https?://[^$]'; then
  fail "NEXT_PUBLIC_SITE_URL build-arg is hardcoded instead of sourced from \$SITE_URL"
else
  pass "NEXT_PUBLIC_SITE_URL build-arg is not hardcoded"
fi

# No regression: the two pre-existing build-args must be byte-identical to before this change.
if printf '%s\n' "$WEB_BLOCK" | grep -qF -- '--build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-https://phuquochub.com/api}"'; then
  pass "NEXT_PUBLIC_API_URL build-arg unchanged (no regression)"
else
  fail "NEXT_PUBLIC_API_URL build-arg changed or missing"
fi
if printf '%s\n' "$WEB_BLOCK" | grep -qF -- '--build-arg "NEXT_PUBLIC_MAP_TILE_URL=$TILE_URL"'; then
  pass "NEXT_PUBLIC_MAP_TILE_URL build-arg unchanged (no regression)"
else
  fail "NEXT_PUBLIC_MAP_TILE_URL build-arg changed or missing"
fi
if printf '%s\n' "$WEB_BLOCK" | grep -qE -- '--build-arg "GIT_COMMIT=\$TAG"' \
  && printf '%s\n' "$WEB_BLOCK" | grep -qE -- '--build-arg "BUILD_DATE=\$BUILD_DATE"'; then
  pass "provenance build-args (GIT_COMMIT/BUILD_DATE) unchanged (no regression)"
else
  fail "provenance build-args changed or missing"
fi

echo "== static: fail-fast, not a silent localhost fallback =="
# The assignment must use ':?' (fail on unset/blank), never ':-' (silent default) -- that is the
# whole point: unlike API_URL/TILE_URL, this one must not have a fallback at all.
SITE_URL_LINE=$(grep -nE '^SITE_URL=' "$DEPLOY")
if printf '%s' "$SITE_URL_LINE" | grep -qE '\$\{NEXT_PUBLIC_SITE_URL:\?'; then
  pass "SITE_URL uses \${NEXT_PUBLIC_SITE_URL:?...} (fails on unset/blank)"
else
  fail "SITE_URL assignment does not fail-fast on unset/blank: $SITE_URL_LINE"
fi
if printf '%s' "$SITE_URL_LINE" | grep -qE '\$\{NEXT_PUBLIC_SITE_URL:-'; then
  fail "SITE_URL still has a ':-' silent-default form -- localhost could ship to production"
else
  pass "SITE_URL has no ':-' silent-default form"
fi
# The fail-fast assignment must appear BEFORE the web docker build call (execution order), not
# merely exist somewhere in the file.
SITE_URL_LN=$(grep -n '^SITE_URL=' "$DEPLOY" | head -1 | cut -d: -f1)
WEB_BUILD_LN=$(grep -n 'docker build .*apps/web/Dockerfile' "$DEPLOY" | head -1 | cut -d: -f1)
if [ -n "$SITE_URL_LN" ] && [ -n "$WEB_BUILD_LN" ] && [ "$SITE_URL_LN" -lt "$WEB_BUILD_LN" ]; then
  pass "SITE_URL is resolved (line $SITE_URL_LN) before the web docker build call (line $WEB_BUILD_LN)"
else
  fail "SITE_URL resolution does not precede the web docker build call in the file"
fi

echo "== static: local-dev default in the Dockerfile is untouched =="
# Phase 4 scope: fix the deploy SCRIPT's gap, do not remove the Dockerfile's own local-dev
# convenience default (a bare 'docker build' with no --build-arg, e.g. local `docker compose up`,
# must keep working exactly as before).
if grep -qE '^ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000$' "$WEB_DF"; then
  pass "Dockerfile's local-dev ARG default (http://localhost:3000) is unchanged"
else
  fail "Dockerfile's NEXT_PUBLIC_SITE_URL ARG default changed or is missing"
fi

# ------------------------------------------------------------------------------------------------
echo "== behavioural: stubbed docker, real deploy.sh =="

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/proj"
CALLS="$TMP/calls.log"

# docker stub: logs argv, then exits 0 for everything EXCEPT the web build, whose exit code is
# controlled per-scenario via $WEB_BUILD_EXIT. This lets a single stub prove both scenarios without
# ever needing to fake migrate/smoke-test/cutover -- deploy.sh's `set -e` aborts the whole script
# the instant the web build call returns non-zero, which is exactly where this test wants to stop:
# right after capturing what args deploy.sh passed, before Step 6 onward ever runs.
make_docker_stub() {
  cat > "$TMP/bin/docker" <<EOF
#!/bin/sh
echo "docker \$*" >> "$CALLS"
case "\$*" in
  *"apps/web/Dockerfile"*) exit "\${WEB_BUILD_EXIT:-0}" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "$TMP/bin/docker"
}
make_docker_stub

run_deploy() {
  ( PATH="$TMP/bin:$PATH" bash "$DEPLOY" test-site-url-tag "$TMP/proj" ) > "$TMP/out.log" 2>&1
  echo $?
}

echo "-- scenario: NEXT_PUBLIC_SITE_URL unset --"
: > "$CALLS"
unset NEXT_PUBLIC_SITE_URL 2>/dev/null || true
ST=$(env -u NEXT_PUBLIC_SITE_URL WEB_BUILD_EXIT=0 sh -c "PATH=\"$TMP/bin:\$PATH\" bash \"$DEPLOY\" test-site-url-tag \"$TMP/proj\"" > "$TMP/out.log" 2>&1; echo $?)
if [ "$ST" != "0" ]; then pass "deploy.sh exits non-zero when NEXT_PUBLIC_SITE_URL is unset"; else fail "deploy.sh exited 0 with NEXT_PUBLIC_SITE_URL unset"; fi
if grep -q "NEXT_PUBLIC_SITE_URL" "$TMP/out.log"; then pass "failure message names NEXT_PUBLIC_SITE_URL"; else fail "failure message does not mention NEXT_PUBLIC_SITE_URL: $(cat "$TMP/out.log")"; fi
if grep -qF 'apps/web/Dockerfile' "$CALLS"; then fail "web docker build was invoked despite missing NEXT_PUBLIC_SITE_URL -- fail-fast did not happen before the build"; else pass "web docker build was NEVER invoked (fail-fast happened before the build)"; fi
# The error message is ALLOWED to mention localhost:3000 by name (it explains what would have
# been baked in); what must never happen is localhost reaching an actual docker invocation.
if grep -qi 'localhost' "$CALLS"; then fail "a localhost value reached a docker invocation"; else pass "no localhost value reached any docker invocation"; fi
if grep -qiE 'PASSWORD=|SECRET=|change-me' "$TMP/out.log"; then fail "a secret-looking value appeared in captured output"; else pass "no secret-looking value in captured output"; fi

echo "-- scenario: NEXT_PUBLIC_SITE_URL blank --"
: > "$CALLS"
ST=$(env NEXT_PUBLIC_SITE_URL='' WEB_BUILD_EXIT=0 sh -c "PATH=\"$TMP/bin:\$PATH\" bash \"$DEPLOY\" test-site-url-tag \"$TMP/proj\"" > "$TMP/out.log" 2>&1; echo $?)
if [ "$ST" != "0" ]; then pass "deploy.sh exits non-zero when NEXT_PUBLIC_SITE_URL is blank"; else fail "deploy.sh exited 0 with NEXT_PUBLIC_SITE_URL=''"; fi
if grep -qF 'apps/web/Dockerfile' "$CALLS"; then fail "web docker build was invoked despite blank NEXT_PUBLIC_SITE_URL"; else pass "web docker build was NEVER invoked for a blank value either"; fi

echo "-- scenario: NEXT_PUBLIC_SITE_URL set -- build-arg propagates, then the injected failure stops the script right after --"
: > "$CALLS"
ST=$(env NEXT_PUBLIC_SITE_URL='https://phuquochub.com' WEB_BUILD_EXIT=1 sh -c "PATH=\"$TMP/bin:\$PATH\" bash \"$DEPLOY\" test-site-url-tag \"$TMP/proj\"" > "$TMP/out.log" 2>&1; echo $?)
if [ "$ST" != "0" ]; then pass "script proceeded past the SITE_URL check (stopped later by the injected build failure, as designed)"; else fail "script exited 0 unexpectedly"; fi
WEB_CALL=$(grep 'apps/web/Dockerfile' "$CALLS" || true)
if [ -n "$WEB_CALL" ]; then pass "web docker build WAS invoked once NEXT_PUBLIC_SITE_URL is set"; else fail "web docker build was never invoked even though NEXT_PUBLIC_SITE_URL was set"; fi
if printf '%s' "$WEB_CALL" | grep -qF -- '--build-arg NEXT_PUBLIC_SITE_URL=https://phuquochub.com'; then
  pass "the exact value of NEXT_PUBLIC_SITE_URL reached the docker build argv"
else
  fail "NEXT_PUBLIC_SITE_URL value did not reach the docker build argv: $WEB_CALL"
fi
if printf '%s' "$WEB_CALL" | grep -qF -- '--build-arg NEXT_PUBLIC_API_URL=https://phuquochub.com/api'; then
  pass "NEXT_PUBLIC_API_URL still reaches the docker build argv (no regression)"
else
  fail "NEXT_PUBLIC_API_URL did not reach the docker build argv"
fi
if printf '%s' "$WEB_CALL" | grep -qF -- '--build-arg NEXT_PUBLIC_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png'; then
  pass "NEXT_PUBLIC_MAP_TILE_URL still reaches the docker build argv (no regression)"
else
  fail "NEXT_PUBLIC_MAP_TILE_URL did not reach the docker build argv"
fi
API_CALL=$(grep 'apps/api/Dockerfile' "$CALLS" || true)
if [ -n "$API_CALL" ]; then pass "api docker build still ran before the web build (step order preserved)"; else fail "api docker build never ran"; fi

# ------------------------------------------------------------------------------------------------
echo "== behavioural: exact canonical-origin match (2026-08-29 hardening, round 2) =="
# This repo serves exactly ONE production origin (infrastructure/caddy/Caddyfile's only
# non-redirect, non-media site block is `phuquochub.com, :8080 { ... }`; www 301-redirects to it;
# CORS_ALLOWED_ORIGINS defaults to it). An earlier shape+blocklist regex REJECTED localhost/
# loopback/www but still ACCEPTED arbitrary well-formed domains -- independently proven:
# `https://example.com`, `https://evil.example`, `https://phuquochub.co` (a typo), and
# `https://phuquochub.com.evil.example` (a suffix attack) all passed and baked into the build-arg.
# Every case below proves the Docker stub is NEVER invoked for the web build on anything other
# than the exact canonical origin -- the check must happen before docker build, not merely before
# cutover.

run_with_url() {
  # $1 = value to set NEXT_PUBLIC_SITE_URL to (use the literal string "UNSET" to unset it)
  : > "$CALLS"
  if [ "$1" = "UNSET" ]; then
    ( unset NEXT_PUBLIC_SITE_URL; PATH="$TMP/bin:$PATH" WEB_BUILD_EXIT=1 bash "$DEPLOY" test-site-url-tag "$TMP/proj" ) > "$TMP/out.log" 2>&1
  else
    ( export NEXT_PUBLIC_SITE_URL="$1"; PATH="$TMP/bin:$PATH" WEB_BUILD_EXIT=1 bash "$DEPLOY" test-site-url-tag "$TMP/proj" ) > "$TMP/out.log" 2>&1
  fi
  echo $?
}

assert_blocked() {
  label="$1"; value="$2"
  st=$(run_with_url "$value")
  webcall=$(grep -F 'apps/web/Dockerfile' "$CALLS" || true)
  if [ -z "$webcall" ]; then
    pass "[$label] blocked before web docker build (exit=$st)"
  else
    fail "[$label] web docker build ran for an invalid URL: $webcall"
  fi
  if [ "$st" = "0" ]; then fail "[$label] deploy.sh exited 0 for an invalid URL"; fi
}

assert_allowed() {
  label="$1"; value="$2"; expected_baked="$3"
  st=$(run_with_url "$value")
  webcall=$(grep -F 'apps/web/Dockerfile' "$CALLS" || true)
  if [ -z "$webcall" ]; then
    fail "[$label] web docker build never ran for a valid URL"
    return
  fi
  pass "[$label] web docker build ran (exit=$st, stopped by the injected build failure as designed)"
  if printf '%s' "$webcall" | grep -qF -- "--build-arg NEXT_PUBLIC_SITE_URL=$expected_baked"; then
    pass "[$label] baked value is exactly '$expected_baked'"
  else
    fail "[$label] baked value did not match '$expected_baked': $webcall"
  fi
}

# --- reject: presence/whitespace ---
assert_blocked "unset"                 "UNSET"
assert_blocked "empty"                 ""
assert_blocked "whitespace-only"       "   "
assert_blocked "leading-whitespace"    " https://phuquochub.com"
assert_blocked "trailing-whitespace"   "https://phuquochub.com "

# --- reject: scheme / loopback / localhost family ---
assert_blocked "http-localhost"        "http://localhost:3000"
assert_blocked "https-localhost"       "https://localhost"
assert_blocked "http-127.0.0.1"        "http://127.0.0.1:3000"
assert_blocked "https-127.0.0.1"       "https://127.0.0.1"
assert_blocked "https-ipv6-loopback"   "https://[::1]"
assert_blocked "http-real-domain"      "http://phuquochub.com"

# --- reject: malformed / dangerous schemes ---
assert_blocked "javascript-scheme"     "javascript:alert(1)"
assert_blocked "malformed-string"      "definitely not a url"

# --- reject: shape violations ---
assert_blocked "credentials"           "https://user:pass@phuquochub.com"
assert_blocked "extra-path"            "https://phuquochub.com/some/path"
assert_blocked "query-string"          "https://phuquochub.com?x=1"
assert_blocked "fragment"              "https://phuquochub.com#section"

# --- reject: www is a redirect target, not the canonical origin (infrastructure/caddy/Caddyfile) ---
assert_blocked "www-subdomain"         "https://www.phuquochub.com"

# --- reject: arbitrary/lookalike domains -- THE independent-review finding this round closes.
#     A shape-only validator (scheme+hostname+no-port/path/query/fragment, rejecting only a small
#     localhost/loopback/www blocklist) is NOT the same thing as "this one specific domain", and
#     every value below is a perfectly well-formed HTTPS origin that such a validator would accept.
assert_blocked "arbitrary-domain"      "https://example.com"
assert_blocked "arbitrary-domain-2"    "https://evil.example"
assert_blocked "one-char-typo"         "https://phuquochub.co"
assert_blocked "suffix-attack"         "https://phuquochub.com.evil.example"
assert_blocked "trailing-dot"          "https://phuquochub.com."
assert_blocked "uppercase-domain"      "https://PHUQUOCHUB.COM"
assert_blocked "decimal-loopback"      "https://2130706433"
assert_blocked "hex-loopback"          "https://0x7f000001"
assert_blocked "octal-loopback"        "https://127.1"
assert_blocked "private-ip-10"         "https://10.0.0.5"
assert_blocked "private-ip-192"        "https://192.168.1.1"
assert_blocked "link-local-ip"         "https://169.254.169.254"

# --- reject: embedded newline defeats a LINE-ORIENTED check but not a whole-value `case` match.
#     Independently proven against the PRIOR `grep -qE '^...$'` mechanism: `grep -q` succeeds if
#     ANY line matches, so a value with the canonical URL on one line and garbage on another made
#     the check pass while the garbage line was what actually reached the docker build-arg. `case`
#     matches the ENTIRE parameter as one string, so this class of bypass no longer exists -- these
#     assertions pin that fix, not merely re-test "rejects a bad value".
assert_blocked "newline-junk-then-valid"  "$(printf 'JUNK-NOT-A-URL\nhttps://phuquochub.com')"
assert_blocked "newline-valid-then-evil"  "$(printf 'https://phuquochub.com\nevil.example')"
assert_blocked "newline-before-valid"     "$(printf '\nhttps://phuquochub.com')"
# NOTE: `$(printf 'https://phuquochub.com\n')` would NOT test what it looks like it tests --
# command substitution strips ALL trailing newlines from its output (POSIX-mandated), so that
# construction silently collapses to the byte-identical accepted value. ANSI-C quoting (`$'...'`)
# is not subject to that stripping and genuinely preserves the trailing newline in the variable.
assert_blocked "newline-after-valid"      $'https://phuquochub.com\n'
assert_blocked "carriage-return"          "$(printf 'https://phuquochub.com\r')"
assert_blocked "embedded-tab"             "$(printf 'https://phuquochub.com\tx')"

# --- reject: shell metacharacters / command-substitution-shaped strings (quoting proof, not just
#     "gets rejected" -- see the dedicated command-injection check further below).
assert_blocked "cmd-subst-shaped"      'https://phuquochub.com$(id)'
assert_blocked "backtick-shaped"       'https://phuquochub.com`id`'
assert_blocked "semicolon-shaped"      'https://phuquochub.com; id'
assert_blocked "pipe-shaped"           'https://phuquochub.com|id'
assert_blocked "glob-shaped"           'https://phuquochub.com*'

# --- accept: the two documented production-valid forms, exact byte match required ---
assert_allowed "bare-origin"           "https://phuquochub.com"  "https://phuquochub.com"
assert_allowed "trailing-slash"        "https://phuquochub.com/" "https://phuquochub.com"

echo "== log-injection safety: rejected value is never echoed verbatim =="
# A rejected value MAY contain control characters (proven above); the failure message must state
# the valid contract without ever reproducing what was actually submitted, so a malicious value
# can't forge extra log lines or otherwise mislead whoever reads deploy output.
INJECT_MARKER="MARKER-$$-MUST-NOT-APPEAR-IN-OUTPUT"
: > "$CALLS"
( export NEXT_PUBLIC_SITE_URL="$(printf '%s\nhttps://phuquochub.com' "$INJECT_MARKER")"; \
  PATH="$TMP/bin:$PATH" WEB_BUILD_EXIT=1 bash "$DEPLOY" test-site-url-tag "$TMP/proj" ) > "$TMP/inject.log" 2>&1
if grep -qF "$INJECT_MARKER" "$TMP/inject.log"; then
  fail "the rejected value's content was echoed verbatim into deploy output (log-injection risk)"
else
  pass "the rejected value's content is never echoed verbatim into deploy output"
fi
if grep -qF 'apps/web/Dockerfile' "$CALLS"; then
  fail "web docker build ran despite an injected multi-line value"
else
  pass "web docker build did not run for an injected multi-line value"
fi

echo "== command injection: no eval, no unquoted expansion =="
# Real proof, not just "the value was rejected": a canary file must NEVER appear on disk, for any
# of the shell-metacharacter-shaped values already exercised above as reject cases.
CANARY="$TMP/injection-canary-$$"
rm -f "$CANARY"
( export NEXT_PUBLIC_SITE_URL="https://phuquochub.com\$(touch $CANARY)"; \
  PATH="$TMP/bin:$PATH" bash "$DEPLOY" test-site-url-tag "$TMP/proj" ) > /dev/null 2>&1 || true
( export NEXT_PUBLIC_SITE_URL="https://phuquochub.com\`touch $CANARY\`"; \
  PATH="$TMP/bin:$PATH" bash "$DEPLOY" test-site-url-tag "$TMP/proj" ) > /dev/null 2>&1 || true
( export NEXT_PUBLIC_SITE_URL="https://phuquochub.com; touch $CANARY"; \
  PATH="$TMP/bin:$PATH" bash "$DEPLOY" test-site-url-tag "$TMP/proj" ) > /dev/null 2>&1 || true
if [ -e "$CANARY" ]; then
  fail "command injection succeeded -- canary file was created"
else
  pass "no command injection -- canary file was never created for any metacharacter-shaped value"
fi

echo
echo "== summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
