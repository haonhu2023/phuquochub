# PLACE-032 — Evidence Index (NestJS 10 → 11 migration, 2026-07-24)

Backs `docs/delivery/reports/PLACE-032-nestjs-11-migration-report.md`. All commands on the D: checkout under pinned **Node v20.20.2 / npm 10.8.2**, Docker Desktop running throughout.

## Authority
| id | source | proves |
|---|---|---|
| S-1 | Owner instruction 2026-07-24 — "PLACE-032 — Execute NestJS 10 to NestJS 11 Migration", timing: execute now, before staging | activation authorized |
| S-2 | PLACE-032 read-only migration-readiness assessment (same session) — recommendation `APPROVE PLACE-032 EXECUTION` | scope + approved package set basis |
| S-3 | Precondition check (report §Preconditions) | all conditions satisfied |

## Phase 1 — Baseline capture
| id | evidence | result |
|---|---|---|
| B-1 | `npm ls @nestjs/... -w apps/api` (before) | all 10 packages at their NestJS-10-line versions, exactly matching the read-only assessment |
| B-2 | `npm audit --omit=dev --json` (before) | 15 total (0/5/10/0) |
| B-3 | `npm audit --json` (before) | 30 total (0/11/16/3) |
| B-4 | `eslint`/`tsc --noEmit` (api) | exit 0 |
| B-5 | `jest` (full unit, before) | **251/251**, 34 suites |
| B-6 | `jest --config test/jest-e2e.json` (full e2e, before) | **59/59**, 10 suites |
| B-7 | `turbo run build --force` (before) | 4/4, 0 cached |
| B-8 | `docker build -f apps/api/Dockerfile -t phuquochub-api:nestjs10-baseline .` | succeeded, image retained |
| B-9 | `docker run` (nestjs10-baseline, real dev Postgres/Redis, `NODE_ENV=production`) | booted clean |
| B-10 | `curl /api/health`, register/login/wrong-password, `docker logs` grep | health `200`; `201`/`200`/`401`; structured `[HTTP]` logs; zero `ERROR` for the 401; zero secret leakage |
| B-11 | `docker run` with `DB_PASSWORD` unset / `=""` | both crash with the expected named Joi error |
| B-12 | baseline row counts | `migrations=20`, `places=49`, `users=78` |
| B-13 | cleanup after baseline capture | test user deleted, container removed, image retained |

## Phase 2 — Dependency changes
| id | evidence | result |
|---|---|---|
| M-1 | `apps/api/package.json` diff | exactly the 10 approved lines |
| M-2 | first `npm install` (incremental) | succeeded, no ERESOLVE, but produced a mixed-version tree (see Defect below) |
| M-3 | `npm ls @nestjs/common --all` (after first install) | **two copies**: `11.1.28` top-level, `10.4.22` nested under `config`/`jwt`/`throttler` |
| M-4 | `require.resolve('@nestjs/common', {paths:[...'@nestjs/throttler']})` | confirmed throttler physically loading `10.4.22` — not an `npm ls` display artifact |
| M-5 | `npm dedupe` (attempted standard fix) | **failed with ERESOLVE** — ineffective for this specific mixed-lockfile state |
| M-6 | `rm -rf node_modules apps/api/node_modules package-lock.json && npm install` (full clean reinstall) | first attempt hit `ENOTEMPTY` (Windows filesystem artifact from a prior interrupted install); second attempt, after fully removing `node_modules` again, succeeded cleanly |
| M-7 | `npm ls @nestjs/common --all` (after clean reinstall) | single `11.1.28` throughout, all 8 dependent packages deduped to it |
| M-8 | `require.resolve()` re-check | confirmed `@nestjs/throttler` now loads `11.1.28` |
| M-9 | `npm ls typeorm reflect-metadata rxjs class-validator class-transformer bcrypt ioredis pg joi typeorm-naming-strategies jest supertest typescript -w apps/api` | all "must remain unchanged" packages confirmed unchanged (or harmlessly in-range patch-drifted for `ioredis`/`pg`/`joi`) |
| M-10 | `git diff --stat -- '**/package.json'` | only `apps/api/package.json` touched, 20 lines; `apps/web/package.json` zero diff |

## Phase 3 — Compile, diagnose, adapt
| id | evidence | result |
|---|---|---|
| C-1 | `tsc -p tsconfig.json --noEmit` (api, post-bump) | exit 0 — `redis.health.ts` compiles cleanly against the deprecated-but-functional Terminus API |
| C-2 | `eslint "src/**/*.ts" --max-warnings=0` (api, post-bump) | exit 0 |
| C-3 | `jest src/modules/health` | 2/2 — `health.controller.spec.ts` unaffected |
| C-4 | `jest --config test/jest-e2e.json health.e2e-spec` | 1/1 — real-Redis health check confirms `RedisHealthIndicator` functions correctly at runtime |
| C-5 | Decision recorded | `redis.health.ts` left unchanged per the task's explicit decision rule; deprecation documented as a follow-up |

## Phase 4/5 — Breaking-change exposure + focused validation
| id | evidence | result |
|---|---|---|
| E-1 | `npm view @nestjs/platform-express@11.1.28 dependencies.express` | `5.2.1` — confirms Express 5 is the actual live dependency |
| E-2 | `jest` (full unit, post-bump) | **251/251**, 34 suites — identical to baseline, exercising env-validation, auth, guards, health, correlation-ID, logging, filters, redaction, and rate-limit specs in one pass |
| E-3 | `jest --config test/jest-e2e.json` (full e2e, post-bump) | **59/59**, 10 suites — identical to baseline, exercising every `@Query()`-bound DTO (places/search/geo/sources), full auth/authz flows, CORS/rate-limit fail-fast, and the full observability e2e spec |

