# PLACE-030 — Evidence Index (Production observability foundation, 2026-07-24)

Backs `docs/delivery/reports/PLACE-030-observability-foundation-report.md`. All commands on the D: checkout under pinned **Node v20.20.2 / npm 10.8.2**, Docker Desktop running throughout.

## Authority
| id | source | proves |
|---|---|---|
| S-1 | Owner instruction 2026-07-24 — "PLACE-030 — Production Observability Foundation... Implement the logging sub-scope of Candidate D" | activation authorized |
| S-2 | `docs/delivery/reports/PLACE-029-CANDIDATE-SELECTION-2026-07-24.md`, Candidate D | scope basis — logging sub-scope only |
| S-3 | Precondition check (report §Preconditions) | all five preconditions satisfied |

## Preflight investigation (fresh, not memory)
| id | evidence | result |
|---|---|---|
| I-1 | `grep -rn useLogger apps/api/src` (before) | zero hits — `AppLoggerService` never wired (TD-03 confirmed) |
| I-2 | `grep -i "correlation\|X-Request-Id\|requestId\|traceId" apps/api/src` (before) | zero hits for any HTTP-level mechanism |
| I-3 | `packages/shared-types/src/api-response.ts:7`, `docs/api/openapi.yaml:1714` | `ApiMeta.requestId?: string` already declared, never populated anywhere |
| I-4 | `apps/api/src/common/filters/all-exceptions.filter.ts:48` (before) | `.error()` already gated on `status >= 500` — 4xx already quiet, preserved unchanged |
| I-5 | `grep -n "new AllExceptionsFilter(\|new LoggingInterceptor(\|new TransformInterceptor("` across `apps/api` | 9 e2e spec files + main.ts construct with zero args — informed the optional-constructor-parameter design |
| I-6 | `find apps/api/src/common/middleware` (before) | `.gitkeep` only — first middleware added by this task |

## Implementation (scope)
| id | evidence | result |
|---|---|---|
| M-1 | `git status --short` (full task diff) | scoped to `apps/api/src/common/{middleware,interceptors,filters}/**`, `apps/api/src/core/logger/**`, `apps/api/src/main.ts`, `apps/api/test/observability.e2e-spec.ts`, delivery docs — zero `package.json`, zero `apps/web`, zero schema/migration file |
| M-2 | `apps/api/src/common/middleware/correlation-id.middleware.ts` (new) | `X-Request-Id` accept-if-valid-else-generate via `crypto.randomUUID()` (Node built-in, no new dependency); state on `req` object only |
| M-3 | `apps/api/src/main.ts` diff | `app.useLogger(await app.resolve(AppLoggerService))` + `bufferLogs:true`; `app.use(correlationIdMiddleware)` registered first; logger instances passed into `LoggingInterceptor`/`AllExceptionsFilter` |
| M-4 | `apps/api/src/common/interceptors/logging.interceptor.ts` / `apps/api/src/common/filters/all-exceptions.filter.ts` diffs | both gained an **optional** `LoggerService` constructor param, default `new AppLoggerService()` — no required-arg breakage |
| M-5 | `apps/api/src/common/interceptors/transform.interceptor.ts` diff | `meta.requestId` populated from `getCorrelationId(request)` |
| M-6 | `apps/api/src/core/logger/app-logger.service.ts` diff | `REDACTED_KEYS` expanded (snake_case + cookie + DB/Redis credential variants), matching made case-insensitive; delegate changed `Logger` → `ConsoleLogger` (bug fix, see BUG-1/BUG-2) |

## A real bug found and fixed (live-verification value)
| id | evidence | result |
|---|---|---|
| BUG-1 | First Docker boot attempt, full container log | `Error: AppLoggerService is marked as a scoped provider... Please, use resolve() instead.` — `app.get()` on a `Scope.TRANSIENT` provider throws at runtime |
| FIX-1 | `apps/api/src/main.ts` | `app.get(AppLoggerService)` → `await app.resolve(AppLoggerService)`, all three call sites |
| BUG-2 | Second Docker boot attempt (after FIX-1), full container log | `RangeError: Maximum call stack size exceeded` at `AppLoggerService.log` → `Logger.log` → `AppLoggerService.log` (infinite recursion) |
| DIAG-2 | `node_modules/@nestjs/common/services/logger.service.js` (read directly, lines 26-35) | confirmed `Logger` instance `.log()` delegates through `Logger.staticInstanceRef`, which — once overridden to an `AppLoggerService` instance — routes straight back into that same instance's `.log()` |
| FIX-2 | `apps/api/src/core/logger/app-logger.service.ts` | delegate changed from `new Logger()` to `new ConsoleLogger()` (the concrete, non-overridable implementation class) |
| RE-VERIFY | typecheck + full unit (251/251) + full e2e (59/59) + Docker rebuild + reboot, all re-run from scratch after FIX-2 | all green; third Docker boot clean, no recursion, identical visual log format to pre-PLACE-030 |

