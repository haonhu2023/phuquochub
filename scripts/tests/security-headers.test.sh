#!/bin/bash
# HTTP security headers (2026-08-15) — static tests for infrastructure/caddy/Caddyfile.
#
# NO Docker daemon, NO network, NO running container is required or touched. `caddy validate` runs
# only when a caddy binary/image is already available, and is skipped otherwise.
#
# WHAT THIS PINS
# --------------
# The header policy is derived from THIS application, and three of its clauses are load-bearing in
# ways that are easy to "clean up" later and silently break production:
#   * connect-src must include the media origin -- uploadPipeline.ts PUTs files straight to the
#     presigned object-storage URL from the browser. Dropping it breaks every upload while the rest
#     of the site keeps working, so no smoke test would notice.
#   * worker-src must allow blob: -- maplibre-gl builds its web worker via Blob + createObjectURL.
#   * img-src must allow data: and blob: -- maplibre marker/control URIs, and the local file
#     preview created by URL.createObjectURL in useSingleImageUpload.ts.
# It also pins the EXISTING media hardening (no Host rewrite, no method filter, /minio/* refused)
# which several of these header edits sit next to.
#
# Run: bash scripts/tests/security-headers.test.sh
#
# NOTE on `pipefail`: deliberately NOT enabled. Every assertion below is `printf "$block" | grep -q`,
# and `grep -q` exits the instant it matches — which SIGPIPEs the still-writing printf. Under
# `pipefail` the pipeline then reports 141 and the assertion FAILS EVEN THOUGH THE MATCH SUCCEEDED,
# non-deterministically, depending on whether the block fits the 64 KB pipe buffer. Observed here:
# the same suite reported the media block as passing in one run and failing in the next. `set -u`
# is kept; pipefail buys nothing for these read-only greps.
set -u

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
CADDYFILE="$REPO_ROOT/infrastructure/caddy/Caddyfile"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }

[ -f "$CADDYFILE" ] || { echo "FATAL: $CADDYFILE not found"; exit 1; }

# Strip comments so assertions never match explanatory prose (the file deliberately NAMES the
# dangerous directives in warnings, e.g. "do NOT add header_up Host").
CODE=$(sed -e 's/#.*//' "$CADDYFILE")

# Extract one site block's code by its address line.
block() { printf '%s\n' "$CODE" | awk -v a="$1" 'index($0,a)==1{f=1;print;next} f&&/^[^[:space:]}]/{exit} f{print}'; }

WEB_BLOCK=$(block 'phuquochub.com, :8080')
MEDIA_BLOCK=$(block 'media.phuquochub.com, :8081')
# The web app's own handler (the one carrying the full policy), excluding the /api handler.
CSP_LINE=$(printf '%s\n' "$CODE" | grep -E 'Content-Security-Policy(-Report-Only)? "default-src .self' | head -1)

echo "== 1. HSTS =="
HSTS_LINE=$(printf '%s\n' "$CODE" | grep -E 'Strict-Transport-Security' | head -1)
if [ -n "$HSTS_LINE" ]; then pass "HSTS present"; else fail "HSTS missing"; fi
printf '%s' "$HSTS_LINE" | grep -q 'max-age=31536000' \
  && pass "HSTS max-age is one year" || fail "HSTS max-age not 31536000"
# includeSubDomains/preload are deliberate NOs -- see the Caddyfile header comment.
if printf '%s\n' "$CODE" | grep -qi 'includeSubDomains'; then
  fail "HSTS includeSubDomains set -- not proven safe for all subdomains"
else
  pass "HSTS has no includeSubDomains (deliberate)"
fi
if printf '%s\n' "$CODE" | grep -qi 'preload'; then
  fail "HSTS preload set -- requires separate justification"
else
  pass "HSTS has no preload (deliberate)"
fi
# Every public host block must carry it, since includeSubDomains is off.
for b in "www.phuquochub.com" "media.phuquochub.com, :8081" "phuquochub.com, :8080"; do
  if printf '%s\n' "$(block "$b")" | grep -q 'import hsts\|Strict-Transport-Security'; then
    pass "HSTS covers host block: $b"
  else
    fail "host block missing HSTS: $b"
  fi
done

