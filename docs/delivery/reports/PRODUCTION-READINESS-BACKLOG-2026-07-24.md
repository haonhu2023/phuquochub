# PhuQuocHub — Production Readiness Backlog

- **Date:** 2026-07-24
- **Supersedes:** the initial draft of this same document (first version, same date) — refined to the stricter schema below. Original item IDs (`B-01`…`B-17`) are preserved as cross-references inside each item so `OWNER-DECISION-PACKAGE-V2-2026-07-24.md`'s existing `Blocks: B-XX` references remain resolvable.
- **Source:** `PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md` (release recommendation: **E. NOT READY**) — Phase 2 issue classification, Phase 3 area-by-area evaluation, Phase 5 risk register.
- **Status:** Planning and governance deliverable only. **No item here is authorized as an implementation task. No PLACE-026 (or any PLACE task) exists or is created by this document.**
- **Method:** Every item below traces to a specific finding already recorded in the assessment (risk-register ID `R-*`/`AR-*`/`DR-*`/`TD-*`/`E-*`/`FR-*`, or a named recommendation in the assessment's Phase 3 area evaluations). No new issue was invented; overlapping items from the assessment's risk register and the prior backlog draft were merged (see "Merges" note on each item where applicable).

---

## Phase 1 — Collected findings (dedup / merge record)

The assessment's risk register named 21 distinct concerns (`R-01`…`R-09`, `AR-01`…`AR-02`, `DR-01`, `TD-01`…`TD-06`, `E-01`…`E-04`, `FR-01`…`FR-04`) plus several area-level recommendations in Phase 3 (OpenAPI contract automation, frontend test coverage, BullMQ). After merging duplicates and grouping items that share one remediation:

| Merge | Combined into | Reason |
|---|---|---|
| `TD-03` (dead `AppLoggerService`) + `E-01` (correlation IDs) | **PRB-010** | Both are the same "logging quality" remediation; assessment itself noted E-01 "should land before or alongside" the logger fix. |
| `R-07` (4 unbuilt modules) + `FR-04` (Community/Reviews/Notifications/Contributions build-out) | **PRB-009** | `FR-04` is the roadmap-level restatement of the same gap `R-07` names as a current-state fact. |
| `TD-06` + `DR-01` (GAP-06/F-15 EXPLAIN proof) | **PRB-024** | Same item, named twice in the assessment (once as technical debt, once as a deferred risk). |
| Assessment's "Caching" Phase-3 recommendation + backlog draft's `B-14`/`E-03` | **PRB-019** | The assessment's Caching section and its Enhancement-category listing described the same HTTP-caching/CDN gap. |

`AR-01` (provisional Phú Quốc bbox) and `AR-02` (offset pagination) are **owner-accepted decisions, not open backlog items** — they require no further engineering action and are excluded from the prioritized list below (see "Already-resolved, not backlog items" at the end).

**Total unique backlog items after merge: 24** (`PRB-001`…`PRB-024`).

---

## Phase 2 — Priority scheme applied

| Priority | Meaning | Count |
|---|---|---|
| **P0** | Release blocker | 4 |
| **P1** | Must complete before public launch | 5 (2 conditional on a scope decision) |
| **P2** | Should complete soon after launch | 5 |
| **P3** | Improvement | 4 |
| **P4** | Long-term roadmap | 6 |

Every item below has exactly one priority. Two items (`PRB-008`, `PRB-009`) carry a **conditional** priority because their correct tier depends on an undecided release-scope choice (`OD2-1` in the Owner Decision Package) — this is stated explicitly on those items, not left ambiguous.

---

## Phase 3 — Engineering Backlog

### P0 — Release blockers

#### PRB-001 — Build a deployable artifact and CI/CD pipeline
- **Category:** Deployment / Infrastructure
- **Rationale:** No way exists today to produce or ship a production build to any environment.
- **Repository evidence:** `find . -iname "Dockerfile*"` → no results; `docker-compose.yml` defines only `postgres`/`redis`/`minio` (no `api`/`web` service); `infrastructure/nginx/`, `infrastructure/k8s/` contain only `.gitkeep`; `.github/workflows/ci.yml` has `build-test` and `e2e` jobs only, no deploy job. (Assessment Phase 3 "Deployment"; risk `R-01`.)
- **Affected modules:** Repository root (new `Dockerfile`s for `apps/api`, `apps/web`), `.github/workflows/` (new deploy job), `infrastructure/` (nginx config, currently empty stub).
- **Estimated effort:** 3–5 days for a minimum-viable pipeline (multi-stage Dockerfiles, one deploy CI job, smoke-test step). +2–3 weeks for the full `deployment.md`-described design (blue-green, PgBouncer, WAL/PITR archiving).
- **Dependencies:** Owner decisions `OD2-2`…`OD2-9` (VPS sizing, media storage, PITR, offsite backup, monitoring stack, registry, tile provider, blue-green-vs-maintenance-window) must be settled first to avoid rework.
- **Implementation risk:** Medium — the application code itself is stable and well-tested, so the risk is entirely in getting the infrastructure choices right the first time, not in application regressions.
- **Production impact:** Total — no release of any kind (staging, limited, or GA) can occur without this.
- **Acceptance criteria:** A committed `Dockerfile` builds `api` and `web` images; a CI job pushes them to the chosen registry; a documented (even if manual-trigger) deploy step brings the images up in at least one real environment; `/api/health` returns 200 from that environment; a documented rollback step (redeploy previous image tag) is proven to work at least once.
- **Merges/refs:** supersedes prior draft `B-02`.

#### PRB-002 — Remediate dependency vulnerabilities and add SCA scanning to CI
- **Category:** Security / Dependency management
- **Rationale:** Known critical/high-severity vulnerabilities currently exist in production dependencies, and nothing in CI would catch this or a future regression.
- **Repository evidence:** `npm audit --omit=dev` (this assessment): **1 critical** (`tar`), **6 high** (`@nestjs/platform-express`, `next`, `multer`, `lodash`, `postcss`, `@mapbox/node-pre-gyp`), **10 moderate** — 17 total. `.github/workflows/ci.yml` has no `npm audit`/SCA step. (Risk `R-02`.)
- **Affected modules:** `package.json`/`package-lock.json` (root and `apps/api`), `apps/web` (Next.js upgrade), `.github/workflows/ci.yml`.
- **Estimated effort:** 1–2 days (dependency version bumps, including a NestJS 10→11 and Next.js major-version migration path per `npm audit fix --force`'s own reported plan; add a blocking `npm audit --audit-level=high` CI step).
- **Dependencies:** Owner decision `OD2-11` (accept the major-version migration vs. targeted patching). Should land before `PRB-001` produces the first deployable image.
- **Implementation risk:** Medium — a NestJS major-version bump can have breaking API changes; mitigated by the repository's own extensive test suite (221 unit + 44 e2e) which must be re-run green after the upgrade.
- **Production impact:** High — shipping a known-critical-CVE dependency to any real environment is unacceptable regardless of other readiness.
- **Acceptance criteria:** `npm audit --omit=dev` reports 0 critical and 0 high; the full unit + e2e suite passes unmodified in assertions (only dependency versions changed); a CI step fails the build on any new critical/high finding.
- **Merges/refs:** supersedes prior draft `B-02a`.

#### PRB-003 — Add rate limiting to public API endpoints
- **Category:** Security / API hardening
- **Rationale:** Every public read endpoint (`/api/places`, `/api/search`, `/api/geo/*`) is fully unauthenticated and completely unthrottled.
- **Repository evidence:** `apps/api/src/main.ts` — no throttler guard registered anywhere; `grep -rn throttler apps/api/package.json` → no hits; `docs/architecture/security.md §1.3` names "rate limit, CORS" as a defense-in-depth layer that is not actually implemented. (Risk `R-03`.)
- **Affected modules:** `apps/api/src/main.ts` (global guard registration), possibly a new `apps/api/src/common/` throttler module.
- **Estimated effort:** 1–2 days (install `@nestjs/throttler` or a Redis-backed limiter; apply globally or per-route; tune against `deployment.md §10`'s traffic estimates).
- **Dependencies:** Owner decision `OD2-12` (global default vs. tuned per-route limits vs. edge-only via Cloudflare).
- **Implementation risk:** Low — additive middleware, does not touch existing business logic.
- **Production impact:** High — an unthrottled, fully public read API is a concrete scraping/DoS exposure.
- **Acceptance criteria:** A rate-limit test proves repeated requests past a configured threshold return `429`; existing e2e suites (44 tests) remain green under normal test-traffic volume (limits must not break legitimate CI usage).
- **Merges/refs:** supersedes prior draft `B-02b`.

#### PRB-004 — Restrict CORS to an explicit allow-list in non-local environments
- **Category:** Security / API hardening
- **Rationale:** `app.enableCors({ origin: true, credentials: true })` reflects any request origin while permitting credentialed requests — a cross-origin credential-exposure anti-pattern.
- **Repository evidence:** `apps/api/src/main.ts:18`. (Risk `R-04`.)
- **Affected modules:** `apps/api/src/main.ts`, `apps/api/src/core/config/configuration.ts` (new config key for allowed origins).
- **Estimated effort:** Hours.
- **Dependencies:** Owner decision `OD2-13` (which origin(s) to allow); final value depends on the domain chosen alongside `OD2-2`.
- **Implementation risk:** Low.
- **Production impact:** High if left as-is; trivial to fix once the origin is known.
- **Acceptance criteria:** In `NODE_ENV=production`, CORS only accepts requests from the configured origin(s); a test confirms a disallowed origin is rejected; local/dev behavior is unaffected.
- **Merges/refs:** supersedes prior draft `B-02c`.

---

### P1 — Must complete before public launch

#### PRB-005 — Stand up minimum-viable monitoring and alerting
- **Category:** Observability / Operations
- **Rationale:** Zero metrics, tracing, dashboards, or alerts exist anywhere; a production incident would be invisible until a user reports it.
- **Repository evidence:** `docs/architecture/deployment.md §12` designs seven monitoring domains against Prometheus/Grafana/Sentry — none implemented; no such dependency in any `package.json`. (Risk `R-05`.)
- **Affected modules:** New — no existing module owns this; likely a new `apps/api/src/core/observability/` addition plus external tooling (Sentry SDK, uptime monitor).
- **Estimated effort:** 2–4 days for a minimum viable slice (uptime check + error tracking) ahead of the full Prometheus/Grafana design.
- **Dependencies:** Owner decision `OD2-6` (stack choice + alert channel); logically follows `PRB-001` (needs something deployed to monitor).
- **Implementation risk:** Low-medium — mostly integration work, low risk of regressing existing behavior.
- **Production impact:** High for any release with real users; not blocking for an internal-only demo deploy.
- **Acceptance criteria:** At least one uptime/health monitor is configured against the deployed environment; at least one error-tracking integration captures unhandled exceptions; one alert channel (email/Telegram/Slack) is verified to receive a test alert.
- **Merges/refs:** supersedes prior draft `B-02d`.

#### PRB-006 — Resynchronize README.md with actual repository state
- **Category:** Documentation
- **Rationale:** README currently claims the environment/tests were never verified (false — extensively verified since PLACE-019) and claims Hotel/Restaurant/Tour/WikiRevision/web-map are "not started" (false — all implemented and tested, confirmed by direct file inventory this assessment).
- **Repository evidence:** `README.md:6-13,76` vs. `find apps/api/src/modules` (17 of 21 modules have real code) and `find apps/web/src/app` (map page exists). (Risk `R-09`.)
- **Affected modules:** `README.md` only.
- **Estimated effort:** 0.5 day.
- **Dependencies:** None.
- **Implementation risk:** Negligible — documentation-only.
- **Production impact:** Medium — misleads onboarding and any release-readiness judgment made by skimming the README instead of the delivery governance record.
- **Acceptance criteria:** README's "Trạng thái hiện thực" table accurately reflects which modules have real implementation vs. stub status; the "chưa được chạy" (never verified) framing is replaced with an accurate statement referencing the actual verification record.
- **Merges/refs:** supersedes prior draft `B-01`.

#### PRB-007 — Require DB credentials explicitly; remove insecure defaults
- **Category:** Configuration / Security
- **Rationale:** `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` all fall back to Joi `.default()` values (`phuquoc`/`phuquoc`) instead of `required()`; a misconfigured production deploy would silently connect with known dev credentials instead of failing fast.
- **Repository evidence:** `apps/api/src/core/config/env.validation.ts` — contrast with `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`, which correctly use `Joi.string().min(16).required()`. (Risk `R-06`.)
- **Affected modules:** `apps/api/src/core/config/env.validation.ts`.
- **Estimated effort:** Hours.
- **Dependencies:** None.
- **Implementation risk:** Low — mirrors an existing, already-proven pattern (the JWT secret validation) in the same file.
- **Production impact:** Medium — closes a real, if narrow, misconfiguration-masking gap; very cheap to fix.
- **Acceptance criteria:** Starting the app with `NODE_ENV=production` and no `DB_PASSWORD` set fails fast with a clear Joi validation error, matching the existing behavior for missing JWT secrets.
- **Merges/refs:** supersedes prior draft `B-09`.

#### PRB-008 — [CONDITIONAL] Build the ADR-008 verification workflow
- **Category:** Product / Database / Backend
- **Priority:** **P1 if verification is in v1 scope, otherwise P4** (see `OD2-1`).
- **Rationale:** `verifications`/`verification_events`/`verification_votes` (exclusive-arc entity + audit trail + community voting, per ADR-008 and `database.md §9`) are not migrated; only a cached `verification_status` enum column exists on `places`. "Verified place" is currently a static badge with no workflow behind it.
- **Repository evidence:** `grep -rln "CREATE TABLE.*verification" apps/api/src/core/database/migrations/*.ts` → no hits; ADR-008 status `Accepted`. (Risk `R-08`.)
- **Affected modules:** New `apps/api/src/modules/verification/` (entities, repository, service, controller), a new migration, `places` module (wiring the cached-status column to the new workflow's outcome).
- **Estimated effort:** 1–2 weeks.
- **Dependencies:** **Owner decision `OD2-1`** (release scope) is the sole gate — do not start until scope is confirmed.
- **Implementation risk:** Medium — new schema + new audit-trail semantics, but can follow the exact rigor already proven on the Place workstream (task file → report → evidence index → mutation-checked tests).
- **Production impact:** None if deferred (current cached-status behavior continues unchanged); High if claimed as a v1 feature without being built.
- **Acceptance criteria (if authorized):** Migration creates the three tables per `database.md §9`; repository/service/controller implemented with the same test rigor as the Place workstream (unit + e2e + architecture tests); existing `verification_status` behavior on `places` remains unchanged unless the decision explicitly supersedes it.
- **Merges/refs:** supersedes prior draft `B-08`.

#### PRB-009 — [CONDITIONAL] Build Community, Reviews, Notifications, Contributions modules
- **Category:** Product / Backend / Frontend
- **Priority:** **P1 if in v1 scope, otherwise P4** (see `OD2-1`).
- **Rationale:** Four planned product surfaces are entirely unbuilt — `.gitkeep`-only directories with zero implementation.
- **Repository evidence:** `find apps/api/src/modules/{community,contributions,notifications,reviews} -type f` → only `.gitkeep` in each. README's own Wave 2+ framing ("Chưa bắt đầu") is accurate for exactly these four. (Risk `R-07`/`FR-04`.)
- **Affected modules:** New `apps/api/src/modules/{community,contributions,notifications,reviews}/` (each needs entities, migrations, repository, service, controller, DTOs, tests), corresponding `apps/web` pages.
- **Estimated effort:** ~1–2 weeks per module × 4 modules ≈ **4–8 weeks total** if all four are in scope.
- **Dependencies:** **Owner decision `OD2-1`.** `PRB-020` (BullMQ) becomes relevant only if Notifications is included, since async delivery would need a queue.
- **Implementation risk:** Medium-High per module (new domain modeling each time), but the repository's established Repository Pattern + testing conventions materially de-risk this relative to a greenfield build.
- **Production impact:** None if deferred; determines whether the release matches the full "Wikipedia + Reddit + Google Maps" product vision or a narrower "Places directory" scope.
- **Acceptance criteria (if authorized):** Each module reaches the same bar already demonstrated by Hotels/Restaurants/Tours — controller + service + repository + DTOs + unit tests + e2e coverage + an execution report.
- **Merges/refs:** supersedes prior draft `B-17`.

---

### P2 — Should complete soon after launch

#### PRB-010 — Wire or remove the dead `AppLoggerService`; add correlation IDs
- **Category:** Observability / Code hygiene
- **Rationale:** A well-designed logger with secret/PII redaction exists but is never injected anywhere — confirmed dead code. Separately, no request-correlation ID exists across a request's log lines, which will matter once monitoring (`PRB-005`) is live.
- **Repository evidence:** `apps/api/src/core/logger/app-logger.service.ts`; `grep -rln AppLoggerService apps/api/src` → only its own file + module file. (Merged `TD-03` + `E-01`.)
- **Affected modules:** `apps/api/src/main.ts` (bootstrap logger wiring), `apps/api/src/common/interceptors/logging.interceptor.ts` (correlation ID generation/propagation).
- **Estimated effort:** 0.5–1 day (wiring) + 1–2 days (correlation IDs) ≈ 2–3 days combined.
- **Dependencies:** None strictly, but most valuable once `PRB-005` (monitoring) exists to consume structured/correlated logs.
- **Implementation risk:** Low.
- **Production impact:** Medium — meaningfully improves incident-diagnosis speed once real traffic exists.
- **Acceptance criteria:** Either `AppLoggerService` is passed to `NestFactory.create(AppModule, { logger })` and verified to redact a test secret in output, or it is deleted with a documented reason; every HTTP request's log line includes a correlation ID traceable across the request lifecycle.
- **Merges/refs:** supersedes prior draft `B-03`.

#### PRB-011 — Fix 422-vs-400 OpenAPI drift on non-list endpoints
- **Category:** Documentation / API contract
- **Rationale:** PLACE-021 corrected this drift specifically for `GET /api/places`; other endpoints likely still document `422` for validation failures the shared global `ValidationPipe` actually returns as `400`.
- **Repository evidence:** PLACE-021 report §7 "Follow-ups"; `docs/api/openapi.yaml`'s repeated `UnprocessableEntity` response references on other operations. (`TD-04`.)
- **Affected modules:** `docs/api/openapi.yaml`, `docs/api/api.md`.
- **Estimated effort:** 1 day.
- **Dependencies:** None.
- **Implementation risk:** Negligible — documentation-only, same pattern PLACE-021 already proved out.
- **Production impact:** Low/cosmetic — contract-accuracy issue for API consumers, not a functional defect.
- **Acceptance criteria:** Every operation's documented validation-failure response code matches the actual `ValidationPipe` behavior (400), verified per-endpoint the same way PLACE-021 verified it for list-pagination.
- **Merges/refs:** supersedes prior draft `B-04`.

#### PRB-012 — Add an automated OpenAPI-vs-runtime contract check to CI
- **Category:** CI/CD / API contract
- **Rationale:** Every OpenAPI reconciliation to date (PLACE-017, PLACE-021, PLACE-024) was done manually, one task at a time; without an automated gate this drift will recur.
- **Repository evidence:** `.github/workflows/ci.yml` has no contract-test step; three separate PLACE tasks each had to manually re-reconcile the same class of drift. (Assessment Phase 3 "OpenAPI" recommendation.)
- **Affected modules:** `.github/workflows/ci.yml` (new step), a new script (e.g. `scripts/check-openapi-contract.js`) deriving DTO shape from source and diffing against `openapi.yaml`.
- **Estimated effort:** 2–3 days.
- **Dependencies:** `PRB-011` should land first so the initial baseline is clean.
- **Implementation risk:** Medium — tooling choice affects how much of the schema can be automatically verified vs. requiring manual spot-checks.
- **Production impact:** None immediately; prevents future contract regressions.
- **Acceptance criteria:** CI fails if a DTO's accepted fields diverge from the corresponding OpenAPI schema for at least the currently-reconciled endpoints (list-places, search).
- **Merges/refs:** supersedes prior draft `B-05`.

#### PRB-013 — Add a coverage threshold gate to CI
- **Category:** CI/CD / Testing
- **Rationale:** `test:cov` exists in `apps/api/package.json` (`jest --coverage`) but CI never invokes it — no coverage percentage is ever measured or enforced.
- **Repository evidence:** `.github/workflows/ci.yml` runs only `npm test`, never `npm run test:cov`. (`E-04`.)
- **Affected modules:** `.github/workflows/ci.yml`.
- **Estimated effort:** Hours.
- **Dependencies:** None.
- **Implementation risk:** Low — but the initial threshold must be set to the current de facto coverage level to avoid an immediate false failure.
- **Production impact:** None immediately; prevents future coverage regressions from going unnoticed.
- **Acceptance criteria:** CI runs `test:cov` and fails if coverage drops below a committed threshold (set from the current baseline measurement).
- **Merges/refs:** supersedes prior draft `B-07`.

#### PRB-014 — Add frontend test coverage
- **Category:** Testing / Frontend
- **Rationale:** Only 3 spec files exist for the entire Next.js app (all auth-related); no component tests, no web e2e.
- **Repository evidence:** `find apps/web -name "*.spec.ts*"` → 3 files (`lib/api.spec.ts`, `auth/api/auth.api.spec.ts`, `auth/session.spec.ts`). (Assessment Phase 3 "Frontend"/"Testing".)
- **Affected modules:** `apps/web/src/modules/*`, `apps/web/src/app/*` (new test files throughout).
- **Estimated effort:** 3–5 days for an initial pass on critical-path components (search, map, place-detail); ongoing thereafter.
- **Dependencies:** None.
- **Implementation risk:** Low — additive test-writing, no production-code change required.
- **Production impact:** Medium — currently near-zero automated protection against UI regressions.
- **Acceptance criteria:** At least the critical user-facing flows (search results rendering, place-detail rendering, map interaction) have component-level test coverage.
- **Merges/refs:** supersedes prior draft `B-06`.

---

### P3 — Improvements

#### PRB-015 — Correct task-file `status:` field lag (PLACE-021/022/023)
- **Category:** Governance hygiene
- **Rationale:** These three task YAML files still read `status: authorized` even though `state.yaml` and their own reports correctly say `completed`.
- **Repository evidence:** `grep "^status:" docs/delivery/tasks/PLACE-021.yaml` (etc.) vs. `state.yaml`'s `completed_tasks`. (`TD-01`.)
- **Affected modules:** `docs/delivery/tasks/PLACE-021.yaml`, `PLACE-022.yaml`, `PLACE-023.yaml`.
- **Estimated effort:** Minutes.
- **Dependencies:** None.
- **Implementation risk:** Negligible.
- **Production impact:** None — pure self-consistency.
- **Acceptance criteria:** All three files' `status:` field reads `completed` with a `completed_at` date, matching PLACE-024/025's already-correct pattern.
- **Merges/refs:** supersedes prior draft `B-10`.

#### PRB-016 — Correct stale `highest_leverage_fix` note in `state.yaml`
- **Category:** Governance hygiene
- **Rationale:** Still names GAP-05/10 as "the sole outstanding release blocker," which PLACE-021 resolved the same day.
- **Repository evidence:** `docs/delivery/state.yaml` `verification_environment.highest_leverage_fix`. (`TD-02`.)
- **Affected modules:** `docs/delivery/state.yaml`.
- **Estimated effort:** Minutes.
- **Dependencies:** None.
- **Implementation risk:** Negligible.
- **Production impact:** None.
- **Acceptance criteria:** The note reflects the current state (no open release blocker in the Place workstream as of PLACE-025) rather than a resolved one.
- **Merges/refs:** supersedes prior draft `B-11`.

#### PRB-017 — Decide the fate of `packages/database` (Prisma stub)
- **Category:** Repository hygiene
- **Rationale:** Empty `.gitkeep`-only directory left over from the pre-TypeORM design phase; ADR-013's addendum (PLACE-025) already confirms Prisma is reference-only.
- **Repository evidence:** `find packages/database -type f` → `.gitkeep` only. (`TD-05`.)
- **Affected modules:** `packages/database/`.
- **Estimated effort:** Minutes once decided.
- **Dependencies:** Owner decision `OD2-14` (low-stakes).
- **Implementation risk:** Negligible.
- **Production impact:** None.
- **Acceptance criteria:** Directory is either removed or explicitly documented as an intentional placeholder.
- **Merges/refs:** supersedes prior draft `B-12`.

#### PRB-018 — Liveness vs. readiness health-endpoint split
- **Category:** Operations / API
- **Rationale:** A single `/api/health` currently checks DB+Redis together; `deployment.md §9` envisions separate liveness (`/health`) and readiness (`/health/ready`, checking DB/Redis/MinIO) endpoints.
- **Repository evidence:** `apps/api/src/modules/health/health.controller.ts` (one combined check). (`E-02`.)
- **Affected modules:** `apps/api/src/modules/health/`.
- **Estimated effort:** Hours.
- **Dependencies:** Most useful once container orchestration (`PRB-001`) exists to consume the distinction.
- **Implementation risk:** Low.
- **Production impact:** None immediately; improves orchestration-level health semantics later.
- **Acceptance criteria:** Two distinct endpoints exist with the documented liveness/readiness semantics.
- **Merges/refs:** supersedes prior draft `B-13`.

---

### P4 — Long-term roadmap

#### PRB-019 — HTTP response caching / CDN integration
- **Category:** Performance
- **Rationale:** Redis only caches geocode lookups; no HTTP-level caching or CDN exists. Matters at the 100k-MAU scale `deployment.md §10` targets, not at current volume (49 seeded places).
- **Repository evidence:** `apps/api/src/modules/geo/geo.service.ts:64-106` (the only cache-aside implementation); `docs/architecture/deployment.md §6.7,§10`. (`E-03`, merged with the assessment's "Caching" section recommendation.)
- **Affected modules:** Cloudflare configuration (external), possibly HTTP cache-control headers in `apps/api`.
- **Estimated effort:** Days — depends entirely on Cloudflare provisioning, which itself depends on `PRB-001`/`OD2-2`.
- **Dependencies:** `PRB-001` (needs a deployed environment first).
- **Implementation risk:** Low.
- **Production impact:** None at current scale.
- **Acceptance criteria:** Deferred — revisit once real traffic data justifies it.

#### PRB-020 — BullMQ / async job queue
- **Category:** Infrastructure / Future feature enabler
- **Rationale:** Designed in `deployment.md §6.5` for notification/media/AI processing; not implemented, and not needed until those product surfaces exist.
- **Repository evidence:** `apps/api/src/core/redis/redis.service.ts` (no queue usage); `deployment.md §6.5`.
- **Affected modules:** New `apps/api/src/core/queue/` if/when built.
- **Estimated effort:** Days — gated entirely by whether `PRB-009` (Notifications) is ever authorized.
- **Dependencies:** `PRB-009` (Notifications module), if authorized.
- **Implementation risk:** Low-medium.
- **Production impact:** None currently.
- **Acceptance criteria:** Deferred until a consuming feature is scoped.

#### PRB-021 — Horizontal scaling / read replicas / stateless multi-instance
- **Category:** Scalability
- **Rationale:** `architecture.md §10` / `deployment.md §14` describe this as a later scaling stage; API is already designed stateless (no server-side session store found), but this is entirely unverified under load.
- **Repository evidence:** `docs/architecture/deployment.md §14`. (`FR-03`.)
- **Affected modules:** Infrastructure only — no application code change anticipated.
- **Estimated effort:** Weeks — needs real load data to justify and size correctly.
- **Dependencies:** `PRB-001` (deployment must exist first to gather load data).
- **Implementation risk:** Low for the API (already stateless); higher for the database (read-replica consistency).
- **Production impact:** None at current scale.
- **Acceptance criteria:** Deferred until traffic data justifies it.

#### PRB-022 — AI features
- **Category:** Product / Future roadmap
- **Rationale:** ADR-012 (AI Architecture) is Superseded and tracked only as a living design doc; zero AI code exists.
- **Repository evidence:** `ls apps/api/src/modules | grep -i ai` → no hits. (`FR-01`.)
- **Affected modules:** N/A — none built.
- **Estimated effort:** Not currently estimated; no code exists to build from.
- **Dependencies:** Owner decision `OD2-10` (AI budget/kill-switch) is itself deferred until this is scheduled.
- **Implementation risk:** N/A.
- **Production impact:** None — never promised for this phase.
- **Acceptance criteria:** Tracked only; not scoped.

#### PRB-023 — Meilisearch/Elasticsearch migration
- **Category:** Search / Future roadmap
- **Rationale:** `search.md §12` designs a migration path off Postgres FTS for scale; current implementation (Postgres `ts_rank` + `unaccent`) is fully adequate at present volume.
- **Repository evidence:** `docs/architecture/search.md §12`; `apps/api/src/modules/places/repositories/places.repository.ts` (current FTS implementation, extensively tested, PLACE-015/024). (`FR-02`.)
- **Affected modules:** `apps/api/src/modules/search/`, `apps/api/src/modules/places/repositories/places.repository.ts`.
- **Estimated effort:** Not currently estimated; revisit at scale.
- **Dependencies:** `PRB-021` (scaling need would likely co-occur).
- **Implementation risk:** N/A currently.
- **Production impact:** None.
- **Acceptance criteria:** Tracked only; not scoped.

#### PRB-024 — GAP-06/F-15 EXPLAIN/index-usage proof at representative scale
- **Category:** Database / Performance verification
- **Rationale:** `idx_places_status_active` exists and is applied, but at 49 seeded rows the query planner correctly chooses a sequential scan — proving the index is *chosen* requires representative data volume. Already deferred by owner decision `OD-B6`.
- **Repository evidence:** live `EXPLAIN` (PLACE-020 certification session): `Seq Scan on places p` at current row count; `docs/delivery/state.yaml` `owner_decisions_2026_07_24` `OD-B6`. (Merged `TD-06` + `DR-01`.)
- **Affected modules:** None currently — no schema/index change is proposed; this item is pure verification work once data exists.
- **Estimated effort:** Hours, once representative data volume is available.
- **Dependencies:** Real or realistic-volume seed data (itself likely a byproduct of `PRB-001`'s staging environment going live with real usage).
- **Implementation risk:** Low.
- **Production impact:** None currently — deferred by explicit prior owner decision, not a current gap.
- **Acceptance criteria:** `EXPLAIN (ANALYZE)` on the public list query shows `Index Scan using idx_places_status_active` under a representative row count.
- **Merges/refs:** supersedes prior draft `B-15`'s misfiled reference and the original `TD-06`/`DR-01` listing.

---

### Already-resolved, not backlog items (excluded per Phase 1 dedup)

| ID | Item | Disposition |
|---|---|---|
| `AR-01` | Provisional Phú Quốc bounding box | Owner-accepted (OD-B5, 2026-07-24) as a documented GA caveat; softened behavior already implemented (PLACE-016). No further action unless an authoritative boundary source ever becomes available. |
| `AR-02` | Offset-only pagination (no cursor) | Owner-ratified (OD-B1 + ADR-010 Accepted, 2026-07-24) as the v1 contract. No further action unless product needs later force a cursor-pagination major version. |

---

## Phase 4 — Execution Roadmap (Waves)

### Wave 1 — Critical production blockers
**Items:** PRB-001, PRB-002, PRB-003, PRB-004
**Goal:** Make a release physically and safely possible at all.
**Estimated total effort:** ~1.5–2 weeks for a minimum-viable pipeline + security hardening; up to ~4 weeks if the full `deployment.md` blue-green/PgBouncer/WAL design is built immediately instead of incrementally.

### Wave 2 — Operational readiness
**Items:** PRB-005, PRB-006, PRB-007, PRB-008 (conditional), PRB-009 (conditional)
**Goal:** Make the release observable, accurately documented, and correctly scoped.
**Estimated total effort:** ~1 week for PRB-005/006/007 (unconditional items). **+4–10 additional weeks** if the release scope decision (`OD2-1`) puts PRB-008 and/or PRB-009 in scope; **+0 weeks** if deferred (in which case they move conceptually to Wave 5).

### Wave 3 — Quality & contract hardening
**Items:** PRB-010, PRB-011, PRB-012, PRB-013, PRB-014
**Goal:** Close the gap between documented behavior and runtime behavior, and add regression guardrails.
**Estimated total effort:** ~2–2.5 weeks.

### Wave 4 — Developer experience & hygiene
**Items:** PRB-015, PRB-016, PRB-017, PRB-018
**Goal:** Cheap, low-risk cleanups that improve governance-record and operational clarity.
**Estimated total effort:** Under 1 day combined — the cheapest wave by far, suitable as quick wins to run alongside any other wave.

### Wave 5 — Long-term improvements
**Items:** PRB-019, PRB-020, PRB-021, PRB-022, PRB-023, PRB-024
**Goal:** Scale, future product features, and deferred verification work — none currently scoped to a committed timeline.
**Estimated total effort:** Not committed; each item's trigger condition (real traffic data, a specific product decision, or a specific future scheduling) is stated on the item itself.

**Grand total estimated effort to clear Waves 1–4 (excluding conditional Wave 2 items and all of Wave 5):** approximately **5–6 weeks** of engineering effort, assuming Wave 1 uses the minimum-viable pipeline option.

---

## Phase 5 — Owner Decisions Required

Full rigor (options/trade-offs/evidence per item, 20-point analysis) already exists in `docs/delivery/decisions/OWNER-DECISION-PACKAGE-V2-2026-07-24.md`. Condensed here, mapped to the backlog items they gate:

| Decision | Gates | Options | Recommended | Evidence |
|---|---|---|---|---|
| **OD2-1** — Release scope: which product surfaces ship in v1? | PRB-008, PRB-009 | (a) Places-directory v1, defer community features; (b) full-vision GA; (c) phased limited release | **(a)** — matches what's actually tested and mature | 4 modules are `.gitkeep`-only; verification workflow is schema-incomplete |
| **OD2-2** — VPS sizing & Staging co-location | PRB-001 | (a) provision at `deployment.md`'s theoretical KVM4 now; (b) start smaller, scale with real data; (c) co-locate Dev+Staging | **(b) + co-located Dev/Staging** | Sizing in `deployment.md §10` is explicitly a theoretical estimate, never load-tested |
| **OD2-3** — Media storage: R2 vs. self-hosted MinIO | PRB-001 | R2 vs. MinIO | **R2** | `deployment.md §6.6,§10`'s own stated rationale (RTO, disk economy) |
| **OD2-4** — Enable PITR/WAL archiving from day one? | PRB-001 | Yes now vs. defer | **Yes, now** | Low marginal cost vs. risk of losing unrecoverable community data |
| **OD2-5** — Offsite backup location + RPO/RTO commitment | PRB-001 | R2/Backblaze/S3 + specific RPO/RTO | **Same provider family as OD2-3; RPO ≤15min / RTO ≤2-4h** per `deployment.md §11`'s own proposal | `deployment.md §11` designs this fully, names no concrete commitment |
| **OD2-6** — Monitoring stack + alert channel | PRB-005 | Prometheus/Grafana (full) vs. Netdata (light) | **Netdata initially** + one alert channel | Matches `deployment.md`'s own "GĐ đầu" (early-phase) framing |
| **OD2-11** — Dependency-upgrade approach | PRB-002 | Full major-version migration vs. targeted patching vs. accept risk | **Full migration**, re-verified against the existing 221+44 test suite | `npm audit fix --force`'s own reported migration path |
| **OD2-12** — Rate-limiting policy | PRB-003 | Global default vs. tuned per-route vs. edge-only (Cloudflare) | **Tuned per-route**, global as an immediate stopgap | Cloudflare not yet provisioned (depends on OD2-2) |
| **OD2-13** — CORS allow-list scope | PRB-004 | Single web-app origin vs. multi-origin vs. per-channel (ADR-010's four channels) | **Single origin now**, per-channel once Public/Partner APIs actually exist | Only the Web-consumed channel is implemented today |
| **OD2-14** — `packages/database` stub disposition | PRB-017 | Archive/delete vs. keep as placeholder | **Archive/delete** | Nothing depends on it; ADR-013 addendum already settles the underlying question |

*Decisions `OD2-7` (registry), `OD2-8` (tile provider), `OD2-9` (blue-green timing), and `OD2-10` (AI budget, currently N/A) also gate parts of Wave 1/5 work but do not block starting the highest-priority items above; see the full Owner Decision Package v2 for their complete analysis.*

**No decision has been made by this document. No decision is implemented by this document.**

---

## Phase 6 — Final Report

### Prioritized backlog
24 items (`PRB-001`…`PRB-024`): **4 × P0, 5 × P1 (2 conditional), 5 × P2, 4 × P3, 6 × P4.** Full detail above.

### Execution roadmap
Five waves, sequenced Wave 1 → Wave 5. Waves 1 and 4 are the highest-leverage near-term work: Wave 1 is mandatory and ~1.5–2 weeks at minimum; Wave 4 is under a day and can run in parallel with anything.

### Recommended first wave
**Wave 1 (PRB-001…004)**, executed alongside Wave 4's sub-day hygiene items at zero marginal cost. Do not start Wave 2's conditional items (PRB-008/009) until `OD2-1` is decided — starting them prematurely risks building product surfaces the owner may choose to defer.

### Remaining release risks
Even after Wave 1 clears, the release recommendation would move from **E (Not Ready)** to at best **D (Ready for staging only)** until Wave 2's unconditional items (monitoring, README, DB-credential fix) also land — full public-launch readiness additionally requires the `OD2-1` scope decision to be made and, if community features are included, Wave 2's conditional items to complete (adding 4–10 weeks).

### Estimated engineering effort
- **To reach "staging only" (Wave 1 + unconditional Wave 2 items):** ~2.5–3 weeks.
- **To reach "public launch ready" excluding community features (Waves 1–4, scope decision = defer):** ~5–6 weeks.
- **To reach "public launch ready" including full community feature build-out (scope decision = full vision):** ~9–16 weeks (adds Wave 2's conditional 4–10 week items).
- **Wave 5:** not committed; effort depends on future triggers (traffic data, product scheduling), not estimated here.

### Exact next governance action
The owner must adjudicate **`OD2-1` (release scope)** first — it is the single decision that determines whether this backlog's Wave 2 conditional items add 0 weeks or 4–10 weeks to the timeline, and it gates every other sequencing choice. In parallel (since it doesn't depend on `OD2-1`), the owner may authorize **Wave 1 (PRB-001…004)** to begin immediately, since those items are unconditionally required regardless of scope. No PRB item is authorized as an engineering task by this document alone — each requires explicit owner sign-off before becoming a scoped PLACE task (numbered PLACE-026 onward, one at a time, per the established delivery convention).

---

*This document modified no runtime code, created no PLACE task, and invented no new issue beyond what `PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md` already recorded. It is a planning and governance deliverable only.*
