# PhuQuocHub — Production Readiness Backlog

- **Date:** 2026-07-24
- **Source:** `PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md` (release recommendation: **E. NOT READY**)
- **Status:** Proposed backlog only. **No item here is authorized as a PLACE task.** Items requiring an owner call are cross-referenced to `OWNER-DECISION-PACKAGE-V2-2026-07-24.md` and must not be started until that decision lands.
- **Ordering:** Priority 0 (blocks everything) → Priority 3 (roadmap-level).

---

## Priority 0 — Release blockers (must clear before any environment beyond local dev)

### B-01 — Resynchronize README.md with actual repository state
- **Rationale:** README currently claims the environment/tests were never verified (false — extensively verified since PLACE-019) and claims Hotel/Restaurant/Tour/WikiRevision/web-map are "not started" (false — all implemented and tested). This misleads onboarding and release judgment in both directions.
- **Evidence:** `README.md:6-13,76` vs. `find apps/api/src/modules`, `find apps/web/src/app` (this assessment).
- **Estimated effort:** 0.5 day.
- **Dependencies:** None.
- **Release impact:** Non-blocking for engineering correctness, but should land before any external communication about release status. Low risk, high value.

### B-02 — Build a deployable artifact and CI/CD pipeline
- **Rationale:** No `Dockerfile` exists anywhere; `docker-compose.yml` only runs dependencies; CI has zero deploy steps. This is the single largest blocker — nothing else in this backlog matters if the code can't be deployed anywhere.
- **Evidence:** `find . -iname "Dockerfile*"` (empty); `.github/workflows/ci.yml` (build-test + e2e only, no deploy job); `docs/architecture/deployment.md §7,§15`.
- **Estimated effort:** 3–5 days for a minimal viable pipeline (multi-stage Dockerfile for `api`+`web`, a `deploy` CI job targeting one environment, smoke test step). Full blue-green + PgBouncer + WAL/PITR per `deployment.md`'s complete design: 2–3 additional weeks.
- **Dependencies:** **Owner Decision Package v2** items OD2-2 through OD2-9 (VPS sizing, media storage, PITR, offsite backup, monitoring stack, registry, tile provider, blue-green vs. maintenance window) must be decided first — building the pipeline before these are chosen risks rework.
- **Release impact:** Blocking. Nothing can release without this.

