# PLACE-028 — API Bootstrap Hardening Report (rate limiting + CORS, 2026-07-24)

Implements `OD2-12` (rate limiting) and `OD2-13` (CORS), Eligible PLACE Candidate 3 from
`docs/delivery/decisions/OWNER-APPROVAL-SESSION-2026-07-24.md`. Executed on the D: checkout,
Node v20.20.2 / npm 10.8.2, Docker Desktop running throughout.

## 1. Objective

Harden the public API bootstrap for production without changing any product behaviour:
- **Rate limiting** — no mechanism existed before this task; every endpoint was unbounded.
- **CORS** — was permissive (`origin: true`) with `credentials: true` enabled despite zero cookie
  usage anywhere in the codebase.

## 2. Investigation findings (Phase 1)

| Finding | Evidence |
|---|---|
| No rate limiting anywhere | grep for `throttler`/`rate-limit` across `apps/api` — none found before this task |
| CORS permissive, `credentials:true` unused | `apps/api/src/main.ts:18` (before); grep `credentials\|document.cookie\|Set-Cookie\|res.cookie` repo-wide — only the CORS config line itself; auth is 100% bearer-token (`Authorization` header) |
| No reverse-proxy trust configured | no `app.set('trust proxy', ...)` anywhere; `infrastructure/` nginx config is a stub (per PLACE-026) |
| HTTP methods in use | `GET, POST, PATCH, DELETE` only (grep across all `@Controller`/`@Get`/`@Post`/etc. decorators) — no `PUT` |
| No runtime OpenAPI endpoint | no `SwaggerModule`/`DocumentBuilder` bootstrap anywhere; `docs/api/openapi.yaml` is hand-maintained documentation only — nothing to break |
| `@nestjs/throttler@^6.4.0` peer-compatible | `npm view @nestjs/throttler@6.4.0 peerDependencies` → `@nestjs/core`/`@nestjs/common`: `^7‖^8‖^9‖^10‖^11`, matches installed `^10.4.4` — **no major bump** |
| Dev frontend origin | `http://localhost:3000` (`apps/web` `next dev -p 3000`) |
| Production origin | **unknown** — no domain provisioned (confirmed in PLACE-026); must be env-configurable |

## 3. Design decisions (Phase 2 execution brief, presented to owner before implementation)

| Decision | Value |
|---|---|
| Rate-limit mechanism | `@nestjs/throttler@6.4.0`, in-memory (`ThrottlerStorageService`), single-instance — no Redis-backed storage (not required at current scale; limitation documented) |
| Global default | `RATE_LIMIT_TTL=60`, `RATE_LIMIT_LIMIT=100` |
| Stricter auth limit | `/api/auth/login`, `/api/auth/register`: `RATE_LIMIT_AUTH_TTL=60`, `RATE_LIMIT_AUTH_LIMIT=10` — evidenced brute-force/spam mitigation |
| Exemptions | `/api/health` only (`@SkipThrottle()`) — container liveness/readiness probe |
| CORS origin strategy | `CORS_ALLOWED_ORIGINS` (comma-separated); dev default `http://localhost:3000`; **required, fail-fast at boot** in production |
| CORS credentials | `CORS_CREDENTIALS`, default `false` (no cookie usage exists) |
| Proxy trust | `TRUST_PROXY_HOPS`, default `0` (no real reverse proxy deployed yet) |

## 4. Implementation (Phases 3-5)

| File | Change |
|---|---|
| `apps/api/package.json` | `@nestjs/throttler@^6.4.0` added |
| `apps/api/src/core/config/configuration.ts` | `rateLimit`, `cors`, `trustProxyHops` config keys |
| `apps/api/src/core/config/env.validation.ts` | Joi schema: rate-limit vars (positive number, defaulted); `CORS_ALLOWED_ORIGINS` required when `NODE_ENV=production`, defaulted otherwise; `CORS_CREDENTIALS`, `TRUST_PROXY_HOPS` |
| `apps/api/src/core/rate-limit/rate-limit.module.ts` (new) | `ThrottlerModule.forRootAsync` + global `APP_GUARD` registration |
| `apps/api/src/app.module.ts` | `RateLimitModule` imported |
| `apps/api/src/modules/health/health.controller.ts` | `@SkipThrottle()` added |
| `apps/api/src/modules/auth/auth.controller.ts` | `@Throttle()` override on `register`/`login` |
| `apps/api/src/main.ts` | Explicit CORS allow-list (`origin`, `credentials`, `methods`, `allowedHeaders`), conditional `trust proxy` |
| `.env.example` | New rate-limit/CORS/proxy-trust variables documented |
| `docker-compose.prod.yml` | `api` service env block extended; `CORS_ALLOWED_ORIGINS` defaults to the stack's own local `web` origin (`http://localhost:3000`) — **must be replaced with a real domain before any real deployment** |
| `.github/workflows/ci.yml` | `docker-build` job's API boot step given `CORS_ALLOWED_ORIGINS` — without this, the job would fail fast under the new production CORS requirement |
| `docs/architecture/deployment.md` | Implementation-status addendum, including the in-memory/single-instance limiter limitation |

