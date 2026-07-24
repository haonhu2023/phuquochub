# PhuQuocHub — Production Release Readiness Assessment

- **Date:** 2026-07-24
- **Scope:** Repository-wide governance assessment, post-PLACE-025
- **Nature:** Governance decision, NOT an implementation task. No PLACE-026 was created. No runtime code was modified.
- **Repository:** `D:\Projects\PhuQuocHub` (branch `master`, HEAD `4ce7b81` at assessment start)
- **Method:** Read-only evidence gathering (state.yaml, all 25 PLACE task/report/evidence records, all findings, all 16 ADRs, README, architecture/security/deployment docs, CI workflow, source code for auth/config/logging/audit/health, `npm audit`) followed by evidence-based classification. No file was created except this governance record set.

---

## Phase 1 — Repository Authority Verification

| Check | Result | Evidence |
|---|---|---|
| All PLACE tasks completed | ✅ | `docs/delivery/tasks/PLACE-001.yaml`…`PLACE-025.yaml` — all `status: completed` in `state.yaml`'s `completed_tasks`/`proposed_tasks` |
| All Owner Decisions disposed | ✅ | `state.yaml.next_action.owner_decision_disposition`: OD-B1/B2/B3/B4/B7 implemented; OD-B5 accepted risk; OD-B6 deferred |
| No active implementation task | ✅ | `state.yaml.current.task: none`, `next_action.task_id: none` |
| No governance inconsistency severe enough to halt | ✅ (with 2 minor exceptions noted below) | see below |

**Verdict: no contradiction found that requires stopping.** The assessment proceeds.

### Minor governance-hygiene inconsistencies found (not halting, but recorded as findings)

1. **Task-file status lag.** `docs/delivery/tasks/PLACE-021.yaml`, `PLACE-022.yaml`, `PLACE-023.yaml` still read `status: authorized` in their own YAML, even though `state.yaml`'s `completed_tasks`/`proposed_tasks` (the authoritative record) and each task's own report/evidence index correctly say `COMPLETED`. PLACE-024 and PLACE-025 were correctly updated to `status: completed`. **Classification: Technical Debt** (self-consistency only; no risk to release).
2. **Stale cross-reference.** `state.yaml.verification_environment.highest_leverage_fix` still reads *"Obtain OWNER adjudication on GAP-05/10 … the sole outstanding release blocker"* — but GAP-05/10 was resolved by PLACE-021 on the same day this line was last touched (PLACE-020). **Classification: Technical Debt** (a stale pointer, not a functional problem).

---

## Phase 2 — Complete Issue Classification

Every issue discovered during this assessment is classified into exactly one of the six required categories. See the **Risk Register (Phase 5)** for the full, ID-tagged version; this table is the summary index.

| Category | Count | Items |
|---|---|---|
| **1. Production blocker** | 4 | R-01 no deployable artifact/pipeline; R-02 critical/high dependency vulnerabilities + no SCA scan; R-03 no rate limiting on fully public API; R-04 permissive CORS (`origin: true` + credentials) |
| **2. High-risk issue** | 5 | R-05 no monitoring/alerting/APM; R-06 insecure default DB credentials (silent, not fail-fast); R-07 zero test coverage for 4 planned modules (community/reviews/notifications/contributions — not built at all); R-08 verification workflow (ADR-008) not implemented at schema level; R-09 README.md materially overstates/understates project maturity (misleads onboarding & release judgment) |
| **3. Accepted risk** | 2 | AR-01 provisional Phú Quốc bounding box (OD-B5, owner-accepted 2026-07-24); AR-02 offset-only pagination at current data scale (OD-B1/ADR-010, owner-ratified) |
| **4. Technical debt** | 6 | TD-01 task-status field lag (PLACE-021/22/23); TD-02 stale `highest_leverage_fix` note; TD-03 `AppLoggerService` built but never wired (dead code); TD-04 422-vs-400 OpenAPI drift on non-list endpoints; TD-05 `packages/database` empty Prisma stub; TD-06 GAP-06/F-15 EXPLAIN/index-usage proof deferred (OD-B6) |
| **5. Enhancement** | 4 | E-01 correlation/request-ID propagation in logs; E-02 liveness/readiness health-endpoint split; E-03 HTTP response caching / CDN integration; E-04 coverage threshold gate in CI (`test:cov` exists but is never run) |
| **6. Future roadmap** | 4 | FR-01 AI features (ADR-012, superseded, none built — by design, not a gap); FR-02 Meilisearch/ES migration (search.md §12); FR-03 horizontal scaling / read replicas (architecture.md §10, deployment.md §14); FR-04 Community/Reviews/Notifications/Contributions product build-out |

Nothing remains unclassified.

---

## Phase 3 — Production Readiness by Area

For each area: current state → evidence → remaining risk → production impact → recommendation.

### Architecture
- **State:** Modular monolith (NestJS API + Next.js web), Repository Pattern strictly enforced (services never touch the ORM directly), 13 of 16 ADRs `Accepted`, 3 `Superseded` for legitimate reasons (search/AI moved to living docs, Prisma superseded by the ADR-013 addendum this session recorded).
- **Evidence:** `docs/99-decisions/decision-register.md`; `apps/api/src/modules/*/repositories/*.repository.ts`; ADR-013 addendum (PLACE-025).
- **Remaining risk:** Low. The architecture is coherent and consistently followed.
- **Production impact:** Positive — a released slice would be maintainable.
- **Recommendation:** No blocking action.

