# PhuQuocHub — PLACE-029 Candidate Selection and Owner Authorization

- **Date:** 2026-07-24
- **Nature:** Governance-only decision task. No runtime code, dependency, or infrastructure change. No PLACE-029 created. Nothing deployed. Nothing pushed.
- **Repository:** `D:\Projects\PhuQuocHub` (branch `master`, working tree clean throughout)
- **Purpose:** Convert `PRODUCTION-READINESS-REASSESSMENT-V2-2026-07-24.md`'s findings into a bounded, comparable set of candidates and a compact decision form so the Owner can select exactly one candidate for PLACE-029.
- **Explicit non-assumption:** The reassessment's Phase 10/11 named Candidate 1 (bcrypt + DB-credential hardening) as its own top pick. This document does not treat that as automatically authorized — it is presented here as one of four candidates, compared on equal terms, awaiting the Owner's own choice in Phase 7 below.

---

## Required-input verification

| Input | Status | Path |
|---|---|---|
| Production Readiness Reassessment v2 | ✅ exists | `docs/delivery/reports/PRODUCTION-READINESS-REASSESSMENT-V2-2026-07-24.md` |
| PLACE-026 report + evidence | ✅ exists | `docs/delivery/reports/PLACE-026-deployment-pipeline-report.md`, `docs/delivery/evidence/PLACE-026-deployment-pipeline-evidence-index.md` |
| PLACE-027 report + evidence | ✅ exists | `docs/delivery/reports/PLACE-027-dependency-security-report.md`, `docs/delivery/evidence/PLACE-027-dependency-security-evidence-index.md` |
| PLACE-028 report + evidence | ✅ exists | `docs/delivery/reports/PLACE-028-api-bootstrap-hardening-report.md`, `docs/delivery/evidence/PLACE-028-api-bootstrap-hardening-evidence-index.md` |
| Production Readiness Backlog | ✅ exists | `docs/delivery/reports/PRODUCTION-READINESS-BACKLOG-2026-07-24.md` (24 items, PRB-001…PRB-024) |
| Owner Decision Package v2 | ✅ exists | `docs/delivery/decisions/OWNER-DECISION-PACKAGE-V2-2026-07-24.md` (14 decisions, OD2-1…OD2-14) |
| Execution Strategy | ✅ exists | `docs/delivery/reports/EXECUTION-STRATEGY-2026-07-24.md` |
| Current delivery state | ✅ exists | `docs/delivery/state.yaml` — `current.task: none`, `status: awaiting_task_authorization`, no `PLACE-029.yaml` present |

All required inputs exist. This task is **not** blocked. Proceeding.

---

## Phase 1 — Current readiness summary

Source: `PRODUCTION-READINESS-REASSESSMENT-V2-2026-07-24.md` Phase 6 (readiness matrix) and Phase 11 (final verdict). All verdicts below are the reassessment's own fresh, live-verified conclusions — nothing here is re-derived from an older assessment.

### Local development — **READY**
- **Blocking conditions:** None.
- **Repository blockers:** None — lint/typecheck/unit(223)/e2e(51)/build all green under the pinned toolchain.
- **External blockers:** None.
- **Security blockers:** None at this scope.
- **Operational blockers:** N/A (not a deployed environment).

### CI — **READY**
- **Blocking conditions:** None repository-side. The workflow has **never executed on GitHub Actions** because no git remote exists — this is recorded as an evidence gap, not a failure, since every step it runs has been independently reproduced locally.
- **Repository blockers:** None — `build-test`/`e2e`/`docker-build` jobs are logically complete and reproduce cleanly when run manually.
- **External blockers:** A git remote (GitHub repository) does not exist yet, so the workflow has no execution history to point to.
- **Security blockers:** None.
- **Operational blockers:** None.

### Internal integration — **READY WITH CONDITIONS**
- **Blocking conditions:** Someone must actually stand up the existing prod-shaped Compose stack on a shared machine — a repository-supported but not-yet-exercised step.
- **Repository blockers:** None.
- **External blockers:** A shared machine to run it on (can be informal/internal, not a full VPS).
- **Security blockers:** None beyond what already applies globally (R-06 DB-credential defaults, open).
- **Operational blockers:** No named operational owner exists yet, but this is not load-bearing for an internal-only environment.

### Staging — **READY WITH CONDITIONS**
- **Blocking conditions:** A real external target host is the **sole hard blocker**. Repository-side, `docker-compose.prod.yml` builds, boots, and passes health checks live (re-verified this session).
- **Repository blockers:** **None.** This is the load-bearing finding of the whole reassessment: Gate A (staging) is repository-side PASS.
- **External blockers:** A provisioned VPS/hosting target (`OD2-2`); domain/DNS/TLS are not required for staging specifically (internal-only traffic).
- **Security blockers:** None hard — the 18 open dependency findings are, per fresh evidence, not demonstrated to be exploitable in this codebase's actual usage and do not block staging.
- **Operational blockers:** None strictly mandatory at staging's risk level.

