# PhuQuocHub — Release, Rollback, and Backup/Restore Operational Checklist

**Created:** 2026-07-25 (PLACE-040). Operator-facing, checkbox-style companion to
[`PRE-DEPLOYMENT-CHECKLIST.md`](PRE-DEPLOYMENT-CHECKLIST.md) (which covers *before-the-first-deploy*
prerequisites) and the prose rollout/rollback design in
[`PLACE-037`'s report](reports/PLACE-037-production-deployment-monitoring-decision-gate-2026-07-25.md)
§23–24. This document is what an operator actually follows during a real release, a real
rollback, or a real backup/restore — every step names the exact script or command to run.

None of the scripts referenced here have been executed against real infrastructure. They were
verified locally in PLACE-038 (Docker-only) except `scripts/smoke-test.sh`, which is new in
PLACE-040 and has only been syntax-checked (`sh -n`) — this session's Docker engine was
unreachable, so it could not be run against a live stack. Run it once, by hand, the first time it
matters, before trusting it unattended.

---

## 1. Pre-release checklist

- [ ] `docs/delivery/PRE-DEPLOYMENT-CHECKLIST.md` §1 (Hostinger) and §2 (secrets) both fully
      answered — no `change-me-*` placeholder remains in the real deploy-time environment.
- [ ] Real DNS `A`/`AAAA` record for `phuquochub.com` resolves to the VPS's public IPv4.
- [ ] A fresh backup exists and is verified: run `scripts/backup.sh`, confirm the printed dump
      size is non-trivial (not 0 bytes), and confirm `gunzip -t` on the resulting file succeeds.
- [ ] `scripts/verify-release-pins.sh` exits 0. Run this **before any `docker compose up -d`**,
      release or not. It is read-only and proves the three things that must agree: the tag in
      `.env`, the image that tag resolves to, and the image the container is actually running. A
      non-zero exit means a plain `up -d` would silently swap a running release — do not run it.

### Image-pin governance (added 2026-08-14)

Two facts an operator needs before touching image tags:

1. **Changing the tag *string* forces a container recreate, even to the same image.** Compose's
   config hash includes the literal `image:` string, so pointing `API_IMAGE_TAG` at a different
   tag that resolves to the *byte-identical* image ID still plans a `Recreate`. Verified on
   production with `--dry-run`: the plan was indistinguishable from pointing at a genuinely
   different image. There is therefore **no way to re-pin a running service to an immutable tag
   without one container recreate.**
2. **`API_IMAGE_TAG=local` is a known, tracked exception.** `phuquochub-api:local` is a *mutable*
   tag: it currently resolves to the approved running API image, but any rebuild re-points it, and
   the pin would then silently mean a different image. The approved image is protected by an
   immutable anchor tag, `phuquochub-api:img-749e3791ac3f`, whose name asserts the image ID it
   points at (self-verifying, and — unlike a commit-shaped tag — it does not imply a provenance
   nobody can prove; that image carries no commit metadata, so its source commit is unknown).
   `verify-release-pins.sh` reports this as a WARNING, not a failure, so the debt stays visible.

   **Retiring the exception** costs exactly one API container recreate from the same image. Either
   let the next real API deploy do it (it recreates anyway — preferred, no extra disruption), or
   reconcile deliberately during a maintenance window:

   ```
   scripts/verify-release-pins.sh                     # expect 0, with the mutable-tag warning
   # set API_IMAGE_TAG=img-749e3791ac3f in .env via scripts/lib/release-tag.sh
   docker compose -f docker-compose.prod.yml --dry-run up -d   # expect: api Recreate, nothing else
   docker compose -f docker-compose.prod.yml up -d --no-deps api
   scripts/verify-release-pins.sh                     # expect 0, no warnings
   ```

   The recreate does **not** change the release: the anchor tag and `:local` point at the same
   image ID. It is a restart, not a deployment.
- [ ] `git log` reviewed since the last release — no destructive migration among the new
      commits (a migration whose `down()` cannot cleanly reverse, or which drops/renames a
      column/table with existing data). All 20 migrations as of PLACE-040 are additive; if a new
      one is not, stop and treat this as a higher-risk release (§4).
- [ ] The image tag to deploy is decided and corresponds to an exact Git commit SHA (§23's own
      tagging recommendation).
- [ ] A short, announced maintenance window exists for this specific release if it is the first
      real deploy ever, or introduces a non-additive migration; not required for routine releases.

### Canonical release artifact (added 2026-08-29, hardened twice on 2026-08-29)

If this release is transferred to the VPS as a source archive rather than built in place, create
it with `bash scripts/create-release-artifact.sh <commit-sha> [output-dir]` — **never a bare
`git archive`**. (`bash`, not a bare path: the script's committed file mode is `100644`, matching
the majority of this repo's `scripts/*.sh`/`scripts/lib/*.sh` — it is not marked executable.)

**Why not a bare `git archive`:** this repository has `core.autocrlf=true` (Windows checkouts) and
no `.gitattributes`. A bare `git archive` run from a Windows shell silently runs every text blob
through the CRLF-conversion filter on the way out, so the archive's file bytes no longer match
`git cat-file blob <sha>:<path>`. This is not theoretical — it happened during the 2026-08-28
production deploy of commit `4ed9af7`: a first, bare `git archive` produced an artifact where 1342
of 1392 tracked files (96%) had CRLF-mismatched bytes against their Git blobs; only a second
archive built with `-c core.autocrlf=false -c core.eol=lf` matched the artifact actually staged and
used for that deploy. `scripts/create-release-artifact.sh` applies that override as a *command-local*
git config flag on the one `git archive` invocation — it never edits `.git/config`, and it never
adds a repo-wide `.gitattributes` (which would renormalize unrelated files far beyond this fix's
scope). **This is proven only on this Windows/Linux pair, not claimed as a general cross-platform
byte-identity guarantee.**

**Source of truth:** the archive is built from the resolved commit's Git *object*, never from the
working tree — untracked files, `.git/`, and any uncommitted working-tree edit are structurally
absent, proven directly (a dirty tracked-file edit and an untracked sentinel file both left no
trace in the resulting archive, which reflected only the committed content).

- [ ] `<commit-sha>` is the exact, immutable target commit for this release (not a branch name, not
      `HEAD`) — the script resolves it to a full commit SHA and fails, touching nothing on disk,
      if it does not resolve.
- [ ] Output filenames use the **full 40-character commit SHA**, not a short SHA:
      `release-<full-sha>.tar.gz`, `.tar.gz.sha256`, `.manifest.sha256`, `.files.txt`, `.meta.txt`.
      All land under `.release-transfer/` by default (gitignored; matches `.gitignore`'s
      `release-*`/`*.tar.gz` patterns, so nothing here is ever committed by accident).
- [ ] `release-<sha>.meta.txt` is the artifact's identity record — deterministic `key=value` lines
      (`format_version`, `commit_sha`, `tree_sha`, `archive_sha256`, `archive_filename`), with no
      timestamp/hostname/username/local path baked in, so it is byte-identical across independent
      runs of the same commit. **Its presence (together with all four siblings) is what makes an
      artifact trustworthy — see the consumer checklist below.** `archive_filename` is
      informational only — the consumer gate below does not verify it.
- [ ] The archive contains only tracked files as of that exact commit: no `.git/`, no untracked
      files, no working-tree edits, and no runtime `.env` (only the tracked `.env.example`, if the
      commit has one). **Never copy the real `.env` into a release artifact or transfer path** — it
      carries live secrets; see `scripts/lib/release-tag.sh`'s own header for why rotation/rollback
      never needs to copy it either.
- [ ] **Tracked symlinks are refused, not archived.** If the target commit contains one, the script
      exits non-zero before touching the output directory at all and names the offending path(s).
      This repo has zero tracked symlinks today; if one is ever legitimately needed, extend the
      script's manifest format deliberately rather than working around the refusal — hashing a
      symlink's *target string* and having `sha256sum -c` later follow the link and hash its
      *content* are two different numbers for the same manifest line.
- [ ] **Refuses to overwrite if ANY final output already exists** — a regular file, a directory, a
      symlink, or a broken symlink, for any of the five (archive/checksum/manifest/file-list/meta),
      checked before staging even begins. Hardened after an independent review proved a prior
      version wrong: it treated `.meta.txt`'s presence as the *only* guard and force-replaced
      (`mv -f`) anything else sitting under a final name — which silently destroyed a genuine
      pre-existing artifact whenever `.meta.txt` happened to be missing, reproduced directly with a
      hand-planted "IRREPLACEABLE PRIOR ARTIFACT" file overwritten with zero warning. There is no
      "safe to replace" leftover from this script's perspective, orphaned or not: **remove
      conflicting paths yourself** after confirming it is safe, or use a different output-dir.
- [ ] **Publish is no-clobber, not just atomic.** Everything (archive, checksum, manifest, file
      list, meta) is built and self-verified in a private staging directory inside the output-dir
      first. Promotion uses a hard link (`ln --`, not `mv -f`) for each of the five files: `link()`
      fails with `EEXIST` if the destination appears between the precheck and promotion, so a
      conflicting file created in that exact window is refused rather than silently overwritten —
      proven directly by planting a file mid-run. `.meta.txt` is promoted last; a run interrupted at
      any point before or during promotion leaves nothing behind under a final name (the interrupt
      handler removes only the paths *that run itself* created, tracked individually, and only if
      `.meta.txt` was not among them — a run interrupted immediately *after* `.meta.txt` publishes
      correctly leaves the complete set in place).

### Before trusting ANY release artifact (consumer checklist — added 2026-08-29)

An artifact is not a release until **all five files verify together**. Do not upload, deploy, or
transfer a partial set as if it were complete, and do not delete an unexplained leftover file
yourself — investigate first; if it turns out to be an orphan from an aborted run, remove it only
after you've confirmed that.

```bash
cd .release-transfer   # or wherever the artifact was transferred to
SHA=<the exact commit SHA this release is supposed to be>
BASE="release-$SHA"

# 1. All five files present
for ext in tar.gz tar.gz.sha256 manifest.sha256 files.txt meta.txt; do
  [ -f "$BASE.$ext" ] || echo "MISSING: $BASE.$ext"
done

# 2. meta.txt exists, is a regular file (not a symlink), and is non-empty
[ -f "$BASE.meta.txt" ] && [ ! -L "$BASE.meta.txt" ] && [ -s "$BASE.meta.txt" ] || echo "meta.txt invalid"

# 3-6. Each required key must appear EXACTLY ONCE, THEN its value must match exactly. A bare
# `grep -qx "key=value" file` only proves ONE line somewhere in the file equals "key=value" -- it
# says nothing about whether "key" also appears a SECOND time with a DIFFERENT value. A meta.txt
# with two `commit_sha=` lines (one correct, one attacker- or corruption-supplied) would still pass
# every one of the four `grep -qx` checks below unmodified, because each only needs its own
# expected line to exist ANYWHERE, not to be the file's only claim about that key. Fail closed on
# any duplicate key before ever comparing a value.
require_unique_kv() {
  local key="$1" expected_value="$2" file="$3" count
  count=$(grep -c "^${key}=" "$file")
  if [ "$count" -ne 1 ]; then
    echo "$key: expected exactly 1 line in $file, found $count -- refusing to trust any value for this key"
    return 1
  fi
  grep -qx "${key}=${expected_value}" "$file" || echo "$key mismatch"
}

EXPECTED_TREE=$(git rev-parse "$SHA^{tree}")
ACTUAL_ARCHIVE_SHA=$(sha256sum "$BASE.tar.gz" | cut -d' ' -f1)

require_unique_kv format_version 1 "$BASE.meta.txt"
require_unique_kv commit_sha "$SHA" "$BASE.meta.txt"
# 5. tree_sha matches Git's own answer for that commit (requires the commit's object to be
#    reachable where you run this -- e.g. on a checkout of this repo)
require_unique_kv tree_sha "$EXPECTED_TREE" "$BASE.meta.txt"
# 6. archive_sha256 in meta.txt matches the archive's REAL bytes
require_unique_kv archive_sha256 "$ACTUAL_ARCHIVE_SHA" "$BASE.meta.txt"

# 7. the .sha256 sidecar agrees too (independent of meta.txt)
sha256sum -c "$BASE.tar.gz.sha256"

# 8. per-file manifest verifies after extraction
mkdir -p /tmp/verify-extract && tar -xzf "$BASE.tar.gz" -C /tmp/verify-extract
( cd /tmp/verify-extract && sha256sum -c "$OLDPWD/$BASE.manifest.sha256" )
```

**Scope of this gate:** it checks an allowlist of *required* keys — `format_version`, `commit_sha`,
`tree_sha`, `archive_sha256` — each must appear exactly once with the expected value. It is not a
strict allowlist of every key the file may contain: an additional key beyond these four (including
`archive_filename`) is permitted, because today's implementation does not treat an unrecognized key
as an error. `archive_filename` is written into `meta.txt` but is **not** one of the four checked
keys, so it is informational only — never rely on it as verified. Nothing above reads it either:
`BASE="release-$SHA"` is built directly from the commit SHA you already know, not from
`archive_filename`. If a future consumer ever needs to trust a filename read out of an untrusted
`meta.txt`, extend this gate to check it explicitly first — do not assume it already is.

If any check fails, or any of the five files is missing: **the set is INCOMPLETE**, full stop. Do
not treat four-out-of-five as "close enough" — a `.tar.gz` with a valid `.sha256` sidecar but no
`.meta.txt` may still be a genuine, complete archive from an interrupted run's *first* promoted
file, or it may be something else entirely; the point of the marker is that you don't have to
guess. Report it and let an operator decide, rather than silently deleting or silently trusting it.

**URL contract enforced at deploy time** (see §2 below) governs `NEXT_PUBLIC_SITE_URL`, not this
artifact helper — the two are unrelated build-time concerns that happen to be hardened in the same
change.

## 2. Deploy checklist

Run `scripts/deploy.sh <tag>` (requires `DB_PASSWORD`, `REDIS_PASSWORD`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET` set in the environment it runs in). It performs, in order:

- [ ] Step 5 — build `phuquochub-api:<tag>` / `phuquochub-web:<tag>` images (the web build embeds
      `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_MAP_TILE_URL`/`NEXT_PUBLIC_SITE_URL` at build time —
      confirm these build-args resolve to the real production values before trusting the image).
      `NEXT_PUBLIC_SITE_URL` (added 2026-08-29, hardened 2026-08-29) has **no fallback default** in
      `deploy.sh` and is **validated, not just checked for presence** — unlike the other two, an
      invalid value makes the script fail *before* `docker build` even runs, rather than silently
      bake something wrong into a production image (broken `metadataBase`/sitemap/robots/JSON-LD
      URLs). `deploy.sh` never sources `.env` itself; export the value explicitly in the environment
      it runs in: `NEXT_PUBLIC_SITE_URL=https://phuquochub.com`.

      **The full contract:** an exact, case-sensitive match against the literal string
      `https://phuquochub.com`, with exactly one accepted variant — a single trailing `/`
      (`https://phuquochub.com/`) — which is normalized away to the bare form before it reaches
      `docker build`. This is **not** a shape/regex validator with several passing hostnames; a
      shape-plus-blocklist regex was tried and independently proven bypassable (it still accepted
      `https://example.com`, `https://phuquochub.co`, and `https://phuquochub.com.evil.example` —
      see the script's own header comment), so the check is a literal `case` match against the one
      production origin this repo actually serves
      ([`infrastructure/caddy/Caddyfile`](../../infrastructure/caddy/Caddyfile)'s only non-redirect
      site block). Every other value is rejected, including but not limited to: any other domain or
      subdomain, `www.phuquochub.com` (a 301 redirect target, not the canonical origin), any
      different case than the literal above, a near-miss/typo/lookalike hostname, `http://`, a
      port, `user:pass@` credentials, any path beyond the one accepted trailing `/`, a `?query`, a
      `#fragment`, surrounding or embedded whitespace, `localhost`/loopback/`0.0.0.0`, and any
      value containing control characters (e.g. an embedded newline).

      On rejection, `deploy.sh` prints one fixed message stating the single required production
      value and refuses to build — it deliberately does **not** echo the rejected input back. The
      submitted value may contain newlines or other control characters that, printed verbatim into
      a log, could forge additional log lines (log injection) or otherwise mislead whoever reads
      the output; stating the one valid contract is enough to fix a typo without ever reproducing
      whatever was actually submitted.
- [ ] Step 6 — tag retained (needed for `scripts/rollback.sh` later — do not delete it).
- [ ] Step 7 — `migrate` compose service runs all pending migrations; **halts the whole deploy
      on failure** without touching the running stack.
      Since 2026-08-14 `migrate` is gated behind `profiles: [tools]`, so it is **not** in the
      default service selection and a bare `docker compose up -d` can no longer start it by
      accident (before the guard, it would have — verified on production with
      `docker compose --dry-run up -d`). `deploy.sh` passes `--profile tools` itself; the
      canonical command for a **manual** migration run is therefore:
      `docker compose -f docker-compose.prod.yml --profile tools run --rm migrate`.
      If that ever appears to fail with "no such service", the profile flag is missing — **do not
      remove the profile from the compose file** to work around it.
- [ ] Step 8 — smoke test on the **new** image in isolation, before cutover; halts on failure.
- [ ] Step 9 — cutover: `docker compose up -d` the new api/web/caddy.
- [ ] Step 9b — **the released tag is persisted** to `API_IMAGE_TAG`/`WEB_IMAGE_TAG` in the
      production `.env`, so a later plain `docker compose up -d` resolves to the release that is
      actually running. Added 2026-08-14 after production drift: the web container was live on
      `phuquochub-web:c9cf9e5` while `.env` still said `WEB_IMAGE_TAG=local`, and
      `phuquochub-web:local` was an **older build missing the c9cf9e5 map fix** — so a routine
      `up -d` would have silently rolled the site back a release. The cause was that every deploy
      passed the tag as a one-shot `WEB_IMAGE_TAG=... docker compose ...` prefix, which leaves no
      record on the host. Step 9b closes that. Only these two non-secret keys are ever written;
      the helper (`scripts/lib/release-tag.sh`) rewrites nothing else in `.env` and preserves its
      `0600` mode.
      To read the current pinned release without dumping `.env`:
      `grep -E '^(WEB|API)_IMAGE_TAG=' .env`
- [ ] Step 10 — `docker compose ps` reviewed; every service other than `caddy` should show
      `healthy` (native `HEALTHCHECK`, PLACE-038).
- [ ] Step 11 — `scripts/smoke-test.sh` (PLACE-040) runs against Caddy's local `:8080` address;
      halts the script and prints a rollback instruction on failure.
- [ ] Manual — steps 12–15 (monitoring activation, an observation period, rollback-criteria
      review, release-evidence recording) are operational, not scripted; do them explicitly.

## 3. Smoke test checklist (what `scripts/smoke-test.sh` actually checks)

- [ ] `GET /api/health` → `200` (DB + Redis both `up`).
- [ ] `GET /` (web home) → `200`.
- [ ] An unknown route → `404` (confirms Next.js's own 404 handling is intact; deliberately does
      **not** probe `/places/<bogus-slug>` — a pre-existing, unrelated PLACE-035/036 quirk returns
      `200` there, and asserting on it would fail a healthy deploy for a known, accepted reason).
- [ ] Optional, if a real slug is passed as the script's second argument: the place-detail page
      renders real content (title text present), not a fallback/error page.
- [ ] Non-zero exit code on any failure — treat that as **the deploy is live but unhealthy**,
      not as "deploy failed" (the cutover already happened at Step 9); decide immediately between
      fixing forward and rolling back (§4).

## 4. Rollback trigger criteria (decide, do not improvise mid-incident)

Roll back when, after a deploy:
- [ ] `scripts/smoke-test.sh` fails and the cause is not immediately obvious and safely fixable
      within a few minutes.
- [ ] `/api/health` reports `db: down` or `redis: down` and does not self-recover within the
      HEALTHCHECK's own retry window (~50s per PLACE-038's configured interval/retries).
- [ ] A spike in 5xx responses or a clear functional regression is observed in logs during the
      post-release observation window.
- [ ] The migration step itself failed — `deploy.sh` already halts automatically in this case;
      the running (previous) version is untouched, so no rollback action is needed, only a fix
      and a retry.

Do **not** roll back for: a single transient error with no reproduction, or a cosmetic issue with
no functional/security impact — fix forward on the next release instead.

## 5. Rollback checklist

Run `scripts/rollback.sh <tag-to-roll-back-to> [api|web|both]`:

- [ ] Confirms the target image tag actually exists locally/on-registry before doing anything
      (fails loudly if it was never retained — this is why Step 6 above matters).
- [ ] Swaps the container(s) via `docker compose up -d --no-build`.
- [ ] **Persists the rolled-back tag** to `.env` for the service(s) actually rolled back (a
      `web`-only rollback does not touch `API_IMAGE_TAG`). Without this, the next plain
      `docker compose up -d` would resurrect the bad release the rollback just removed.
- [ ] Waits, then verifies `/api/health` directly — exits non-zero if it does not return `200`.
- [ ] **Not scripted, do manually:** re-run `scripts/smoke-test.sh` against `:8080` for the full
      check set (rollback.sh only re-checks `/api/health`, not the whole smoke suite), and
      confirm monitoring/logs reflect the rolled-back version.
- [ ] Remember: this script never touches the database. If the incident involves a destructive
      migration or real data loss, container rollback is **not sufficient** — go to §6.

## 6. Restore checklist (destructive — database only)

Run `scripts/restore.sh <backup-file>`:

- [ ] Confirm this is genuinely needed — restore is destructive (drops and recreates the
      database from the dump). Container rollback (§5) alone is sufficient for the vast majority
      of cases, since all 20 migrations as of PLACE-040 are additive.
- [ ] For a migration-level rollback specifically (not a full restore), use
      `scripts/migration-rollback-rehearsal.sh` (PLACE-042) as the reference sequence — it
      wraps the official `migration:revert` → `migration:run` cycle with safety guards
      (refuses to run against production or a non-local `DB_HOST`). See
      [`DATABASE-ROLLBACK-RECOVERY-RUNBOOK.md`](DATABASE-ROLLBACK-RECOVERY-RUNBOOK.md) for the
      full rehearsal evidence and the failure/recovery decision tree.
- [ ] The script itself gates on an explicit typed confirmation before proceeding — do not
      script around that gate.
- [ ] After restore, verify row counts / a known-entity spot check look correct, then re-run
      `scripts/smoke-test.sh` to confirm the application layer is healthy against the restored
      data.

## 7. Backup checklist (routine, non-incident)

- [ ] `scripts/backup.sh` scheduled via cron on the VPS (recommended: nightly, matching the
      documented daily-7/weekly-4/monthly-6 retention it already enforces).
- [ ] `scripts/sync-offsite.sh` scheduled immediately after it, once real R2 credentials exist
      (§2 of `PRE-DEPLOYMENT-CHECKLIST.md`) — safe no-op until then.
- [ ] Periodically (at minimum: once before the very first real production release) actually
      run `scripts/restore.sh` against a throwaway/test database to prove the backup is
      restorable — "an untested backup is not a backup."

## 8. Startup verification checklist

- [ ] `docker compose -f docker-compose.prod.yml ps` — `postgres`/`redis`/`minio`/`api`/`web` all
      report `healthy` (native `HEALTHCHECK`, PLACE-038); `caddy` reports `running` (no native
      healthcheck configured for it).
- [ ] `docker compose logs api --tail=50` — no `ERROR`-level lines, no repeated Redis
      `NOAUTH`/connection-refused messages.
- [ ] `scripts/smoke-test.sh` passes (§3).

## 9. Shutdown verification checklist

- [ ] `docker compose -f docker-compose.prod.yml down` (never `down -v` in production — that
      would delete the named volumes, i.e. the database).
- [ ] The API's `app.enableShutdownHooks()` (see `apps/api/src/main.ts`) means NestJS's own
      lifecycle hooks run on `SIGTERM` — confirm in logs that shutdown was graceful (no forced
      `SIGKILL` after Docker's default 10s grace period; increase `stop_grace_period` in Compose
      if a graceful shutdown is ever observed to need longer).
- [ ] `docker volume ls` afterward still lists `pg_data_prod`, `redis_data_prod`, `minio_data_prod`
      — confirms no accidental volume removal occurred.