### Backend
- **State:** 21 module directories exist; **17 have real, tested implementation** (auth, authz, categories, contacts, events, geo, health, hotels, media, places, prices, rbac, restaurants, revisions, search, sources, tours, users); **4 are empty stubs** (`community`, `contributions`, `notifications`, `reviews` — `.gitkeep` only).
- **Evidence:** `find apps/api/src/modules -type f` (this assessment); `docs/delivery/workstreams/place.yaml`.
- **Remaining risk:** High for any release claiming full product scope; Low for a scoped "Place/Geo/Search/Auth" release.
- **Production impact:** A GA release implying the full PhuQuocHub vision (Wikipedia+Reddit+Maps) would ship with 4 major surfaces entirely missing.
- **Recommendation:** Owner must explicitly scope the release (see ODP v2, item OD2-1).

### Frontend
- **State:** Next.js App Router pages exist for places, hotels, restaurants, tours, events, search, map, dashboard, login/register — reasonably complete relative to backend coverage. Only **3 unit test files** exist for the entire web app (`lib/api.spec.ts`, `auth/api/auth.api.spec.ts`, `auth/session.spec.ts`); no component tests, no web e2e.
- **Evidence:** `find apps/web/src/app`; `find apps/web -name "*.spec.ts*"`.
- **Remaining risk:** Medium — UI regressions have almost no automated safety net.
- **Production impact:** Higher chance of undetected frontend regressions shipping.
- **Recommendation:** Technical debt / enhancement — not release-blocking for an API-first assessment, but should be tracked (see backlog B-06).

### Database
- **State:** PostgreSQL + PostGIS, TypeORM `synchronize:false`, 20 forward-only migrations, all applying cleanly (verified repeatedly, PLACE-019 through PLACE-025). `SnakeNamingStrategy`. TypeORM confirmed (PLACE-025) as the sole runtime persistence authority; Prisma is reference-only.
- **Evidence:** `apps/api/src/core/database/migrations/*.ts` (20 files); PLACE-025 report; live `psql` migration-table checks across sessions.
- **Remaining risk:** Low for schema soundness; the ADR-008 verification workflow tables (`verifications`, `verification_events`, `verification_votes`) are designed in `database.md` but **not migrated** — only a cached `verification_status` enum column exists on `places`.
- **Production impact:** No community trust/verification workflow can function beyond a single cached status flag.
- **Recommendation:** Technical/product decision — build the verification schema before claiming "verified place" as a user-facing feature (backlog B-08).

### Redis
- **State:** `RedisService` wraps `ioredis`; used for health-check (`PING`) and geocode cache-aside (24h TTL). No session storage, no rate-limiting use, no queue (BullMQ, as designed in `deployment.md §6.5`, is not implemented).
- **Evidence:** `apps/api/src/core/redis/redis.service.ts`; `apps/api/src/modules/geo/geo.service.ts`.
- **Remaining risk:** Low for what's implemented; the designed use cases (rate-limit, queue) are simply not built yet.
- **Production impact:** None for current functionality; matters once rate-limiting or async jobs are needed.
- **Recommendation:** Future roadmap (FR — BullMQ) / Production blocker (rate-limiting — see Security below).

### Authentication
- **State:** JWT access+refresh via `@nestjs/jwt`, global `JwtAuthGuard` (`APP_GUARD`), `@Public()` escape hatch, fail-fast env validation (`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` required, `min(16)` via Joi, `abortEarly:false`).
- **Evidence:** `apps/api/src/modules/auth/*`; `apps/api/src/core/config/env.validation.ts`; `apps/api/src/modules/auth/auth.module.ts:32-33`.
- **Remaining risk:** Low. Email verification/reset-password flows are explicitly deferred (README, by design — token entity not yet approved).
- **Production impact:** Solid for what's built; password-reset UX gap for real users.
- **Recommendation:** No blocking action for the current scope; track password-reset as roadmap.

### Authorization
- **State:** RBAC with role inheritance (DAG), deny-by-default `PermissionsGuard`, explicit-deny-wins semantics, wildcard support. F-24 hardening (PLACE-022) added a **mutation-checked architecture test** proving no `@Public` route can reach the privileged unfiltered card-fetch method.
- **Evidence:** `apps/api/src/modules/authz/*`; `apps/api/src/modules/places/places-privileged-access.arch.spec.ts`.
- **Remaining risk:** Low. This is one of the most rigorously tested areas in the repository.
- **Production impact:** Positive.
- **Recommendation:** No blocking action.

### Validation
- **State:** Global `ValidationPipe({whitelist, transform, forbidNonWhitelisted})`; consistently applied; PLACE-021 reconciled the documented error code for list-pagination (422→400, matching runtime).
- **Evidence:** `apps/api/src/main.ts:19-21`; PLACE-021 report.
- **Remaining risk:** Low-medium — the same 422-vs-400 documentation drift likely exists on other (non-list) endpoints; this was explicitly flagged as **out of scope** for PLACE-021 and not yet fixed elsewhere.
- **Production impact:** Cosmetic (client-facing error-code documentation mismatch), not a functional defect.
- **Recommendation:** Technical debt (backlog B-04).