### Restricted beta — **NOT READY**
- **Blocking conditions:** R-06 (DB-credential insecure defaults) should close first; at minimum an uptime/error-rate signal should exist before real beta users are exposed to an otherwise-invisible outage.
- **Repository blockers:** R-06 (env validation still `.default()` instead of `.required()` for DB credentials); zero observability instrumentation exists to wire once a provider is chosen.
- **External blockers:** Real Postgres/Redis instances at the target environment; a monitoring provider decision + account (`OD2-6`); object storage only if media upload is in scope for beta (currently unbuilt feature, not just unprovisioned infra).
- **Security blockers:** R-06 open since the very first assessment; no reverse-proxy/WAF layer exists yet (acceptable at this scale, per Phase 4 exposure analysis).
- **Operational blockers:** No way to know the service is down (monitoring absent); no tested restore path if any real user data is collected.

### Public production — **NOT READY**
- **Blocking conditions:** Domain+TLS, real backup/DR with a tested restore, monitoring+alerting, a release runbook, and (recommended, not code-broken today) the two major-version migration programs plus the `bcrypt` bump.
- **Repository blockers:** R-06; zero observability code; no upload/object-storage service code; no release runbook exists (`ENVIRONMENT-SETUP-RUNBOOK.md` is a dev-setup guide, not a release/rollback runbook); dependency findings recommended-before-launch (Phase 4/5 below).
- **External blockers:** Domain, DNS, TLS certificates, reverse-proxy topology, monitoring provider + alert recipients, offsite backup destination, data-restoration target, production-grade secrets, a repository remote.
- **Security blockers:** Same as beta, escalated — "recommended before public launch" becomes load-bearing exactly at this threshold (Phase 9, footnote 10 of the reassessment).
- **Operational blockers:** No named operational owner, no on-call/incident process, no rehearsed rollback (only a theoretical `git revert`), no DR drill ever performed.

### Full product vision — **NOT READY**
- **Blocking conditions:** All of Public Production's blockers, plus four unbuilt product surfaces and the ADR-008 verification workflow.
- **Repository blockers:** `apps/api/src/modules/{community,contributions,notifications,reviews}` remain `.gitkeep`-only; no `verifications`/`verification_events`/`verification_votes` tables exist. This is a **product-scope gap, not a quality gap** in what has been built (reassessment Phase 6, footnote 11).
- **External blockers:** Same as public production.
- **Security blockers:** Same as public production.
- **Operational blockers:** Same as public production, at greater scale.

---

## Phase 2 — Remaining blocker inventory

Every unresolved item that can materially affect staging, restricted beta, or public launch, drawn from the reassessment's Phase 3 (blocker reconciliation), Phase 4 (dependency risk), and Phase 7 (external prerequisites). Items with zero effect on these three gates (e.g. pure governance hygiene like `TD-01`/`TD-02` task-status lag) are excluded — they don't gate any release level.

