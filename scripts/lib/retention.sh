#!/bin/bash
# Backup-Restore Hardening (2026-08-12) — shared retention policy: daily 7 / weekly 4 / monthly 6
# (Owner-approved, PLACE-037 §11). Sourced by scripts/backup.sh and scripts/backup-media.sh so both
# backup trees age out identically and the rule is testable in one place.
#
# WHY THIS EXISTS: the previous inline implementation in backup.sh was inverted — it kept a file
# when a NEWER file shared its ISO week or calendar month, which preserved older duplicates and
# deleted precisely the newest-per-week/newest-per-month files the policy is meant to keep. It also
# never enforced the 4-week / 6-month caps. Against 20 dated fixtures it removed every weekly and
# monthly backup, collapsing a nominally 6-month recovery window to about 10 days.
#
# THE RULE, stated exactly:
#   1. DAILY   — the newest 7 backups are kept unconditionally, whatever their dates.
#   2. WEEKLY  — BEYOND the daily window, keep the newest backup of each distinct ISO week, for up
#                to 4 such weeks.
#   3. MONTHLY — BEYOND that, keep the newest backup of each distinct calendar month, for up to 6
#                such months.
#   4. Everything else is deleted.
# Upper bound retained: 7 + 4 + 6 = 17 files.
#
# TWO SEPARATE BOOKKEEPING SETS, and conflating them is a real bug (caught by
# scripts/tests/retention.test.sh while writing this):
#   *_seen   — every week/month already represented by a KEPT file, including via the daily tier.
#              Prevents keeping a second backup from a week we already cover.
#   *_budget — how many slots the weekly/monthly tier itself has spent. ONLY incremented when a file
#              is kept BY that tier. Weeks covered by dailies must not consume weekly budget, or the
#              "4 weeks BEYOND the daily window" guarantee silently shrinks to 4-minus-however-many-
#              weeks-this-week's-dailies-happened-to-span.
#
# SAFETY: only files matching the caller's glob are ever considered or removed. Anything else in the
# directory — sidecars, other backup trees, operator notes — is untouched.

# Extract the YYYYMMDD date embedded in a backup filename, or empty if absent.
# Accepts any prefix; matches the first 8-digit run followed by 'T'.
_retention_date_of() {
  printf '%s' "$1" | sed -n 's/.*[^0-9]\([0-9]\{8\}\)T[0-9]\{6\}Z.*/\1/p'
}

_retention_week_key() {
  # ISO week (%G-%V) so a week spanning a year boundary stays one bucket.
  date -u -d "$1" +%G-W%V 2>/dev/null || date -u -j -f %Y%m%d "$1" +%G-W%V 2>/dev/null || printf ''
}

# apply_retention <dir> <glob> <suffix>
#   dir    — directory to prune
#   glob   — filename pattern identifying THIS backup tree (e.g. 'phuquochub-*.sql.gz')
#   suffix — extension stripped when locating the .sha256 sidecar (e.g. '.sql.gz')
apply_retention() {
  ret_dir="$1"
  ret_glob="$2"
  ret_suffix="$3"

  # `-d` is essential: without it, a glob matching DIRECTORIES (media snapshots) makes `ls` list
  # each directory's CONTENTS instead of the directory itself, so nothing is ever classified or
  # pruned correctly. Caught by the directory-snapshot test below.
  ret_all=$(ls -1dt "$ret_dir"/$ret_glob 2>/dev/null || true)
  [ -z "$ret_all" ] && { echo "[retention] no backups matching $ret_glob -- nothing to do"; return 0; }

  ret_keep_list=""
  ret_index=0
  ret_weeks_seen=""
  ret_weeks_budget=0
  ret_months_seen=""
  ret_months_budget=0

  # `ls -1t` is newest-first, so a single pass assigns each file to the first tier it qualifies for.
  while IFS= read -r ret_file; do
    [ -z "$ret_file" ] && continue
    ret_index=$((ret_index + 1))
    ret_base=$(basename "$ret_file")
    ret_date=$(_retention_date_of "$ret_base")

    # Tier 1 — newest 7, unconditional.
    if [ "$ret_index" -le 7 ]; then
      ret_keep_list="$ret_keep_list
$ret_file"
      # A daily-kept file marks its week/month as COVERED (so we don't keep a redundant second
      # backup from the same week), but deliberately does NOT spend weekly/monthly budget.
      if [ -n "$ret_date" ]; then
        ret_wk=$(_retention_week_key "$ret_date")
        case " $ret_weeks_seen " in *" $ret_wk "*) : ;; *) ret_weeks_seen="$ret_weeks_seen $ret_wk" ;; esac
        ret_mo=$(printf '%s' "$ret_date" | cut -c1-6)
        case " $ret_months_seen " in *" $ret_mo "*) : ;; *) ret_months_seen="$ret_months_seen $ret_mo" ;; esac
      fi
      continue
    fi

    # Undated filename beyond the daily window: cannot be classified, so it is left alone rather
    # than guessed at or deleted.
    if [ -z "$ret_date" ]; then
      ret_keep_list="$ret_keep_list
