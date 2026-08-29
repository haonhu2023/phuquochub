#!/bin/bash
# Canonical release-artifact creation (2026-08-29, hardened 2026-08-29) — tests for
# scripts/create-release-artifact.sh.
#
# NO Docker, NO network, NO production access, NO writes anywhere near this real repository. Every
# scenario builds its own disposable Git repo under mktemp -d and runs the REAL helper script
# against THAT repo (the helper resolves its target repo from the caller's cwd, not from its own
# file location -- see the script's own comment on this). Every fixture repo and its output
# directory are removed on exit via a trap.
#
# THREE BUGS this suite pins, all found by an independent security review of the first version of
# this script and confirmed by direct reproduction before being fixed:
#
#  1. CRLF (original bug): a bare `git archive` on this Windows checkout (core.autocrlf=true, no
#     .gitattributes) silently CRLF-converts every text blob on the way out. Reproduced during the
#     2026-08-28 production deploy of commit 4ed9af7 (1342/1392 tracked files mismatched their Git
#     blobs). Fixed with command-local `-c core.autocrlf=false -c core.eol=lf`.
#  2. Unicode manifest corruption: the original manifest loop read `git ls-tree -r --name-only`
#     line-by-line and ran `git cat-file blob "$SHA:$path"` per path. `git ls-tree` QUOTES any path
#     with non-ASCII bytes (core.quotePath, on by default), `git cat-file` then fails on the quoted
#     literal, and the failure was swallowed inside a `$(...)` substitution whose status was never
#     checked -- `sha256sum` hashed EMPTY input and the script printed success. Reproduced directly:
#     a Vietnamese-named tracked file's manifest entry recorded the SHA-256 of "" instead of the
#     real blob hash, exit 0. Fixed architecturally: archive once, extract to a private staging
#     dir, hash REAL FILE ARGUMENTS via NUL-safe `find -print0 | sha256sum` (which owns its own
#     correct filename escaping) instead of re-parsing `git ls-tree` text.
#  3. Non-atomic publish: no `trap`, writes went straight to final filenames. An interrupted run
#     left a 0-byte `.tar.gz` under a final name with no checksum, and the overwrite guard then
#     BLOCKED a clean retry into the same directory. Fixed: everything is built and self-verified
#     in a staging directory; `release-<sha>.meta.txt` is promoted last and is the only thing that
#     blocks a re-run (its absence means any leftover final-named files are orphans from an
#     interrupted run, safely replaced rather than treated as a block).
#
# Run: bash scripts/tests/create-release-artifact.test.sh
set -uo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname "$(dirname "$SCRIPT_DIR")")
HELPER="$REPO_ROOT/scripts/create-release-artifact.sh"

