#!/bin/bash
# Backup-Restore Hardening follow-up (2026-08-12) — regression tests for the legacy
# immutable_unaccent detection/repair in scripts/restore.sh + scripts/lib/repair-legacy-unaccent.awk.
#
# These pin the two production-rollout blockers found by the review of 8bdd93c:
#   1. SIGPIPE/pipefail made `gzip -dc | grep -q` report "not legacy" for every real-sized dump.
#   2. A global unanchored sed rewrote COPY data and let user data mark a dump as legacy.
#
# NO Docker, NO network, NO database. Fixtures are synthetic gzip dumps, deliberately large enough
# that the SIGPIPE bug reproduces if it is ever reintroduced.
#
# Run: bash scripts/tests/legacy-repair.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
AWK_PROG="$REPO_ROOT/scripts/lib/repair-legacy-unaccent.awk"
RESTORE_SH="$REPO_ROOT/scripts/restore.sh"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }
assert_eq() { if [ "$1" = "$2" ]; then pass "$3"; else fail "$3 (got '$1', expected '$2')"; fi; }
assert_contains() { case "$1" in *"$2"*) pass "$3" ;; *) fail "$3 -- lacked '$2'" ;; esac; }
assert_not_contains() { case "$1" in *"$2"*) fail "$3 -- unexpectedly had '$2'" ;; *) pass "$3" ;; esac; }

LEGACY_BODY="SELECT unaccent('unaccent', \$1)"
POSTFIX_BODY="SELECT public.unaccent('public.unaccent'::regdictionary, \$1)"

# ---- fixture builders ---------------------------------------------------------------------------
emit_func() {  # emit_func <legacy|postfix>
  printf 'CREATE FUNCTION public.immutable_unaccent(text) RETURNS text\n'
  printf '    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE\n'
  if [ "$1" = "legacy" ]; then
    printf '    AS $_$ %s $_$;\n' "$LEGACY_BODY"
  else
    printf '    AS $_$ %s $_$;\n' "$POSTFIX_BODY"
  fi
}

# emit_copy_with_literal — a COPY block whose DATA contains the legacy fragment verbatim.
emit_copy_with_literal() {
  printf 'COPY public.places (id, description) FROM stdin;\n'
  printf '1\tA description mentioning %s in prose\n' "$LEGACY_BODY"
  printf '2\tordinary row\n'
  printf '\\.\n'
}

# build_dump <legacy|postfix|none> <with-copy-literal:0|1> <filler-lines> <outfile.gz>
# Filler is emitted AFTER the function so the function sits near the front, exactly like pg_dump
# (~line 689 of ~16,700) — which is what makes the SIGPIPE bug reproduce.
build_dump() {
  bd_form="$1"; bd_copy="$2"; bd_filler="$3"; bd_out="$4"
  {
    printf -- '--\n-- PostgreSQL database dump\n--\n'
    printf 'SET statement_timeout = 0;\n'
    [ "$bd_form" = "none" ] || emit_func "$bd_form"
    printf 'ALTER FUNCTION public.immutable_unaccent(text) OWNER TO phuquoc;\n'
    [ "$bd_copy" = "1" ] && emit_copy_with_literal
    i=0
    while [ "$i" -lt "$bd_filler" ]; do
      printf 'INSERT INTO filler VALUES (%d);\n' "$i"
      i=$((i + 1))
    done
    printf -- '-- PostgreSQL database dump complete\n'
  } | gzip > "$bd_out"
}

# analyse <file.gz> [repair]  -> echoes the countfile line; sets ANALYSE_STATUS / ANALYSE_OUT
analyse() {
  # NOTE: this suite deliberately runs WITHOUT `set -e` (header is `set -uo pipefail`) because
  # almost every case asserts on a NON-ZERO status. Do not add `set -e` here -- an earlier draft
  # did, and the first expected-failure assignment silently aborted the whole suite.
  an_cf=$(mktemp); an_out=$(mktemp)
  if [ "${2:-0}" = "1" ]; then
    gzip -dc "$1" | awk -v countfile="$an_cf" -v repair=1 -f "$AWK_PROG" > "$an_out"
  else
    gzip -dc "$1" | awk -v countfile="$an_cf" -f "$AWK_PROG" > "$an_out"
  fi
  ANALYSE_STATUS=$?
  ANALYSE_COUNTS=$(cat "$an_cf" 2>/dev/null || true)
  ANALYSE_OUT="$an_out"
  rm -f "$an_cf"
}

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT

# =================================================================================================
echo "== case 1: LARGE legacy dump -- the SIGPIPE regression =="
# 300k filler lines => ~7 MB uncompressed, with the function near the top. Under the old
# `gzip -dc | grep -q` probe this returned "not legacy" (pipeline_status=141).
build_dump legacy 0 300000 "$FIX/big-legacy.sql.gz"
echo "  fixture: $(stat -c%s "$FIX/big-legacy.sql.gz") bytes gz, $(gzip -dc "$FIX/big-legacy.sql.gz" | wc -c) bytes raw"
analyse "$FIX/big-legacy.sql.gz"
assert_eq "$ANALYSE_STATUS" "0" "analysis of a large legacy dump exits 0 (no SIGPIPE)"
assert_contains "$ANALYSE_COUNTS" "legacy=1" "large legacy dump is classified legacy"
assert_contains "$ANALYSE_COUNTS" "complete=1" "completion marker detected in the same pass"