## Tests (new/updated)
| id | file | count | result |
|---|---|---|---|
| T-1 | `apps/api/src/common/middleware/correlation-id.middleware.spec.ts` (new) | 7/7 | generation, valid passthrough, invalid/oversized rejection, per-request uniqueness, read-back + fallback |
| T-2 | `apps/api/src/common/filters/all-exceptions.filter.spec.ts` (new) | 5/5 | 500-path logged w/ correlationId+errorType+stack; 400/401 quiet; `meta.requestId` populated; default-constructible |
| T-3 | `apps/api/src/common/interceptors/logging.interceptor.spec.ts` (rewritten) | 5/5 | structured log incl. correlationId; error path; RPC skip; single-log-per-request; default-constructible |
| T-4 | `apps/api/src/common/interceptors/transform.interceptor.spec.ts` (updated) | 5/5 (2 new) | `meta.requestId` populated + safe fallback |
| T-5 | `apps/api/src/core/logger/app-logger.service.spec.ts` (updated) | 7/7 (4 new) | snake_case keys, cookie/DB/Redis-credential keys, case-insensitive matching, nested redaction |
| T-6 | `apps/api/test/observability.e2e-spec.ts` (new, full HTTP stack via supertest) | 8/8 | correlation-ID generation/propagation, request-log match, 500-path proof (test-only throwing module, never in production `app.module.ts`), real-secret absence across live register+login, quiet-401 preserved, health/auth preserved |

## Verification ladder
| id | command | result |
|---|---|---|
| V-1 | `eslint "src/**/*.ts" --max-warnings=0` (api) | exit 0 |
| V-2 | `tsc -p tsconfig.json --noEmit` (api) | exit 0 |
| V-3 | `tsc --noEmit` (web) | exit 0 |
| V-4 | `jest` (full unit) | **251/251**, 34 suites (baseline 231/32 + 20 new) |
| V-5 | `jest --config test/jest-e2e.json` (full e2e) | **59/59**, 10 suites (baseline 51/9 + 8 new) — all 9 pre-existing files unmodified and passing |
| V-6 | `rm apps/api/tsconfig.build.tsbuildinfo` + `turbo run build --force` | 4/4 tasks, 0 cached, real artifacts confirmed |
| V-7 | `docker build -f apps/api/Dockerfile -t phuquochub-api:place030-verify .` (x3, after each fix) | succeeded each time |
| V-8 | `docker run` (api, `NODE_ENV=production`, real `phuquoc-postgres`/`phuquoc-redis`) | booted clean on the 3rd attempt (after BUG-1/BUG-2 fixes); identical visual log format to pre-PLACE-030 |
| V-9 | `curl /api/health` (no incoming header) | `X-Request-Id: 6410c13d-...` response header; `meta.requestId` in body **exactly matching** |
| V-10 | `curl /api/health -H "X-Request-Id: my-custom-trace-777"` | response header `X-Request-Id: my-custom-trace-777` — propagated unchanged |
| V-11 | `docker logs` during the above | `[HTTP] {"correlationId":"6410c13d-...",...}` and `[HTTP] {"correlationId":"my-custom-trace-777",...}` — structured, correct IDs |
| V-12 | `curl -X POST /api/auth/register` (real password, `X-Request-Id: corr-register-001`) | `201`; `meta.requestId` == `corr-register-001` |
| V-13 | `curl -X POST /api/auth/login` (correct password, `X-Request-Id: corr-login-ok`) | `200` |
| V-14 | `curl -X POST /api/auth/login` (wrong password, `X-Request-Id: corr-login-bad`) | `401` |
| V-15 | `docker logs` since the above requests | `[HTTP]` structured lines for register/login-ok/login-bad, each with its own correct `correlationId`; **zero** `ERROR`/`AllExceptionsFilter` lines for the 401 |
| V-16 | `docker logs` (full history) grepped for the real test password + both issued JWT tokens | **zero matches** — confirmed no secret leakage |
| V-17 | `docker run` (api, `NODE_ENV=production`, `DB_PASSWORD` unset) | crashed immediately: `Config validation error: "DB_PASSWORD" is required` — PLACE-029 behavior unaffected |
| V-18 | `docker run` (api, `NODE_ENV=production`, `DB_PASSWORD=""`) | crashed immediately: `Config validation error: "DB_PASSWORD" is not allowed to be empty` — unaffected |
| V-19 | `docker build -f apps/web/Dockerfile .` + `docker run` + `curl /` | succeeded; `200` — web unaffected (zero `apps/web` file touched) |
| V-20 | `docker exec phuquoc-postgres psql ... DELETE FROM users WHERE email='place030-live@example.test'` | `DELETE 1` |
| V-21 | `docker exec phuquoc-postgres psql ... DELETE FROM users WHERE email LIKE '%place030%' OR email LIKE '%observability%'` | cleaned up e2e-created test rows (2 separate runs) |
| V-22 | `psql SELECT count(*) FROM migrations` / `FROM places` | `20` / `49` — both unchanged |
| V-23 | `docker ps` before/during/after all verification | `phuquoc-postgres`/`-redis`/`-minio` healthy and unchanged throughout |
| V-24 | `docker rm -f` / `docker rmi` for all verification containers+images | removed |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | NestJS/Next.js migration | NOT performed |
| NX-2 | Live Docker proof of the unexpected-500 exception path | NOT performed by design — no debug route exists in the shipped image; proven instead at the e2e level via a test-only controller (T-6/V-5) never registered in production `app.module.ts` |
| NX-3 | CORS `allowedHeaders`/`exposedHeaders` change | NOT made — deliberate scope boundary (see report) |
| NX-4 | Any of the 9 pre-existing e2e spec files | NOT modified |
| NX-5 | Paid external observability vendor integration (Candidate D monitoring sub-scope) | NOT performed — separate Owner decision, `OD2-6` |
| NX-6 | PLACE-031 | NOT started, NOT created |
