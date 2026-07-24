# PLACE-031 — Release & Rollback Readiness (Runbook + Locally-Rehearsed Rollback Drill)

- **Date:** 2026-07-24
- **Authority:** Owner explicit authorization — "PLACE-031 — Execute the Approved Recommended Candidate" — selecting the fresh PLACE-031 candidate assessment's Candidate E (Release & Rollback Readiness, weighted score 5.77/10, disposition `RECOMMENDED FOR PLACE-031`).
- **Nature:** Documentation + a local Docker verification exercise. No application code, dependency, schema, or configuration-file change.
- **Repository:** `D:\Projects\PhuQuocHub` (branch `master`)
- **Toolchain:** Node v20.20.2 / npm 10.8.2 (pinned), Docker Desktop.

---

## Preconditions

| Check | Result |
|---|---|
| PLACE-030 completed | ✅ `state.yaml` `completed_tasks` |
| PLACE-029 completed | ✅ `state.yaml` `completed_tasks` |
| Working tree clean at start | ✅ |
| `current.task: none` at start | ✅ |
| No `PLACE-031.yaml` existed before this task | ✅ |
| No conflicting task active | ✅ |
| No unresolved Owner decision blocks this candidate | ✅ — confirmed during the fresh candidate assessment; this was the deciding factor for selecting it over the higher-scoring but Owner-blocked NestJS 10→11 migration |

---

## Original problem

Two gaps, both explicitly named as still-open in `PRODUCTION-READINESS-REASSESSMENT-V2-2026-07-24.md` and untouched by every PLACE task through PLACE-030:

1. **Phase 3, item #38 — Release runbook:** `docs/delivery/ENVIRONMENT-SETUP-RUNBOOK.md` exists but is a local dev-environment setup guide (Node install, `F:`→`D:` relocation), not a release/rollback runbook. Confirmed by direct full read in this task's preflight — zero overlap.
2. **Phase 3, item #21 — Rollback readiness:** "no deployed environment exists to roll back from; no rollback rehearsal has ever been performed; `git revert` capability exists at the code level only."

## Candidate-selection basis

From the fresh PLACE-031 candidate assessment performed immediately before this task: Candidate B (NestJS 10→11) scored highest overall (6.06/10) but carries an unresolved Owner dependency (migration timing was never separately decided). Candidate E (this task) scored 5.77/10 with **zero** Owner dependency and **zero** deployment risk, making it the highest-scoring genuinely-executable candidate — selected per the explicit decision rule to prefer an executable, high-value task over a theoretically important but Owner-blocked one.

---

## Files changed

| File | Nature |
|---|---|
| `docs/delivery/RELEASE-ROLLBACK-RUNBOOK.md` (new) | The runbook itself |
| `docs/delivery/tasks/PLACE-031.yaml` (new) | Task authority |
| `docs/delivery/reports/PLACE-031-release-rollback-readiness-report.md` (new) | This report |
| `docs/delivery/evidence/PLACE-031-release-rollback-readiness-evidence-index.md` (new) | Evidence index |
| `docs/delivery/state.yaml` | `current.task` transitions, `completed_tasks` entry |
| `docs/delivery/workstreams/place.yaml` | `place_031_status` entry |

**Zero files under `apps/api`, `apps/web`, or `packages/*` were touched.** `docker-compose.prod.yml` was read for reference but not modified — the rehearsal deliberately used plain `docker build`/`docker run` with distinct tags instead, specifically to avoid touching the PLACE-026-established compose configuration.

---

## Implementation approach

The runbook documents the release/rollback mechanism already designed in `docs/architecture/deployment.md` §9 ("redeploy the previous immutable image tag; smoke-test failure triggers rollback") — it does not invent a new mechanism. Since no real staging/production target exists in this repository or session, the mechanism was **rehearsed locally** against the real dev Postgres/Redis: two image tags (`release-N`, `release-N1`) built from the same reviewed commit represent a "current release" and a "next release"; the rehearsal proves the build → boot → health-check → rollback → re-verify cycle actually works, including data continuity across the rollback (a user created while `release-N1` was running remained fully usable after rolling back to `release-N`, confirming state lives in Postgres/Redis, not the container).

---

## Acceptance-criteria results