# Demonstrate the OLD approach still fails on this very fixture, so the regression is real and the
# fixture is big enough to catch it.
OLD_RESULT=$(bash -c 'set -euo pipefail; if gzip -dc "$1" | grep -q "SELECT unaccent(.unaccent., \$1)"; then echo legacy; else echo not-legacy; fi' _ "$FIX/big-legacy.sql.gz" 2>/dev/null)
assert_eq "$OLD_RESULT" "not-legacy" "the OLD grep -q probe still misfires on this fixture (regression is reproducible)"
rm -f "$ANALYSE_OUT"

# =================================================================================================
echo "== case 2: legacy dump with the literal ALSO inside COPY data =="
build_dump legacy 1 2000 "$FIX/legacy-copy.sql.gz"
analyse "$FIX/legacy-copy.sql.gz" 1
assert_eq "$ANALYSE_STATUS" "0" "repair exits 0"
assert_contains "$ANALYSE_COUNTS" "legacy=1" "only the FUNCTION definition counts as legacy (COPY data ignored)"
assert_contains "$ANALYSE_COUNTS" "repaired=1" "exactly one replacement"
# The function body must be repaired...
assert_contains "$(cat "$ANALYSE_OUT")" "AS \$_\$ $POSTFIX_BODY \$_\$;" "function body repaired"
# ...and the COPY data row must be byte-identical.
assert_contains "$(cat "$ANALYSE_OUT")" "1	A description mentioning $LEGACY_BODY in prose" "COPY data row left byte-identical"
DATA_OCCURRENCES=$(grep -c "A description mentioning $LEGACY_BODY in prose" "$ANALYSE_OUT" || true)
assert_eq "$DATA_OCCURRENCES" "1" "user-data row still present exactly once, unmodified"
rm -f "$ANALYSE_OUT"

# =================================================================================================
echo "== case 3: POST-migration dump whose COPY data contains the legacy literal =="
build_dump postfix 1 2000 "$FIX/postfix-copy.sql.gz"
analyse "$FIX/postfix-copy.sql.gz"
assert_eq "$ANALYSE_STATUS" "0" "analysis exits 0"
assert_contains "$ANALYSE_COUNTS" "legacy=0" "user data does NOT mark the dump as legacy"
assert_contains "$ANALYSE_COUNTS" "postfix=1" "recognised as already schema-qualified"
assert_contains "$ANALYSE_COUNTS" "repaired=0" "no transformation performed"
rm -f "$ANALYSE_OUT"

# =================================================================================================
echo "== case 4: canonical legacy dump -- exactly one replacement, correct result =="
build_dump legacy 0 100 "$FIX/one-legacy.sql.gz"
analyse "$FIX/one-legacy.sql.gz" 1
assert_contains "$ANALYSE_COUNTS" "repaired=1" "exactly one replacement"
assert_contains "$(cat "$ANALYSE_OUT")" "$POSTFIX_BODY" "restored body is the schema-qualified form"
assert_not_contains "$(cat "$ANALYSE_OUT")" "AS \$_\$ $LEGACY_BODY \$_\$;" "no legacy body remains in the function"
rm -f "$ANALYSE_OUT"

# =================================================================================================
echo "== case 5: TWO candidate legacy function definitions -- abort, do not guess =="
{
  printf -- '--\n-- PostgreSQL database dump\n--\n'
  emit_func legacy
  printf 'SELECT 1;\n'
  emit_func legacy
  printf -- '-- PostgreSQL database dump complete\n'
} | gzip > "$FIX/two-legacy.sql.gz"
analyse "$FIX/two-legacy.sql.gz"
assert_eq "$ANALYSE_STATUS" "3" "two legacy definitions -> non-zero (ambiguous)"
assert_contains "$ANALYSE_COUNTS" "legacy=2" "both definitions counted"
rm -f "$ANALYSE_OUT"

# One legacy + one post-fix definition is equally ambiguous.
{
  printf -- '--\n-- PostgreSQL database dump\n--\n'
  emit_func legacy
  emit_func postfix
  printf -- '-- PostgreSQL database dump complete\n'
} | gzip > "$FIX/mixed.sql.gz"
analyse "$FIX/mixed.sql.gz"
assert_eq "$ANALYSE_STATUS" "3" "one legacy + one post-fix -> non-zero (ambiguous)"
rm -f "$ANALYSE_OUT"

# =================================================================================================
echo "== case 6: truncated / corrupt gzip =="
build_dump legacy 0 5000 "$FIX/truncated.sql.gz"
TRUNC_SIZE=$(( $(stat -c%s "$FIX/truncated.sql.gz") / 2 ))
dd if="$FIX/truncated.sql.gz" of="$FIX/truncated-half.sql.gz" bs=1 count="$TRUNC_SIZE" 2>/dev/null
analyse "$FIX/truncated-half.sql.gz"
if [ "$ANALYSE_STATUS" != "0" ]; then pass "corrupt gzip fails the analysis pipeline (non-zero)"; else fail "corrupt gzip was accepted"; fi
rm -f "$ANALYSE_OUT"