| # | Item | Classification | Severity | Gate affected | Est. effort | Dependencies | Responsible role | Evidence required for closure |
|---|---|---|---|---|---|---|---|---|
| 1 | Staging target host does not exist | External infrastructure | Blocking (Gate A) | Staging | None (repo-side) / Owner provisioning time | `OD2-2` (sizing) | Owner (procurement) | `docker compose -f docker-compose.prod.yml up` succeeding on the real host; `/api/health` 200 |
| 2 | R-06 — DB-credential insecure `.default()` values | Repository implementation | Medium | Beta, Public | Hours | None | Engineering | Production boot with `DB_PASSWORD` unset fails fast, matching the existing JWT-secret pattern |
| 3 | Critical `tar` vuln (via `bcrypt`→`node-pre-gyp`) | Repository implementation (major bump) | Critical (install-time only) | Public (recommended) | Hours–1 day | None | Engineering | `npm audit --omit=dev` shows 0 critical; full regression green |
| 4 | 9 `@nestjs/*` findings (1 high + moderates), incl. live HTTP stack (`platform-express`/`body-parser`/`express`/`qs`) | Framework migration | High/Moderate | Public (recommended) | 1–3 days | Owner decision on timing | Engineering, gated by Owner | 9 packages on 11.x; audit findings closed; 223+51 regression green; Docker boot re-verified |
| 5 | `next`/`postcss` findings + forced ESLint 8→9 flat-config rewrite | Framework migration | High/Moderate | Public (recommended) | 2–4 days | Owner decision on timing | Engineering, gated by Owner | `next` on 16.x; ESLint 9.x flat config working; audit findings closed; manual smoke-test pass |
| 6 | Zero observability (metrics/tracing/dashboards/alerting) | Operational process + repository implementation | High (lowest-scoring dimension, 10/100) | Beta, Public | Logging: hours–days. Monitoring integration: 2–4 days | Monitoring-provider Owner decision (`OD2-6`) for the integration half only | Engineering (logging) + Owner+Engineering (monitoring) | `AppLoggerService` active with correlation IDs; one real external signal proven to fire a real alert |
| 7 | `AppLoggerService` built but never wired (TD-03) | Repository implementation | Low (bundled with #6) | Beta, Public | 0.5–1 day | None | Engineering | `grep -rn "useLogger" apps/api/src` shows real wiring |
| 8 | No offsite backup/DR destination; no restore drill ever performed | External infrastructure + credentials | High | Beta (recommended), Public (mandatory) | Minor repo work (`wal-archive.sh` already supports swapping destination) | `OD2-5` (provider), `OD2-3` (soft-correlated) | Owner (account) + Engineering (wiring) | A real offsite object appearing after `pg_switch_wal()`; a timed restore drill |
| 9 | No rehearsed rollback (only theoretical `git revert`) | Operational process | High | Public | Depends on target env existing | Item #1 (staging host) | Owner + Engineering | A demonstrated redeploy-to-previous-tag on a real environment |
| 10 | Release artifact publication (GHCR push) never executed for real | External infrastructure | Medium | Public | None (code already written) | Git remote (item #12) | Owner | A real `docker push` succeeding from a live Actions run |
| 11 | Secrets management is `.env`-file only, no rotation/KMS integration | Operational process (accepted risk short-term) | Medium | Beta (acceptable), Public (should improve) | Not yet scoped | Owner risk tolerance | Owner | A documented rotation process, or an explicit accepted-risk record |
| 12 | No git remote configured | Credentials/account provisioning | High (blocks CI/CD proof + GHCR) | Staging→Public (all gate CI/CD evidence on this) | None (repo-side) | None | Owner (GitHub org/account) | `git remote -v` showing a real URL; first CI run completing |
| 13 | No domain/DNS/TLS anywhere | External infrastructure + credentials | High | Public | Reverse-proxy config not yet written (`infrastructure/nginx/` empty) | Owner choice of registrar/TLS provider | Owner + Engineering | HTTPS handshake against the real domain |
| 14 | No reverse-proxy topology (`TRUST_PROXY_HOPS` ready, unused) | External infrastructure + repository implementation | Medium | Public (recommended before), Public (mandatory at) | Config not yet written | Owner choice (nginx vs. Cloudflare) | Owner + Engineering | Correct client-IP resolution through the real proxy |
| 15 | Object storage: infra provisioned (MinIO), zero application code (no upload endpoint/service) | Repository implementation (significant) | Medium | Public (media at scale) | Significant (no existing service/controller) | Owner choice of backend (`OD2-3`) | Owner (choice) + Engineering (build) | A real file round-trip (upload→retrieve) |
| 16 | No named operational owner, on-call, or incident process | Operational process | High | Public | Not code — a staffing/process decision | None | Owner | A documented, followed incident process |
| 17 | No release/rollback runbook (`ENVIRONMENT-SETUP-RUNBOOK.md` is dev-setup only) | Repository implementation + operational process | Medium | Public | Not yet estimated | Item #9 (rollback rehearsal) informs it | Engineering + Owner | An exercised runbook document distinct from the dev-setup guide |
| 18 | Four product surfaces unbuilt (Community/Reviews/Notifications/Contributions) + ADR-008 verification workflow | Owner decision + framework/product-scope | Low if scope excludes them; High if claimed | Full vision only | 4–10 weeks combined, if authorized | `OD2-1` (release scope) | Owner (decision) + Engineering (build, if authorized) | Each module reaches the Hotels/Restaurants/Tours test-rigor bar |
| 19 | CI workflow never executed live on GitHub Actions | External infrastructure | Medium | Staging→Public (evidence gap) | None (repo-side, already reproduced locally) | Item #12 (git remote) | Owner | A real Actions run completing green |
| 20 | Production CORS origin value not yet set to a real domain | Owner decision (value only) | Low | Staging (recommended), Beta/Public (mandatory) | None — mechanism already wired and fail-fast | Item #13 (domain) | Owner | Live preflight/allow check against the real origin |
| 21 | Monitoring provider + alert recipients not chosen | Owner decision + credentials | High | Beta (recommended), Public (mandatory) | Bundled with #6 | `OD2-6` | Owner | A real test alert reaching a real person |
| 22 | Backup retention policy undecided | Owner decision | Medium | Beta (recommended), Public (mandatory) | None — a policy decision | None | Owner | A documented retention policy matched by actual stored backups |
| 23 | R-09 — README materially stale (claims environment unverified, several modules "not started") | Repository implementation | Low | None of the three gates directly; misleads onboarding/readiness judgment | 0.5 day | None | Engineering | README's status table matches actual module implementation state |

---

## Phase 3 — Candidate normalization

The reassessment's own Phase 10 already proposed exactly four candidates from repository evidence, each with a single coherent objective and disjoint scope. Independent review of that evidence confirms they normalize cleanly — no forcing of the suggested categories (staging provisioning, monitoring, backup/DR, runbook, or either migration) was needed beyond what the evidence itself supports, **except** one deliberate exclusion explained below.

**Why "staging environment provisioning" is not a candidate:** Per Phase 1/2 above, staging's only blocker is an external target host (`OD2-2`) — there is no repository-side engineering work left to do for staging itself; `docker-compose.prod.yml` already builds, boots, and passes health checks. A PLACE task is a bounded repository-engineering task; "provision a VPS" is an Owner procurement action, not an engineering deliverable, so it cannot become a PLACE-029 candidate on its own merits. It appears instead as Decision 4 in the Owner Decision Form (Phase 7).

**Why "backup/DR completion" and "release runbook" are not standalone candidates:** Both require a target environment to exist first (item #1) before there is anything real to back up or roll back — attempting either now would produce untestable, speculative work. They are carried forward as **deferred work** in Phase 6.

### The four normalized candidates

| ID | Title | Category |
|---|---|---|
| **Candidate A** | Bcrypt major upgrade + DB-credential fail-fast hardening | Repository implementation (dependency security + config hardening) |
| **Candidate B** | NestJS 10 → 11 ecosystem migration | Framework migration |
| **Candidate C** | Next.js 14 → 16 + ESLint flat-config migration | Framework migration |
| **Candidate D** | Minimum-viable observability (logging correlation + one external monitoring signal) | Repository implementation + operational (split-eligible) |

---

## Phase 4 — Candidate comparison

### Candidate A — Bcrypt major upgrade + DB-credential fail-fast hardening

| Field | Value |
|---|---|
| Problem solved | Closes the single critical-severity dependency finding (`tar`, via `bcrypt` 5→6 removing the entire `node-pre-gyp`/`tar` chain) and R-06 (insecure silent DB-credential defaults) — the oldest-standing High-risk finding, open since the first assessment. |
| Exact scope | `apps/api/package.json` (`bcrypt` version bump only); `apps/api/src/core/config/env.validation.ts` (DB credentials `required()`, mirroring the existing JWT-secret pattern). |
| Out-of-scope | Any other dependency; any NestJS/Next change; any application feature. |
| Prerequisites | None. |
| External resources required | None. |
| Owner decisions required | None — narrow, low-risk, consistent with PLACE-027's own narrower-than-recommended precedent. |
| Repository files/systems likely affected | `apps/api/package.json`, `apps/api/package-lock.json`, `apps/api/src/core/config/env.validation.ts`, and any spec asserting current DB-credential defaults. |
| Release gate improved | Gate C (dependency + runtime security); no gate is currently blocked by this. |
| Security benefit | Eliminates 1 critical + 1 high finding outright (not deferred, not mitigated — removed); closes a misconfiguration-masking gap that has been open since the very first assessment. |
| Operational benefit | None directly. |
| Estimated person-days | 0.5–1.5 (hours for the config change, low single-digit days including full 223+51 regression re-run for the bcrypt bump). |
| Execution risk | Low — isolated single-package major bump, no ecosystem coupling; DB-credential change needs care not to break local dev defaults. |
| Rollback difficulty | Trivial — `git revert`, no schema/data/migration involvement. |
| Measurable acceptance criteria | `npm audit --omit=dev` shows 0 critical; DB credentials fail fast in production when unset/weak; full 223/51 regression green. |
| Currently executable? | Yes — fully repository-contained. |
| Eligibility | **ELIGIBLE NOW** |

### Candidate B — NestJS 10 → 11 ecosystem migration

| Field | Value |
|---|---|
| Problem solved | Closes 9 of 18 open production dependency findings — all `@nestjs/*`-rooted, including the packages that constitute the actual live HTTP stack (`platform-express`, `body-parser`, `express`, `multer`, `qs`). |
| Exact scope | 9 direct `@nestjs/*` packages bumped together (all-or-nothing, per peer-dependency constraint — confirmed via `npm view`); full regression re-run; investigation of any NestJS 11 behavioral changes the existing suite surfaces. |
| Out-of-scope | TypeORM itself (already peer-compatible, confirmed — does not need to move); `@nestjs/throttler` (already peer-compatible); any Next.js change. |
| Prerequisites | A full green baseline immediately before starting (already satisfied). |
| External resources required | None. |
| Owner decisions required | **Yes** — this is the exact migration decision PLACE-027 explicitly deferred to a separate Owner approval; still undecided. See Phase 5 below. |
| Repository files/systems likely affected | `apps/api/package.json`/`package-lock.json` (9 packages); potentially `main.ts`, exception filters, or DTO-validation error shapes if NestJS 11 shifts internals the existing 274-test suite surfaces. |
| Release gate improved | Gate C (dependency + runtime security). |
| Security benefit | Closes the vulnerabilities on the packages that handle every live HTTP request (not merely install-time or build-time surfaces). |
| Operational benefit | None directly; keeps the framework from drifting further from its supported line. |
| Estimated person-days | 1–3. |
| Execution risk | Medium — an all-or-nothing 9-package bump; the existing 274-test suite is the primary regression detector. |
| Rollback difficulty | Low — single-commit `git revert` including the lockfile; no schema/migration/data change. |
| Measurable acceptance criteria | All 9 packages on 11.x; corresponding `npm audit --omit=dev` findings closed; full regression suite green (identical or explicitly-reviewed-different totals); Docker build+boot re-verified live. |
| Currently executable? | Technically yes, but gated by an outstanding Owner decision on timing (Phase 5). |
| Eligibility | **ELIGIBLE AFTER OWNER INPUT** |

### Candidate C — Next.js 14 → 16 + ESLint flat-config migration

| Field | Value |
|---|---|
| Problem solved | Closes `next`/`postcss` (2 of 18 open findings); modernizes the frontend build/lint toolchain ahead of future feature work. |
| Exact scope | `next`, `eslint-config-next` version bumps; a full ESLint 8→9 flat-config rewrite (`.eslintrc.cjs` → `eslint.config.js`, `apps/web/.eslintrc.json` → flat equivalent) — forced by the Next 16 bump's own peer requirement (`eslint: >=9.0.0`), not optional. |
| Out-of-scope | React 19 (not forced — React 18 peer range still accepted); any NestJS/API change; any new frontend feature. |
| Prerequisites | A full green baseline immediately before starting (already satisfied). |
| External resources required | None. |
| Owner decisions required | **Yes** — same PLACE-027 deferred-migration boundary as Candidate B. |
| Repository files/systems likely affected | `apps/web/package.json`/`package-lock.json`, `.eslintrc.cjs`, `apps/web/.eslintrc.json` (removed/replaced), new `eslint.config.js`; possibly `next.config.mjs` if Next 16 requires config-shape changes beyond what's already there. |
| Release gate improved | Gate C (dependency security); improves frontend tooling health generally. |
| Security benefit | Closes 2 findings; one (`postcss`) is build-time only, the other (`next`) is the entire web server's runtime surface. |
| Operational benefit | Modern lint tooling; reduces future migration debt. |
| Estimated person-days | 2–4. |
| Execution risk | Medium — the forced ESLint flat-config rewrite is the main source of surprise scope; low existing frontend test coverage (3 spec files) means more manual smoke-testing is needed to catch regressions. |
| Rollback difficulty | Low — `git revert`; no data/schema involvement, purely build-tooling/framework-version. |
| Measurable acceptance criteria | `next` on 16.x; ESLint on 9.x with a working flat config; corresponding `npm audit --omit=dev` findings closed; full regression suite green; a manual smoke-test pass across the app's main routes. |
| Currently executable? | Technically yes, but gated by an outstanding Owner decision on timing (Phase 5). |
| Eligibility | **ELIGIBLE AFTER OWNER INPUT** |

### Candidate D — Minimum-viable observability (logging correlation + one external monitoring signal)

| Field | Value |
|---|---|
| Problem solved | Addresses the single lowest-scoring dimension in the reassessment (Observability, 10/100) and R-05 (open since the first assessment) — currently a production incident would be invisible until a user reports it. |
| Exact scope | Wire the already-built `AppLoggerService` as the actual Nest logger (closes TD-03), add request-correlation IDs (logging sub-scope); integrate one Owner-chosen external monitoring/alerting signal, e.g. an uptime check + error-rate alert (monitoring sub-scope). |
| Out-of-scope | Full Prometheus/Grafana stack; distributed tracing; anything beyond one uptime/error signal at this stage. |
| Prerequisites | Logging sub-scope: none. Monitoring sub-scope: an Owner-chosen provider (`OD2-6`) and an account with it. |
| External resources required | Monitoring sub-scope only — an external monitoring/alerting provider account. |
| Owner decisions required | **No**, for the logging-correlation portion alone. **Yes**, for the monitoring-provider choice (`OD2-6`) — this candidate is splittable into a repo-only sub-scope and an externally-gated sub-scope. |
| Repository files/systems likely affected | `apps/api/src/main.ts` (bootstrap logger wiring), `apps/api/src/common/interceptors/logging.interceptor.ts` (or equivalent, for correlation IDs), a new integration point for the chosen monitoring SDK/webhook. |
| Release gate improved | Gate B (restricted beta) and Gate C (public launch) — both currently fail partly on this dimension. |
| Security benefit | Indirect — faster incident detection and diagnosis. |
| Operational benefit | Direct and significant — the single highest-priority risk identified in the reassessment's own final recommendation (Phase 11, item 7): an incident today would be both invisible and unrecoverable. |
| Estimated person-days | Logging: 0.5–2. Monitoring integration: variable, provider-dependent, roughly 1–3 once a provider is chosen. |
| Execution risk | Low for logging; Low–Medium for monitoring, entirely dependent on which provider is chosen. |
| Rollback difficulty | Low — additive changes, no schema/data involvement. |
| Measurable acceptance criteria | `AppLoggerService` is the active Nest logger with correlation IDs visible across a single request's log lines; at least one real external signal (uptime or error-rate) is live and proven to fire a real alert. |
| Currently executable? | The logging sub-scope: yes, fully. The monitoring sub-scope: no, pending Owner's provider choice. |
| Eligibility | **ELIGIBLE AFTER OWNER INPUT** as a combined candidate; the logging sub-scope alone would independently be **ELIGIBLE NOW** if the Owner chooses to split it. |

---

## Phase 5 — Dependency-security decision

Both migrations are **independently decidable** — confirmed by the reassessment (Phase 5): NestJS lives entirely in `apps/api`, Next.js entirely in `apps/web`, separate workspaces, no cross-package version constraint links them.

### NestJS 10 → NestJS 11

- **Vulnerability exposure:** 1 high (`@nestjs/platform-express`) + several moderate (`@nestjs/core`, `@nestjs/config`, `@nestjs/typeorm`, `@nestjs/terminus`, `@nestjs/common`) + transitively-carried high/moderate (`multer`, `lodash`, `body-parser`, `express`, `file-type`, `qs`, `uuid`).
- **Reachable application surface:** Largely **runtime and request-path** — `express`/`body-parser`/`qs` process every HTTP request; `@nestjs/core`/`@nestjs/common` are active on every request. Two exceptions with no current reachable path: `multer` (no upload feature implemented anywhere — zero `FileInterceptor`/`@UploadedFile` usage) and `file-type` (no `FileTypeValidator`/`ParseFilePipe` usage).
- **Compensating controls:** None specific to these findings beyond what already exists (RBAC, input validation, rate limiting, CORS allow-list — all live-verified). No demonstrated exploit against this codebase's actual usage exists today.
- **Migration effort:** Medium — 1–3 person-days, single atomic 9-package bump, full 274-test suite as the primary regression detector.
- **Release risk:** Medium — an all-or-nothing peer-dependency-constrained bump; mitigated by the existing test suite's breadth and the fact that `main.ts`'s core bootstrap APIs are stable across the 10/11 boundary.
- **Consequence of deferral:** None demonstrated today (Phase 4's reachability analysis found no exploitable path in this codebase's actual usage); the exposure is real but currently theoretical, and it grows in relevance specifically once real, adversarial internet traffic exists — i.e., at public launch, not before.

**Recommendation: MIGRATE BEFORE PUBLIC LAUNCH.**

Rationale: nothing here blocks staging or restricted beta (both internal/limited-audience environments where the exposure window is small and controlled). The "recommended before public launch" framing in the reassessment (Phase 4/8) becomes load-bearing exactly when real, uncontrolled public traffic arrives — which is public launch, not before. Deferring further than that (i.e., "defer with accepted risk" indefinitely) is not warranted given the fix is well-understood, low-risk, and already fully scoped.

### Next.js 14 → Next.js 16

- **Vulnerability exposure:** 1 high (`next` itself) + 1 high transitively (`postcss`).
- **Reachable application surface:** `next` is **runtime** — the entire web server handles every request. `postcss` is **build-time only** — CSS is compiled once during `next build`, never reprocessed per request.
- **Compensating controls:** None specific beyond the existing CORS/rate-limiting layer on the API side (the web app itself has no comparable hardening layer, but also serves no privileged operations directly — all writes go through the API). No demonstrated exploit against this codebase's actual usage exists today.
- **Migration effort:** Medium-High — 2–4 person-days; the Next bump itself is usually mechanical, but it forces a separate ESLint 8→9 flat-config rewrite, which is the larger share of the effort. Low existing frontend test coverage (3 spec files) means more manual smoke-testing is required to catch regressions than automated tests would provide.
- **Release risk:** Medium — same reasoning as NestJS, compounded by lower automated regression coverage on this side of the codebase.
- **Consequence of deferral:** Same shape as NestJS — no demonstrated exploitation today; the `next` runtime exposure becomes materially relevant once real public traffic exists.

**Recommendation: MIGRATE BEFORE PUBLIC LAUNCH.**

Rationale: identical logic to NestJS — deferrable through staging and restricted beta, not warranted to defer indefinitely given a known, scoped fix exists. Kept as an independently-timed decision from NestJS since the two share no technical coupling and can proceed on separate schedules if the Owner prefers (e.g., approving one now and the other after a subsequent review).

---

## Phase 6 — Recommended execution order

| Rank | Candidate | Why now | Why not later | Gate unlocked | Residual risk after | Parallelizable with |
|---|---|---|---|---|---|---|
| 1 | **Candidate A** (bcrypt + DB creds) | No Owner decision required; smallest, lowest-risk, closes the oldest-standing critical+high findings in one narrow task | Every day it's deferred is a day the critical `tar` finding and R-06 (open since the first assessment) remain unresolved for zero benefit — there is no reason to wait | Improves Gate C readiness (dependency + runtime security); unblocks nothing else structurally but removes the two cheapest wins available | Remaining dependency findings (17 of 18) still open; R-05 (observability) still open | Candidate D's logging sub-scope (disjoint files: `env.validation.ts`/`bcrypt` vs. `main.ts` logger wiring) |
| 2 | **Candidate D** (observability, logging sub-scope first) | Addresses the single lowest-scoring dimension (10/100) and is the reassessment's own stated highest-priority risk (Phase 11, item 7); the logging half needs no Owner decision | The monitoring-integration half genuinely must wait on the Owner's provider choice (`OD2-6`) — but the logging half has no reason to wait | Materially improves Gate B (restricted beta) readiness; a prerequisite for meaningful incident visibility before any real users are exposed | Monitoring-provider integration still pending Owner choice; still no offsite backup/DR | Candidate A (disjoint files); the monitoring sub-scope can trail once `OD2-6` is decided |
| 3 | **Candidate B** (NestJS 10→11) | Closes the largest single cluster of dependency findings (9 of 18, including the live HTTP request path) | Confirmed deferrable through staging/beta (Phase 5) — no urgency beyond "before public launch" | Improves Gate C readiness | Candidate C's findings (`next`/`postcss`) still open until it also lands | Candidate C (separate workspace, zero file overlap); best sequenced after Candidate A to avoid any incidental lockfile churn overlap |
| 4 | **Candidate C** (Next.js 14→16 + ESLint) | Closes the remaining 2 of 18 findings; modernizes frontend tooling before further frontend feature work accumulates on the old toolchain | Same reasoning as Candidate B — deferrable through staging/beta | Improves Gate C readiness | None from this specific finding set after landing; broader Gate C blockers (external infra) remain | Candidate B (separate workspace); can run before or after B with no technical ordering requirement |

**Recommended PLACE-029 candidate: Candidate A.**
**Recommended PLACE-030 candidate: Candidate D (logging sub-scope), sequenced to begin observability work immediately after A closes.**
**Optional parallel work:** Candidates B and C may be authorized independently of the A→D sequence above, in parallel with each other or with A/D, once the Owner resolves Decisions 2 and 3 in Phase 7 — nothing about their timing is forced by A or D's completion.
**Deferred work:** the four unbuilt product modules + ADR-008 verification workflow (pending `OD2-1`); staging-host provisioning, domain/TLS, offsite backup destination, and monitoring-provider selection (all pending Owner external-infrastructure decisions, Phase 7 Decision 4); release runbook and rollback rehearsal (both require a real deployed environment to rehearse against, which does not yet exist).

These are proposals only. No task number is assigned in repository state by this document.

---

## Phase 7 — Owner Decision Form

### Decision 1 — PLACE-029 candidate
Choose exactly one:
- [ ] **Candidate A** — Bcrypt major upgrade + DB-credential fail-fast hardening
- [ ] **Candidate B** — NestJS 10 → 11 ecosystem migration
- [ ] **Candidate C** — Next.js 14 → 16 + ESLint flat-config migration
- [ ] **Candidate D** — Minimum-viable observability (logging correlation + one external monitoring signal)
- [ ] **DEFER ALL**

### Decision 2 — NestJS migration timing
Choose exactly one:
- [ ] Before staging
- [ ] Before restricted beta
- [ ] Before public launch *(recommended — see Phase 5)*
- [ ] Defer with accepted risk

### Decision 3 — Next.js migration timing
Choose exactly one:
- [ ] Before staging
- [ ] Before restricted beta
- [ ] Before public launch *(recommended — see Phase 5)*
- [ ] Defer with accepted risk

### Decision 4 — External infrastructure
For each required external resource, the Owner must state one of: **provide existing account/credentials**, **create a new account**, **approve a recommended provider**, or **defer the related release gate**.

| Resource | Gates it affects | Recommended provider (if any) | Owner must: |
|---|---|---|---|
| Staging/production VPS hosting | Staging, Beta, Public | Start smaller, scale with real data (`OD2-2`) | ☐ provide existing ☐ create new ☐ approve recommendation ☐ defer gate |
| Media/object storage | Public (media at scale) | Cloudflare R2 (`OD2-3`) | ☐ provide existing ☐ create new ☐ approve recommendation ☐ defer gate |
| Offsite backup destination | Beta (recommended), Public (mandatory) | Same provider family as media storage (`OD2-5`) | ☐ provide existing ☐ create new ☐ approve recommendation ☐ defer gate |
| Monitoring/alerting provider | Beta (recommended), Public (mandatory) | Netdata + one alert channel (`OD2-6`) | ☐ provide existing ☐ create new ☐ approve recommendation ☐ defer gate |
| Container registry | Staging→Public (CI/CD evidence) | GHCR, using the existing GitHub account (`OD2-7`) | ☐ provide existing ☐ create new ☐ approve recommendation ☐ defer gate |
| Git remote (GitHub repository) | Staging→Public (all CI/CD proof depends on this) | — (no recommendation needed, a mechanical prerequisite) | ☐ provide existing ☐ create new ☐ approve recommendation ☐ defer gate |
| Production domain + DNS | Public, full vision | — (Owner's own choice of registrar) | ☐ provide existing ☐ create new ☐ approve recommendation ☐ defer gate |
| TLS certificates | Public, full vision | — (Let's Encrypt vs. Cloudflare, Owner's choice) | ☐ provide existing ☐ create new ☐ approve recommendation ☐ defer gate |

---

## Phase 8 — Draft authorization statement (NOT executed)

> **This is a draft for Owner review only. It has not been signed, executed, or acted upon. No PLACE-029 task file exists. No delivery state has been activated.**

**Selected candidate:** *(to be filled in by the Owner from Decision 1 above)*

**Approved scope:** *(pre-filled for Candidate A as the reassessment's own top-ranked, no-Owner-decision-required option; replace if the Owner selects a different candidate)*
- `bcrypt` 5→6 major-version bump in `apps/api/package.json`/`package-lock.json`, with full regression re-verification.
- `apps/api/src/core/config/env.validation.ts`: `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` changed from `Joi.string().default(...)` to `Joi.string().required()` (or a `NODE_ENV`-conditional equivalent that still allows a safe local-dev default), mirroring the existing `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` pattern.

**Excluded scope:**
- No other dependency (NestJS, Next.js, or any other package) may be touched.
- No new feature, endpoint, or schema change.
- No infrastructure provisioning or external account creation.
- No change to CORS, rate-limiting, or any other PLACE-028 behavior.

**Required external inputs:** None — this candidate is fully repository-contained.

**Acceptance criteria:**
- `npm audit --omit=dev` reports 0 critical findings (down from 1).
- Starting the API with `NODE_ENV=production` and any of `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` unset fails fast with a clear Joi validation error.
- Full existing regression suite (223 unit + 51 e2e) passes with zero regression.
- Docker image rebuilt and booted live against the real dev Postgres/Redis, matching the verification rigor of PLACE-026/027/028.

**Stop conditions (execution must halt and report back to the Owner if any occur):**
- The `bcrypt@6.0.0` bump requires touching any file outside `apps/api/package.json`/`package-lock.json` beyond what's needed to satisfy the type/API surface change (e.g., if native bindings force a Dockerfile change).
- The DB-credential hardening breaks the documented local-dev quick-start flow without an equally simple replacement.
- Any regression appears in the 223+51 suite that is not resolvable without touching out-of-scope code.

**Authorization to create PLACE-029:** *(granted only upon explicit Owner sign-off on Decision 1 above; not granted by this document alone)*

**Prohibition on starting PLACE-030:** PLACE-030 (or any successor) may not begin, and no PLACE-030 task file may be created, until PLACE-029 reaches `status: completed` in `docs/delivery/state.yaml` and its own report/evidence index exist — regardless of which candidate is selected as PLACE-029.

---

## Closing note

This document made no decision, implemented no code, modified no dependency, provisioned no infrastructure, and created no PLACE-029. It is a governance deliverable only, structured to let the Owner select exactly one candidate for PLACE-029 and record the three additional decisions (NestJS timing, Next.js timing, external-infrastructure disposition) needed to unblock the rest of the roadmap.