PASS=0; FAIL=0
pass() { echo "  ok: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }

[ -f "$HELPER" ] || { echo "FATAL: $HELPER not found"; exit 1; }

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

# --- fixture repo: LF content, committed under autocrlf=true, exactly like this real repo -------
FIXTURE="$WORKDIR/fixture"
mkdir -p "$FIXTURE"
( cd "$FIXTURE"
  git init -q -b main .
  git config user.email test@test.local
  git config user.name "test"
  # THE exact repo setting that caused the real bug -- deliberately reproduced here, and
  # deliberately NEVER changed by this test.
  git config core.autocrlf true
  printf 'line one\nline two\nline three\n' > fixture.txt
  printf 'top secret runtime value\n' > .env
  printf 'placeholder value\n' > .env.example
  mkdir -p sub
  printf 'nested file\n' > "sub/dir with space.txt"
  git add fixture.txt .env.example "sub/dir with space.txt" >/dev/null 2>&1
  git commit -qm "init" >/dev/null 2>&1
) 2>/dev/null
SHA=$(git -C "$FIXTURE" rev-parse HEAD)

run_helper() { ( cd "$FIXTURE" && bash "$HELPER" "$@" ); }
files_in() { ls -1 "$1" 2>/dev/null | sort; }

# ==================================================================================================
echo "== 1. canonical bytes: extracted archive is byte-identical to the Git blob, under autocrlf=true =="
OUT1="$WORKDIR/out1"
if run_helper "$SHA" "$OUT1" > "$WORKDIR/run1.log" 2>&1; then
  pass "helper exits 0 for a valid commit + explicit output-dir"
else
  fail "helper failed on a valid commit: $(cat "$WORKDIR/run1.log")"
fi

ARCHIVE1="$OUT1/release-$SHA.tar.gz"
[ -f "$ARCHIVE1" ] && pass "archive file created, named with the FULL commit SHA" || fail "archive file not created at the expected full-SHA path"
[ -f "$OUT1/release-$SHA.tar.gz.sha256" ] && pass "archive checksum file created" || fail "archive checksum file not created"
[ -f "$OUT1/release-$SHA.manifest.sha256" ] && pass "manifest file created" || fail "manifest file not created"
[ -f "$OUT1/release-$SHA.files.txt" ] && pass "tracked-file list created" || fail "tracked-file list not created"
[ -f "$OUT1/release-$SHA.meta.txt" ] && pass "identity metadata file created" || fail "identity metadata file not created"

EXTRACT1="$WORKDIR/extract1"
mkdir -p "$EXTRACT1"
tar -xzf "$ARCHIVE1" -C "$EXTRACT1" 2>/dev/null
if diff -q <(git -C "$FIXTURE" cat-file blob "$SHA:fixture.txt") "$EXTRACT1/fixture.txt" >/dev/null 2>&1; then
  pass "extracted fixture.txt is byte-identical to its Git blob (no CRLF drift)"
else
  fail "extracted fixture.txt DIFFERS from its Git blob -- CRLF or other corruption"
fi
if diff -q <(git -C "$FIXTURE" cat-file blob "$SHA:sub/dir with space.txt") "$EXTRACT1/sub/dir with space.txt" >/dev/null 2>&1; then
  pass "extracted nested/space-named file is byte-identical to its Git blob"
else
  fail "extracted nested/space-named file DIFFERS from its Git blob"
fi

echo "== 14. manifest verifies after extract (and the script already proved this itself before publishing) =="
if ( cd "$EXTRACT1" && sha256sum -c "$OUT1/release-$SHA.manifest.sha256" > /dev/null 2>&1 ); then
  pass "manifest verifies against the extracted archive (sha256sum -c)"
else
  fail "manifest does NOT verify against the extracted archive"
fi
if ( cd "$OUT1" && sha256sum -c "release-$SHA.tar.gz.sha256" > /dev/null 2>&1 ); then
  pass "archive checksum file verifies against the archive itself"
else
  fail "archive checksum file does NOT verify"
fi

echo "== manifest format: plain two-space, no binary-mode marker (portable across the fleet) =="
if grep -qE '^\S+ \*' "$OUT1/release-$SHA.manifest.sha256"; then
  fail "manifest uses sha256sum's binary-mode '*' marker instead of plain text format"
else
  pass "manifest uses plain two-space sha256sum format"
fi

echo "== untracked file never enters the archive =="
if tar -tzf "$ARCHIVE1" | grep -q '\.env$'; then
  fail "untracked .env leaked into the archive"
else
  pass "untracked .env is absent from the archive"
fi

echo "== tracked .env.example IS present, runtime .env is NOT =="
if tar -tzf "$ARCHIVE1" | grep -qE '(^|/)\.env\.example$'; then
  pass "tracked .env.example is present in the archive"
else
  fail "tracked .env.example is missing from the archive"
fi

echo "== .git/ never enters the archive =="
if tar -tzf "$ARCHIVE1" | grep -qi '(^|/)\.git/'; then
  fail ".git/ leaked into the archive"
else
  pass "no .git/ entry in the archive"
fi

# ==================================================================================================
echo "== 2+3. dirty tracked edit + untracked sentinel never enter the archive =="
( cd "$FIXTURE"
  printf 'MODIFIED AFTER COMMIT, NOT PART OF %s\n' "$SHA" > fixture.txt
  echo "untracked junk" > untracked-junk.txt
) 2>/dev/null
OUT3="$WORKDIR/out3"
run_helper "$SHA" "$OUT3" > "$WORKDIR/run3.log" 2>&1
EXTRACT3="$WORKDIR/extract3"
mkdir -p "$EXTRACT3"
tar -xzf "$OUT3/release-$SHA.tar.gz" -C "$EXTRACT3" 2>/dev/null
if grep -q "MODIFIED AFTER COMMIT" "$EXTRACT3/fixture.txt" 2>/dev/null; then
  fail "archive captured the dirty working-tree edit instead of the committed content"
else
  pass "archive reflects the COMMITTED content, ignoring the dirty working-tree edit"
fi
if tar -tzf "$OUT3/release-$SHA.tar.gz" | grep -q 'untracked-junk.txt'; then
  fail "untracked-junk.txt leaked into the archive"
else
  pass "untracked-junk.txt is absent from the archive"
fi
( cd "$FIXTURE" && git checkout -q -- fixture.txt && rm -f untracked-junk.txt ) 2>/dev/null

echo "== 4. CRLF working tree does not change the archive bytes =="
if diff -q "$ARCHIVE1" "$OUT3/release-$SHA.tar.gz" >/dev/null 2>&1; then
  pass "archive is byte-identical whether the working tree is clean or has an unrelated CRLF-checked-out edit"
else
  fail "archive bytes changed even though the SAME commit was archived"
fi

echo "== 1 (repeat, explicit). two independent runs of the same commit produce equivalent canonical content =="
OUT4="$WORKDIR/out4"
run_helper "$SHA" "$OUT4" > "$WORKDIR/run4.log" 2>&1
SUM1=$(sha256sum "$ARCHIVE1" | cut -d' ' -f1)
SUM4=$(sha256sum "$OUT4/release-$SHA.tar.gz" | cut -d' ' -f1)
if [ "$SUM1" = "$SUM4" ]; then
  pass "two separate invocations of the same commit produce a byte-identical archive"
else
  fail "archive bytes differ between two runs of the same commit ($SUM1 vs $SUM4)"
fi
if diff -q "$OUT1/release-$SHA.manifest.sha256" "$OUT4/release-$SHA.manifest.sha256" >/dev/null 2>&1; then
  pass "manifest is identical between two runs of the same commit"
else
  fail "manifest differs between two runs of the same commit"
fi
if diff -q "$OUT1/release-$SHA.meta.txt" "$OUT4/release-$SHA.meta.txt" >/dev/null 2>&1; then
  pass "meta.txt (identity metadata) is byte-identical between two runs -- no timestamp/host leaked in"
else
  fail "meta.txt differs between two runs of the same commit (should be purely a function of the commit)"
fi

echo "== 15. changing the committed blob changes both the archive and the manifest =="
( cd "$FIXTURE"
  printf 'DIFFERENT CONTENT ENTIRELY\n' > fixture.txt
  git add fixture.txt >/dev/null 2>&1
  git commit -qm "second commit" >/dev/null 2>&1
) 2>/dev/null
SHA2=$(git -C "$FIXTURE" rev-parse HEAD)
OUT15="$WORKDIR/out15"
run_helper "$SHA2" "$OUT15" > "$WORKDIR/run15.log" 2>&1
if diff -q "$ARCHIVE1" "$OUT15/release-$SHA2.tar.gz" >/dev/null 2>&1; then
  fail "archive did not change even though the committed blob changed"
else
  pass "archive changed when the committed blob changed"
fi
if diff -q "$OUT1/release-$SHA.manifest.sha256" "$OUT15/release-$SHA2.manifest.sha256" >/dev/null 2>&1; then
  fail "manifest did not change even though the committed blob changed"
else
  pass "manifest changed when the committed blob changed"
fi
# The FIRST commit's archive, created earlier, must still hold the ORIGINAL content -- proving the
# helper archives the exact resolved commit, not "whatever HEAD is now".
EXTRACT1B="$WORKDIR/extract1b"; mkdir -p "$EXTRACT1B"
tar -xzf "$ARCHIVE1" -C "$EXTRACT1B" 2>/dev/null
if grep -q "^line one$" "$EXTRACT1B/fixture.txt" 2>/dev/null; then
  pass "the first commit's already-created archive still holds ITS OWN content (unaffected by later commits)"
else
  fail "the first commit's archive was somehow affected by a later commit"
fi

# ==================================================================================================
echo "== 5. Unicode Vietnamese filename hashes correctly -- not the empty-string hash =="
UNIFIX="$WORKDIR/unifix"; mkdir -p "$UNIFIX"
( cd "$UNIFIX"
  git init -q -b main .
  git config user.email test@test.local; git config user.name test
  printf 'normal\n' > normal.txt
  git add normal.txt >/dev/null 2>&1
  git commit -qm base >/dev/null 2>&1
  B_UNI=$(printf 'unicontent\n' | git hash-object -w --stdin)
  git update-index --add --cacheinfo "100644,$B_UNI,Địa-điểm-Phú-Quốc.md"
  TREE=$(git write-tree)
  git commit-tree "$TREE" -p HEAD -m unicode > "$UNIFIX/commit.sha"
) 2>/dev/null
UNI_SHA=$(cat "$UNIFIX/commit.sha")
UNI_OUT="$WORKDIR/uniout"
if run_helper_uni() { ( cd "$UNIFIX" && bash "$HELPER" "$UNI_SHA" "$UNI_OUT" ); }; run_helper_uni > "$WORKDIR/uni.log" 2>&1; then
  pass "helper succeeds on a commit containing a Unicode filename"
else
  fail "helper failed on a Unicode filename: $(cat "$WORKDIR/uni.log")"
fi
REAL_BLOB_HASH=$(git -C "$UNIFIX" cat-file blob "$UNI_SHA:Địa-điểm-Phú-Quốc.md" | sha256sum | cut -d' ' -f1)
EMPTY_HASH=$(printf '' | sha256sum | cut -d' ' -f1)
MANIFEST_LINE=$(grep -F "Quốc.md" "$UNI_OUT/release-$UNI_SHA.manifest.sha256" 2>/dev/null || grep -F ".md" "$UNI_OUT/release-$UNI_SHA.manifest.sha256" 2>/dev/null || true)
if printf '%s' "$MANIFEST_LINE" | grep -qF "$REAL_BLOB_HASH"; then
  pass "manifest records the REAL blob hash for the Unicode filename ($REAL_BLOB_HASH)"
elif printf '%s' "$MANIFEST_LINE" | grep -qF "$EMPTY_HASH"; then
  fail "manifest records the EMPTY-STRING hash for the Unicode filename -- the original bug is back"
else
  fail "could not find a manifest entry matching either hash: $MANIFEST_LINE"
fi
UNI_EXTRACT="$WORKDIR/uni-extract"; mkdir -p "$UNI_EXTRACT"
tar -xzf "$UNI_OUT/release-$UNI_SHA.tar.gz" -C "$UNI_EXTRACT" 2>/dev/null
if ( cd "$UNI_EXTRACT" && sha256sum -c "$UNI_OUT/release-$UNI_SHA.manifest.sha256" > /dev/null 2>&1 ); then
  pass "Unicode-filename manifest verifies against the extracted archive"
else
  fail "Unicode-filename manifest does NOT verify against the extracted archive"
fi

echo "== 6. filenames with spaces hash correctly (already exercised above, re-asserted explicitly) =="
SPACE_HASH_MANIFEST=$(grep -F "dir with space" "$OUT1/release-$SHA.manifest.sha256" 2>/dev/null || true)
SPACE_REAL_HASH=$(git -C "$FIXTURE" cat-file blob "$SHA:sub/dir with space.txt" | sha256sum | cut -d' ' -f1)
if printf '%s' "$SPACE_HASH_MANIFEST" | grep -qF "$SPACE_REAL_HASH"; then
  pass "space-containing filename has the correct real hash in the manifest"
else
  fail "space-containing filename manifest entry does not match its real blob hash: $SPACE_HASH_MANIFEST"
fi

echo "== 7. tab/newline-named tracked paths: structurally cannot reach a published artifact =="
# git update-index refuses these at the porcelain level, but git mktree (plumbing) can build a
# tree object containing one -- proven directly. What matters is what THIS SCRIPT does when given
# such a commit: `git archive` itself refuses to unpack the tree (confirmed: exit 128, "invalid
# path"), and this script's atomic staging means that failure leaves NOTHING under a final name.
TABFIX="$WORKDIR/tabfix"; mkdir -p "$TABFIX"
( cd "$TABFIX"
  git init -q -b main .
  git config user.email test@test.local; git config user.name test
  printf 'x\n' > a.txt
  git add a.txt >/dev/null 2>&1
  git commit -qm base >/dev/null 2>&1
  B=$(printf 'content\n' | git hash-object -w --stdin)
  TREE=$(printf '100644 blob %s\thas\ttab.txt\n' "$B" | git mktree)
  git commit-tree "$TREE" -p HEAD -m exotic > "$TABFIX/commit.sha"
) 2>/dev/null
TAB_SHA=$(cat "$TABFIX/commit.sha")
TAB_OUT="$WORKDIR/tabout"
if ( cd "$TABFIX" && bash "$HELPER" "$TAB_SHA" "$TAB_OUT" ) > "$WORKDIR/tab.log" 2>&1; then
  fail "helper exited 0 for a commit containing a tab-named path (should fail closed via git archive's own refusal)"
else
  pass "helper fails closed for a tab-named tracked path"
fi
if [ -e "$TAB_OUT" ] && [ -n "$(find "$TAB_OUT" -type f 2>/dev/null)" ]; then
  fail "a tab-named-path failure left files behind: $(find "$TAB_OUT" -type f)"
else
  pass "a tab-named-path failure leaves no files behind (atomic staging held)"
fi

echo "== 8. tracked symlink: refused before publish, not archived ambiguously =="
LNKFIX="$WORKDIR/lnkfix"; mkdir -p "$LNKFIX"
( cd "$LNKFIX"
  git init -q -b main .
  git config user.email test@test.local; git config user.name test
  printf 'normal\n' > normal.txt
  git add normal.txt >/dev/null 2>&1
  git commit -qm base >/dev/null 2>&1
  B_LNK=$(printf 'normal.txt' | git hash-object -w --stdin)
  git update-index --add --cacheinfo "120000,$B_LNK,link-to-normal"
  TREE=$(git write-tree)
  git commit-tree "$TREE" -p HEAD -m symlink > "$LNKFIX/commit.sha"
) 2>/dev/null
LNK_SHA=$(cat "$LNKFIX/commit.sha")
LNK_OUT="$WORKDIR/lnkout"
if ( cd "$LNKFIX" && bash "$HELPER" "$LNK_SHA" "$LNK_OUT" ) > "$WORKDIR/lnk.log" 2>&1; then
  fail "helper exited 0 for a commit containing a tracked symlink -- should refuse"
else
  pass "helper refuses a commit containing a tracked symlink"
fi
if grep -qi "symlink" "$WORKDIR/lnk.log"; then
  pass "refusal message names the symlink as the reason"
else
  fail "refusal message does not mention symlink: $(cat "$WORKDIR/lnk.log")"
fi
if [ -e "$LNK_OUT" ] && [ -n "$(find "$LNK_OUT" -type f 2>/dev/null)" ]; then
  fail "symlink refusal left files behind: $(find "$LNK_OUT" -type f)"
else
  pass "symlink refusal leaves no output directory / files behind (mkdir happens after the check)"
fi

# ==================================================================================================
echo "== 9. exact ref/commit is required; invalid ref fails before any output =="
OUT5="$WORKDIR/out5"
if run_helper "not-a-real-ref-xyz" "$OUT5" > "$WORKDIR/run5.log" 2>&1; then
  fail "helper exited 0 for an unresolvable ref"
else
  pass "helper exits non-zero for an unresolvable ref"
fi
if [ -e "$OUT5" ] && [ -n "$(ls -A "$OUT5" 2>/dev/null)" ]; then
  fail "an unresolvable ref still left output files behind: $(ls -A "$OUT5")"
else
  pass "an unresolvable ref leaves no output directory / files behind"
fi
if run_helper > "$WORKDIR/run6.log" 2>&1; then
  fail "helper exited 0 with no ref argument (should require one explicitly, no implicit HEAD)"
else
  pass "helper requires an explicit ref argument (fails with none given)"
fi

echo "== 10+L. existing COMPLETE artifact is never overwritten, content stays byte-identical =="
OUT7="$WORKDIR/out7"
run_helper "$SHA" "$OUT7" > "$WORKDIR/run7a.log" 2>&1
SUM_BEFORE=$(sha256sum "$OUT7/release-$SHA.tar.gz" | cut -d' ' -f1)
if run_helper "$SHA" "$OUT7" > "$WORKDIR/run7b.log" 2>&1; then
  fail "second run into the same output-dir overwrote the first without complaint"
else
  pass "second run into the same output-dir (complete artifact present) refuses to overwrite"
fi
if grep -qi "overwrit" "$WORKDIR/run7b.log"; then
  pass "overwrite refusal is explained in the output"
else
  fail "overwrite refusal has no clear explanation: $(cat "$WORKDIR/run7b.log")"
fi
if diff -q "$OUT7/release-$SHA.tar.gz" "$ARCHIVE1" >/dev/null 2>&1; then
  pass "the original artifact is untouched by the refused overwrite attempt"
else
  fail "the original artifact was altered by the refused overwrite attempt"
fi
SUM_AFTER=$(sha256sum "$OUT7/release-$SHA.tar.gz" | cut -d' ' -f1)
if [ "$SUM_BEFORE" = "$SUM_AFTER" ]; then
  pass "archive content byte-identical before/after the refused overwrite (all five sibling files, not just tar.gz, checked below)"
else
  fail "archive content CHANGED across a refused overwrite attempt"
fi
for ext in tar.gz.sha256 manifest.sha256 files.txt meta.txt; do
  [ -f "$OUT7/release-$SHA.$ext" ] && pass "release-$SHA.$ext still present after the refused overwrite" || fail "release-$SHA.$ext missing after the refused overwrite"
done

echo "== precheck isolation: a conflict is caught WITHOUT ever running 'git archive' =="
# The end-to-end "does it refuse, is content preserved" tests below also pass if ONLY the
# promotion-time no-clobber `ln` existed and the upfront precheck did not (defense-in-depth means
# the second layer alone still produces the same observable refusal) -- confirmed directly: a
# mutation that reverts the precheck to a meta.txt-only check still fails all of the same
# end-to-end assertions the OLD version failed, because `ln --` at promotion time independently
# catches the same conflict. This test isolates the precheck's OWN distinct value: it must reject
# a known conflict WITHOUT wasting work building an archive that will just be discarded. A `git`
# wrapper on PATH logs every `archive` invocation and delegates everything else to the real git.
GITWRAP="$WORKDIR/gitwrap"; mkdir -p "$GITWRAP/bin"
REAL_GIT=$(command -v git)
ARCHIVE_CALL_LOG="$WORKDIR/archive-calls.log"
cat > "$GITWRAP/bin/git" <<EOF
#!/bin/sh
for arg in "\$@"; do
  case "\$arg" in archive) echo "ARCHIVE_CALLED with: \$*" >> "$ARCHIVE_CALL_LOG"; break ;; esac