printf 'definitely not gzip' > "$FIX/notgz.sql.gz"
analyse "$FIX/notgz.sql.gz"
if [ "$ANALYSE_STATUS" != "0" ]; then pass "non-gzip input fails the analysis pipeline"; else fail "non-gzip input accepted"; fi
rm -f "$ANALYSE_OUT"

# A dump with no completion marker must be rejected by restore.sh (analysis reports complete=0).
build_dump legacy 0 100 "$FIX/nomarker.sql.gz"
gzip -dc "$FIX/nomarker.sql.gz" | grep -v 'dump complete' | gzip > "$FIX/nomarker2.sql.gz"
analyse "$FIX/nomarker2.sql.gz"
assert_contains "$ANALYSE_COUNTS" "complete=0" "missing completion marker is reported"
rm -f "$ANALYSE_OUT"

# =================================================================================================
echo "== case 7/8: restore.sh end-to-end guards (stubbed docker, no database) =="
ENVDIR=$(mktemp -d); mkdir -p "$ENVDIR/bin" "$ENVDIR/proj/backups"; : > "$ENVDIR/proj/docker-compose.prod.yml"
CALLS="$ENVDIR/calls.log"; : > "$CALLS"
cat > "$ENVDIR/bin/docker" <<EOF
#!/bin/bash
echo "docker \$*" >> "$CALLS"
for a in "\$@"; do [ "\$a" = "ps" ] && { echo healthy; exit 0; }; done
case "\$*" in *psql*) cat >/dev/null 2>&1 || true; exit 0 ;; esac
exit 0
EOF
chmod +x "$ENVDIR/bin/docker"
run_restore() { ( export PATH="$ENVDIR/bin:$PATH"; printf 'yes\n' | bash "$RESTORE_SH" "$1" "$ENVDIR/proj" 2>&1 ); }

# 7a. ambiguous dump must abort BEFORE any destructive operation
cp "$FIX/two-legacy.sql.gz" "$ENVDIR/proj/backups/ambiguous.sql.gz"
: > "$CALLS"
OUT=$(run_restore "$ENVDIR/proj/backups/ambiguous.sql.gz"); ST=$?
assert_eq "$ST" "1" "restore.sh aborts on an ambiguous dump"
assert_contains "$OUT" "will not guess which one to repair" "ambiguity is explained"
assert_not_contains "$(cat "$CALLS")" "DROP DATABASE" "NO destructive operation started for an ambiguous dump"

# 7b. corrupt gzip aborts before DROP DATABASE
cp "$FIX/notgz.sql.gz" "$ENVDIR/proj/backups/corrupt.sql.gz"
: > "$CALLS"
OUT=$(run_restore "$ENVDIR/proj/backups/corrupt.sql.gz"); ST=$?
assert_eq "$ST" "1" "restore.sh aborts on corrupt gzip"
assert_not_contains "$(cat "$CALLS")" "DROP DATABASE" "NO destructive operation for corrupt gzip"

# 7c. truncated dump (no completion marker) aborts before DROP DATABASE
cp "$FIX/nomarker2.sql.gz" "$ENVDIR/proj/backups/nomarker.sql.gz"
: > "$CALLS"
OUT=$(run_restore "$ENVDIR/proj/backups/nomarker.sql.gz"); ST=$?
assert_eq "$ST" "1" "restore.sh aborts on a truncated dump"
assert_contains "$OUT" "completion marker" "truncation is named"
assert_not_contains "$(cat "$CALLS")" "DROP DATABASE" "NO destructive operation for a truncated dump"

# 8. large legacy dump is CLASSIFIED legacy by restore.sh itself (the blocker, end to end)
cp "$FIX/big-legacy.sql.gz" "$ENVDIR/proj/backups/big-legacy.sql.gz"
: > "$CALLS"
OUT=$(run_restore "$ENVDIR/proj/backups/big-legacy.sql.gz")
assert_contains "$OUT" "predates migration 1720004400000" "restore.sh classifies a LARGE legacy dump correctly"
assert_contains "$OUT" "1 function body rewritten" "repair count asserted as exactly 1"

# 8b. post-migration dump takes the normal path, no repair announced
cp "$FIX/postfix-copy.sql.gz" "$ENVDIR/proj/backups/postfix.sql.gz"
: > "$CALLS"
OUT=$(run_restore "$ENVDIR/proj/backups/postfix.sql.gz")
assert_contains "$OUT" "already schema-qualified" "post-migration dump recognised"
assert_not_contains "$OUT" "predates migration" "post-migration dump NOT treated as legacy"
assert_not_contains "$OUT" "function body rewritten" "no repair performed on a post-migration dump"
rm -rf "$ENVDIR"

echo
echo "legacy-repair.test.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