### B-02a — Remediate dependency vulnerabilities + add SCA scanning to CI
- **Rationale:** `npm audit --omit=dev` currently reports 1 critical (`tar`), 6 high (`@nestjs/platform-express`, `next`, `multer`, `lodash`, `postcss`, `@mapbox/node-pre-gyp`), 10 moderate. No automated scan exists to catch this or prevent regression.
- **Evidence:** `npm audit --omit=dev --json` (this assessment, full breakdown in the main report's Phase 3 "Security" section).
- **Estimated effort:** 1–2 days (dependency upgrades, some are semver-major — `@nestjs/*` to 11.x, Next.js to a patched version — requiring a compatibility pass across the affected modules; add `npm audit --audit-level=high` as a blocking CI step).
- **Dependencies:** None technically, but should land before B-02's deploy pipeline goes live so the first deployable image isn't already vulnerable.
- **Release impact:** Blocking. Shipping a known-critical-CVE dependency to production is not acceptable regardless of deployment readiness.

### B-02b — Add rate limiting to public endpoints
- **Rationale:** Every public read endpoint (`/api/places`, `/api/search`, `/api/geo/*`) is fully unauthenticated and unthrottled. No `@nestjs/throttler` or equivalent exists anywhere in the dependency tree.
- **Evidence:** `apps/api/src/main.ts` (no throttler guard registered); `grep -rn throttler apps/api/package.json` (no hits).
- **Estimated effort:** 1–2 days (install `@nestjs/throttler`, apply as a global or per-route guard, tune limits against `deployment.md §10`'s traffic estimates).
- **Dependencies:** None.
- **Release impact:** Blocking. A fully public, unthrottled read API is a concrete DoS/scraping exposure.

### B-02c — Restrict CORS to an explicit allow-list in non-local environments
- **Rationale:** `app.enableCors({ origin: true, credentials: true })` reflects any request origin while permitting credentialed requests — a cross-origin credential exposure pattern that should never reach production as-is.
- **Evidence:** `apps/api/src/main.ts:18`.
- **Estimated effort:** Hours (make the allow-list environment-driven via `ConfigService`, default to the actual web app origin(s) in non-development environments).
- **Dependencies:** None; but final production origin(s) depend on the domain decision in Owner Decision Package v2 (OD2-2 area).
- **Release impact:** Blocking.

### B-02d — Stand up minimum-viable monitoring and alerting
- **Rationale:** Zero metrics, tracing, dashboards, or alerts exist anywhere. A production incident today would be invisible until a user reports it.
- **Evidence:** `docs/architecture/deployment.md §12` (fully designed, zero implemented); no monitoring dependency in any `package.json`.
- **Estimated effort:** 2–4 days for a minimum viable slice (uptime/health check monitor + error tracking, e.g. Sentry, ahead of the full Prometheus/Grafana design).
- **Dependencies:** Owner Decision Package v2 OD2-5 (monitoring stack choice); must exist before real user traffic, can be built in parallel with B-02.
- **Release impact:** Blocking for any release with real users; not blocking for an internal-only demo deploy.

---

## Priority 1 — High-risk, strongly recommended before GA

### B-03 — Wire or remove the dead `AppLoggerService`; add correlation IDs
- **Rationale:** A well-designed logger with secret/PII redaction exists but is never injected anywhere (confirmed: only self-referenced). Either wire it as the actual Nest bootstrap logger (`NestFactory.create(AppModule, { logger: ... })`) to get its redaction benefits in practice, or remove it as dead code. Separately, no request-correlation ID exists across log lines for a single request, making incident diagnosis harder once monitoring (B-02d) exists.
- **Evidence:** `apps/api/src/core/logger/app-logger.service.ts`; `grep -rln AppLoggerService apps/api/src` (only its own file + module).
- **Estimated effort:** 0.5–1 day (wiring) + 1–2 days (correlation ID middleware/interceptor).
- **Dependencies:** None.
- **Release impact:** Non-blocking, but should land before or alongside B-02d so the monitoring stack has useful logs to ingest.

### B-04 — Fix the 422-vs-400 OpenAPI documentation drift on non-list endpoints
- **Rationale:** PLACE-021 corrected this drift specifically for `GET /api/places` (list pagination); other endpoints likely still document `422` for validation failures that the shared global `ValidationPipe` actually returns as `400`.
- **Evidence:** PLACE-021 report §7 "Follow-ups"; `docs/api/openapi.yaml`'s repeated `UnprocessableEntity` response references across other operations.
- **Estimated effort:** 1 day (audit every operation, correct the response code, verify against live behavior per-endpoint).
- **Dependencies:** None.
- **Release impact:** Cosmetic/contract-accuracy only; non-blocking.

### B-05 — Add an automated OpenAPI-vs-runtime contract check to CI
- **Rationale:** Every OpenAPI reconciliation to date (PLACE-017, PLACE-021, PLACE-024) has been done manually, one task at a time. Without an automated gate, this drift will recur.
- **Evidence:** `.github/workflows/ci.yml` (no contract-test step); repeated manual reconciliations across the PLACE history.
- **Estimated effort:** 2–3 days (tooling choice — e.g., a script deriving DTO shape from source and diffing against the OpenAPI schema, following the pattern PLACE-017's ad hoc contract check used).
- **Dependencies:** B-04 should land first so the initial baseline is clean.
- **Release impact:** Non-blocking; prevents future regressions.

### B-06 — Add frontend test coverage
- **Rationale:** Only 3 spec files exist for the entire Next.js app (all auth-related); no component tests, no web e2e. UI regressions currently have no automated safety net.
- **Evidence:** `find apps/web -name "*.spec.ts*"` (3 files).
- **Estimated effort:** Ongoing; an initial pass (critical-path component tests for search/map/place-detail) is ~3–5 days.
- **Dependencies:** None.
- **Release impact:** Non-blocking for an API-first release; recommended before any UI-heavy GA claim.

### B-07 — Add a coverage threshold gate to CI
- **Rationale:** `test:cov` exists in `apps/api/package.json` but CI never invokes it — no coverage percentage is measured or enforced anywhere.
- **Evidence:** `.github/workflows/ci.yml` (only `npm test`, never `test:cov`).
- **Estimated effort:** Hours (add the CI step + a reasonable initial threshold, e.g. matching current de facto coverage so it doesn't immediately fail).
- **Dependencies:** None.
- **Release impact:** Non-blocking; prevents future coverage regressions from going unnoticed.

### B-08 — Decide and (if in scope) build the ADR-008 verification workflow
- **Rationale:** `verifications`/`verification_events`/`verification_votes` (exclusive-arc entity + audit trail + community voting, per `database.md §9` and ADR-008) do not exist as migrated tables — only a cached `verification_status` enum column does. "Verified place" is currently a static badge with no workflow behind it.
- **Evidence:** `grep -rln "CREATE TABLE.*verification" apps/api/src/core/database/migrations/*.ts` (no hits) vs. `docs/data/database.md §9`, ADR-008 (Accepted).
- **Estimated effort:** 1–2 weeks (schema + migration + repository + service + controller + tests, following the same rigor as the Place workstream).
- **Dependencies:** **Owner Decision Package v2 OD2-1** (release scope) — only build this if verification is in scope for the targeted release.
- **Release impact:** Blocking **only if** "place verification" is claimed as a feature of the release; otherwise defer.

### B-09 — Require DB credentials explicitly; remove insecure defaults
- **Rationale:** `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` all fall back to Joi `.default()` values (`phuquoc`/`phuquoc`) instead of `required()`. A misconfigured production deploy would silently connect with well-known dev credentials rather than fail fast.
- **Evidence:** `apps/api/src/core/config/env.validation.ts`.
- **Estimated effort:** Hours (make these `required()` for `NODE_ENV=production`, or drop defaults entirely and rely on `.env.example`/deployment tooling to supply real values).
- **Dependencies:** None.
- **Release impact:** Recommended before GA; low effort, meaningfully closes a real (if narrow) misconfiguration-masking risk.

---

## Priority 2 — Technical debt (low individual risk, worth batching)

### B-10 — Correct task-file `status:` field lag (PLACE-021/022/023)
- **Rationale:** These three task YAML files still say `status: authorized`; `state.yaml` and their own reports correctly say completed. Pure self-consistency issue.
- **Effort:** Minutes.
- **Dependencies:** None.
- **Release impact:** None — cosmetic governance hygiene only.

### B-11 — Correct the stale `highest_leverage_fix` note in `state.yaml`
- **Rationale:** Still names GAP-05/10 as "the sole outstanding release blocker," which PLACE-021 resolved. A dead pointer, not a functional issue.
- **Effort:** Minutes.
- **Dependencies:** None.
- **Release impact:** None.

### B-12 — Decide the fate of `packages/database` (Prisma stub)
- **Rationale:** Empty `.gitkeep`-only directory left over from the pre-TypeORM design phase. ADR-013's addendum (PLACE-025) already confirms Prisma is reference-only; this stub can likely be archived/removed, but that's the owner's call, not an inferred one.
- **Effort:** Minutes (delete) once decided.
- **Dependencies:** Owner confirmation (low-stakes, can be bundled into Owner Decision Package v2 or decided informally).
- **Release impact:** None — pure hygiene.

---

## Priority 3 — Enhancements and future roadmap (explicitly non-blocking, not gaps)

### B-13 — Liveness vs. readiness health-endpoint split
- Currently a single `/api/health` checks both DB and Redis together. `deployment.md §9` envisions separate `/health` (liveness) and `/health/ready` (readiness, DB/Redis/MinIO). Effort: hours. Non-blocking; useful once orchestration (Priority 0, B-02) exists.

### B-14 — HTTP response caching / CDN integration
- Redis caches geocode lookups only; no HTTP-level caching or CDN exists. Matters at the 100k-MAU scale `deployment.md §10` targets, not at current volume (49 seeded places). Future roadmap.

### B-15 — BullMQ / async job queue
- Designed in `deployment.md §6.5` for notification/media/AI processing; not implemented, and not needed until those product surfaces (Priority-0-gated by Owner Decision Package v2 OD2-1) are built.

### B-16 — Horizontal scaling / read replicas
- `architecture.md §10` / `deployment.md §14` describe this as a later scaling stage. Not relevant until real traffic data exists to justify it.

### B-17 — Community/Reviews/Notifications/Contributions product build-out
- Four entirely-unbuilt modules. This is the largest single line item in the backlog by effort, but it is explicitly a **product scope decision** (Owner Decision Package v2 OD2-1), not a technical gap to silently fill.

---

*Every item above traces to specific repository evidence cited in `PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md`. No item in this backlog has been started, and none is authorized as a PLACE task by this document alone.*
