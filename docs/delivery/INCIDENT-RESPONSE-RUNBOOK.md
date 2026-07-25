# PhuQuocHub — Incident Response Runbook

**Created:** 2026-07-25 (PLACE-041). Found missing by the production audit (Section 5 — no
incident-response/disaster-recovery document existed anywhere in `docs/`). This is a first,
deliberately minimal runbook scoped to what this repository's actual current tooling supports —
it does not invent an on-call rotation, a paging service, or a status page, none of which exist
yet (single-operator project, zero real users as of this writing).

See also: [`RELEASE-AND-ROLLBACK-CHECKLIST.md`](RELEASE-AND-ROLLBACK-CHECKLIST.md) (deploy-time
operations) and [`PRE-DEPLOYMENT-CHECKLIST.md`](PRE-DEPLOYMENT-CHECKLIST.md) (pre-launch gate).

## 1. What "monitoring" currently means here

There is no external alerting yet (PLACE-039/040 §3 — the uptime-monitor account is still an open
Owner-side item). Until it exists, incident detection is **manual**: the operator notices a
problem (a user report, a manual check of `/api/health`, or `docker compose ps` showing an
unhealthy container). This runbook assumes that starting point.

## 2. Triage — first 5 minutes

1. `docker compose -f docker-compose.prod.yml ps` — which service(s) are unhealthy/restarting?
2. `docker compose -f docker-compose.prod.yml logs <service> --tail=100` — any `ERROR`-level
   line, stack trace, or repeated crash-loop message?
3. `curl -s https://phuquochub.com/api/health` — is it `200` (healthy), `503` (DB/Redis down), or
   unreachable (Caddy/network/VPS-level problem)?
4. Classify: **application bug** (a specific request/route fails, others work) vs. **infra
   failure** (a whole service is down/unhealthy) vs. **data problem** (wrong/missing data, no
   error at all).

## 3. Common scenarios and the exact response

| Symptom | Likely cause | Response |
|---|---|---|
| `/api/health` returns `503`, `database: down` | Postgres container unhealthy/crashed | Check `docker compose logs postgres`; if crash-looped, see PLACE-038's Defect 2 class of issue (a bad `command:`/config change) — if a recent deploy caused it, roll back (§5); if not, restart the container and investigate disk space / OOM |
| `/api/health` returns `503`, `redis: down` | Redis container unhealthy, or `REDIS_URL`/`REDIS_PASSWORD` mismatch after a config change | Check `docker compose logs redis`; PLACE-040 made `REDIS_URL` fail-fast in production, so if the API won't boot at all after a redeploy, this is the first thing to check |
| API container keeps restarting, never reports healthy | A bad deploy (bug in the new image) | `scripts/rollback.sh <previous-tag>` immediately (see `RELEASE-AND-ROLLBACK-CHECKLIST.md` §5) — do not debug forward under user-facing downtime |
| Web pages show a generic error page instead of content | An API error is propagating correctly (PLACE-041 fixed 4 routes that previously mis-reported all errors as 404 — this is the CORRECT new behavior, not a regression) | Check `/api/health` and API logs; the error boundary itself is not the problem |
| A specific `/places`, `/hotels`, etc. slug wrongly shows "not found" | Either it really doesn't exist/isn't published, or (pre-041) a masked server error | Confirm via `GET /api/places/<slug>` directly; if the API itself returns non-404, this would indicate a regression in the 404-vs-error fix — check the relevant `page.tsx` |
| High latency / slow responses, no errors | Possible DB query cost at a data volume this project hasn't reached yet (GAP-06/F-15, deferred per Owner decision OD-B6) | Not expected at current scale; if it happens, this is the trigger to revisit that deferred decision, not to add ad hoc indexes under incident pressure |
| Disk filling up on the VPS | WAL archive or backups accumulating without offsite sync (R2 credentials not yet configured, PLACE-039 §3) | Check `df -h` and `du -sh` under the WAL archive / backups directories; the retention logic in `scripts/backup.sh` already prunes local dumps, but the WAL archive itself has no automatic pruning until offsite sync is configured |

## 4. Rollback decision

Use `RELEASE-AND-ROLLBACK-CHECKLIST.md` §4's trigger criteria. In short: if a recent deploy is the
suspected cause and the fix isn't both obvious and fast, roll back first, investigate after.

## 5. Data-loss / destructive-migration incidents

This is the one class of incident container rollback cannot fix. Use
`RELEASE-AND-ROLLBACK-CHECKLIST.md` §6 (`scripts/restore.sh`). As of PLACE-040, all 20 migrations
in this repository are additive, so this scenario is not expected under normal operation — it
would only apply to a future non-additive migration gone wrong.

## 6. After the incident

- [ ] Confirm `scripts/smoke-test.sh` passes.
- [ ] Write down: what happened, when, root cause, what fixed it, how long it took — even a few
      lines. There is no formal postmortem template yet; do not block on writing one, just record
      the facts somewhere durable (this file's future revisions, or a dated note under
      `docs/delivery/reports/`).
- [ ] If the same class of incident could recur, decide whether it needs a follow-up PLACE task
      (a real fix) or just an update to this runbook's table in §3.

## 7. What this runbook deliberately does NOT cover

- Paging/on-call rotation — does not exist (single operator, no team).
- A public status page — not built, not decided.
- A fixed SLA/RTO/RPO number — no real users yet to derive one from; the backup policy (daily
  7/weekly 4/monthly 6, PLACE-037 §11) is the closest existing RPO-equivalent commitment.