done
exec "$REAL_GIT" "\$@"
EOF
chmod +x "$GITWRAP/bin/git"
OUT_PRECHECK="$WORKDIR/precheck-isolation"; mkdir -p "$OUT_PRECHECK"
printf 'PRE-EXISTING-CONFLICT\n' > "$OUT_PRECHECK/release-$SHA.manifest.sha256"
: > "$ARCHIVE_CALL_LOG"
( cd "$FIXTURE" && PATH="$GITWRAP/bin:$PATH" bash "$HELPER" "$SHA" "$OUT_PRECHECK" ) > "$WORKDIR/precheck-isolation.log" 2>&1
if [ -s "$ARCHIVE_CALL_LOG" ]; then
  fail "'git archive' was invoked despite a pre-existing conflict at manifest.sha256 -- the precheck did not run first, wasted work occurred"
else
  pass "'git archive' was never invoked -- the conflict was caught before any staging work began"
fi
if grep -qF "PRE-EXISTING-CONFLICT" "$OUT_PRECHECK/release-$SHA.manifest.sha256" 2>/dev/null; then
  pass "the pre-existing conflicting file is untouched"
else
  fail "the pre-existing conflicting file was altered"
fi

echo "== A-E. EACH of the five final paths individually blocks publish, and only that path is reported =="
# Not "any conflict blocks" as one fact -- each of the five is independently a conflict, checked
# BEFORE staging begins (the precheck loop enumerates all five up front, not one-at-a-time as it
# happens to reach them during promotion).
declare -A CONFLICT_EXT=( [A]=tar.gz [B]=tar.gz.sha256 [C]=manifest.sha256 [D]=files.txt [E]=meta.txt )
for key in A B C D E; do
  ext="${CONFLICT_EXT[$key]}"
  OUTC="$WORKDIR/conflict-$key"; mkdir -p "$OUTC"
  printf 'SENTINEL-%s-DO-NOT-LOSE\n' "$key" > "$OUTC/release-$SHA.$ext"
  BEFORE_LIST=$(files_in "$OUTC")
  if run_helper "$SHA" "$OUTC" > "$WORKDIR/conflict-$key.log" 2>&1; then
    fail "[$key] helper succeeded despite a pre-existing release-$SHA.$ext"
  else
    pass "[$key] helper refuses when release-$SHA.$ext already exists"
  fi
  AFTER_LIST=$(files_in "$OUTC")
  if [ "$BEFORE_LIST" = "$AFTER_LIST" ]; then
    pass "[$key] no file was added or removed by the refused run (only the sentinel remains)"
  else
    fail "[$key] file set changed by a refused run: before=[$BEFORE_LIST] after=[$AFTER_LIST]"
  fi
  if grep -qF "SENTINEL-$key-DO-NOT-LOSE" "$OUTC/release-$SHA.$ext" 2>/dev/null; then
    pass "[$key] sentinel content untouched"
  else
    fail "[$key] sentinel content was altered or destroyed"
  fi
  if grep -qF "release-$SHA.$ext" "$WORKDIR/conflict-$key.log"; then
    pass "[$key] the specific conflicting path is named in the error output"
  else
    fail "[$key] error output does not name the specific conflicting path"
  fi
done