$ret_file"
      continue
    fi

    ret_wk=$(_retention_week_key "$ret_date")
    ret_mo=$(printf '%s' "$ret_date" | cut -c1-6)
    ret_kept=0

    # Tier 2 — newest file of an ISO week not already covered, spending weekly budget (max 4).
    case " $ret_weeks_seen " in
      *" $ret_wk "*) : ;;
      *)
        if [ "$ret_weeks_budget" -lt 4 ]; then
          ret_weeks_seen="$ret_weeks_seen $ret_wk"
          ret_weeks_budget=$((ret_weeks_budget + 1))
          ret_kept=1
        fi
        ;;
    esac

    # Tier 3 — newest file of a calendar month not already covered, spending monthly budget (max 6).
    case " $ret_months_seen " in
      *" $ret_mo "*) : ;;
      *)
        if [ "$ret_months_budget" -lt 6 ]; then
          ret_months_seen="$ret_months_seen $ret_mo"
          ret_months_budget=$((ret_months_budget + 1))
          ret_kept=1
        fi
        ;;
    esac

    # Kept by either tier: record its buckets as covered so a later, older file in the same week or
    # month is not kept redundantly.
    if [ "$ret_kept" -eq 1 ]; then
      case " $ret_weeks_seen " in *" $ret_wk "*) : ;; *) ret_weeks_seen="$ret_weeks_seen $ret_wk" ;; esac
      case " $ret_months_seen " in *" $ret_mo "*) : ;; *) ret_months_seen="$ret_months_seen $ret_mo" ;; esac
    fi

    if [ "$ret_kept" -eq 1 ]; then
      ret_keep_list="$ret_keep_list
$ret_file"
    fi
  done <<EOF
$ret_all
EOF

  # Delete only what this tree owns, and only what was not kept.
  while IFS= read -r ret_file; do
    [ -z "$ret_file" ] && continue
    case "$ret_keep_list" in
      *"$ret_file"*) continue ;;
    esac
    echo "[retention]   removing $(basename "$ret_file") (outside daily7/weekly4/monthly6)"
    # Database backups are files; media snapshots are directories carrying their own SHA256SUMS.
    # Handle both, and never follow a symlink out of the backup tree.
    if [ -d "$ret_file" ] && [ ! -L "$ret_file" ]; then
      rm -rf "$ret_file"
    else
      rm -f "$ret_file"
      # Retire the checksum sidecar with its backup so no orphan manifest is left behind.
      if [ -n "$ret_suffix" ]; then
        ret_sidecar="${ret_file%$ret_suffix}$ret_suffix.sha256"
        [ -f "$ret_sidecar" ] && rm -f "$ret_sidecar"
      fi
    fi
  done <<EOF
$ret_all
EOF

  echo "[retention] kept $(printf '%s' "$ret_keep_list" | grep -c . || true) backup(s) under daily7/weekly4/monthly6"
}
