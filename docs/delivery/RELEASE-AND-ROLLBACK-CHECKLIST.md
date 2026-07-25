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
- [ ] `git log` reviewed since the last release — no destructive migration among the new
      commits (a migration whose `down()` cannot cleanly reverse, or which drops/renames a
      column/table with existing data). All 20 migrations as of PLACE-040 are additive; if a new
      one is not, stop and treat this as a higher-risk release (§4).
- [ ] The image tag to deploy is decided and corresponds to an exact Git commit SHA (§23's own
      tagging recommendation).
- [ ] A short, announced maintenance window exists for this specific release if it is the first
      real deploy ever, or introduces a non-additive migration; not required for routine releases.

## 2. Deploy checklist

Run `scripts/deploy.sh <tag>` (requires `DB_PASSWORD`, `REDIS_PASSWORD`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET` set in the environment it runs in). It performs, in order:

- [ ] Step 5 — build `phuquochub-api:<tag>` / `phuquochub-web:<tag>` images (the web build embeds
      `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_MAP_TILE_URL` at build time — confirm these build-args
      resolve to the real production values before trusting the image).
- [ ] Step 6 — tag retained (needed for `scripts/rollback.sh` later — do not delete it).
- [ ] Step 7 — `migrate` compose service runs all pending migrations; **halts the whole deploy
      on failure** without touching the running stack.
- [ ] Step 8 — smoke test on the **new** image in isolation, before cutover; halts on failure.
- [ ] Step 9 — cutover: `docker compose up -d` the new api/web/caddy.
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