echo "== E (malformed/empty metadata): a garbage or empty meta.txt is a conflict, not 'safe to replace' =="
OUT_EMPTY_META="$WORKDIR/empty-meta"; mkdir -p "$OUT_EMPTY_META"
: > "$OUT_EMPTY_META/release-$SHA.meta.txt"
if run_helper "$SHA" "$OUT_EMPTY_META" > "$WORKDIR/empty-meta.log" 2>&1; then
  fail "helper succeeded despite a pre-existing EMPTY meta.txt"
else
  pass "an empty meta.txt is treated as a conflict, not as 'no complete artifact exists'"
fi
[ "$(files_in "$OUT_EMPTY_META" | wc -l)" = "1" ] && pass "only the empty meta.txt remains (nothing else was created)" || fail "unexpected files present after the refused run"

echo "== F. tracked symlink refusal already covered in section 8 above; broken OUTPUT-PATH symlink =="
OUT_SYMTEST="$WORKDIR/symtest"; mkdir -p "$WORKDIR/symtest-parent"
if ln -s "$WORKDIR/symtest-parent/does-not-exist" "$WORKDIR/symtest-parent/release-$SHA.meta.txt" 2>/dev/null \
   && [ -L "$WORKDIR/symtest-parent/release-$SHA.meta.txt" ]; then
  if run_helper "$SHA" "$WORKDIR/symtest-parent" > "$WORKDIR/symtest.log" 2>&1; then
    fail "helper succeeded despite a pre-existing BROKEN symlink at a final path"
  else
    pass "a broken symlink at a final path is treated as a conflict (-L catches it even though -e alone would not)"
  fi
else
  echo "  skip: cannot create symlinks in this environment (Windows privilege) -- broken-symlink-at-final-path NOT executed"
fi

echo "== G. destination appearing BETWEEN precheck and promotion is never overwritten (TOCTOU) =="
OUT_RACE="$WORKDIR/race"; mkdir -p "$OUT_RACE"
RACE_HELPER="$WORKDIR/helper-race.sh"
sed 's#^mkdir -p "\$OUT_DIR"$#mkdir -p "$OUT_DIR"\nsleep 3#' "$HELPER" > "$RACE_HELPER"
( cd "$FIXTURE" && bash "$RACE_HELPER" "$SHA" "$OUT_RACE" ) > "$WORKDIR/race.log" 2>&1 &
RACE_PID=$!
sleep 1
printf 'RACE-PLANTED-DURING-DELAY\n' > "$OUT_RACE/release-$SHA.manifest.sha256"
wait "$RACE_PID" 2>/dev/null || true
if grep -qF "RACE-PLANTED-DURING-DELAY" "$OUT_RACE/release-$SHA.manifest.sha256" 2>/dev/null; then
  pass "a destination planted mid-run (after precheck, before promotion) survives -- no TOCTOU overwrite"
else
  fail "a destination planted mid-run was overwritten -- TOCTOU window exists"
fi
if [ "$(files_in "$OUT_RACE" | wc -l)" = "1" ]; then
  pass "no other final files were published once the race was detected"
else
  fail "other final files were published despite the raced conflict: $(files_in "$OUT_RACE")"
fi

echo "== 11+12. interrupted run leaves no final-named partial files, and a retry is never blocked =="
OUT11="$WORKDIR/out11"
# Real mid-pipeline interruption: inject a delay right after the archive step so a SIGTERM lands
# while a real staged archive.tar.gz exists but nothing has been promoted yet.
DELAYED="$WORKDIR/helper-delayed.sh"
sed 's#^tar -xzf "\$STAGE_ARCHIVE" -C "\$STAGE_EXTRACT"$#sleep 5\ntar -xzf "$STAGE_ARCHIVE" -C "$STAGE_EXTRACT"#' "$HELPER" > "$DELAYED"
( cd "$FIXTURE" && bash "$DELAYED" "$SHA" "$OUT11" ) > "$WORKDIR/run11.log" 2>&1 &
DELAYED_PID=$!
# Poll for the staged archive rather than a fixed sleep -- a fixed delay races against real system
# load (this exact scenario was caught flaking once, while a concurrent heavy git-archive job was
# running elsewhere: the 0.8s fixed wait landed BEFORE archive creation had finished under
# contention). Polling up to 8s eliminates the race regardless of load; the 5s injected post-archive
# delay above still leaves ample margin to land the kill inside the "archive exists, not yet
# promoted" window every time.
STAGE_MID=""
for _i in $(seq 1 80); do
  STAGE_MID=$(find "$OUT11" -maxdepth 1 -name '.release-artifact-stage.*' 2>/dev/null | head -1)
  if [ -n "$STAGE_MID" ] && [ -f "$STAGE_MID/archive.tar.gz" ]; then break; fi
  STAGE_MID=""
  sleep 0.1
done
if [ -n "$STAGE_MID" ]; then
  pass "confirmed the kill lands mid-run (a real staged archive.tar.gz exists before the kill)"
else
  fail "could not confirm mid-run state before killing -- staging archive not found"
fi
kill -TERM "$DELAYED_PID" 2>/dev/null
wait "$DELAYED_PID" 2>/dev/null || true
if [ -e "$OUT11" ] && [ -n "$(find "$OUT11" -mindepth 1 2>/dev/null)" ]; then
  fail "interrupted run left files/dirs behind: $(find "$OUT11" -mindepth 1)"
else
  pass "interrupted run leaves the output directory empty (trap cleaned the staging dir)"
fi
if run_helper "$SHA" "$OUT11" > "$WORKDIR/run11b.log" 2>&1; then
  pass "retry after an interrupted run succeeds (not blocked by leftover partial files)"
else
  fail "retry after an interrupted run was blocked: $(cat "$WORKDIR/run11b.log")"
fi
[ -f "$OUT11/release-$SHA.meta.txt" ] && pass "retry produced a complete artifact set (meta.txt present)" || fail "retry did not produce meta.txt"

echo "== orphaned partial files (no meta.txt marker) are ALSO conflicts -- never silently replaced =="
# Hardened again after independent review: a PRIOR version of this script treated .meta.txt's
# presence as the ONLY overwrite guard and force-replaced anything else sitting under a final
# name. That was proven to silently DESTROY a genuine pre-existing artifact whenever .meta.txt
# happened to be absent -- reproduced directly with a hand-planted "IRREPLACEABLE PRIOR ARTIFACT"
# .tar.gz, overwritten with zero warning, exit 0. There is no such thing as a "safe to replace"
# leftover from this script's own perspective: every final path is checked, unconditionally.
OUT_ORPHAN="$WORKDIR/orphan"; mkdir -p "$OUT_ORPHAN"
printf 'IRREPLACEABLE-PRIOR-ARTIFACT-DO-NOT-LOSE\n' > "$OUT_ORPHAN/release-$SHA.tar.gz"
printf 'PRIOR-MANIFEST-DO-NOT-LOSE\n' > "$OUT_ORPHAN/release-$SHA.manifest.sha256"
if run_helper "$SHA" "$OUT_ORPHAN" > "$WORKDIR/orphan.log" 2>&1; then
  fail "a run SUCCEEDED despite orphaned partial files present (no meta.txt marker) -- should refuse"
else
  pass "orphaned partial files (no meta.txt marker) block the run just like any other conflict"
fi
if grep -qF "IRREPLACEABLE-PRIOR-ARTIFACT-DO-NOT-LOSE" "$OUT_ORPHAN/release-$SHA.tar.gz" 2>/dev/null; then
  pass "the pre-existing 'orphan' .tar.gz content was NOT destroyed"
else
  fail "the pre-existing 'orphan' .tar.gz content was silently overwritten -- data loss"
fi
if grep -qF "PRIOR-MANIFEST-DO-NOT-LOSE" "$OUT_ORPHAN/release-$SHA.manifest.sha256" 2>/dev/null; then
  pass "the pre-existing 'orphan' manifest content was NOT destroyed"
else
  fail "the pre-existing 'orphan' manifest content was silently overwritten -- data loss"
fi
if [ "$(files_in "$OUT_ORPHAN" | wc -l)" = "2" ]; then
  pass "no additional final files were created alongside the untouched orphans"
else
  fail "unexpected file count after the refused run: $(files_in "$OUT_ORPHAN")"
fi

echo "== I. SIGTERM after archive published, before checksum -- no leftover, clean retry =="
OUT_I="$WORKDIR/interrupt-i"; mkdir -p "$OUT_I"
DELAYED_I="$WORKDIR/helper-delay-i.sh"
sed 's#^promote "\$STAGE_ARCHIVE" "\$ARCHIVE"$#promote "$STAGE_ARCHIVE" "$ARCHIVE"\nsleep 3#' "$HELPER" > "$DELAYED_I"
( cd "$FIXTURE" && bash "$DELAYED_I" "$SHA" "$OUT_I" ) > "$WORKDIR/interrupt-i.log" 2>&1 &
PID_I=$!
FOUND_I=0
for _i in $(seq 1 50); do
  if [ -f "$OUT_I/release-$SHA.tar.gz" ]; then FOUND_I=1; break; fi
  sleep 0.1