echo "== 2. frame protection =="
printf '%s\n' "$WEB_BLOCK" | grep -qE 'X-Frame-Options[[:space:]]+DENY' \
  && pass "X-Frame-Options: DENY on web" || fail "X-Frame-Options missing on web"
printf '%s' "$CSP_LINE" | grep -q "frame-ancestors 'none'" \
  && pass "CSP frame-ancestors 'none'" || fail "CSP frame-ancestors missing"
printf '%s' "$CSP_LINE" | grep -q "frame-src 'none'" \
  && pass "CSP frame-src 'none'" || fail "CSP frame-src missing"
# The two mechanisms must agree; DENY + frame-ancestors 'none' is the only consistent pair here.
if printf '%s\n' "$WEB_BLOCK" | grep -qiE 'X-Frame-Options[[:space:]]+(SAMEORIGIN|ALLOW-FROM)'; then
  fail "X-Frame-Options disagrees with frame-ancestors 'none'"
else
  pass "X-Frame-Options and frame-ancestors agree"
fi

echo "== 3. nosniff / referrer / permissions =="
printf '%s\n' "$WEB_BLOCK" | grep -q 'X-Content-Type-Options nosniff' \
  && pass "nosniff on web" || fail "nosniff missing on web"
printf '%s\n' "$MEDIA_BLOCK" | grep -q 'X-Content-Type-Options nosniff' \
  && pass "nosniff preserved on media" || fail "nosniff lost on media"
printf '%s\n' "$WEB_BLOCK" | grep -q 'Referrer-Policy "strict-origin-when-cross-origin"' \
  && pass "Referrer-Policy strict-origin-when-cross-origin" || fail "Referrer-Policy missing/changed"
printf '%s\n' "$WEB_BLOCK" | grep -q 'Permissions-Policy' \
  && pass "Permissions-Policy present" || fail "Permissions-Policy missing"
for feat in camera geolocation microphone payment; do
  printf '%s\n' "$WEB_BLOCK" | grep -q "$feat=()" \
    && pass "Permissions-Policy denies $feat" || fail "Permissions-Policy does not deny $feat"
done

echo "== 4. CSP: application-derived origins that MUST be present =="
[ -n "$CSP_LINE" ] && pass "web CSP present" || fail "web CSP missing"
printf '%s' "$CSP_LINE" | grep -q "connect-src[^;]*https://media.phuquochub.com" \
  && pass "connect-src allows media origin (presigned PUT upload path)" \
  || fail "connect-src missing media origin -- uploads would break"
printf '%s' "$CSP_LINE" | grep -q "connect-src[^;]*https://tile.openstreetmap.org" \
  && pass "connect-src allows tile origin" || fail "connect-src missing tile origin"
printf '%s' "$CSP_LINE" | grep -q "img-src[^;]*https://media.phuquochub.com" \
  && pass "img-src allows media origin" || fail "img-src missing media origin"
printf '%s' "$CSP_LINE" | grep -q "img-src[^;]*https://tile.openstreetmap.org" \
  && pass "img-src allows tile origin" || fail "img-src missing tile origin"
printf '%s' "$CSP_LINE" | grep -q "img-src[^;]*data:" \
  && pass "img-src allows data: (maplibre marker URIs)" || fail "img-src missing data:"
printf '%s' "$CSP_LINE" | grep -q "img-src[^;]*blob:" \
  && pass "img-src allows blob: (upload preview)" || fail "img-src missing blob:"
printf '%s' "$CSP_LINE" | grep -q "worker-src[^;]*blob:" \
  && pass "worker-src allows blob: (maplibre worker)" || fail "worker-src missing blob:"
printf '%s' "$CSP_LINE" | grep -q "script-src[^;]*'unsafe-inline'" \
  && pass "script-src allows inline (Next.js hydration, no nonce available)" \
  || fail "script-src forbids inline -- would break Next.js hydration"
printf '%s' "$CSP_LINE" | grep -q "style-src[^;]*'unsafe-inline'" \
  && pass "style-src allows inline (React style props)" || fail "style-src forbids inline"

echo "== 5. CSP: things that must NOT appear =="
if printf '%s' "$CSP_LINE" | grep -q "'unsafe-eval'"; then
  fail "'unsafe-eval' present -- maplibre-gl was proven not to need it"
