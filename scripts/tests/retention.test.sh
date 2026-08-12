#!/bin/bash
# Backup-Restore Hardening (2026-08-12) — deterministic tests for scripts/lib/retention.sh.
#
# The retention rule is the difference between a 6-month recovery window and a 10-day one, and the
# previous implementation was silently inverted for months. These tests pin the exact policy:
# daily 7 / weekly 4 / monthly 6, capped, with unrelated files untouched.
#
# Run: bash scripts/tests/retention.test.sh          (no Docker, no network, no real backups)
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
. "$REPO_ROOT/scripts/lib/retention.sh"

PASS=0
FAIL=0

fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }

assert_present() {
  if [ -f "$1/$2" ]; then pass "$3"; else fail "$3 (expected $2 to be kept)"; fi
}
assert_absent() {
  if [ -f "$1/$2" ]; then fail "$3 (expected $2 to be deleted)"; else pass "$3"; fi
}

mkdir_fixture() {
  d=$(mktemp -d)
  printf '%s' "$d"
}

# Create a backup file whose mtime matches its embedded date, so `ls -1t` ordering is deterministic
# and independent of creation order.
mkbackup() {
  # mkbackup <dir> <YYYYMMDD>
  f="$1/phuquochub-$2T020000Z.sql.gz"
  printf 'fixture' > "$f"
  touch -d "${2:0:4}-${2:4:2}-${2:6:2} 02:00:00" "$f"
  printf 'sha  phuquochub-%sT020000Z.sql.gz' "$2" > "$f.sha256"
}

echo "== retention: daily window keeps the newest 7 unconditionally =="
D=$(mkdir_fixture)
for i in 1 2 3 4 5 6 7 8 9 10; do mkbackup "$D" "202608$(printf '%02d' $((20 - i)))"; done
apply_retention "$D" 'phuquochub-*.sql.gz' '.sql.gz' >/dev/null
# 20260819..20260813 are the newest 7 -> kept as dailies.
assert_present "$D" "phuquochub-20260819T020000Z.sql.gz" "newest daily kept"
assert_present "$D" "phuquochub-20260813T020000Z.sql.gz" "7th newest daily kept"
# 20260812/11/10 fall beyond the daily window; they share ISO week and month with kept dailies, so
# they claim no new bucket and are pruned.
assert_absent "$D" "phuquochub-20260810T020000Z.sql.gz" "same-week/month extra beyond daily 7 pruned"
rm -rf "$D"