done
if [ "$FOUND_I" = 1 ]; then
  pass "confirmed the archive was published before the kill (mid-promotion state reached)"
else
  fail "could not confirm the archive was published before killing"
fi
kill -TERM "$PID_I" 2>/dev/null
wait "$PID_I" 2>/dev/null || true
if [ -n "$(find "$OUT_I" -mindepth 1 2>/dev/null)" ]; then
  fail "interrupt-after-archive left files behind: $(find "$OUT_I" -mindepth 1)"
else
  pass "interrupt after archive-only promotion leaves NOTHING behind (the one promoted file is cleaned up too)"
fi
if run_helper "$SHA" "$OUT_I" > "$WORKDIR/interrupt-i-retry.log" 2>&1; then
  pass "retry after interrupt-I succeeds"
else
  fail "retry after interrupt-I was blocked: $(cat "$WORKDIR/interrupt-i-retry.log")"
fi
[ -f "$OUT_I/release-$SHA.meta.txt" ] && pass "retry after interrupt-I produced a complete set" || fail "retry after interrupt-I incomplete"

echo "== J. SIGTERM immediately after meta.txt is promoted -- the narrow completeness-race window =="
# This is the single most important interrupt scenario in the whole suite: a kill in the gap
# between meta.txt's `ln` succeeding and whatever statement comes after it. A first version of
# this script used a SEPARATE flag (set on the line after the last promote() call) to decide
# whether the trap should clean up -- and a kill landing in exactly this gap caused the trap to
# DELETE an already-fully-published, complete artifact set, meta.txt included. Reproduced directly.
# Fixed by deriving completeness from whether $META itself appears in the promoted-files list
# (updated inside promote(), immediately after its `ln` succeeds) rather than a flag set later.
OUT_J="$WORKDIR/interrupt-j"; mkdir -p "$OUT_J"
DELAYED_J="$WORKDIR/helper-delay-j.sh"
sed 's#^promote "\$STAGE/meta.txt" "\$META"$#promote "$STAGE/meta.txt" "$META"\nsleep 3#' "$HELPER" > "$DELAYED_J"
grep -q "sleep 3" "$DELAYED_J" && pass "delay injected immediately after the meta.txt promote() call" || fail "failed to inject delay for interrupt-J"
( cd "$FIXTURE" && bash "$DELAYED_J" "$SHA" "$OUT_J" ) > "$WORKDIR/interrupt-j.log" 2>&1 &
PID_J=$!
FOUND_J=0
for _i in $(seq 1 50); do
  if [ -f "$OUT_J/release-$SHA.meta.txt" ]; then FOUND_J=1; break; fi
  sleep 0.1
done
if [ "$FOUND_J" = 1 ]; then
  pass "confirmed meta.txt was published before the kill (the exact race window is now open)"
else
  fail "could not confirm meta.txt was published before killing"
fi
kill -TERM "$PID_J" 2>/dev/null
wait "$PID_J" 2>/dev/null || true
if [ -f "$OUT_J/release-$SHA.meta.txt" ]; then
  pass "a kill in the narrow post-promotion window still leaves the complete artifact set intact"
else
  fail "meta.txt disappeared after a post-promotion kill -- the exact race this test exists to catch"
fi
for ext in tar.gz tar.gz.sha256 manifest.sha256 files.txt; do
  [ -f "$OUT_J/release-$SHA.$ext" ] || fail "release-$SHA.$ext missing after interrupt-J -- incomplete set left as if complete"
done
if run_helper "$SHA" "$OUT_J" > "$WORKDIR/interrupt-j-retry.log" 2>&1; then
  fail "a SECOND run succeeded even though interrupt-J already left a complete artifact -- should refuse"
else
  pass "a second run correctly refuses -- interrupt-J's on-disk state is already a complete, valid artifact"
fi

# ==================================================================================================
echo "== K. TRUE ln->record signal race: SIGTERM sent from INSIDE the ln invocation itself, the =="
echo "==    instant the real hard link exists but before promote() resumes =========================="
# Interrupt tests I and J above inject a `sleep` via `sed` AFTER an entire promote() call already
# returned -- i.e. after any bookkeeping promote() does internally has already finished. That
# proves nothing about a signal landing INSIDE promote(), between "ln returned 0" and whatever
# statement follows it there. This section reproduces that exact window with a PATH-stubbed `ln`:
# the stub calls the REAL `ln`, and the INSTANT it returns 0, sends a signal to its own parent (the
# running create-release-artifact.sh process) and only then returns control to promote().
#
# A prior version of promote() appended to a PROMOTED_FILES array in the statement immediately
# after `ln` succeeded, using ONE trap shared across EXIT/INT/TERM whose handler never called
# `exit`. Reproduced directly against that version before this fix: a signal landing in that gap
# made the trap misclassify a just-published meta.txt as unpublished, so it deleted the four OTHER
# genuinely-published final files while leaving meta.txt itself orphaned (permanently blocking
# retry) -- AND because the handler never exited, the interrupted run resumed anyway, printed all
# five false "wrote ..." success lines, and exited 0.
REAL_LN_K=$(command -v ln)
STUBBIN_K="$WORKDIR/stubbin-k"; mkdir -p "$STUBBIN_K"
cat > "$STUBBIN_K/ln" <<EOF
#!/bin/bash
"$REAL_LN_K" "\$@"
status=\$?
if [ "\$status" -eq 0 ] && [ -n "\${SIGNAL_ON_SUFFIX:-}" ]; then
  last="\${@: -1}"
  case "\$last" in
    *"\$SIGNAL_ON_SUFFIX")
      kill -"\${SIGNAL_TO_SEND:-TERM}" "\$PPID"
      sleep 2
      ;;
  esac
fi
exit "\$status"
EOF
chmod +x "$STUBBIN_K/ln"

echo "== K1. signal the instant meta.txt's ln succeeds (the LAST promote call, the narrowest window) =="
OUT_K1="$WORKDIR/race-k1"; mkdir -p "$OUT_K1"
( cd "$FIXTURE" && PATH="$STUBBIN_K:$PATH" SIGNAL_ON_SUFFIX="meta.txt" SIGNAL_TO_SEND=TERM bash "$HELPER" "$SHA" "$OUT_K1" ) > "$WORKDIR/race-k1.log" 2>&1
CODE_K1=$?
[ "$CODE_K1" = "143" ] && pass "[K1] exits 143 for SIGTERM (not swallowed, not exit 0)" || fail "[K1] exit code was $CODE_K1, expected 143"
if grep -qE '^\[release-artifact\] wrote' "$WORKDIR/race-k1.log"; then
  fail "[K1] a 'wrote ...' success line was printed despite the run being interrupted -- stale success message"
else
  pass "[K1] no false 'wrote ...' success message after the signal"
fi
K1_COMPLETE=1
for ext in tar.gz tar.gz.sha256 manifest.sha256 files.txt meta.txt; do
  [ -f "$OUT_K1/release-$SHA.$ext" ] || { fail "[K1] release-$SHA.$ext missing -- a signal AFTER the complete set's last link must preserve all five"; K1_COMPLETE=0; }
done
[ "$K1_COMPLETE" = 1 ] && pass "[K1] all five final files present after a signal landing right after the last (meta.txt) link succeeded"
if find "$OUT_K1" -maxdepth 1 -name '.release-artifact-stage.*' 2>/dev/null | grep -q .; then
  fail "[K1] staging directory leaked"
else
  pass "[K1] staging directory cleaned up"
fi
if run_helper "$SHA" "$OUT_K1" > "$WORKDIR/race-k1-retry.log" 2>&1; then
  fail "[K1] a second run succeeded even though K1 already left a complete artifact set -- should refuse"
else
  pass "[K1] retry correctly refuses -- K1's on-disk state is already a complete, valid, five-file set"
fi

echo "== K2. signal the instant an EARLIER (non-last) file's ln succeeds -- incomplete set must be fully undone =="
OUT_K2="$WORKDIR/race-k2"; mkdir -p "$OUT_K2"
( cd "$FIXTURE" && PATH="$STUBBIN_K:$PATH" SIGNAL_ON_SUFFIX="manifest.sha256" SIGNAL_TO_SEND=TERM bash "$HELPER" "$SHA" "$OUT_K2" ) > "$WORKDIR/race-k2.log" 2>&1
CODE_K2=$?
[ "$CODE_K2" = "143" ] && pass "[K2] exits 143 for SIGTERM" || fail "[K2] exit code was $CODE_K2, expected 143"
if [ -n "$(find "$OUT_K2" -mindepth 1 2>/dev/null)" ]; then
  fail "[K2] an incomplete run (signal after the FIRST of five links) left files behind: $(find "$OUT_K2" -mindepth 1)"
else
  pass "[K2] an incomplete run leaves NOTHING behind -- the one link that had just succeeded was cleaned up too"