| ID | Criterion | Result |
|---|---|---|
| AC1 | Runbook exists, distinct from `ENVIRONMENT-SETUP-RUNBOOK.md`, covers pre-release/deploy/health-verify/rollback as one document | ✅ `RELEASE-ROLLBACK-RUNBOOK.md`, 6 sections |
| AC2 | Real two-tag rollback rehearsal performed and evidenced | ✅ see §"Runtime verification" below |
| AC3 | No `apps/api`/`apps/web`/`packages/*` file changed; no dependency/schema/migration touched | ✅ `git status --short` confirms |
| AC4 | Full lint/typecheck/unit/e2e/build totals unaffected (identical to PLACE-030 baseline) | ✅ unit 251/251, e2e 59/59 — exact match |
| AC5 | PLACE-029 and PLACE-030 guarantees re-confirmed live, unaffected | ✅ bcrypt round-trip, DB-credential fail-fast, correlation ID, structured logs, quiet 4xx all re-proven during the rehearsal |
| AC6 | Dev-stack integrity confirmed unchanged; all rehearsal artifacts cleaned up | ✅ migrations=20, places=49 both before and after; test user deleted; images/containers removed |

---

## Test totals

No new test file was added — this task adds no application code (per its own scope). Full existing suite re-run to prove zero regression:

| Check | Result |
|---|---|
| Lint (api) | exit 0 |
| Typecheck (api) | exit 0 |
| Typecheck (web) | exit 0 |
| Unit tests | **251/251**, 34 suites — identical to PLACE-030 baseline |
| E2e tests | **59/59**, 10 suites — identical to PLACE-030 baseline |

## Build results

Clean production build (after purging `apps/api/tsconfig.build.tsbuildinfo`, per the reassessment's documented hygiene practice): `turbo run build --force` → **4/4 tasks, 0 cached**, real artifacts.

## Docker/runtime results

| Step | Result |
|---|---|
| Baseline row counts recorded | `migrations=20`, `places=49`, `users=68` |
| Build `phuquochub-api:release-N` | succeeded |
| Boot `release-N`, health-check | `200`, `database:up`, `redis:up`, `X-Request-Id` present |
| Auth round-trip on `release-N` | register `201` → login correct `200` → login wrong `401` |
| Structured logs on `release-N` | `[HTTP] {"correlationId":...}` present for every request |
| Build `phuquochub-api:release-N1` (simulated next release) | succeeded |
| Boot `release-N1`, health-check | `200` |
| **Rollback:** stop `release-N1`, redeploy `release-N` | confirmed via `docker inspect --format '{{.Config.Image}}'` → `phuquochub-api:release-N` |
| Post-rollback health-check | `200`, `database:up`, `redis:up` |
| **Data continuity:** login with the user created under `release-N1`, now against the rolled-back `release-N` | `200` — proves state lives in Postgres, not the container |
| DB-credential fail-fast re-confirmed on `release-N` | `DB_PASSWORD` unset → `Config validation error: "DB_PASSWORD" is required` |
| Cleanup | test user deleted (`DELETE 1`); both images and the container removed |
| Post-cleanup row counts | `migrations=20`, `places=49` — **identical to baseline** |

Full command-level transcript in the evidence index.

## Security and observability regression results

- **PLACE-029 (bcrypt/DB-credential):** register/login/wrong-password round-trip proven on `release-N`; `DB_PASSWORD` fail-fast re-proven after the full rollback rehearsal — both unaffected by this task.
- **PLACE-030 (observability):** correlation ID present in every response header and body (`meta.requestId`), structured `[HTTP]` log lines for every request with correct correlation IDs, and the 401 login attempt produced no error-level log line (quiet-business-error behavior preserved) — all unaffected by this task.

## Data-integrity confirmation

`migrations` and `places` row counts identical before and after (`20`/`49`). The one test user created during the rehearsal (`place031-release-n@example.test`) was deleted; a final grep for `%place031%` in the `users` table returned `0` rows.

---

## Unresolved limitations

- This runbook's rollback mechanism has only been rehearsed **locally** — it has not been exercised against a real staging/production host, because none exists in this repository or session. The mechanism itself (build → tag → boot → health-check → rollback) is directly reusable once a real host exists; only host/network placeholders change.
- Blue-green / zero-downtime cutover, automated smoke-test-triggered rollback, and database-migration-failure recovery are explicitly out of scope and named as such in the runbook's own §6 — none of these were designed or built here.
- The runbook documents environment variables required for a real release but does not itself provision or validate any real production secret — that remains, as always, entirely owner-supplied.

## Rollback procedure (for this task's own repository changes)

Purely additive documentation and delivery-evidence files. `git revert` of the relevant commit(s) fully removes them; no application state, schema, or running service is affected by reverting.

## Recommended next candidate

Per the fresh PLACE-031 assessment, **Candidate B (NestJS 10→11 migration)** remains the highest-scoring candidate overall (6.06/10) but requires the Owner to confirm migration timing (before staging / before beta / before public launch / defer with accepted risk) before it can be authorized as PLACE-032. Absent that confirmation, no further candidate from the current assessment is both high-value and immediately executable without new Owner or external input.