## 5. Tests (Phase 6)

| File | Coverage |
|---|---|
| `apps/api/src/core/rate-limit/rate-limit.spec.ts` (new, unit) | `ThrottlerGuard` mechanism in isolation, deliberately low limit (3/60s): requests within limit succeed, over-limit returns 429; `@SkipThrottle()` endpoint never limited |
| `apps/api/test/security-hardening.e2e-spec.ts` (new, e2e) | CORS: allowed origin reflected, disallowed origin not reflected, no `Access-Control-Allow-Credentials` by default, OPTIONS preflight succeeds with configured methods/headers, no-Origin request still succeeds. Rate limiting: `/api/auth/login` (real `RATE_LIMIT_AUTH_LIMIT=10` default) returns 429 on the 11th request; `/api/health` never throttled across 15 rapid requests |

## 6. Verification ladder (Phase 7)

| Step | Result |
|---|---|
| `eslint` (api, full `src/**`) | exit 0 |
| `tsc --noEmit` (api) | exit 0 |
| `tsc --noEmit` (web) | exit 0 (unaffected, confirms no cross-workspace regression) |
| `jest` (full unit) | **223/223**, 31 suites (baseline 221 + 2 new) |
| `jest --config test/jest-e2e.json` (full e2e) | **51/51**, 9 suites (baseline 44 + 7 new) |
| `turbo run build --force` | 4/4 tasks succeeded, 0 cached (web build's own lint+typecheck pass included) |
| `docker build -f apps/api/Dockerfile .` | succeeded |
| `docker run` (real dev Postgres/Redis, `RATE_LIMIT_AUTH_LIMIT=5` override) | booted clean; `/api/health` → `database:up`, `redis:up (PONG)` |
| Live CORS check | allowed origin (`http://localhost:3000`) reflected; disallowed origin (`https://evil.example.com`) not reflected; OPTIONS preflight → `204`, `Access-Control-Allow-Methods: GET,POST,PATCH,DELETE,OPTIONS`, `Access-Control-Allow-Headers: Content-Type,Authorization` |
| Live rate-limit check | 5 requests to `/api/auth/login` (bad credentials) → `401` each; 6th → `429`; `/api/health` stayed `200` throughout |
| `docker compose -p phuquochub-place028-verify -f docker-compose.prod.yml config` | resolved cleanly, new env vars present with documented defaults — **no containers started**, isolated project name used throughout |
| Dev stack integrity | `phuquoc-postgres`/`-redis`/`-minio` confirmed healthy and untouched before and after; only `phuquochub_pg_data`/`_redis_data`/`_minio_data` volumes exist — no stray verification containers or volumes left behind |

## 7. Not claimed

- No NestJS or Next.js major-version migration (remains deferred, per PLACE-027).
- No distributed (Redis-backed) rate limiter — single-instance in-memory limiter; the limitation is
  documented in `docs/architecture/deployment.md`'s PLACE-028 addendum and does not block the
  current one-instance deployment shape.
- No real production CORS origin was provisioned or hardcoded — `CORS_ALLOWED_ORIGINS` remains an
  owner-supplied environment variable; the value shipped in `docker-compose.prod.yml` is this local
  prod-shaped stack's own `web` origin, not a real domain.

## 8. Governance state

Task completed. `docs/delivery/state.yaml` and `docs/delivery/workstreams/place.yaml` updated:
`current.task` reset to `none`, `PLACE-028` added to `completed_tasks`, implements `OD2-12`/`OD2-13`
(Eligible Candidate 3 — fully implemented). No PLACE-029 defined or started.