fi
if run_helper "$SHA" "$OUT_K2" > "$WORKDIR/race-k2-retry.log" 2>&1; then
  pass "[K2] retry after an incomplete interrupted run succeeds cleanly"
else
  fail "[K2] retry after K2 was blocked: $(cat "$WORKDIR/race-k2-retry.log")"
fi
[ -f "$OUT_K2/release-$SHA.meta.txt" ] && pass "[K2] retry produced a complete five-file set" || fail "[K2] retry did not produce a complete set"

echo "== K3 (structural). no separate post-ln bookkeeping statement exists for promote() to race against =="
# Matches actual CODE use (assignment/append/expansion), not this test's own or the script's
# explanatory-comment prose mentioning the retired array's former name.
if grep -qE '(^|[^#[:alnum:]_])PROMOTED_FILES(\+?=|\[)' "$HELPER"; then
  fail "[K3] PROMOTED_FILES (the array whose separate-statement update caused the race) is still used as code in the script"
else
  pass "[K3] no PROMOTED_FILES array/bookkeeping step exists in code -- ownership is derived from -ef alone, nothing to race"
fi
PROMOTE_BODY=$(awk '/^promote\(\) \{/,/^\}/' "$HELPER")
if printf '%s\n' "$PROMOTE_BODY" | grep -qE '^\s*(PROMOTED_FILES\+=|rm -f -- "\$staged")\s*$'; then
  fail "[K3] promote() still has a post-ln bookkeeping/removal statement after a successful ln"
else
  pass "[K3] promote() does nothing after a successful ln except return -- no window left to signal into"
fi

echo "== L. SIGINT is handled distinctly and exits 130 (not swallowed, not conflated with SIGTERM's 143) =="
OUT_L="$WORKDIR/race-l"; mkdir -p "$OUT_L"
( cd "$FIXTURE" && PATH="$STUBBIN_K:$PATH" SIGNAL_ON_SUFFIX="meta.txt" SIGNAL_TO_SEND=INT bash "$HELPER" "$SHA" "$OUT_L" ) > "$WORKDIR/race-l.log" 2>&1
CODE_L=$?
[ "$CODE_L" = "130" ] && pass "[L] SIGINT exits 130" || fail "[L] SIGINT exit code was $CODE_L, expected 130"
L_COMPLETE=1
for ext in tar.gz tar.gz.sha256 manifest.sha256 files.txt meta.txt; do
  [ -f "$OUT_L/release-$SHA.$ext" ] || { fail "[L] release-$SHA.$ext missing after a SIGINT landing right after the last link succeeded"; L_COMPLETE=0; }
done
[ "$L_COMPLETE" = 1 ] && pass "[L] all five final files present after SIGINT lands right after the last (meta.txt) link succeeded"
if grep -qE '^\[release-artifact\] wrote' "$WORKDIR/race-l.log"; then
  fail "[L] a 'wrote ...' success line was printed despite SIGINT interrupting the run"
else
  pass "[L] no false success message after SIGINT"
fi

echo "== M. raced destination mid-run: precheck-time conflict leaves the sentinel and nothing else =="
OUT_M="$WORKDIR/race-m"; mkdir -p "$OUT_M"
printf 'SENTINEL-M-NOT-OWNED-BY-THIS-RUN\n' > "$OUT_M/release-$SHA.tar.gz.sha256"
if run_helper "$SHA" "$OUT_M" > "$WORKDIR/race-m.log" 2>&1; then
  fail "[M] helper succeeded despite a pre-existing conflict at tar.gz.sha256"
else
  pass "[M] helper refuses (precheck catches the pre-planted conflict before any staging work)"
fi
if grep -qF "SENTINEL-M-NOT-OWNED-BY-THIS-RUN" "$OUT_M/release-$SHA.tar.gz.sha256" 2>/dev/null; then
  pass "[M] the pre-existing sentinel is untouched"
else
  fail "[M] the pre-existing sentinel was destroyed"
fi
if [ "$(files_in "$OUT_M" | wc -l)" = "1" ]; then
  pass "[M] no other final files exist (nothing was published before the precheck refused the whole run)"
else
  fail "[M] unexpected files present: $(files_in "$OUT_M")"
fi

echo "== N (mutation-relevant). stripping the -ef ownership check makes cleanup destroy a raced destination =="
# Reuses test G's exact TOCTOU mechanism (destination planted mid-run, after precheck, during an
# injected delay) but points it at a disposable copy with the -ef ownership test removed from
# do_cleanup's incomplete-set branch. G already proves the REAL script preserves the sentinel;
# this proves that WITHOUT -ef, the same scenario would NOT preserve it -- i.e. -ef is load-bearing,
# not decorative.
NO_EF_HELPER="$WORKDIR/helper-no-ef.sh"
sed 's#\[ -e "\$final" \] && \[ -e "\$staged" \] && \[ "\$final" -ef "\$staged" \]#[ -e "$final" ]#' "$HELPER" > "$NO_EF_HELPER"
if grep -qF '[ -e "$final" ] && [ -e "$staged" ] && [ "$final" -ef "$staged" ]' "$NO_EF_HELPER"; then
  fail "[N] failed to strip the -ef check from the disposable copy -- mutation not applied"
else
  OUT_N="$WORKDIR/race-n"; mkdir -p "$OUT_N"
  RACE_N_HELPER="$WORKDIR/helper-race-n.sh"
  sed 's#^mkdir -p "\$OUT_DIR"$#mkdir -p "$OUT_DIR"\nsleep 3#' "$NO_EF_HELPER" > "$RACE_N_HELPER"
  ( cd "$FIXTURE" && bash "$RACE_N_HELPER" "$SHA" "$OUT_N" ) > "$WORKDIR/race-n.log" 2>&1 &
  RACE_N_PID=$!
  sleep 1
  printf 'SENTINEL-N-NOT-OWNED-BY-THIS-RUN\n' > "$OUT_N/release-$SHA.manifest.sha256"
  wait "$RACE_N_PID" 2>/dev/null || true
  if grep -qF "SENTINEL-N-NOT-OWNED-BY-THIS-RUN" "$OUT_N/release-$SHA.manifest.sha256" 2>/dev/null; then
    fail "[N] mutated (-ef-stripped) helper did NOT reproduce the bug -- test M/G would not catch a regression on the -ef check"
  else
    pass "[N] mutation confirmed load-bearing: stripping -ef makes do_cleanup destroy a raced destination it does not own"
  fi
fi

echo "== O (mutation-relevant). a signal handler that returns instead of exiting resumes main flow =="
RETURN_HELPER="$WORKDIR/helper-return-not-exit.sh"
sed 's/^  exit 143$/  return 0/' "$HELPER" > "$RETURN_HELPER"
if grep -q '^  return 0$' "$RETURN_HELPER"; then
  pass "[O] mutation applied: on_term no longer calls exit"
else
  fail "[O] failed to apply the return-instead-of-exit mutation"
fi
OUT_O="$WORKDIR/race-o"; mkdir -p "$OUT_O"
( cd "$FIXTURE" && PATH="$STUBBIN_K:$PATH" SIGNAL_ON_SUFFIX="manifest.sha256" SIGNAL_TO_SEND=TERM bash "$RETURN_HELPER" "$SHA" "$OUT_O" ) > "$WORKDIR/race-o.log" 2>&1
CODE_O=$?
if [ "$CODE_O" = "143" ]; then
  fail "[O] mutated (return-not-exit) helper still exited 143 -- K1/K2's exit-code assertions would not catch this regression"
else
  pass "[O] mutation confirmed load-bearing: a handler that returns instead of exiting does NOT stop at 143 (got $CODE_O) -- K1/K2's exit-code checks are what catch this"
fi

# ==================================================================================================
echo "== P. runbook consumer-gate: duplicate metadata key must be rejected, not silently accepted =="
# docs/delivery/RELEASE-AND-ROLLBACK-CHECKLIST.md's consumer checklist is Markdown, not an
# executable this suite can source -- so its exact `require_unique_kv` logic (count occurrences of
# a key, refuse if != 1, THEN compare the value) is mirrored here verbatim and run against a REAL
# artifact this suite already produced, plus negative fixtures. If the runbook's snippet and this
# copy ever drift, update both together.
require_unique_kv_test() {
  local key="$1" expected_value="$2" file="$3" count
  count=$(grep -c "^${key}=" "$file")
  if [ "$count" -ne 1 ]; then
    return 1
  fi
  grep -qx "${key}=${expected_value}" "$file"
}
# The OLD (pre-hardening) gate mirrored for comparison: `grep -qx` alone, no uniqueness check.
old_grepqx_gate() {
  local key="$1" expected_value="$2" file="$3"
  grep -qx "${key}=${expected_value}" "$file"
}

REAL_META="$OUT1/release-$SHA.meta.txt"
if require_unique_kv_test commit_sha "$SHA" "$REAL_META"; then
  pass "[P] gate ACCEPTS the real, valid meta.txt produced by an actual run"
else
  fail "[P] gate rejected a genuinely valid meta.txt"