else
  pass "no 'unsafe-eval'"
fi
printf '%s' "$CSP_LINE" | grep -q "object-src 'none'" \
  && pass "object-src 'none'" || fail "object-src not locked down"
printf '%s' "$CSP_LINE" | grep -q "base-uri 'self'" \
  && pass "base-uri 'self'" || fail "base-uri not restricted"
printf '%s' "$CSP_LINE" | grep -q "form-action 'self'" \
  && pass "form-action 'self'" || fail "form-action not restricted"
# COEP/COOP/CORP would break cross-origin media/tiles; they are deliberately absent.
for h in Cross-Origin-Embedder-Policy Cross-Origin-Resource-Policy; do
  if printf '%s\n' "$CODE" | grep -q "$h"; then
    fail "$h present -- not proven compatible with cross-origin media/tiles"
  else
    pass "$h deliberately absent"
  fi
done

echo "== 6. existing media hardening preserved =="
printf '%s\n' "$MEDIA_BLOCK" | grep -q 'respond 404' \
  && pass "/minio/* still refused" || fail "/minio/* block lost"
printf '%s\n' "$MEDIA_BLOCK" | grep -q -- '-Server' \
  && pass "MinIO Server fingerprint still stripped" || fail "-Server lost on media"
# Host must never be rewritten: SigV4 signs it.
if printf '%s\n' "$CODE" | grep -q 'header_up Host'; then
  fail "Host header is rewritten -- breaks every presigned SigV4 signature"
else
  pass "no Host rewrite anywhere (SigV4 safe)"
fi
# No global method filtering: media uses GET/PUT/HEAD/DELETE.
if printf '%s\n' "$CODE" | grep -qE '^[[:space:]]*(not )?method[[:space:]]'; then
  fail "method filtering present -- would break presigned uploads"
else
  pass "no global method restriction"
fi

echo "== 7. fingerprinting =="
printf '%s\n' "$WEB_BLOCK" | grep -q -- '-X-Powered-By' \
  && pass "X-Powered-By stripped" || fail "X-Powered-By not stripped"
# `Via` is a legitimate proxy-hop marker and is intentionally retained.
if printf '%s\n' "$CODE" | grep -q -- '-Via'; then
  fail "Via stripped -- it is a useful operational header, keep it"
else
  pass "Via intentionally retained"
fi

echo "== 8. negative controls (prove the assertions can fail) =="
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
# 8a. a CSP that drops the media origin from connect-src must be detectable
BAD=$(printf '%s' "$CSP_LINE" | sed 's#connect-src .self. https://media.phuquochub.com#connect-src '"'"'self'"'"'#')
if printf '%s' "$BAD" | grep -q "connect-src[^;]*https://media.phuquochub.com"; then
  fail "negative control 8a did not mutate the policy"
else
  pass "negative control: a connect-src missing the media origin IS detected"
fi
# 8b. an added unsafe-eval must be detectable
BAD2=$(printf '%s' "$CSP_LINE" | sed "s/script-src 'self'/script-src 'self' 'unsafe-eval'/")
printf '%s' "$BAD2" | grep -q "'unsafe-eval'" \
  && pass "negative control: an added 'unsafe-eval' IS detected" \
  || fail "negative control 8b failed to introduce unsafe-eval"
# 8c. a Host rewrite must be detectable
printf 'reverse_proxy minio:9000 {\n  header_up Host {upstream_hostport}\n}\n' > "$TMP/bad.caddy"
grep -q 'header_up Host' "$TMP/bad.caddy" \
  && pass "negative control: a Host rewrite IS detected" || fail "negative control 8c failed"

echo "== 9. caddy syntax validation (skipped if no caddy available) =="
if command -v caddy >/dev/null 2>&1; then
  caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1 \
    && pass "caddy validate (host binary)" || fail "caddy validate failed"
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if docker run --rm -v "$CADDYFILE":/etc/caddy/Caddyfile:ro caddy:2-alpine \
       caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    pass "caddy validate (docker caddy:2-alpine)"
  else
    fail "caddy validate failed under docker"
  fi
else
  echo "  skip: no caddy binary and no docker daemon"
fi

echo
echo "security-headers: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
