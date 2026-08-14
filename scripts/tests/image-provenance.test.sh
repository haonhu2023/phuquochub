#!/bin/bash
# Image provenance (2026-08-14) — static tests that release images can identify their own commit.
#
# NO Docker daemon needed: these are text-level assertions on the Dockerfiles and deploy.sh, which
# is where the property lives. (The end-to-end proof — building an image and reading the label back
# with `docker inspect` — was performed once during the release-readiness audit and is recorded in
# that report; it needs a daemon and a full image build, so it is not part of this suite.)
#
# Why this exists: production ran an API image whose source commit could not be determined from the
# image at all. It carried no version metadata and the only tag pointing at it was the MUTABLE
# `phuquochub-api:local`, so even an approximate answer required bracketing the image's compiled
# dist/ against per-commit marker files. These assertions keep that from recurring.
#
# Run: bash scripts/tests/image-provenance.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
API_DF="$REPO_ROOT/apps/api/Dockerfile"
WEB_DF="$REPO_ROOT/apps/web/Dockerfile"
DEPLOY="$REPO_ROOT/scripts/deploy.sh"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }
for f in "$API_DF" "$WEB_DF" "$DEPLOY"; do
  [ -f "$f" ] || { echo "FATAL: $f not found"; exit 1; }
done

# Text of the FINAL stage only. Labels are per-stage: declaring them in an earlier stage would not
# reach the shipped image, so asserting on the whole file would let that regression through.
final_stage() { awk '/^FROM /{buf=""} {buf=buf $0 "\n"} END{printf "%s", buf}' "$1"; }

for pair in "api:$API_DF" "web:$WEB_DF"; do
  svc="${pair%%:*}"; df="${pair#*:}"
  echo "== $svc Dockerfile declares provenance in its FINAL stage =="
  STAGE=$(final_stage "$df")

  if printf '%s' "$STAGE" | grep -qE '^ARG[[:space:]]+GIT_COMMIT'; then
    pass "$svc: final stage declares ARG GIT_COMMIT"
  else
    fail "$svc: final stage has no ARG GIT_COMMIT (label would be empty or build would fail)"
  fi
  if printf '%s' "$STAGE" | grep -qE '^ARG[[:space:]]+BUILD_DATE'; then
    pass "$svc: final stage declares ARG BUILD_DATE"
  else
    fail "$svc: final stage has no ARG BUILD_DATE"
  fi
  if printf '%s' "$STAGE" | grep -q 'org.opencontainers.image.revision="\$GIT_COMMIT"'; then
    pass "$svc: revision label is wired to the ARG"
  else
    fail "$svc: revision label missing or not wired to \$GIT_COMMIT"
  fi
  if printf '%s' "$STAGE" | grep -q 'org.opencontainers.image.created="\$BUILD_DATE"'; then
    pass "$svc: created label is wired to the ARG"
  else
    fail "$svc: created label missing or not wired to \$BUILD_DATE"
  fi
  if printf '%s' "$STAGE" | grep -q "org.opencontainers.image.title=\"phuquochub-$svc\""; then
    pass "$svc: title label names the image"
  else
    fail "$svc: title label missing or wrong"
  fi
  # A bare `docker build` (no --build-arg) must still work, so the ARGs need defaults.
  if printf '%s' "$STAGE" | grep -qE '^ARG[[:space:]]+GIT_COMMIT=.+'; then
    pass "$svc: GIT_COMMIT has a default (bare docker build still works)"
  else
    fail "$svc: GIT_COMMIT has no default -- a bare docker build would label it empty"
  fi
done

echo "== deploy.sh stamps the real values =="
if grep -q 'BUILD_DATE=$(date -u ' "$DEPLOY"; then
  pass "deploy.sh computes a UTC BUILD_DATE"
else
  fail "deploy.sh does not compute BUILD_DATE"
fi
for svc in api web; do
  # The build-arg must appear within that service's own docker build invocation.
  BLOCK=$(awk "/docker build .*apps\/$svc\/Dockerfile/,/^\$/" "$DEPLOY")
  if printf '%s' "$BLOCK" | grep -q -- '--build-arg "GIT_COMMIT=\$TAG"'; then
    pass "$svc build passes GIT_COMMIT=\$TAG (the released revision)"
  else
    fail "$svc build does not pass GIT_COMMIT=\$TAG"
  fi
  if printf '%s' "$BLOCK" | grep -q -- '--build-arg "BUILD_DATE=\$BUILD_DATE"'; then
    pass "$svc build passes BUILD_DATE"
  else
    fail "$svc build does not pass BUILD_DATE"
  fi
done

echo "== provenance must never carry a mutable identifier =="
# `local`/`latest` as a recorded revision would defeat the whole point.
if grep -qE -- '--build-arg "GIT_COMMIT=(local|latest)"' "$DEPLOY"; then
  fail "deploy.sh records a mutable identifier as the image revision"
else
  pass "deploy.sh never records 'local'/'latest' as the revision"
fi

echo "== labels are metadata only: no runtime behaviour introduced =="
# The provenance change must not alter what the image RUNS. Guard the entrypoint/cmd lines.
if grep -q 'CMD \["node", "dist/main.js"\]' "$API_DF"; then
  pass "api CMD unchanged"
else
  fail "api CMD changed"
fi
if grep -qE '^(ENTRYPOINT|CMD)' "$WEB_DF"; then
  pass "web still declares an entrypoint/cmd"
else
  fail "web entrypoint/cmd disappeared"
fi
for df in "$API_DF" "$WEB_DF"; do
  if grep -qE '^(RUN|COPY).*\$GIT_COMMIT' "$df"; then
    fail "$(basename "$(dirname "$df")"): GIT_COMMIT is used outside a LABEL (would affect the build)"
  else
    pass "$(basename "$(dirname "$df")"): GIT_COMMIT used only for labelling"
  fi
done

echo
echo "== summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