fi

DUP_TREE=$(git -C "$FIXTURE" rev-parse "$SHA^{tree}")
DUP_ARCHIVE_SHA=$(sha256sum "$ARCHIVE1" | cut -d' ' -f1)

mk_dup_meta() {
  # $1 = second commit_sha line's value (the duplicate)
  printf 'format_version=1\ncommit_sha=%s\ntree_sha=%s\narchive_sha256=%s\narchive_filename=release-%s.tar.gz\ncommit_sha=%s\n' \
    "$SHA" "$DUP_TREE" "$DUP_ARCHIVE_SHA" "$SHA" "$1"
}

DUP_CORRECT_CORRECT="$WORKDIR/dup-meta-1.txt"; mk_dup_meta "$SHA" > "$DUP_CORRECT_CORRECT"
if require_unique_kv_test commit_sha "$SHA" "$DUP_CORRECT_CORRECT"; then
  fail "[P] gate ACCEPTED a meta.txt with commit_sha duplicated (correct/correct) -- duplicate keys must always be rejected, even if both copies agree"
else
  pass "[P] gate rejects commit_sha duplicated as correct/correct (ambiguous file, refused regardless of agreement)"
fi
if old_grepqx_gate commit_sha "$SHA" "$DUP_CORRECT_CORRECT"; then
  echo "  (old grep -qx-only gate would ALSO have accepted this one -- not the interesting case)"
fi

DUP_CORRECT_WRONG="$WORKDIR/dup-meta-2.txt"; mk_dup_meta "0000000000000000000000000000000000dead" > "$DUP_CORRECT_WRONG"
if require_unique_kv_test commit_sha "$SHA" "$DUP_CORRECT_WRONG"; then
  fail "[P] gate ACCEPTED a meta.txt with commit_sha duplicated (correct + wrong) -- the exact bypass this hardening exists to close"
else
  pass "[P] gate rejects commit_sha duplicated as correct+wrong"
fi
if old_grepqx_gate commit_sha "$SHA" "$DUP_CORRECT_WRONG"; then
  pass "[P] confirmed: the OLD grep -qx-only gate WOULD have silently accepted this ambiguous file (one correct line exists) -- proves the fix is load-bearing, not redundant"
else
  fail "[P] could not reproduce the old gate's weakness against this fixture -- the mutation-comparison proof is inconclusive"
fi

DUP_WRONG_CORRECT="$WORKDIR/dup-meta-3.txt"
printf 'format_version=1\ncommit_sha=0000000000000000000000000000000000dead\ntree_sha=%s\narchive_sha256=%s\narchive_filename=release-%s.tar.gz\ncommit_sha=%s\n' \
  "$DUP_TREE" "$DUP_ARCHIVE_SHA" "$SHA" "$SHA" > "$DUP_WRONG_CORRECT"
if require_unique_kv_test commit_sha "$SHA" "$DUP_WRONG_CORRECT"; then
  fail "[P] gate ACCEPTED commit_sha duplicated as wrong+correct"
else
  pass "[P] gate rejects commit_sha duplicated as wrong+correct (order does not matter)"
fi

MISSING_KEY="$WORKDIR/missing-key-meta.txt"
printf 'format_version=1\ntree_sha=%s\narchive_sha256=%s\narchive_filename=release-%s.tar.gz\n' "$DUP_TREE" "$DUP_ARCHIVE_SHA" "$SHA" > "$MISSING_KEY"
if require_unique_kv_test commit_sha "$SHA" "$MISSING_KEY"; then
  fail "[P] gate ACCEPTED a meta.txt entirely missing commit_sha"
else
  pass "[P] gate rejects a meta.txt missing the commit_sha key (count=0, not 1)"
fi

WRONG_VALUE="$WORKDIR/wrong-value-meta.txt"
printf 'format_version=1\ncommit_sha=0000000000000000000000000000000000dead\ntree_sha=%s\narchive_sha256=%s\narchive_filename=release-%s.tar.gz\n' "$DUP_TREE" "$DUP_ARCHIVE_SHA" "$SHA" > "$WRONG_VALUE"
if require_unique_kv_test commit_sha "$SHA" "$WRONG_VALUE"; then
  fail "[P] gate ACCEPTED a meta.txt with the wrong commit_sha"
else
  pass "[P] gate rejects a meta.txt with a single, unambiguous, but WRONG commit_sha"
fi

EMPTY_META_P="$WORKDIR/empty-meta-p.txt"; : > "$EMPTY_META_P"
if require_unique_kv_test commit_sha "$SHA" "$EMPTY_META_P"; then
  fail "[P] gate ACCEPTED a completely empty meta.txt"
else
  pass "[P] gate rejects an empty meta.txt (count=0)"
fi

for key in format_version tree_sha archive_sha256; do
  DUP_OTHER="$WORKDIR/dup-$key.txt"
  case "$key" in
    format_version) printf 'format_version=1\ncommit_sha=%s\ntree_sha=%s\narchive_sha256=%s\nformat_version=1\n' "$SHA" "$DUP_TREE" "$DUP_ARCHIVE_SHA" > "$DUP_OTHER"; expected=1 ;;
    tree_sha) printf 'format_version=1\ncommit_sha=%s\ntree_sha=%s\narchive_sha256=%s\ntree_sha=deadbeef\n' "$SHA" "$DUP_TREE" "$DUP_ARCHIVE_SHA" > "$DUP_OTHER"; expected="$DUP_TREE" ;;
    archive_sha256) printf 'format_version=1\ncommit_sha=%s\ntree_sha=%s\narchive_sha256=%s\narchive_sha256=deadbeef\n' "$SHA" "$DUP_TREE" "$DUP_ARCHIVE_SHA" > "$DUP_OTHER"; expected="$DUP_ARCHIVE_SHA" ;;
  esac
  if require_unique_kv_test "$key" "$expected" "$DUP_OTHER"; then
    fail "[P] gate ACCEPTED $key duplicated"
  else
    pass "[P] gate rejects $key duplicated"
  fi
done

echo "== 16. output directory containing spaces works =="
OUT_SPACE="$WORKDIR/out with spaces"
if run_helper "$SHA" "$OUT_SPACE" > "$WORKDIR/runspace.log" 2>&1; then
  pass "helper succeeds with a space-containing output-dir path"
else
  fail "helper failed with a space-containing output-dir path: $(cat "$WORKDIR/runspace.log")"
fi
[ -f "$OUT_SPACE/release-$SHA.meta.txt" ] && pass "artifact set complete under the space-containing output-dir" || fail "artifact set incomplete under the space-containing output-dir"

echo "== option-like / unsafe argument handling =="
OUT_OPT="$WORKDIR/optout"
if run_helper "--help" "$OUT_OPT" > /dev/null 2>&1; then fail "'--help' as ref was accepted instead of failing"; else pass "'--help' as ref fails closed (not treated as an option)"; fi
if [ -e "$OUT_OPT" ] && [ -n "$(find "$OUT_OPT" -mindepth 1 2>/dev/null)" ]; then fail "'--help'-as-ref left files behind"; else pass "'--help'-as-ref leaves no output behind"; fi

echo "== default output-dir: .release-transfer under the fixture repo root, not this real repo =="
OUT_DEFAULT="$FIXTURE/.release-transfer"
if run_helper "$SHA" > "$WORKDIR/run8.log" 2>&1; then
  pass "helper runs with no explicit output-dir (uses the default)"
else
  fail "helper failed with no explicit output-dir: $(cat "$WORKDIR/run8.log")"
fi
if [ -f "$OUT_DEFAULT/release-$SHA.tar.gz" ]; then
  pass "default output-dir is .release-transfer under the FIXTURE repo (not the real repo)"
else
  fail "default output-dir did not resolve to the fixture repo's .release-transfer"
fi
if [ -f "$REPO_ROOT/.release-transfer/release-$SHA.tar.gz" ]; then
  fail "an artifact leaked into THIS repo's .release-transfer -- must never happen"
else
  pass "this repo's own .release-transfer directory was never touched by any test scenario"
fi

echo "== 13. full commit SHA is present as the artifact's identity contract =="
if grep -q "^commit_sha=$SHA\$" "$OUT1/release-$SHA.meta.txt"; then
  pass "meta.txt records the exact full commit SHA"
else
  fail "meta.txt does not record the exact full commit SHA"
fi
TREE_SHA_EXPECTED=$(git -C "$FIXTURE" rev-parse "$SHA^{tree}")
if grep -q "^tree_sha=$TREE_SHA_EXPECTED\$" "$OUT1/release-$SHA.meta.txt"; then
  pass "meta.txt records the correct tree SHA"
else
  fail "meta.txt does not record the correct tree SHA"
fi
ARCHIVE_SHA_EXPECTED=$(sha256sum "$ARCHIVE1" | cut -d' ' -f1)
if grep -q "^archive_sha256=$ARCHIVE_SHA_EXPECTED\$" "$OUT1/release-$SHA.meta.txt"; then
  pass "meta.txt records the correct archive SHA-256"
