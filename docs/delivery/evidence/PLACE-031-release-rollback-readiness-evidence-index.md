# PLACE-031 — Evidence Index (Release & rollback readiness, 2026-07-24)

Backs `docs/delivery/reports/PLACE-031-release-rollback-readiness-report.md`. All commands on the D: checkout under pinned **Node v20.20.2 / npm 10.8.2**, Docker Desktop running throughout.

## Authority
| id | source | proves |
|---|---|---|
| S-1 | Owner instruction 2026-07-24 — "PLACE-031 — Execute the Approved Recommended Candidate" | activation authorized |
| S-2 | Fresh PLACE-031 candidate assessment (this session) — Candidate E, score 5.77/10, `RECOMMENDED FOR PLACE-031` | scope basis |
| S-3 | Precondition check (report §Preconditions) | all conditions satisfied, no Owner decision required |

## Preflight investigation
| id | evidence | result |
|---|---|---|
| I-1 | `git status --short` (before) | empty — clean tree |
| I-2 | `state.yaml` `current` | `task: none`, `awaiting_task_authorization` |
| I-3 | full read of `docs/delivery/ENVIRONMENT-SETUP-RUNBOOK.md` | confirmed: a 2026-07-22 F:→D: environment-relocation guide, zero overlap with release/rollback |
| I-4 | full read of `docker-compose.prod.yml` | confirmed present, unchanged since PLACE-026/028/029/030; `api`/`web` services use a fixed `:local` tag — informed the decision to rehearse via plain `docker build`/`run` with distinct tags instead of modifying this file |
| I-5 | `docs/architecture/deployment.md` §9 read | confirmed the rollback mechanism already designed there ("redeploy image tag trước") — this task rehearses it, does not invent a new one |
| I-6 | `docker ps` | `phuquoc-postgres`/`-redis`/`-minio` healthy before starting |

## Implementation
| id | evidence | result |
|---|---|---|
| M-1 | `git status --short` (full task diff) | `docs/delivery/RELEASE-ROLLBACK-RUNBOOK.md` (new), `docs/delivery/tasks/PLACE-031.yaml` (new), report/evidence-index (new), `state.yaml`/`workstreams/place.yaml` (modified) — zero `apps/api`, `apps/web`, or `packages/*` file |
| M-2 | `docs/delivery/RELEASE-ROLLBACK-RUNBOOK.md` | pre-release checklist, deploy procedure, health verification, rollback procedure, local rehearsal record, explicit scope boundary (§6) |

## Runtime verification (rollback rehearsal, full transcript)
| id | command | result |
|---|---|---|
| V-1 | `docker exec phuquoc-postgres psql ... SELECT count(*) FROM migrations/places/users` (baseline) | `20` / `49` / `68` |
| V-2 | `git rev-parse --short HEAD` | `c82634e` |
| V-3 | `docker build -f apps/api/Dockerfile -t phuquochub-api:release-N .` | succeeded |
| V-4 | `docker run -d ... phuquochub-api:release-N` (real dev Postgres/Redis, `NODE_ENV=production`) | booted clean |
| V-5 | `curl /api/health` | `200`; `X-Request-Id` header present; `database:up`, `redis:up` |
| V-6 | `curl -X POST /api/auth/register` | `201` |
| V-7 | `curl -X POST /api/auth/login` (correct password) | `200` |
| V-8 | `curl -X POST /api/auth/login` (wrong password) | `401` |
| V-9 | `docker logs phuquochub-api-release --since 15s \| grep "\[HTTP\]"` | three structured log lines, one per request above, each with its own correct `correlationId` |
| V-10 | `docker rm -f phuquochub-api-release` | stopped `release-N` |
| V-11 | `docker build -f apps/api/Dockerfile -t phuquochub-api:release-N1 .` | succeeded (simulated next release, same reviewed commit) |
| V-12 | `docker run -d ... phuquochub-api:release-N1` | booted clean |
| V-13 | `curl /api/health` | `200` |
| V-14 | `docker inspect phuquochub-api-release --format '{{.Config.Image}}'` | `phuquochub-api:release-N1` — confirms N+1 is what's actually running |
| V-15 | **Rollback:** `docker rm -f phuquochub-api-release` then `docker run -d ... phuquochub-api:release-N` | executed |
| V-16 | `docker inspect phuquochub-api-release --format '{{.Config.Image}}'` (post-rollback) | `phuquochub-api:release-N` — confirms the rollback landed on the correct prior tag |
| V-17 | `curl /api/health` (post-rollback) | `200`, `database:up`, `redis:up` |
| V-18 | `curl -X POST /api/auth/login` with the user created under V-6 (now against the rolled-back `release-N`) | `200` — **data continuity across the rollback confirmed**: the user persisted in Postgres, unaffected by which container image is running |
| V-19 | `docker run --rm ... phuquochub-api:release-N` with `DB_PASSWORD` unset | `Config validation error: "DB_PASSWORD" is required` — PLACE-029 guarantee re-confirmed after the full rehearsal cycle |
| V-20 | `docker exec phuquoc-postgres psql ... DELETE FROM users WHERE email='place031-release-n@example.test'` | `DELETE 1` |
| V-21 | `docker rm -f phuquochub-api-release`; `docker rmi phuquochub-api:release-N phuquochub-api:release-N1` | container + both images removed |
| V-22 | `docker exec phuquoc-postgres psql ... SELECT count(*) FROM migrations/places` (post-cleanup) | `20` / `49` — **identical to baseline** |
| V-23 | `docker ps` | `phuquoc-postgres`/`-redis`/`-minio` healthy throughout |

## Regression verification
| id | command | result |
|---|---|---|
| V-24 | `eslint "src/**/*.ts" --max-warnings=0` (api) | exit 0 |
| V-25 | `tsc -p tsconfig.json --noEmit` (api) | exit 0 |
| V-26 | `tsc --noEmit` (web) | exit 0 |
| V-27 | `jest` (full unit) | **251/251**, 34 suites — identical to PLACE-030 baseline |
| V-28 | `jest --config test/jest-e2e.json` (full e2e) | **59/59**, 10 suites — identical to PLACE-030 baseline |
| V-29 | `rm apps/api/tsconfig.build.tsbuildinfo` + `turbo run build --force` | 4/4 tasks, 0 cached, real artifacts |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | A real staging/production rollback | NOT performed — no target host exists; rehearsed locally only, mechanism is directly reusable once one exists |
| NX-2 | Blue-green / zero-downtime cutover | NOT built — explicitly out of scope, named in the runbook's own §6 |
| NX-3 | Automated smoke-test-triggered rollback (CI/CD wiring) | NOT built — manual procedure only, documented as future work |
| NX-4 | Any application code, dependency, or schema change | NOT made |
| NX-5 | Any modification to `docker-compose.prod.yml` | NOT made — deliberate, to avoid touching the PLACE-026-established config |
| NX-6 | PLACE-032 | NOT started, NOT created |
