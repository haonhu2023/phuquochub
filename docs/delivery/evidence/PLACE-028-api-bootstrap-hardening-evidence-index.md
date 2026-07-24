# PLACE-028 — Evidence Index (API bootstrap hardening, 2026-07-24)

Backs `docs/delivery/reports/PLACE-028-api-bootstrap-hardening-report.md`. All commands on the D:
checkout under pinned **Node v20.20.2 / npm 10.8.2**, Docker Desktop running throughout.

## Authority
| id | source | proves |
|---|---|---|
| S-1 | owner instruction 2026-07-24 — "execution of Eligible Candidate 3: PLACE-028" | activation authorized |
| S-2 | `decisions/OWNER-APPROVAL-SESSION-2026-07-24.md`, Eligible Candidate 3 | implements `OD2-12` + `OD2-13` (both Approved) |
| S-3 | Precondition check (report §preconditions) | all preconditions satisfied |

## Investigation (Phase 1, fresh, not memory)
| id | evidence | result |
|---|---|---|
| I-1 | `apps/api/src/main.ts:18` (before) | `enableCors({ origin: true, credentials: true })`, no rate limiting |
| I-2 | repo-wide grep `throttler\|rate-limit` | no existing mechanism |
| I-3 | repo-wide grep `credentials\|document.cookie\|Set-Cookie\|res.cookie` | only the CORS config line itself — zero cookie usage |
| I-4 | `npm view @nestjs/throttler@6.4.0 peerDependencies` | `@nestjs/core`/`@nestjs/common: ^7‖^8‖^9‖^10‖^11` — compatible with installed `^10.4.4`, no major bump |
| I-5 | grep of all controller HTTP-method decorators | `GET/POST/PATCH/DELETE` only, no `PUT` |
| I-6 | grep `SwaggerModule\|DocumentBuilder` | none — no runtime OpenAPI endpoint exists |
| I-7 | `apps/web/package.json` dev script | `next dev -p 3000` — dev origin `http://localhost:3000` |

## Implementation (Phases 3-5)
| id | evidence | result |
|---|---|---|
| M-1 | `git diff --stat apps/api/package.json` | `@nestjs/throttler@^6.4.0` added, no other dependency touched |
| M-2 | `git status --short` (full task diff) | scoped to: `.env.example`, `.github/workflows/ci.yml`, `apps/api/package.json`, `apps/api/src/{app.module.ts,core/config/*,core/rate-limit/*,main.ts,modules/auth/auth.controller.ts,modules/health/health.controller.ts}`, `apps/api/test/security-hardening.e2e-spec.ts`, `docker-compose.prod.yml`, `docs/architecture/deployment.md`, `package-lock.json` — no unrelated file |
| M-3 | `git diff package-lock.json` | 12 insertions, exactly the `@nestjs/throttler` package entry |
| M-4 | `apps/api/src/main.ts` (after) | explicit `origin`/`credentials`/`methods`/`allowedHeaders`; conditional `app.set('trust proxy', N)` |
| M-5 | `.github/workflows/ci.yml` diff | `docker-build` job's API boot step given `-e CORS_ALLOWED_ORIGINS=http://localhost:3000` — prevents a fail-fast break under the new production requirement |

## Tests (Phase 6)
| id | file | result |
|---|---|---|
| T-1 | `apps/api/src/core/rate-limit/rate-limit.spec.ts` | 2/2 — isolated `ThrottlerGuard` mechanism, limit=3: in-limit succeeds, over-limit → 429; `@SkipThrottle()` endpoint never limited across 5 calls |
| T-2 | `apps/api/test/security-hardening.e2e-spec.ts` | 7/7 — CORS allow/reject/credentials/preflight/no-origin (5 tests) + real `/api/auth/login` 429 at `RATE_LIMIT_AUTH_LIMIT=10` default + `/api/health` never throttled (2 tests) |

## Verification ladder (Phase 7)
| id | command | result |
|---|---|---|
| V-1 | `eslint "src/**/*.ts" --max-warnings=0` (api) | exit 0 |
| V-2 | `tsc --noEmit` (api) | exit 0 |
| V-3 | `tsc --noEmit` (web) | exit 0 |
| V-4 | `jest` (full unit) | **223/223**, 31 suites (baseline 221 + 2 new `rate-limit.spec.ts`) |
| V-5 | `jest --config test/jest-e2e.json` (full e2e) | **51/51**, 9 suites (baseline 44 + 7 new `security-hardening.e2e-spec.ts`) |
| V-6 | `turbo run build --force` (tsbuildinfo purged) | 4/4 tasks, 0 cached; web build's own lint+typecheck pass included and green |
| V-7 | `docker build -f apps/api/Dockerfile -t phuquochub-api:place028-verify .` | succeeded |
| V-8 | `docker run` (network `phuquochub_default`, real `phuquoc-postgres`/`phuquoc-redis`, `RATE_LIMIT_AUTH_LIMIT=5` override, `CORS_ALLOWED_ORIGINS=http://localhost:3000`, `NODE_ENV=production`) | booted clean, no crash — proves production Joi requirement for `CORS_ALLOWED_ORIGINS` is satisfiable and enforced |
| V-9 | `curl /api/health` | `{"status":"ok","database":"up","redis":"up (PONG)"}` |
| V-10 | `curl -H "Origin: http://localhost:3000" /api/health` | `Access-Control-Allow-Origin: http://localhost:3000` present |
| V-11 | `curl -H "Origin: https://evil.example.com" /api/health` | `Access-Control-Allow-Origin` header absent/not reflecting the disallowed origin |
| V-12 | `curl -X OPTIONS /api/auth/login` (preflight, `Access-Control-Request-Method: POST`, `-Headers: Content-Type,Authorization`) | `204`; `Access-Control-Allow-Methods: GET,POST,PATCH,DELETE,OPTIONS`; `Access-Control-Allow-Headers: Content-Type,Authorization` |
| V-13 | 6x `curl -X POST /api/auth/login` (bad credentials, live container, `RATE_LIMIT_AUTH_LIMIT=5`) | requests 1-5 → `401`; request 6 → `429` |
| V-14 | `curl /api/health` during/after the above loop | `200` throughout — confirms `@SkipThrottle()` |
| V-15 | `docker compose -p phuquochub-place028-verify -f docker-compose.prod.yml config` | resolved cleanly; `RATE_LIMIT_*`/`CORS_*`/`TRUST_PROXY_HOPS` present with documented defaults; **no containers started** (config-only command) |
| V-16 | `docker rm -f api-place028-verify`, `docker rmi phuquochub-api:place028-verify` | verification container + image removed |
| V-17 | `docker ps` (before and after all verification) | `phuquoc-postgres`/`-redis`/`-minio` healthy and unchanged throughout |
| V-18 | `docker volume ls \| grep phuquochub` | only `phuquochub_pg_data`/`_redis_data`/`_minio_data` exist — no stray `_prod` volumes created |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | NestJS/Next.js major-version migration | NOT performed — remains deferred per PLACE-027 |
| NX-2 | Distributed (Redis-backed) rate limiter | NOT implemented — single-instance in-memory limiter; limitation documented in `docs/architecture/deployment.md` |
| NX-3 | Real production CORS domain | NOT provisioned — `CORS_ALLOWED_ORIGINS` remains owner-supplied; local stack default is the stack's own `web` origin, not a real domain |
| NX-4 | PLACE-029 | NOT started |