## Phase 6 — Full regression
| id | command | result |
|---|---|---|
| R-1 | `npm run lint --workspace=apps/api` | exit 0 |
| R-2 | `npm run typecheck --workspace=apps/api` | exit 0 |
| R-3 | `npm run typecheck --workspace=apps/web` | exit 0 — confirms zero web impact |
| R-4 | `jest` (full unit) | 251/251, 34 suites |
| R-5 | `jest --config test/jest-e2e.json` (full e2e) | 59/59, 10 suites |
| R-6 | `rm apps/api/tsconfig.build.tsbuildinfo && turbo run build --force` | 4/4, 0 cached |

## Phase 7 — Audit comparison
| id | evidence | result |
|---|---|---|
| A-1 | `npm audit --omit=dev --json` (after) | **2 total (0/2/0/0)** — `next` (direct, high), `postcss` (transitive, high), both Next.js-rooted |
| A-2 | `npm audit --json` (after, incl. dev) | **5 total** |
| A-3 | Reconciliation | 15 → 2 production findings: **13 closed**, all `@nestjs/*`-rooted (direct packages + `body-parser`/`express`4.x/`qs`/`uuid`/`lodash`/`multer`/`file-type` transitive chain); 0 new findings introduced |

## Phase 8 — Production Docker verification
| id | command | result |
|---|---|---|
| V-1 | `docker build -f apps/api/Dockerfile -t phuquochub-api:nestjs11 .` | succeeded |
| V-2 | `docker run` (nestjs11, real dev Postgres/Redis, `NODE_ENV=production`) | booted clean, identical visual log format to baseline |
| V-3 | `curl /api/health` | `200`, `database:up`, `redis:up`, `X-Request-Id` present |
| V-4 | `curl -X POST /api/auth/register` (`X-Request-Id: n11-register`) | `201`, `meta.requestId` == supplied header |
| V-5 | `curl -X POST /api/auth/login` (correct / wrong password) | `200` / `401` |
| V-6 | `curl -X POST /api/places` (no token) | `401` |
| V-7 | Explicit header-vs-body correlation-ID comparison (separate `curl -D`/`-o` capture + `node` JSON parse) | **CONFIRMED MATCH** |
| V-8 | `docker logs --since 30s \| grep "\[HTTP\]\|ERROR"` | structured lines for every request, correct correlation IDs, zero `ERROR` for the 401 |
| V-9 | `docker logs \| grep <real password>` | zero matches |
| V-10 | 11× `curl -X POST /api/auth/login` (bad credentials) | 8× `401` then `429`×3 — rate limiting unaffected |
| V-11 | `docker run` with `DB_PASSWORD` unset / `=""` / `CORS_ALLOWED_ORIGINS` unset | all three crash immediately with the expected named error (cosmetic stack-trace formatting difference noted, no functional change) |
| V-12 | `docker build -f apps/web/Dockerfile .` + `docker run` + `curl /` | succeeded, `200` — web unaffected |

## Phase 9 — Rollback rehearsal
| id | step | result |
|---|---|---|
| RB-1 | Confirm N11 running | `docker inspect --format '{{.Config.Image}}'` → `phuquochub-api:nestjs11` |
| RB-2 | Stop N11, redeploy `nestjs10-baseline` | `docker inspect` confirms rolled-back container running `phuquochub-api:nestjs10-baseline` |
| RB-3 | Post-rollback health | `200`, `database:up`, `redis:up` |
| RB-4 | **Data continuity**: login with the N11-created user, now against N10 | `200` |
| RB-5 | Auth behavior re-confirmed | wrong password still `401` |
| RB-6 | Row counts after rollback | `migrations=20`, `places=49` — unchanged |
| RB-7 | **Forward recovery**: stop N10, redeploy N11 | `docker inspect` confirms `phuquochub-api:nestjs11` running again |
| RB-8 | Post-forward-recovery health + login | `200` / `200` |

## Cleanup
| id | evidence | result |
|---|---|---|
| CU-1 | `DELETE FROM users WHERE email LIKE '%place032%'` | `DELETE 1` |
| CU-2 | `docker rm -f phuquochub-api-migration` | removed |
| CU-3 | `docker rmi phuquochub-api:nestjs11 phuquochub-api:nestjs10-baseline` | both removed |
| CU-4 | Final row counts | `migrations=20`, `places=49` — identical to the original pre-task baseline |
| CU-5 | `git status --short -- apps/api/src/core/database/migrations/` | empty — zero migration/schema file touched |
| CU-6 | `docker ps` | `phuquoc-postgres`/`-redis`/`-minio` healthy throughout |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | `redis.health.ts` `HealthIndicatorService` migration | NOT performed — works correctly as-is, deprecation recorded as a follow-up |
| NX-2 | Next.js migration | NOT performed — separate candidate |
| NX-3 | Any `apps/web` change | NOT made |
| NX-4 | Closing the remaining 2 production findings (`next`/`postcss`) | NOT performed — Next.js-rooted, out of scope |
| NX-5 | PLACE-033 | NOT started, NOT created |