echo "== retention: weekly tier capped at 4 distinct ISO weeks =="
D=$(mkdir_fixture)
# 7 consecutive dailies in one week, then 8 weekly-spaced older files.
for i in 0 1 2 3 4 5 6; do mkbackup "$D" "$(date -u -d "2026-08-19 -$i day" +%Y%m%d)"; done
for w in 1 2 3 4 5 6 7 8; do mkbackup "$D" "$(date -u -d "2026-08-19 -$((w * 7 + 6)) day" +%Y%m%d)"; done
apply_retention "$D" 'phuquochub-*.sql.gz' '.sql.gz' >/dev/null
KEPT=$(ls -1 "$D"/phuquochub-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
# 7 dailies + at most 4 weekly + at most 6 monthly, and these fixtures span only ~3 months.
if [ "$KEPT" -le 17 ]; then pass "total kept ($KEPT) within the 17-file policy ceiling"; else fail "kept $KEPT files, above the 17 ceiling"; fi
if [ "$KEPT" -ge 11 ]; then pass "weekly tier retained history beyond the daily window ($KEPT files)"; else fail "only $KEPT kept -- weekly history was destroyed (the old bug)"; fi
rm -rf "$D"

echo "== retention: monthly tier capped at 6 distinct months, older months pruned =="
D=$(mkdir_fixture)
for i in 0 1 2 3 4 5 6; do mkbackup "$D" "$(date -u -d "2026-08-19 -$i day" +%Y%m%d)"; done
# One backup on the 15th of each of the previous 10 months.
for m in 07 06 05 04 03 02 01; do mkbackup "$D" "2026${m}15"; done
for m in 12 11 10; do mkbackup "$D" "2025${m}15"; done
apply_retention "$D" 'phuquochub-*.sql.gz' '.sql.gz' >/dev/null
assert_present "$D" "phuquochub-20260715T020000Z.sql.gz" "most recent monthly kept"
assert_absent  "$D" "phuquochub-20251015T020000Z.sql.gz" "10-months-old backup pruned (beyond monthly 6)"
MONTHS=$(ls -1 "$D"/phuquochub-*.sql.gz | sed -E 's/.*phuquochub-([0-9]{6}).*/\1/' | sort -u | wc -l | tr -d ' ')
if [ "$MONTHS" -le 7 ]; then pass "distinct months retained ($MONTHS) within monthly cap + current"; else fail "retained $MONTHS distinct months, above cap"; fi
rm -rf "$D"

echo "== retention: the exact regression that broke production retention =="
D=$(mkdir_fixture)
for d in 20260812 20260811 20260810 20260809 20260808 20260807 20260806 20260805 \
         20260728 20260721 20260714 20260615 20260515 20260415; do mkbackup "$D" "$d"; done
apply_retention "$D" 'phuquochub-*.sql.gz' '.sql.gz' >/dev/null
# Under the OLD inverted logic every one of these was deleted.
assert_present "$D" "phuquochub-20260728T020000Z.sql.gz" "weekly backup survives (old logic deleted it)"
assert_present "$D" "phuquochub-20260721T020000Z.sql.gz" "second weekly survives"
assert_present "$D" "phuquochub-20260615T020000Z.sql.gz" "monthly backup survives (old logic deleted it)"
assert_present "$D" "phuquochub-20260515T020000Z.sql.gz" "second monthly survives"
rm -rf "$D"

echo "== retention: never touches unrelated files =="
D=$(mkdir_fixture)
for i in $(seq 0 12); do mkbackup "$D" "$(date -u -d "2026-08-19 -$i day" +%Y%m%d)"; done
printf 'keep me' > "$D/media-20200101T000000Z.tar.gz"
printf 'keep me' > "$D/operator-notes.txt"
printf 'keep me' > "$D/phuquochub-README.md"
apply_retention "$D" 'phuquochub-*.sql.gz' '.sql.gz' >/dev/null
assert_present "$D" "media-20200101T000000Z.tar.gz" "other backup tree untouched"
assert_present "$D" "operator-notes.txt" "unrelated file untouched"
assert_present "$D" "phuquochub-README.md" "similarly-named non-backup untouched"
rm -rf "$D"

echo "== retention: prunes the .sha256 sidecar with its backup, leaving no orphans =="
D=$(mkdir_fixture)
for i in $(seq 0 9); do mkbackup "$D" "$(date -u -d "2026-08-19 -$i day" +%Y%m%d)"; done
apply_retention "$D" 'phuquochub-*.sql.gz' '.sql.gz' >/dev/null
ORPHANS=0
for s in "$D"/*.sha256; do
  [ -e "$s" ] || continue
  [ -f "${s%.sha256}" ] || ORPHANS=$((ORPHANS + 1))
done
if [ "$ORPHANS" -eq 0 ]; then pass "no orphaned .sha256 sidecars"; else fail "$ORPHANS orphaned sidecars left behind"; fi
rm -rf "$D"

echo "== retention: media snapshots are DIRECTORIES, not files =="
# Regression guard: `ls -1t <glob>` without -d lists each directory's CONTENTS rather than the
# directory itself, so every snapshot silently survives retention forever. Found by this test.
D=$(mkdir_fixture)
for i in $(seq 0 11); do
  dt=$(date -u -d "2026-08-19 -$i day" +%Y%m%d)
  mkdir -p "$D/media-${dt}T030000Z"
  printf 'object' > "$D/media-${dt}T030000Z/photo.jpg"
  printf 'sha  ./photo.jpg' > "$D/media-${dt}T030000Z/SHA256SUMS"
  touch -d "${dt:0:4}-${dt:4:2}-${dt:6:2} 03:00:00" "$D/media-${dt}T030000Z"
done
mkdir -p "$D/unrelated-tree"; printf 'keep' > "$D/unrelated-tree/f"
apply_retention "$D" 'media-*' '' >/dev/null
SNAPS=$(ls -1d "$D"/media-* 2>/dev/null | wc -l | tr -d ' ')
if [ "$SNAPS" -lt 12 ]; then pass "directory snapshots are actually pruned ($SNAPS of 12 kept)"; else fail "no snapshot was pruned -- retention is not seeing directories"; fi
if [ "$SNAPS" -ge 7 ]; then pass "daily window of snapshots preserved ($SNAPS kept)"; else fail "over-pruned to $SNAPS"; fi
assert_present "$D" "unrelated-tree/f" "unrelated directory tree untouched"
# A pruned snapshot must be gone entirely, not emptied.
assert_absent "$D" "media-20260808T030000Z/photo.jpg" "pruned snapshot removed recursively"
rm -rf "$D"

echo "== retention: empty directory is a safe no-op =="
D=$(mkdir_fixture)
if apply_retention "$D" 'phuquochub-*.sql.gz' '.sql.gz' >/dev/null 2>&1; then pass "empty dir exits 0"; else fail "empty dir should be a no-op"; fi
rm -rf "$D"

echo
echo "retention.test.sh: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
