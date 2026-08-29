#!/bin/bash
# Canonical release-artifact creation (2026-08-29, hardened twice after independent review) --
# byte-faithful `git archive` for a given commit, with a strict no-overwrite, no-clobber, atomic
# publish that cannot report success while lying about content.
#
# WHY `#!/bin/bash` AND NOT `#!/bin/sh` (matches scripts/backup.sh's own precedent/reasoning):
# the manifest step below is a multi-stage pipe (find | sort | xargs sha256sum). Under plain
# POSIX `set -e`, only the LAST command in a pipe determines the pipeline's exit status -- if
# `find` failed and produced no output, `sort`/`sha256sum` would "succeed" trivially on empty
# input and the script would report success over an EMPTY manifest. `set -o pipefail` (bash-only)
# is the only portable fix, so this file is bash, not POSIX sh.
#
# WHY THIS EXISTS (CRLF)
# -----------------------
# `git archive` streams the exact bytes recorded as Git blobs UNLESS a line-ending conversion
# filter intervenes. This repository has `core.autocrlf=true` (Windows checkouts) and no
# `.gitattributes`, so a bare `git archive` run from a Windows shell silently runs every text blob
# through the CRLF-conversion filter on the way out. Reproduced during the 2026-08-28 production
# deploy of commit 4ed9af7: a first bare `git archive` mismatched 1342 of 1392 tracked files (96%)
# against their Git blobs; only `-c core.autocrlf=false -c core.eol=lf` on that ONE invocation
# fixed it. That override is command-local only here -- it never touches `.git/config`.
#
# WHY THE MANIFEST IS BUILT FROM EXTRACTED FILES, NOT `git cat-file` PER PATH
# ----------------------------------------------------------------------------
# An earlier version of this script read `git ls-tree -r --name-only` as a LINE-oriented list and
# ran `git cat-file blob "$SHA:$path" | sha256sum` per line. `git ls-tree` QUOTES any path
# containing non-ASCII bytes (core.quotePath, on by default) -- e.g. a Vietnamese filename comes
# back as `"\304\220..."`. `git cat-file blob "$SHA:\"...\""` then fails, and the failure was
# swallowed, so `sha256sum` hashed nothing (EMPTY input) and the manifest recorded the SHA-256 of
# "" as if it were the real file. Fixed architecturally: `git archive` the commit ONCE, extract it
# to a private staging directory, then let `find -print0` (NUL-delimited, immune to embedded
# whitespace/newlines) hand REAL FILE PATHS to `sha256sum` directly -- it performs its own correct
# filename escaping, which `sha256sum -c` already knows how to reverse.
#
# EMPTY-TREE / EMPTY-FILE-LIST SAFETY
# --------------------------------------
# The same "empty input silently hashed as if it were a real file" failure mode was independently
# reproduced against an EMPTY-TREE commit: `find` produced no paths, and a bare `xargs sha256sum`
# (no `-r`) still invoked `sha256sum` with zero file arguments, which then read STDIN and hashed
# nothing -- producing a manifest with one bogus line (`e3b0c442...  -`) attributed to a file
# literally named `-`, and the script exited 0. `xargs -r`/`--no-run-if-empty` closes this: on zero
# input it does not invoke `sha256sum` at all, so the manifest is genuinely empty (0 bytes) rather
# than containing a phantom entry. `sha256sum -c` itself refuses to run against a 0-byte checksum
# file ("no properly formatted checksum lines found", exit 1), so the empty case is detected
# explicitly below and self-verification is skipped rather than forced through a check that cannot
# succeed on zero lines by construction.
#
# TRACKED SYMLINKS: refused, not represented
# --------------------------------------------
# This repo has zero tracked symlinks today. If a resolved commit ever contains one, this script
# refuses to archive it rather than emit an ambiguous manifest entry: hashing the symlink's TARGET
# STRING and having `sha256sum -c` follow the link and hash its CONTENT at verify time are two
# different numbers for the same manifest line -- proven directly (target-string hash
# `10c08209...` vs. followed-content hash `83d7d4df...`). Extend this script deliberately if this
# repo ever needs to track one; do not work around the refusal.
#
# TRACKED TAB/NEWLINE FILENAMES: impossible to reach a successful archive
# ---------------------------------------------------------------------------
# `git update-index` refuses to stage such a path, but lower-level plumbing (`git mktree`) CAN
# construct a tree object containing one. `git archive` itself then refuses to unpack that tree
# (`error: invalid path '...'`, exit 128) for BOTH tab- and newline-containing paths. This script's
# atomic staging (below) means that failure never leaves a partial artifact under a final filename.
#
# STRICT NO-OVERWRITE / NO-CLOBBER PUBLISH (hardened again after independent review)
# ---------------------------------------------------------------------------------------
# A prior version treated `.meta.txt`'s presence as the ONLY overwrite guard, and force-replaced
# (`mv -f`) anything else already sitting under a final name. That was proven to silently DESTROY
# a genuine pre-existing artifact whenever `.meta.txt` happened to be missing (e.g. placed there by
# an operator, a different tool, or a run of this script older than this hardening) -- reproduced
# directly: a hand-planted "IRREPLACEABLE PRIOR ARTIFACT" .tar.gz was overwritten with zero warning
# and exit 0. Fixed: EVERY one of the five final paths (archive, its checksum, the manifest, the
# file list, the metadata -- checked with both `-e` and `-L` so a broken symlink counts as a
# conflict too) is checked BEFORE any staging work begins, and a conflict on ANY of them aborts the
# whole run with nothing touched. Promotion itself then uses `ln --` (a hard link -- same
# filesystem, since the staging dir is always created inside the output-dir) instead of `mv -f`:
# `link()` atomically fails with EEXIST if the destination appears between the precheck and the
# promotion, so a conflicting file created in that window is never overwritten either, and no
# separate check-then-write TOCTOU window exists at publish time. Every final path this run
# actually creates is tracked; if the run fails or is interrupted before `.meta.txt` (published
# LAST) is promoted, the trap below removes only the files THIS run created, never a pre-existing
# or concurrently-created one it refused to touch.
#
# GIT OBJECTS, NOT THE WORKING TREE
# ------------------------------------
# The archive is built from the resolved commit's tree, never the working directory: untracked
# files, `.git/`, and any uncommitted working-tree edits are structurally absent.
#
# FULL COMMIT IDENTITY
# ----------------------
# Final filenames use the FULL 40-character commit SHA (not a 7-char short SHA), and
# `release-<sha>.meta.txt` additionally records the full commit SHA, tree SHA, and archive
# SHA-256 as plain `key=value` lines -- deterministic (no timestamp, no hostname, no username, no
# local absolute path), so two independent runs of the same commit produce a byte-identical
# `.meta.txt` too, not just a byte-identical archive. A CONSUMER MUST VERIFY THIS FILE (see the
# runbook) before trusting any of the other four as a genuine, complete release artifact.
#
# Usage: scripts/create-release-artifact.sh <ref> [output-dir]
#   <ref>         Required. Any commit-ish (full/short SHA, tag, branch name). Resolved to a full
#                 commit SHA before anything is read or written -- there is no implicit HEAD, and
#                 an unresolved ref (or one naming a tracked symlink) fails before the output
#                 directory is even created.
#   [output-dir]  Optional. Defaults to .release-transfer (repo-root, already gitignored). Created
#                 only after ref validation succeeds.
#
# Output (all under the resolved output-dir, named release-<full-sha>.*):
#   release-<sha>.tar.gz            the archive
#   release-<sha>.tar.gz.sha256     its checksum (sha256sum -c compatible)
#   release-<sha>.manifest.sha256   per tracked-file checksum, sha256sum's own native format --
#                                   verify with `sha256sum -c` from inside an extracted copy.
#                                   Empty (0 bytes) if and only if the commit has zero tracked
#                                   files -- never a phantom entry for "no files to hash".
#   release-<sha>.files.txt         the tracked-file list (git ls-tree -r --name-only)
#   release-<sha>.meta.txt          commit_sha / tree_sha / archive_sha256 / format_version --
#                                   promoted LAST; ONLY its presence, together with all four
#                                   siblings, means the set is complete and trustworthy.
#
# Refuses to overwrite ANY existing final path for this exact commit -- regular file, directory,
# symlink, or broken symlink -- with nothing partial, malformed, or orphaned treated as safe to
# replace. Remove conflicting paths yourself after confirming it is safe, or use a different
# output-dir.
set -euo pipefail

