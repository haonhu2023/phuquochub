# Backup-Restore Hardening follow-up (2026-08-12) — analyse and (optionally) repair the
# `public.immutable_unaccent(text)` definition inside a plain-SQL pg_dump stream.
#
# Reads the decompressed dump on stdin, writes the (possibly repaired) dump to stdout, and writes a
# machine-readable summary to the file named by -v countfile=...
#
# WHY AWK AND NOT sed/grep — two blockers in the previous implementation, both fixed here:
#
#  1. SIGPIPE. The old detection was `gzip -dc f | grep -q PATTERN`. `grep -q` exits at the FIRST
#     match, gzip then dies of SIGPIPE (141), and under `set -o pipefail` the whole pipeline reads
#     as failure — so a legacy dump was reported as NOT legacy. Because pg_dump emits this function
#     around line 689 of ~16,700, that misfired on essentially every real dump.
#     THE RULE THIS PROGRAM OBEYS: it NEVER exits early. Ambiguity is recorded and acted on in END,
#     after stdin has been read to EOF, so the upstream gzip always completes normally and the
#     pipeline status is awk's alone. There is no early-reader in the pipeline any more.
#
#  2. UNSCOPED REWRITE. The old repair was a global `sed s|...|...|g` over the entire stream,
#     including COPY data — so a user-data row containing the literal old SQL fragment would be
#     silently rewritten, and such a row in a POST-migration dump would falsely mark it legacy.
#     THE RULE THIS PROGRAM OBEYS: a replacement can only happen on a line that is inside a
#     `CREATE FUNCTION public.immutable_unaccent(text) RETURNS text` statement which is itself
#     outside any COPY block. Data is copied through byte-for-byte and is never even examined for
#     the pattern.
#
# Usage:
#   awk -v countfile=FILE [-v repair=1] -f repair-legacy-unaccent.awk
#     repair=0 (default)  analyse only; stdout is still the unmodified stream (redirect to /dev/null)
#     repair=1            emit the repaired stream on stdout
#
# countfile receives exactly one line:
#   legacy=<n> postfix=<n> repaired=<n> complete=<0|1>
#     legacy    canonical function definitions carrying the OLD unqualified body
#     postfix   canonical function definitions carrying the NEW schema-qualified body
#     repaired  bodies actually rewritten (always 0 when repair=0)
#     complete  1 if pg_dump's end-of-dump marker was seen
#
# Exit status:
#   0  clean: at most one canonical definition, unambiguous
#   3  ambiguous — refuse to guess (see END)

BEGIN {
    # Plain strings, compared with index()/substr(), NEVER regex. The body contains `$1`, `(`, `)`
    # and quotes; treating it as a regex (or as sed's replacement text, where `&` is special) is
    # how subtle corruption gets introduced. Literal matching has no metacharacters at all.
    LEGACY_BODY  = "SELECT unaccent('unaccent', $1)"
    POSTFIX_BODY = "SELECT public.unaccent('public.unaccent'::regdictionary, $1)"

    # pg_dump always emits this header verbatim for our function.
    FUNC_HEADER  = "CREATE FUNCTION public.immutable_unaccent(text) RETURNS text"

    in_copy = 0      # inside a COPY ... FROM stdin; ... \.  data block
    in_func = 0      # inside the CREATE FUNCTION statement for immutable_unaccent
    legacy  = 0
    postfix = 0
    repaired = 0
    complete = 0
    if (repair == "") repair = 0
}

# ---- COPY data: absolute pass-through -----------------------------------------------------------
# Entered on the COPY header and left only on the `\.` terminator. Every line in between is printed
# unexamined, so no user data can ever be inspected, matched, or rewritten. This block is FIRST so
# it wins over every rule below.
!in_copy && /^COPY .* FROM stdin;$/ { in_copy = 1; print; next }
in_copy && /^\\\.$/                 { in_copy = 0; print; next }
in_copy                             { print; next }

# ---- Canonical function statement ---------------------------------------------------------------
# Only reachable outside COPY. Anchored to the whole line so a mention inside a comment or another
# statement cannot open the block.
!in_func && $0 == FUNC_HEADER { in_func = 1; print; next }

in_func {
    line = $0
    if (index(line, LEGACY_BODY) > 0) {
        legacy++
        if (repair == 1) {
            # index()+substr() rather than sub(): no regex, no `&` expansion, and only the FIRST
            # occurrence on this one line inside this one statement is touched.
            p = index(line, LEGACY_BODY)
            line = substr(line, 1, p - 1) POSTFIX_BODY substr(line, p + length(LEGACY_BODY))
            repaired++
        }
    } else if (index(line, POSTFIX_BODY) > 0) {
        postfix++
    }
    # pg_dump terminates the statement with `;` at end of the AS line.
    if (line ~ /;[ \t]*$/) in_func = 0
    print line
    next
}

# ---- Everything else -----------------------------------------------------------------------------
/^-- PostgreSQL database dump complete/ { complete = 1 }

{ print }

END {
    # Reached ONLY after stdin hit EOF -- that is what keeps the upstream gzip free of SIGPIPE.
    printf "legacy=%d postfix=%d repaired=%d complete=%d\n", legacy, postfix, repaired, complete > countfile
    close(countfile)

    # Ambiguity: more than one canonical definition of the same function, in either form, or one of
    # each. A dump should contain exactly one. Refuse to guess which to repair.
    if (legacy > 1 || postfix > 1 || (legacy == 1 && postfix == 1)) exit 3
    # Asked to repair but did not rewrite exactly the one definition we found.
    if (repair == 1 && legacy != repaired) exit 3
    exit 0
}