else
  fail "meta.txt does not record the correct archive SHA-256"
fi
if printf '%s' "$SHA" | grep -qE '^[0-9a-f]{40}$'; then
  pass "the filenames themselves already use the full 40-hex commit SHA"
else
  fail "SHA used for filenames is not a full 40-hex commit SHA: $SHA"
fi
if grep -q "^format_version=" "$OUT1/release-$SHA.meta.txt"; then
  pass "meta.txt declares a format_version"
else
  fail "meta.txt does not declare a format_version"
fi

echo "== 17. a hashing failure cannot be swallowed into a false exit 0 =="
# Mutation-style proof INLINE (not a disposable-copy mutation -- this one directly exercises the
# real script's actual fail-closed behavior against a real unreadable-file condition, which is a
# more direct proof than editing the script): a file that is deleted out from under `find` between
# listing and hashing must make the whole run fail, not silently produce a shorter manifest.
# Simulated by pointing HOME/PATH such that `sha256sum` itself is replaced with a failing stub for
# this one invocation, proving the script does not tolerate an internal hashing failure.
FAILSTUB="$WORKDIR/failstub"; mkdir -p "$FAILSTUB/bin"
cat > "$FAILSTUB/bin/sha256sum" <<'EOF'
#!/bin/sh
echo "sha256sum: forced failure for test" >&2
exit 1
EOF
chmod +x "$FAILSTUB/bin/sha256sum"
OUT17="$WORKDIR/out17"
if ( cd "$FIXTURE" && PATH="$FAILSTUB/bin:$PATH" bash "$HELPER" "$SHA" "$OUT17" ) > "$WORKDIR/run17.log" 2>&1; then
  fail "helper exited 0 even though sha256sum itself was forced to fail"
else
  pass "helper exits non-zero when the hashing tool itself fails"
fi
if [ -e "$OUT17" ] && [ -n "$(find "$OUT17" -mindepth 1 -not -name '.release-artifact-stage.*' -type f 2>/dev/null)" ]; then
  fail "a forced hashing failure still left final-named files behind: $(find "$OUT17" -mindepth 1 -type f)"
else
  pass "a forced hashing failure publishes nothing under a final name"
fi

echo "== 17b. a NON-LAST pipe-stage failure cannot be swallowed either (this is specifically what pipefail is for) =="
# The manifest step is `find | sort | xargs sha256sum`. A failure in `sha256sum` (the LAST stage)
# already propagates under plain `set -e` with no `pipefail` needed -- 17 above does not actually
# distinguish whether `pipefail` is in effect. This one fails `find` (the FIRST stage) instead: sort
# and xargs/sha256sum would both "succeed" trivially on the empty input find produces, so WITHOUT
# `set -o pipefail` the overall pipeline's exit status would be 0 (from the last command) even
# though `find` itself failed -- the exact "swallowed error, empty manifest, exit 0" failure mode
# this script exists to prevent. Only `pipefail` makes this fail closed.
FINDFAILSTUB="$WORKDIR/findfailstub"; mkdir -p "$FINDFAILSTUB/bin"
cat > "$FINDFAILSTUB/bin/find" <<'EOF'
#!/bin/sh
echo "find: forced failure for test" >&2
exit 1
EOF
chmod +x "$FINDFAILSTUB/bin/find"
OUT17B="$WORKDIR/out17b"
if ( cd "$FIXTURE" && PATH="$FINDFAILSTUB/bin:$PATH" bash "$HELPER" "$SHA" "$OUT17B" ) > "$WORKDIR/run17b.log" 2>&1; then
  fail "helper exited 0 even though 'find' (a non-last pipe stage) was forced to fail -- pipefail is not doing its job"
else
  pass "helper exits non-zero when 'find' (a non-last pipe stage) fails -- pipefail is effective"
fi
if [ -e "$OUT17B" ] && [ -n "$(find "$OUT17B" -mindepth 1 -not -name '.release-artifact-stage.*' -type f 2>/dev/null)" ]; then
  fail "a forced 'find' failure still left final-named files behind"
else
  pass "a forced 'find' failure publishes nothing under a final name"
fi

# ==================================================================================================
echo "== empty-tree commit: manifest is genuinely empty, not a phantom 'sha256 of stdin' entry =="
# Independently reproduced: `xargs sha256sum` (no -r) still invokes sha256sum with ZERO file
# arguments when `find` produces no paths, and sha256sum then reads STDIN -- hashing nothing and
# producing one bogus manifest line (`e3b0c442...  -`) attributed to a file literally named `-`,
# with the script still exiting 0. `xargs -r`/--no-run-if-empty is what fixes it (verified this
# flag exists and behaves this way in this environment before relying on it).
EMPTYFIX="$WORKDIR/emptyfix"; mkdir -p "$EMPTYFIX"
( cd "$EMPTYFIX"
  git init -q -b main .
  git config user.email test@test.local; git config user.name test
) 2>/dev/null
EMPTY_TREE_SHA=$(git -C "$EMPTYFIX" hash-object -t tree /dev/null)
EMPTY_COMMIT_SHA=$(git -C "$EMPTYFIX" commit-tree "$EMPTY_TREE_SHA" -m "empty tree")
EMPTY_OUT="$WORKDIR/emptyout"
if ( cd "$EMPTYFIX" && bash "$HELPER" "$EMPTY_COMMIT_SHA" "$EMPTY_OUT" ) > "$WORKDIR/empty.log" 2>&1; then
  pass "helper succeeds on a commit with zero tracked files"
else
  fail "helper failed on a zero-tracked-file commit: $(cat "$WORKDIR/empty.log")"
fi
EMPTY_MANIFEST="$EMPTY_OUT/release-$EMPTY_COMMIT_SHA.manifest.sha256"
if [ -f "$EMPTY_MANIFEST" ] && [ ! -s "$EMPTY_MANIFEST" ]; then
  pass "manifest exists and is exactly 0 bytes"
else
  fail "manifest is missing or non-empty for a zero-tracked-file commit: $(wc -c < "$EMPTY_MANIFEST" 2>/dev/null || echo missing) bytes"
fi
if grep -qF -- '-' "$EMPTY_MANIFEST" 2>/dev/null; then
  fail "manifest contains a phantom entry (the original empty-input bug, reintroduced)"
else
  pass "manifest contains no phantom 'sha256 of stdin' entry"
fi
EMPTY_FILES="$EMPTY_OUT/release-$EMPTY_COMMIT_SHA.files.txt"
if [ -f "$EMPTY_FILES" ] && [ ! -s "$EMPTY_FILES" ]; then
  pass "files.txt is also correctly empty (0 tracked files)"
else
  fail "files.txt is not empty for a zero-tracked-file commit"
fi
[ -f "$EMPTY_OUT/release-$EMPTY_COMMIT_SHA.meta.txt" ] && pass "meta.txt still published for the empty-tree commit" || fail "meta.txt missing for the empty-tree commit"
EMPTY_ARCHIVE_SUM_EXPECTED=$(sha256sum "$EMPTY_OUT/release-$EMPTY_COMMIT_SHA.tar.gz" | cut -d' ' -f1)
if grep -q "^archive_sha256=$EMPTY_ARCHIVE_SUM_EXPECTED\$" "$EMPTY_OUT/release-$EMPTY_COMMIT_SHA.meta.txt"; then
  pass "meta.txt's archive_sha256 is correct for the empty-tree archive"
else
  fail "meta.txt's archive_sha256 is wrong for the empty-tree archive"
fi

echo "== mutation-relevant: removing the empty-list guard reintroduces the phantom manifest entry =="
# Direct proof that -r is load-bearing, not merely present. A disposable copy of the helper with
# `-r` stripped from the xargs invocation must reproduce the exact original bug on this exact
# empty-tree commit.
NO_R_HELPER="$WORKDIR/helper-no-r.sh"
sed 's/xargs -r -0 sha256sum/xargs -0 sha256sum/' "$HELPER" > "$NO_R_HELPER"
if grep -q "xargs -r -0" "$NO_R_HELPER"; then
  fail "failed to strip -r from the disposable copy -- mutation not applied"
else
  NO_R_OUT="$WORKDIR/no-r-out"
  ( cd "$EMPTYFIX" && bash "$NO_R_HELPER" "$EMPTY_COMMIT_SHA" "$NO_R_OUT" ) > "$WORKDIR/no-r.log" 2>&1
  NO_R_MANIFEST="$NO_R_OUT/release-$EMPTY_COMMIT_SHA.manifest.sha256"
  if [ -s "$NO_R_MANIFEST" ] 2>/dev/null; then
    pass "removing -r reproduces the original bug (non-empty manifest for a zero-file commit) -- confirms -r is load-bearing"
  else
    fail "removing -r did NOT reproduce the bug -- this test would not catch a regression here"
  fi
fi

echo
echo "== summary: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