REF="${1:?Usage: scripts/create-release-artifact.sh <ref> [output-dir]}"

# Captured BEFORE any `cd`, so a relative output-dir is resolved against the CALLER's working
# directory (normal CLI convention) even though we `cd` into the repo root below.
CALLER_PWD=$(pwd)

# The target repo is whichever one the caller is standing in (plain `git rev-parse
# --show-toplevel`, auto-discovered upward from the working directory) -- NOT wherever this
# script file happens to live. That is what every plain `git` subcommand does, and it is what
# makes this script testable against a disposable fixture repo.
REPO_ROOT=$(git rev-parse --show-toplevel) || {
  echo "[release-artifact] ERROR: not inside a Git working tree." >&2
  exit 1
}
# Normalize to the same POSIX-style form `pwd`/`mktemp` already use everywhere else in this
# script. On this Git-for-Windows build, `git rev-parse --show-toplevel` consistently returns a
# DRIVE-LETTER path (`D:/Projects/...`), not the `/d/Projects/...` form `pwd` returns for the
# identical location. Left unnormalized, the `/*` absolute-path check just below would wrongly
# treat a drive-letter $REPO_ROOT as *relative* and re-prefix it with $CALLER_PWD, corrupting
# every path built from it. Normalizing once here means every downstream use only ever sees one
# consistent style.
REPO_ROOT=$(CDPATH= cd -- "$REPO_ROOT" && pwd)