### OpenAPI
- **State:** `docs/api/openapi.yaml` exists, is hand-maintained, and was reconciled for list-pagination and search (PLACE-021, PLACE-024). No automated contract-test-vs-implementation CI gate exists — reconciliation has been done manually, task by task.
- **Evidence:** `docs/api/openapi.yaml`; PLACE-017/021/024 reports.
- **Remaining risk:** Medium — without an automated OpenAPI-vs-runtime consistency check in CI, drift will recur endpoint by endpoint as new work lands.
- **Production impact:** External API consumers (per ADR-010's Public/Partner channel design) would face an unreliable contract over time.
- **Recommendation:** Enhancement — add an automated contract-diff check to CI (backlog B-05).

### Documentation
- **State:** Mixed and important to distinguish by layer:
  - **Delivery governance docs** (`docs/delivery/**`): exceptional — 25 tasks, each with a task file, execution report, and evidence index; every claim traceable to a command or file. This is materially better than most production codebases.
  - **`README.md`**: **materially stale.** It claims the environment/build/test suite has *"chưa được chạy... chưa verify"* (never run/never verified) — false; extensively verified since PLACE-019. It claims Hotel/Restaurant/Tour, WikiRevision, and the web map are *"chưa bắt đầu"*/missing — false; all three are implemented and tested (verified this session by direct file count).
  - **`docs/architecture/deployment.md`**: self-declares *"chỉ thiết kế... không code"* (design only, no code) — accurately describes itself as 100% aspirational.
- **Evidence:** `README.md:6-13,76`; `docs/architecture/deployment.md:3`; direct module/page inventories (this assessment).
- **Remaining risk:** High for anyone using README as an onboarding or release-readiness signal — it would lead them to badly underestimate what exists and badly overestimate how unverified it is (i.e., wrong in both directions).
- **Production impact:** A release decision-maker skimming only the README would reach the wrong conclusion in both directions.
- **Recommendation:** High-risk issue (R-09) — README should be resynchronized before any release communication (backlog B-01).

### Monitoring
- **State:** None implemented. `deployment.md §12` designs seven monitoring domains (infra/DB/API/queue/AI/search/storage) against Prometheus/Grafana/Sentry — none are wired into the code or provisioned.
- **Evidence:** `docs/architecture/deployment.md §12`; no Prometheus/Grafana/Sentry dependency anywhere in `package.json`.
- **Remaining risk:** High — a production incident would be invisible until a user reports it.
- **Production impact:** No golden-signal (Rate/Errors/Duration) visibility, no alerting.
- **Recommendation:** High-risk issue (R-05) — must exist before any real user traffic (backlog B-02).

### Logging
- **State:** `LoggingInterceptor` logs one line per HTTP request (method/url/status/duration, no body/PII). `AllExceptionsFilter` logs 5xx with stack traces. A well-designed `AppLoggerService` with key-redaction (`password`, `token`, `secret`, etc.) exists **but is never wired as the actual Nest logger** — confirmed dead code (only self-referenced).
- **Evidence:** `apps/api/src/common/interceptors/logging.interceptor.ts`; `apps/api/src/core/logger/app-logger.service.ts`; `grep -rln AppLoggerService apps/api/src` → only its own file + module.
- **Remaining risk:** Medium — logging works today via plain Nest `Logger` output to stdout; no centralized aggregation, no correlation ID across a request's log lines.
- **Production impact:** Debugging a production incident would require reading raw container stdout with no cross-service trace correlation.
- **Recommendation:** Technical debt (TD-03, wire or remove the dead logger) + Enhancement (E-01, correlation IDs) — backlog B-03.

### Configuration
- **State:** `ConfigModule.forRoot({isGlobal:true, validationSchema: envValidationSchema, validationOptions:{abortEarly:false}})` — Joi-validated, fails fast for missing/invalid JWT secrets.
- **Evidence:** `apps/api/src/core/config/config.module.ts`; `env.validation.ts`.
- **Remaining risk:** Medium — `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` all have **permissive Joi `.default()` values** (`phuquoc`/`phuquoc`) rather than `required()`. A misconfigured production deploy would **silently** connect using well-known dev credentials rather than failing to start.
- **Production impact:** A real, if narrow, misconfiguration-masking risk.
- **Recommendation:** High-risk issue (R-06) — make DB credentials `required()` with no default in production, or a `NODE_ENV`-conditional schema (backlog B-09).

### Secrets management
- **State:** Purely `.env`-file based; `.env.example` documents keys with placeholder/dev values; `.gitignore` excludes `.env`; CI injects inline placeholder secrets for its own e2e job (fine, CI-only). No secret-manager (Vault, GitHub Environments-as-configured, cloud KMS) integration exists or has been verified.
- **Evidence:** `.env.example`; `.gitignore`; `.github/workflows/ci.yml` env block.
- **Remaining risk:** Medium — acceptable for the current stage, but `deployment.md §8`'s design (GitHub Environments + periodic rotation) is unimplemented.
- **Production impact:** Manual secret handling on any real deploy; no rotation process exists.
- **Recommendation:** Deferred until deployment work begins (tracked under B-02/deployment backlog).

### Environment variables
- **State:** `.env.example` is reasonably complete and documents Sprint markers (e.g., "S3 — used from Sprint 5"). `NEXT_PUBLIC_API_URL` documented for web.
- **Evidence:** `.env.example`.
- **Remaining risk:** Low.
- **Production impact:** None currently.
- **Recommendation:** No blocking action.

### Deployment
- **State:** **Not implemented at all.** No `Dockerfile` anywhere in the repository. `docker-compose.yml` only orchestrates *dependencies* (Postgres, Redis, MinIO) — it does not build or run the `api`/`web` application. `infrastructure/nginx/` and `infrastructure/k8s/` contain only `.gitkeep`. No VPS is provisioned; no domain/TLS/Cloudflare configuration exists in-repo. `deployment.md` explicitly self-labels as *design only*.
- **Evidence:** `find . -iname "Dockerfile*"` → empty; `docker-compose.yml` (3 services: postgres/redis/minio only); `infrastructure/{nginx,k8s}/.gitkeep`; `docs/architecture/deployment.md:3,15`.
- **Remaining risk:** **Maximum.** There is currently no way to produce or run a deployable production artifact.
- **Production impact:** A release cannot physically happen today regardless of code quality.
- **Recommendation:** **Production blocker (R-01).** This is the single most decisive finding of this assessment (backlog B-02, top priority).

### Rollback
- **State:** Not testable — there is nothing deployed to roll back from. `deployment.md §9` designs blue-green + image-tag rollback conceptually; none of it is built.
- **Evidence:** Same as Deployment above.
- **Remaining risk:** Maximum, but derivative of the Deployment blocker.
- **Production impact:** No rollback mechanism exists because no deployment mechanism exists.
- **Recommendation:** Production blocker (same root cause as R-01).

### Testing
- **State:** For implemented backend modules: **excellent.** 221 unit tests / 44 e2e tests, all green (verified live this session — repeated across PLACE-021 through PLACE-025 with identical totals proving zero regression). Deterministic-ordering mutation checks exist (PLACE-004, PLACE-015, PLACE-023). Architecture-level enforcement tests exist (PLACE-009, PLACE-022). e2e runs against real PostGIS+Redis, not mocks.
- **Evidence:** direct `jest` runs during PLACE-021→025 (this session); `apps/api/test/*.e2e-spec.ts` (8 suites).
- **Remaining risk:** Zero coverage for the 4 unbuilt modules (expected, since they don't exist); minimal frontend coverage (3 spec files); no load/performance testing anywhere.
- **Production impact:** High confidence in the implemented backend slice; no confidence in frontend regressions or performance under load.
- **Recommendation:** No blocking action for backend; frontend/perf testing tracked as debt/enhancement.

### Coverage
- **State:** `apps/api/package.json` defines `test:cov` (`jest --coverage`) and Jest is configured with `collectCoverageFrom: ["**/*.(t|j)s"]`. **CI never invokes `test:cov`** — coverage is never measured or gated in the pipeline that actually runs on every push/PR.
- **Evidence:** `.github/workflows/ci.yml` (only `npm test`, never `test:cov`); `apps/api/package.json`.
- **Remaining risk:** Medium — coverage regressions would go undetected indefinitely.
- **Production impact:** No quantified confidence number exists; test count (221/44) is a proxy, not a coverage percentage.
- **Recommendation:** Enhancement (E-04) — add a coverage gate to CI (backlog B-07).

### Build reproducibility
- **State:** Excellent. `turbo run build --force` with a purged `tsconfig.build.tsbuildinfo` has been run and verified clean at least 5 times across PLACE-021 through PLACE-025, always producing `153` compiled files matching `153` non-spec source files, `dist/main.js`+`dist/app.module.js`+`dist/core/` present, `apps/web/.next` present, zero spec leakage into `dist`.
- **Evidence:** PLACE-021→025 evidence indices (verification ladder tables).
- **Remaining risk:** Low.
- **Production impact:** Positive — the build is provably deterministic and clean.
- **Recommendation:** No blocking action.

### Caching
- **State:** Redis cache-aside for geocode lookups only (24h TTL, fails open on Redis error). No HTTP response caching, no CDN (Cloudflare, as designed in `deployment.md §6.7`, not provisioned).
- **Evidence:** `apps/api/src/modules/geo/geo.service.ts:64-106`.
- **Remaining risk:** Low for current scale (49 seeded places); would matter at the 100k-MAU target `deployment.md §10` describes.
- **Production impact:** None today; a scaling concern later.
- **Recommendation:** Future roadmap (FR-03).

### Performance
- **State:** No load testing evidence anywhere in the repository. `deployment.md §10`'s capacity sizing (RPS, DB size, media volume) is a **theoretical estimate**, explicitly labeled "điểm khởi đầu có headroom" (a starting point with headroom) — not measured against the real implementation.
- **Evidence:** `docs/architecture/deployment.md §10`; absence of any load-test tool/config in the repo.
- **Remaining risk:** Unknown — genuinely untested.
- **Production impact:** Cannot be assessed from repository evidence alone.
- **Recommendation:** Future roadmap / pre-launch requirement once deployment exists.

### Security
- **State (mixed):**
  - ✅ JWT + global guards + deny-by-default RBAC, extensively tested.
  - ✅ Input validation consistently enforced (`whitelist`+`forbidNonWhitelisted`).
  - ✅ Audit logging for privileged state changes (`AuditService`, ADR-016) with PII/secret redaction.
  - ❌ **No rate limiting anywhere** — despite `security.md §1.3` naming "rate limit, CORS" as a defense-in-depth layer, no `@nestjs/throttler` or equivalent exists in any `package.json`. Every public read endpoint (`/places`, `/search`, `/geo/*`) is fully unthrottled.
  - ❌ **CORS is permissive:** `app.enableCors({ origin: true, credentials: true })` — reflects any origin while allowing credentialed requests. This is a real production security anti-pattern.
  - ❌ **1 critical + 6 high + 10 moderate `npm audit` findings** in production dependencies (see Coverage/Repository-hygiene evidence below); no automated dependency scan runs anywhere.
  - ⚠️ DB credentials have insecure silent defaults (see Configuration above).
- **Evidence:** `apps/api/src/main.ts:18-21`; `docs/architecture/security.md §1,§10`; `npm audit --omit=dev` (this assessment: 17 vulnerabilities, 1 critical/`tar`, 6 high including `@nestjs/platform-express`, `next`, `multer`, `lodash`).
- **Remaining risk:** **High to Critical.**
- **Production impact:** Direct exposure to abuse (unthrottled public endpoints), cross-origin credential leakage risk, and known-exploitable dependency versions.
- **Recommendation:** **Production blockers R-02 (dependency vulnerabilities + no scanning), R-03 (no rate limiting), R-04 (permissive CORS).** Top priority alongside deployment.

### Error handling
- **State:** `AllExceptionsFilter` normalizes every error to `{success:false, error:{code,message,details}, meta}`; 5xx logged server-side with stack trace, never leaked to the client; validation errors mapped to a structured `details` array.
- **Evidence:** `apps/api/src/common/filters/all-exceptions.filter.ts`.
- **Remaining risk:** Low.
- **Production impact:** Positive.
- **Recommendation:** No blocking action.

### Observability
- **State:** Effectively the union of Monitoring + Logging above: request-level access logs and a health endpoint exist; no metrics, no tracing/APM, no dashboards, no alerting.
- **Evidence:** as above.
- **Remaining risk:** High.
- **Production impact:** An incident would be diagnosed by manually reading container logs after the fact.
- **Recommendation:** High-risk issue (R-05), same remediation as Monitoring.

### Scalability
- **State:** API is designed stateless (JWT, no server-side session store found); `deployment.md §14` describes a 3-stage scaling path (single VPS → read replica + stateless horizontal scale → managed services/Meilisearch/vector DB) as a **future roadmap**, not current work.
- **Evidence:** `docs/architecture/deployment.md §14`; `docs/architecture/architecture.md §10`.
- **Remaining risk:** Low today (current data volume is tiny — 49 seeded places); the design is sound in principle but entirely unverified under load.
- **Production impact:** None at current scale.
- **Recommendation:** Future roadmap (FR-03).

### Developer experience
- **State:** One of the strongest areas. Clear root scripts, `.env.example`, `docker compose up -d postgres redis minio` one-liner, `ENVIRONMENT-SETUP-RUNBOOK.md`, rich ADRs + Data Dictionary, and an exceptionally rigorous delivery-governance trail (every PLACE task has a report + evidence index citing exact commands and outputs).
- **Evidence:** `README.md`; `docs/delivery/ENVIRONMENT-SETUP-RUNBOOK.md`; the 25-task delivery record itself.
- **Remaining risk:** Low, aside from the README staleness noted above (a DX issue for new contributors specifically).
- **Production impact:** N/A (internal quality-of-life).
- **Recommendation:** No blocking action beyond README resync (already tracked as R-09/B-01).

### Repository hygiene
- **State:** `.gitignore` correctly excludes `node_modules/`, `dist/`, `.next/`, `.turbo/`, `coverage/`, `.env*` (except `.env.example`); no secrets found committed at any point across this session's extensive `git diff`/`git status` reviews (PLACE-020 through PLACE-025 all explicitly scanned for this); git history is clean, meaningful, and grouped by concern.
- **Evidence:** `.gitignore`; every PLACE-0xx evidence index's "scope" and "secret scan" sections.
- **Remaining risk:** Low — only the two minor task-status/stale-note items noted in Phase 1.
- **Production impact:** None.
- **Recommendation:** Technical debt only (TD-01, TD-02).

### CI/CD
- **State:** CI (`build-test` + `e2e` jobs) is real, verified, and matches what this session independently reproduced (lint→typecheck→build→unit, then a separate Postgres+Redis-backed e2e job with real migrations). **There is no CD.** `deployment.md §7`'s designed pipeline (Lint→Test→Build→**Scan**→**Push**→**Deploy**→**Smoke**) is only ~40% implemented — the first three steps exist; Scan/Push/Deploy/Smoke do not exist anywhere in `.github/workflows/`.
- **Evidence:** `.github/workflows/ci.yml` (full read, this assessment); `docs/architecture/deployment.md §7`.
- **Remaining risk:** High for release execution (no automated path to any environment) and Medium for security (no scan step, consistent with the `npm audit` finding above going undetected).
- **Production impact:** Every deploy today would have to be manual, unscripted, and unverified by tooling.
- **Recommendation:** Production blocker (same root cause as R-01/R-02).

### Infrastructure assumptions
- **State:** `deployment.md` assumes a single Hostinger VPS behind Cloudflare, PgBouncer, WAL archiving/PITR, MinIO or R2, and a Prometheus/Grafana/Sentry monitoring stack — **§15 of that document itself lists 9 unresolved pre-production decisions** (VPS size, media storage choice, PITR confirmation, offsite backup location, monitoring stack choice, registry choice, tile provider, blue-green vs. maintenance window, AI budget threshold). None of the 9 has been decided; none of the infrastructure is provisioned.
- **Evidence:** `docs/architecture/deployment.md §15`.
- **Remaining risk:** Maximum — these are foundational choices that gate everything else in Deployment.
- **Production impact:** Cannot proceed to any real environment without these decisions.
- **Recommendation:** Owner Decision Package v2 (this assessment carries these 9 items forward, see below) — production blocker until decided.

---

## Phase 4 — Release Gates

| Gate | Status | Evidence | Remediation if unsatisfied |
|---|---|---|---|
| Build | ✅ Satisfied | `turbo run build --force` 4/4 repeatedly, tsbuildinfo purged, 153==153 artifacts | — |
| Lint | ✅ Satisfied | `eslint --max-warnings=0` exit 0, every PLACE task | — |
| Typecheck | ✅ Satisfied | `tsc --noEmit` exit 0 (api + web), every PLACE task | — |
| Unit tests | ✅ Satisfied | 221/221, 30 suites, repeatedly reverified | — |
| Integration/e2e tests | ✅ Satisfied | 44/44, 8 suites, against real Postgres/PostGIS/Redis | — |
| Migrations | ✅ Satisfied | 20 migrations apply cleanly and repeatably; verified live (`psql` migrations table) multiple sessions | — |
| Startup | ✅ Satisfied | Production build (`node dist/main.js`) boots and serves successfully, verified 5+ times | — |
| Health endpoint | ✅ Satisfied | `/api/health` → 200, `database:up`, `redis:up (PONG)` | — |
| OpenAPI consistency | ⚠️ Partial | list-pagination + search reconciled (PLACE-021/024); other endpoints' 422-vs-400 drift unaddressed | Automated contract-diff in CI (B-05) |
| Documentation | ⚠️ Partial | Delivery docs excellent; README stale; deployment doc is 100% design-only by its own declaration | Resync README (B-01); scope deployment work |
| Runtime verification | ✅ Satisfied | End-to-end verified locally (build→boot→health→db→redis) repeatedly | — |
| Rollback capability | ❌ **Not satisfied** | No deployed artifact/environment exists to roll back from | Build Dockerfile + deploy pipeline first (B-02) |
| Deployment reproducibility | ❌ **Not satisfied** | No Dockerfile, no deploy job, no provisioned environment | Same (B-02) |
| Dependency security | ❌ **Not satisfied** | 1 critical + 6 high + 10 moderate `npm audit` findings; no CI scan step | Upgrade + add SCA gate (B-02a) |
| Rate limiting | ❌ **Not satisfied** | No throttling on any public endpoint | Add `@nestjs/throttler` or Redis-based limiter (B-02b) |
| CORS policy | ❌ **Not satisfied** | `origin: true` + `credentials: true` in all environments | Environment-scoped allow-list (B-02c) |
| Monitoring/alerting | ❌ **Not satisfied** | Nothing wired | Minimum viable stack before real traffic (B-02) |

**Gates satisfied: 11 of 17. Gates failed: 6 of 17 — all in the deployment/security/observability cluster.**

---

## Phase 5 — Risk Register

### Production blockers (release-blocking)

| ID | Title | Description | Probability | Impact | Mitigation | Owner | Blocking? |
|---|---|---|---|---|---|---|---|
| R-01 | No deployable artifact or pipeline | No Dockerfile anywhere; `docker-compose.yml` only orchestrates dependencies; `infrastructure/nginx`/`k8s` are empty; no CD job in CI | Certain (already true) | Total — cannot release | Build Dockerfile(s), a deploy CI job, and provision a target environment | Engineering + Owner (infra decisions) | **YES** |
| R-02 | Dependency vulnerabilities, no scanning | `npm audit`: 1 critical (`tar`), 6 high (`@nestjs/platform-express`, `next`, `multer`, `lodash`, `postcss`, `@mapbox/node-pre-gyp`), 10 moderate; CI runs no SCA step | Certain (already true) | High — known exploitable versions in a public-facing stack | Upgrade dependencies (NestJS 11.x path, Next.js patch), add `npm audit`/SCA gate to CI | Engineering | **YES** |
| R-03 | No rate limiting on public API | Every read endpoint (`/places`, `/search`, `/geo/*`) is unauthenticated and unthrottled | High (will be hit once public) | High — DoS/scrape/abuse exposure | Add `@nestjs/throttler` or Redis-based limiter at minimum on public routes | Engineering | **YES** |
| R-04 | Permissive CORS with credentials | `enableCors({ origin: true, credentials: true })` reflects any origin while allowing credentials | Medium-High | Medium-High — CSRF-adjacent cross-origin credential exposure | Environment-scoped allow-list for production | Engineering | **YES** |

### High-risk issues (strongly recommended before GA, not all individually blocking)

| ID | Title | Description | Probability | Impact | Mitigation | Owner | Blocking? |
|---|---|---|---|---|---|---|---|
| R-05 | No monitoring/alerting/APM | Zero metrics, tracing, dashboards, or alerts anywhere in the stack | Certain | High — incidents are invisible until reported by users | Minimum viable stack (uptime check + error tracking) before real traffic | Engineering + Owner (tool choice) | Recommended pre-GA |
| R-06 | Insecure default DB credentials | `DB_PASSWORD`/`DB_USER` default to `phuquoc`/`phuquoc` via Joi `.default()` rather than failing fast | Low-Medium (requires misconfiguration) | High if it occurs | Make DB credentials `required()` with no default, or `NODE_ENV`-conditional | Engineering | Recommended pre-GA |
| R-07 | Four planned modules entirely unbuilt | `community`, `contributions`, `notifications`, `reviews` are `.gitkeep`-only stubs | Certain (already true) | Depends entirely on release scope | Owner must explicitly scope the release (ODP v2 OD2-1) | Owner | Blocking **only if** full-product GA is claimed |
| R-08 | Verification workflow not implemented | ADR-008's `verifications`/`verification_events`/`verification_votes` tables don't exist; only a cached enum column does | Certain (already true) | Medium — "verified" is currently just a static badge with no workflow behind it | Build the schema + workflow, or explicitly scope it out of v1 | Owner + Engineering | Blocking **only if** "verification" is claimed as a v1 feature |
| R-09 | README materially stale | Understates verification status (claims never-verified when extensively verified) and understates feature completeness (claims Hotel/Restaurant/Tour/WikiRevision/map "not started" when implemented) | Certain (already true) | Medium — misleads onboarding and release judgment in both directions | Resync README with actual state | Engineering | Recommended pre-GA (not functionally blocking) |

### Accepted risks (owner has already decided; not blocking)

| ID | Title | Decision reference | Disposition |
|---|---|---|---|
| AR-01 | Provisional Phú Quốc bounding box, not authoritative | OD-B5 (B5-B), 2026-07-24 | Accepted as a documented GA caveat; softened behavior (warn, not reject) already implemented (PLACE-016) |
| AR-02 | Offset-only pagination (no cursor), current scale | OD-B1 (B1-A) + ADR-010 Accepted, 2026-07-24 | Ratified as the v1 contract; cursor explicitly deferred to a future major version if ever needed |

### Deferred risks

| ID | Title | Reference | Disposition |
|---|---|---|---|
| DR-01 | GAP-06/F-15 — EXPLAIN/index-usage proof for `idx_places_status_active` | OD-B6 (B6-A), 2026-07-24 | Deferred to a future performance task at representative data scale; explicitly non-blocking at current volume (49 rows) |

### Technical debt

| ID | Title | Effort estimate |
|---|---|---|
| TD-01 | PLACE-021/022/023 task-file `status:` field lag vs. `state.yaml` | Minutes |
| TD-02 | Stale `verification_environment.highest_leverage_fix` note in `state.yaml` | Minutes |
| TD-03 | `AppLoggerService` built (with PII redaction) but never wired as the actual Nest logger | Hours |
| TD-04 | 422-vs-400 OpenAPI documentation drift on non-list endpoints | Hours–1 day |
| TD-05 | `packages/database` empty Prisma-stub directory (`.gitkeep` only) | Minutes (archive or delete, owner's call per ADR-013 addendum) |
| TD-06 | GAP-06/F-15 EXPLAIN evidence deferred (see DR-01) | Hours, needs representative data first |

### Enhancements

| ID | Title | Effort estimate |
|---|---|---|
| E-01 | Correlation/request-ID propagation through logs | 1–2 days |
| E-02 | Liveness vs. readiness health-endpoint split (`/health` vs `/health/ready`) | Hours |
| E-03 | HTTP response caching / CDN integration | Days (depends on Cloudflare provisioning) |
| E-04 | Coverage threshold gate in CI (`test:cov` exists, never invoked) | Hours |

### Future roadmap (explicitly not gaps — never promised for this phase)

| ID | Title | Reference |
|---|---|---|
| FR-01 | AI features | ADR-012 (Superseded, tracked in `docs/ai/ai-architecture.md`) |
| FR-02 | Meilisearch/Elasticsearch migration | `docs/architecture/search.md §12` |
| FR-03 | Horizontal scaling / read replicas / stateless multi-instance | `deployment.md §14`, `architecture.md §10` |
| FR-04 | Community/Reviews/Notifications/Contributions product build-out | Wave 2+ per README's own (accurate, for these four) roadmap framing |

---

## Phase 6 — Release Recommendation

# **E. NOT READY**

### Justification (repository evidence only)

1. **There is no way to produce or deploy a production artifact today.** No `Dockerfile` exists anywhere in the repository; `docker-compose.yml` only orchestrates dependencies (Postgres/Redis/MinIO), never the application itself; `infrastructure/nginx/` and `infrastructure/k8s/` contain only `.gitkeep`; CI has zero deploy/CD steps. This alone makes any release — even to staging — physically impossible without additional engineering work that does not exist in the repository today.
2. **A critical-severity dependency vulnerability is currently present** in production dependencies (`npm audit`: 1 critical, 6 high, 10 moderate), and no automated scanning exists to catch it or future regressions.
3. **The public API has no rate limiting and permissive CORS**, both concrete, currently-exploitable security gaps on a fully public read surface.
4. **No monitoring, alerting, or centralized logging exists.** A production incident would be invisible until reported by an end user.
5. **The delivery governance framework's own gates have never claimed readiness.** After 25 completed tasks, `state.yaml.gates` still reads `implementation: in_progress`, `testing: in_progress`, `deployment: not_started`, `canary: not_started`, `hypercare: not_started`, `stabilization: not_started`. This is the project's own conservative, evidence-driven self-assessment — this report does not need to override it, only confirm it remains accurate.
6. **Four planned product surfaces (Community, Reviews, Notifications, Contributions) are entirely unbuilt**, and the ADR-008 verification workflow exists only as a cached status column, not the designed exclusive-arc entity + audit-trail + community-vote system. Whether this matters depends entirely on release *scope*, which has not yet been decided by the owner (see Owner Decision Package v2).

**What is genuinely strong and should not be lost in this verdict:** the implemented backend slice (Auth, RBAC, Place, Geo, Search, Categories, Users, Hotels, Restaurants, Tours, Sources, Revisions, Media, Prices, Contacts, Audit) is extensively tested (221 unit + 44 e2e, all green, deterministic, mutation-checked in multiple places), builds cleanly and reproducibly, and has been repeatedly verified end-to-end against real infrastructure. **The code that exists is release-quality for what it covers.** The blockers are entirely in deployment infrastructure, security hardening, and product-scope decisions — none of them require redoing any of the 25 PLACE tasks' work.

---

## Phase 8 — Not Approved: See Companion Documents

Per instruction, no PLACE-026 or implementation task is created. Two companion governance documents are produced instead:

1. **`docs/delivery/reports/PRODUCTION-READINESS-BACKLOG-2026-07-24.md`** — priority-ordered remediation backlog (rationale, evidence, effort, dependencies, release impact per item).
2. **`docs/delivery/decisions/OWNER-DECISION-PACKAGE-V2-2026-07-24.md`** — owner decisions required before the backlog can be authorized as tasks (release scope, deployment infrastructure choices carried forward from `deployment.md §15`, and new items this assessment discovered).

---

## Phase 9 — Final Report

1. **Repository maturity:** High for the delivered backend slice (rigorous governance, deep test coverage, deterministic builds); Low-to-none for four planned product surfaces (not started) and for deployment/operations tooling (not started).
2. **Production readiness score (qualitative):** **Code quality: 8.5/10** (for what's implemented) · **Operational readiness: 2/10** (no deploy path, no monitoring) · **Security posture: 5/10** (strong AuthN/AuthZ, but critical dependency vuln + no rate limiting + permissive CORS) · **Overall: NOT READY.**
3. **Release blockers:** R-01 (no deploy pipeline), R-02 (critical/high CVEs + no scanning), R-03 (no rate limiting), R-04 (permissive CORS). See Phase 5.
4. **Accepted risks:** AR-01 (provisional bbox), AR-02 (offset pagination) — both owner-decided 2026-07-24, not blockers.
5. **Deferred work:** DR-01 (GAP-06/F-15 EXPLAIN proof) — non-blocking, deferred to scale.
6. **Technical debt:** TD-01…TD-06 — six items, all low-to-medium effort, none release-blocking on their own.
7. **Architecture health:** Strong. 13/16 ADRs Accepted, Repository Pattern consistently enforced, TypeORM authority unambiguous (PLACE-025).
8. **Documentation health:** Bifurcated — delivery governance docs are excellent and traceable; `README.md` is materially stale in both directions; `deployment.md` is candidly self-labeled as design-only.
9. **Testing health:** Excellent for implemented modules (221 unit + 44 e2e, deterministic, mutation-checked); zero for unbuilt modules (expected); minimal for frontend; no coverage percentage measured in CI; no performance testing anywhere.
10. **Operational readiness:** Very low. No deployment mechanism, no monitoring, no alerting, no tested rollback, no provisioned environment of any kind.
11. **Deployment readiness:** Not ready — no Dockerfile, no CD pipeline, 9 unresolved infrastructure decisions from `deployment.md §15` outstanding.
12. **Final release recommendation:** **E. NOT READY.**
13. **Exact next governance action:** The owner must review and adjudicate **Owner Decision Package v2** (release scope + 9 carried-forward infrastructure decisions + 3 new security/config decisions this assessment raised). Once decided, the **Production Readiness Backlog** items it authorizes should be executed as scoped engineering tasks (numbering to resume at PLACE-026 only once the owner explicitly authorizes specific backlog items — not before, and not as a blanket resumption).

---

*This assessment modified no runtime code, no schema, no migration, no API contract, and no test. It produced exactly three new governance documents (this report, the backlog, and Owner Decision Package v2) and no PLACE-026.*