OUT_DIR="${2:-$REPO_ROOT/.release-transfer}"
case "$OUT_DIR" in
  /*) : ;; # already absolute
  *) OUT_DIR="$CALLER_PWD/$OUT_DIR" ;;
esac

cd "$REPO_ROOT"

# --- Validate the ref FIRST. Nothing on disk is touched (no mkdir, no temp dir) until this and
#     the symlink check below both pass. -----------------------------------------------------
SHA=$(git rev-parse --verify --quiet "$REF^{commit}") || {
  echo "[release-artifact] ERROR: '$REF' does not resolve to a commit in this repository." >&2
  exit 1
}
TREE_SHA=$(git rev-parse --verify --quiet "$SHA^{tree}") || {
  echo "[release-artifact] ERROR: could not resolve the tree for commit $SHA." >&2
  exit 1
}

# --- Symlink guard: fail closed rather than emit an ambiguous manifest entry (see header). -----
SYMLINK_LINES=$(git ls-tree -r "$SHA" | awk '$1 == "120000"') || {
  echo "[release-artifact] ERROR: failed to list the tree for commit $SHA." >&2
  exit 1
}
if [ -n "$SYMLINK_LINES" ]; then
  echo "[release-artifact] ERROR: commit $SHA contains tracked symlink(s) -- refusing to archive" >&2
  echo "[release-artifact]        (this helper's manifest format cannot represent a symlink" >&2
  echo "[release-artifact]        without ambiguity between hashing the link target vs. its" >&2
  echo "[release-artifact]        followed content; see this script's own header comment):" >&2
  printf '%s\n' "$SYMLINK_LINES" | sed 's/^/[release-artifact]   /' >&2
  exit 1
fi

BASE="release-$SHA"
ARCHIVE="$OUT_DIR/$BASE.tar.gz"
ARCHIVE_SUM="$OUT_DIR/$BASE.tar.gz.sha256"
MANIFEST="$OUT_DIR/$BASE.manifest.sha256"
FILES="$OUT_DIR/$BASE.files.txt"
META="$OUT_DIR/$BASE.meta.txt"

# --- Strict conflict precheck: EVERY final path, checked BEFORE any staging work begins. A
#     conflict on ANY one of them aborts with nothing touched -- see header for why this replaced
#     the old "only .meta.txt matters" guard, which was proven to silently destroy a genuine
#     pre-existing artifact. `-e` catches a regular file/directory (or a symlink to one that
#     exists); `-L` additionally catches a BROKEN symlink, which `-e` alone reports as absent. ---
CONFLICTS=()
for f in "$ARCHIVE" "$ARCHIVE_SUM" "$MANIFEST" "$FILES" "$META"; do
  if [ -e "$f" ] || [ -L "$f" ]; then
    CONFLICTS+=("$f")
  fi
done
if [ "${#CONFLICTS[@]}" -gt 0 ]; then
  echo "[release-artifact] ERROR: refusing to publish -- the following final output path(s)" >&2
  echo "[release-artifact]        already exist for this exact commit (this includes a malformed" >&2
  echo "[release-artifact]        or empty file, a directory, and a broken symlink -- none of" >&2
  echo "[release-artifact]        those are treated as safe to replace):" >&2
  for f in "${CONFLICTS[@]}"; do
    echo "[release-artifact]   $f" >&2
  done
  echo "[release-artifact]        Remove them yourself after confirming it is safe, or pass a" >&2
  echo "[release-artifact]        different output-dir. Nothing was overwritten." >&2
  exit 1
fi

# --- Only now does anything get created on disk. ------------------------------------------------
mkdir -p "$OUT_DIR"

STAGE=$(mktemp -d "$OUT_DIR/.release-artifact-stage.XXXXXX") || {
  echo "[release-artifact] ERROR: could not create a staging directory under $OUT_DIR." >&2
  exit 1
}

STAGE_ARCHIVE="$STAGE/archive.tar.gz"
STAGE_EXTRACT="$STAGE/extract"
mkdir -p "$STAGE_EXTRACT"

# --- Ownership-by-inode publish/cleanup (hardened a THIRD time after an independent review found
#     a load-bearing signal race in the PREVIOUS hardening, reproduced directly with a
#     PATH-stubbed `ln` that signals this script's own PID the instant the real `link()` syscall
#     returns) -------------------------------------------------------------------------------------
# The previous version tracked "which final paths this run published" in a PROMOTED_FILES array,
# appended in the STATEMENT AFTER each `ln` succeeded, and used ONE trap (`trap cleanup EXIT INT
# TERM`) whose handler never called `exit`. Both were proven wrong by direct reproduction:
#   1. A SIGTERM delivered in the gap between "ln returned 0 for meta.txt" and "the array was
#      appended to" made the trap see an array WITHOUT meta.txt -- so it deleted the four OTHER
#      final files that HAD already been fully published, while meta.txt itself (not in the array,
#      so never a deletion candidate) survived as an orphan. That orphan then permanently blocks
#      every future retry (the strict conflict precheck at the top of this script sees it and
#      refuses to run), with no automated way to know it is safe to remove.
#   2. Because the single shared handler never called `exit`, bash resumed the INTERRUPTED script
#      after the trap returned: the run continued to completion, printed all five "wrote ..."
#      success lines, and exited 0 -- even though SIGTERM had already caused its own handler to
#      delete four of those five files moments earlier. A caller has no way to tell, from exit code
#      or output alone, that the run was actually torn apart by a signal it "handled".
#
# Fixed on both axes:
#   - Ownership of a final path is now the same fact `ln` itself establishes atomically. Each
#     staged file is kept on disk (never removed by promote()) until the ENTIRE run either
#     completes or is torn down, so "did THIS run publish $final" can be answered at any moment, by
#     any handler, by asking the filesystem directly: does $final exist, and is it `-ef` (same
#     device+inode as) its still-present staged counterpart? That question has no window where the
#     answer is transiently wrong -- the instant `link()` returns, both halves of the `-ef` test
#     are already true; no subsequent bash statement's completion is required for the fact to
#     become knowable, so no signal can land "between" the fact and its recording -- there is no
#     separate recording step left to land between.
#   - THREE separate handlers replace the one shared trap. Each disables every trap FIRST (so a
#     second signal, or a failure inside cleanup under `set -e`, cannot re-enter or recurse into
#     these handlers) and then unconditionally calls `exit` with a specific code -- never `return`
#     -- so control can never resume in the interrupted main-flow body and print a stale success
#     message again.
PUBLISH_STAGED=("$STAGE/manifest.sha256" "$STAGE/files.txt" "$STAGE_ARCHIVE" "$STAGE/archive.tar.gz.sha256" "$STAGE/meta.txt")
PUBLISH_FINAL=("$MANIFEST" "$FILES" "$ARCHIVE" "$ARCHIVE_SUM" "$META")

# Re-derives completeness from the filesystem EVERY time it runs, rather than trusting a flag a
# signal could catch mid-update. Every `[ ]` test below lives inside an `if`/`&&` condition (never
# as a bare statement), and every `rm` is `|| true`-guarded, so `set -e` cannot itself abort this
# function partway through and leave it having examined only some of the five pairs.
do_cleanup() {
  local i staged final all_complete=1
  for i in "${!PUBLISH_FINAL[@]}"; do
    staged="${PUBLISH_STAGED[$i]}"
    final="${PUBLISH_FINAL[$i]}"
    if [ ! -e "$final" ] || [ ! "$final" -ef "$staged" ]; then
      all_complete=0
    fi
  done

  if [ "$all_complete" = "1" ]; then
    # All five final paths exist and are each provably THIS run's own link -- a genuinely
    # complete, trustworthy set. Keep every one of them; only the now-redundant staging directory
    # (which still holds a second link to each of the same five inodes, plus the extracted
    # verification copy) is removed.
    rm -rf -- "$STAGE" 2>/dev/null || true
    return 0
  fi

  # Incomplete: remove ONLY the final paths this run can PROVE it created (still `-ef` a staged
  # copy that has not been removed). Anything else -- not yet published by this run, or a
  # pre-existing/raced file belonging to someone/something else entirely -- is never touched,
  # exactly the same no-clobber guarantee `promote()`'s `ln` already gives at publish time.
  for i in "${!PUBLISH_FINAL[@]}"; do
    staged="${PUBLISH_STAGED[$i]}"
    final="${PUBLISH_FINAL[$i]}"
    if [ -e "$final" ] && [ -e "$staged" ] && [ "$final" -ef "$staged" ]; then
      rm -f -- "$final" 2>/dev/null || true
    fi
  done
  rm -rf -- "$STAGE" 2>/dev/null || true
}

on_exit() {
  local exit_code=$?
  trap - EXIT INT TERM
  do_cleanup
  exit "$exit_code"
}
on_int() {
  trap - EXIT INT TERM
  echo "[release-artifact] Interrupted (SIGINT) -- cleaning up and exiting 130." >&2
  do_cleanup
  exit 130
}
on_term() {
  trap - EXIT INT TERM
  echo "[release-artifact] Terminated (SIGTERM) -- cleaning up and exiting 143." >&2
  do_cleanup
  exit 143
}
trap on_exit EXIT
trap on_int INT
trap on_term TERM

# No-clobber promotion of one staged file to its final path. `ln --` (a hard link -- STAGE is
# always inside $OUT_DIR, so same filesystem) atomically fails with EEXIST if the destination
# already exists, closing the TOCTOU window between the precheck above and publish: a conflicting
# file that appears in that window is refused, not silently replaced. The staged copy is
# deliberately NOT removed here (see the ownership-by-inode block above) -- it stays on disk until
# do_cleanup runs, so ownership of $final can always be re-derived from `-ef` alone, with nothing
# else this run has to do after `ln` returns for that fact to be true.
promote() {
  local staged="$1" final="$2"
  if ! ln -- "$staged" "$final"; then
    echo "[release-artifact] ERROR: could not publish $final (see the error above)." >&2
    echo "[release-artifact]        If it already exists, another process may have published to" >&2
    echo "[release-artifact]        this output-dir concurrently, or a conflicting file appeared" >&2
    echo "[release-artifact]        after the initial check. It was NOT overwritten." >&2
    exit 1
  fi
}

echo "[release-artifact] ref '$REF' -> commit $SHA"

# THE canonical step: command-local config only. core.autocrlf=false + core.eol=lf forces `git
# archive` to emit each blob's bytes unmodified -- the same guarantee a Linux/macOS checkout gets
# by default, restored here for a Windows one without changing how the working tree behaves.
git -c core.autocrlf=false -c core.eol=lf archive --format=tar.gz --output="$STAGE_ARCHIVE" "$SHA"

# Extract into a PRIVATE staging dir so the manifest can be built from real files on disk (see
# header for why this replaces the old per-path `git cat-file` loop).
tar -xzf "$STAGE_ARCHIVE" -C "$STAGE_EXTRACT"

git ls-tree -r --name-only "$SHA" > "$STAGE/files.txt"
FILE_COUNT=$(wc -l < "$STAGE/files.txt" | tr -d ' ')

# Per-file manifest: NUL-safe traversal, `sha256sum` invoked on REAL FILE ARGUMENTS (never piped
# content) so it performs its own correct filename escaping. `LC_ALL=C sort -z` keeps line order
# deterministic and locale-independent, so two runs of the same commit produce a byte-identical
# manifest. `xargs -r` (--no-run-if-empty) is what makes an empty file list produce a genuinely
# empty manifest instead of one bogus "sha256 of stdin" line (see header). `set -o pipefail` (top
# of file) makes a failure ANYWHERE in this pipe -- not just in the last command -- abort the run.
( cd "$STAGE_EXTRACT" && find . -type f -print0 | LC_ALL=C sort -z | xargs -r -0 sha256sum --text -- ) \
  > "$STAGE/manifest.sha256"

MANIFEST_LINE_COUNT=$(wc -l < "$STAGE/manifest.sha256" | tr -d ' ')

# Self-verification: prove the manifest just generated actually verifies against the extracted
# tree BEFORE any of this is published under a final name. `sha256sum -c` itself refuses to run
# against a 0-byte checksum file ("no properly formatted checksum lines found", exit 1) even
# though zero-files-to-verify is a legitimate outcome for a genuinely empty tree -- so that case is
# detected explicitly rather than forced through a check that cannot succeed on zero lines by
# construction. A COUNT MISMATCH (manifest empty but the tree is not) is never treated as "nothing
# to verify" -- that would silently accept a truncated manifest instead of catching it.
if [ "$MANIFEST_LINE_COUNT" -eq 0 ] && [ "$FILE_COUNT" -eq 0 ]; then
  echo "[release-artifact] commit $SHA has zero tracked files -- manifest is empty; nothing to self-verify."
elif [ "$MANIFEST_LINE_COUNT" -eq 0 ]; then
  echo "[release-artifact] ERROR: manifest is empty but commit $SHA has $FILE_COUNT tracked file(s)" >&2
  echo "[release-artifact]        -- refusing to publish a manifest that cannot possibly be right." >&2
  exit 1
else
  if ! ( cd "$STAGE_EXTRACT" && sha256sum -c "$STAGE/manifest.sha256" ) > "$STAGE/verify.log" 2>&1; then
    echo "[release-artifact] ERROR: self-verification of the freshly generated manifest FAILED --" >&2
    echo "[release-artifact]        refusing to publish anything. Details:" >&2
    cat "$STAGE/verify.log" >&2
    exit 1
  fi
fi

ARCHIVE_SHA256=$(sha256sum "$STAGE_ARCHIVE" | cut -d' ' -f1)
printf '%s  %s\n' "$ARCHIVE_SHA256" "$BASE.tar.gz" > "$STAGE/archive.tar.gz.sha256"

# Deterministic identity metadata: no timestamp, hostname, username, or local absolute path --
# purely a function of the commit and the archive bytes, so this file is itself byte-identical
# across independent runs of the same commit. A CONSUMER MUST CHECK THIS FILE (format_version,
# commit_sha, tree_sha, archive_sha256) before trusting the artifact -- see the runbook.
{
  echo "format_version=1"
  echo "commit_sha=$SHA"
  echo "tree_sha=$TREE_SHA"
  echo "archive_sha256=$ARCHIVE_SHA256"
  echo "archive_filename=$BASE.tar.gz"
} > "$STAGE/meta.txt"

# --- Promotion: no-clobber (see promote() above). Content files first, `.meta.txt` LAST -- its
#     arrival is what makes the set "complete"; nothing before this line is treated as trustworthy
#     on its own, by this script or by a consumer following the runbook. -------------------------
promote "$STAGE/manifest.sha256" "$MANIFEST"
promote "$STAGE/files.txt" "$FILES"
promote "$STAGE_ARCHIVE" "$ARCHIVE"
promote "$STAGE/archive.tar.gz.sha256" "$ARCHIVE_SUM"
promote "$STAGE/meta.txt" "$META"

echo "[release-artifact] wrote $ARCHIVE ($FILE_COUNT tracked files)"
echo "[release-artifact] wrote $ARCHIVE_SUM"
echo "[release-artifact] wrote $MANIFEST"
echo "[release-artifact] wrote $FILES"
echo "[release-artifact] wrote $META"
echo "[release-artifact] commit_sha=$SHA"
echo "[release-artifact] archive_sha256=$ARCHIVE_SHA256"
