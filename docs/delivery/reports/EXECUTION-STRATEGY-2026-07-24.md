# PhuQuocHub — Execution Strategy (from Owner Decision Package v2)

- **Date:** 2026-07-24
- **Source:** `docs/delivery/decisions/OWNER-DECISION-PACKAGE-V2-2026-07-24.md` (14 decisions, `OD2-1`…`OD2-14`) and `docs/delivery/reports/PRODUCTION-READINESS-BACKLOG-2026-07-24.md` (24 items, `PRB-001`…`PRB-024`).
- **Nature:** Governance/planning deliverable only. **No code implemented. No PLACE task created. No PLACE-026.**

### A note on "approved" decisions

This document plans **as if** each of the 14 decisions in Owner Decision Package v2 resolves to that package's own recommendation — that is the only evidence-grounded working basis available. **No decision has actually been rubber-stamped by the owner in this conversation.** Every place below that depends on a specific option being chosen says so explicitly (e.g. "assuming `OD2-1` resolves to option A"). Phase 4's PLACE Candidates and Phase 5's final recommendation remain **proposals awaiting explicit owner sign-off**, exactly as the prior turns required.

---

## Phase 1 — Review

### All 14 decisions, classified

| ID | Title | Mandatory / Optional | Notes |
|---|---|---|---|
| `OD2-1` | Release scope | **Mandatory to decide** (even choosing "defer" is a decision) | Zero technical prerequisite; purely a product/business call |
| `OD2-2` | VPS sizing & Staging co-location | **Mandatory** — gates `PRB-001` | |
| `OD2-3` | Media storage (R2 vs MinIO) | **Mandatory** — gates `PRB-001` | Soft-correlated with `OD2-5` (see below) |
| `OD2-4` | PITR/WAL archiving | **Mandatory** — gates `PRB-001` | |
| `OD2-5` | Offsite backup location + RPO/RTO | **Mandatory** — gates `PRB-001` | Recommendation explicitly follows `OD2-3`'s choice |
| `OD2-6` | Monitoring stack + alert channel | **Mandatory before public launch**, not before an internal/staging deploy | Can be decided now even though execution follows `PRB-001` |
| `OD2-7` | Container registry | **Mandatory** — gates `PRB-001` | Low-controversy, single clear default (GHCR) |
| `OD2-8` | Map tile provider | **Mandatory** — gates the map feature's production config | Low-controversy, isolated blast radius |
| `OD2-9` | Blue-green vs. maintenance window | **Mandatory** — shapes `PRB-001`'s build | Low-controversy |
| `OD2-10` | AI budget/kill-switch | **Optional — explicitly deferred** | No code exists to attach a policy to; not actionable |
| `OD2-11` | Dependency-upgrade approach | **Mandatory** — gates `PRB-002` (closing a live critical CVE) | |
| `OD2-12` | Rate-limiting policy | **Mandatory** — gates `PRB-003` | |
| `OD2-13` | CORS allow-list scope | **Mandatory** — gates `PRB-004` | |
| `OD2-14` | `packages/database` stub disposition | **Optional — zero urgency** | Nothing depends on it |

**12 mandatory, 2 optional (`OD2-10` deferred indefinitely, `OD2-14` can wait indefinitely with no cost to waiting).**

### Mutually exclusive decisions

**None found.** No two of the 14 decisions are true alternatives to one another — each addresses a distinct, non-overlapping concern (infrastructure sizing, security posture, monitoring, product scope, hygiene). Two pairs are **soft-correlated** (not exclusive, just related):
- `OD2-3` (media storage) ↔ `OD2-5` (offsite backup) — the recommendation for `OD2-5` explicitly follows whatever `OD2-3` chooses ("same provider family"), but choosing differently for each remains technically valid, just operationally messier (two vendor relationships instead of one).
- `OD2-2` (VPS sizing) ↔ `OD2-9` (blue-green vs. maintenance window) — blue-green briefly needs roughly double the running-container resources; this constrains but does not exclude either choice.

### Decisions that can run in parallel

**All 14 can be adjudicated in the same sitting.** None of the 14 decisions requires knowing the outcome of another decision before it can itself be decided — the dependencies that exist (`OD2-1` → `PRB-008`/`PRB-009`; `OD2-3` → `OD2-5`'s recommendation) are dependencies in *engineering execution* or in *which recommendation is optimal*, not in the ability to make the decision itself. This is the single most actionable finding of this review: **there is no technical reason to stagger decision-making across multiple sessions.**

---

## Phase 2 — Approval Strategy

Recommended approval order (all 13 non-deferred decisions can be approved in one sitting; the order below reflects leverage and urgency, not a hard sequencing requirement):

| Rank | Decision | Why approve now | Why it could wait | Release impact | Engineering impact | Est. effort (decision + downstream) | Dependencies |
|---|---|---|---|---|---|---|---|
| 1 | `OD2-1` | Zero technical prerequisite, highest information value — reshapes how much of the rest of the roadmap matters | Could wait, but every week it's undecided is a week Wave 2's true scope stays unknown | Determines whether public launch needs +4–10 weeks | None directly (a scope call); downstream unlocks/blocks `PRB-008`/`009` | Decision: none. Downstream: 0 wks (defer) or 4–10 wks (full scope) | None |
| 2 | `OD2-11` | Closes a **currently active critical CVE** — the single most time-sensitive item in the whole package | Cannot reasonably wait — this is the only decision tied to an already-exploitable condition | Blocks any release (`R-02`) | 1–2 days incl. full-suite re-verification | 1–2 days | None |
| 3 | `OD2-12` | Public API is unthrottled today; closing this is cheap and removes a live abuse surface | Could wait a few days without new incident, but no reason to | Blocks any public-facing release | 1–2 days | 1–2 days | None (stopgap available immediately; Cloudflare-tier tuning depends on `OD2-2`'s domain work) |
| 4 | `OD2-13` | Same rationale as `OD2-12` — cheap, currently-exposed | Could wait briefly | Blocks any public-facing release | Hours | Hours | Final origin value depends on `OD2-2`'s domain choice |
| 5 | `OD2-2` | Unlocks the single largest engineering deliverable (`PRB-001`) — the true critical path for any release | N/A — this is the pacing item; delaying it delays everything downstream | Blocks any release | Shapes `PRB-001`'s target environment | Decision: none. Downstream: 3–5 days (MVP) | None |
| 6 | `OD2-3` | Same rationale as `OD2-2` — feeds the same deliverable | Same | Blocks any release | Same | Same | None |
| 7 | `OD2-4` | Same | Same | Blocks any release | Same | Same | None |
| 8 | `OD2-5` | Same; ideally decided right after `OD2-3` so the recommendation ("same provider family") stays coherent | Same | Blocks any release | Same | Same | `OD2-3` (soft) |
| 9 | `OD2-7` | Low-controversy, quick to close out alongside 5–8 | Could genuinely wait with zero cost | Blocks any release (but trivially resolved) | Same | Same | None |
| 10 | `OD2-8` | Isolated blast radius (map feature only) | Could wait without affecting the deploy-pipeline critical path | None on core release readiness | Isolated to the map feature | Hours | None |
| 11 | `OD2-9` | Shapes *how* `PRB-001` is built, best decided before that work starts | Could default to the recommended "maintenance window first" without further discussion | Shapes `PRB-001`'s complexity, not whether it happens | Same | Same | Soft: `OD2-2` |
| 12 | `OD2-6` | Cheap to decide now even though execution logically follows `PRB-001` — avoids a second decision-cycle later | Its *execution* can wait; its *decision* need not | Must complete before public launch, not before an internal deploy | 2–4 days, sequenced after `PRB-001` | 2–4 days | Logically follows `PRB-001` (execution only) |
| 13 | `OD2-14` | Zero cost to decide now, closes a trivial hygiene item | Genuinely can wait indefinitely with zero consequence | None | Minutes | Minutes | None |
| — | `OD2-10` | **Do not approve now** — no code exists to attach a policy to | Wait until AI features are actually scheduled | None currently | None currently | N/A | AI feature scheduling (not yet planned) |

---

## Phase 3 — Execution Waves

Waves below assume all 13 non-deferred decisions resolve per Owner Decision Package v2's own recommendations. **Contingent on that assumption**, not yet owner-confirmed.

### Wave 1 — Foundation (Critical Production Blockers)
Three streams, deliberately scoped to **disjoint file sets** to minimize merge conflicts and maximize parallel throughput:

| Stream | Implements | Primary files touched | Conflicts with |
|---|---|---|---|
| **A — Deploy pipeline** | `OD2-2`…`OD2-9` | new `Dockerfile`s (root/`apps/api`/`apps/web`), `.github/workflows/` (new deploy job), `infrastructure/nginx/` | None — isolated file tree |
| **B — Dependency remediation** | `OD2-11` | `package.json`/`package-lock.json` (root, `apps/api`, `apps/web`) | Soft coordination point only: Stream A's `Dockerfile`s should be written against Stream B's post-upgrade dependency set, not before it, to avoid baking a vulnerable image on day one |
| **C — API bootstrap hardening** | `OD2-12` + `OD2-13` **merged into one stream** | `apps/api/src/main.ts`, `apps/api/src/core/config/configuration.ts`, new throttler module | Deliberately merged (not split into two parallel streams) because both would otherwise edit `main.ts` concurrently — this is the one real merge-conflict risk identified in this package, resolved by scoping it as a single stream instead of two |

**Minimizing production risk:** none of the three streams touches another's files, and none requires the others to be complete before it can be verified in isolation (each has its own test/verification path — Stream A via a boot+health check, Stream B via `npm audit` + full suite re-run, Stream C via the rate-limit/CORS tests already specified in Owner Decision Package v2's Future Tasks B–D).

- **Engineering effort:** Stream A 3–5 days · Stream B 1–2 days · Stream C 1–2 days (combined) ≈ **5–9 person-days total**.
- **Elapsed calendar time:** ~**1–1.5 weeks** if the three streams run concurrently (one person/pair per stream); ~2 weeks if worked sequentially by a single engineer.
- **Release impact:** Moves the verdict from **E (Not Ready)** to **D (Staging only)** — a real, deployable, security-hardened artifact exists for the first time, but monitoring (Wave 2) is still absent.

### Wave 2 — Operational Readiness
- **Item:** Monitoring & alerting (`OD2-6`).
- **Sequencing:** Starts once Wave 1 Stream A produces a real deployed environment to monitor; does not need Streams B/C to be finished first.
- **Engineering effort:** 2–4 days.
- **Elapsed calendar time:** +2–4 days after Wave 1 Stream A lands (largely overlappable with Wave 1's tail end if staffed separately).
- **Release impact:** Moves the verdict toward **C (Beta-ready)** or **B (Limited Release)**, contingent on `OD2-1`'s resolution — if release scope is confirmed as "Places-directory v1" (the recommended default), Wave 2's completion is very close to public-launch-ready from an infrastructure/security standpoint.

### Wave 3 — Quality & Hygiene (parallel-anytime, no decision gate)
- **Items:** the 10 backlog items requiring no owner decision (`PRB-006`, `007`, `010`–`016`, `018`) — README resync, DB-credential defaults, dead-logger wiring, OpenAPI drift fix, contract-check automation, coverage gate, frontend tests, governance hygiene, liveness/readiness split.
- **Why its own wave:** These touch an entirely different file set (`README.md`, `apps/api/src/core/logger/`, `docs/api/openapi.yaml`, `apps/web/src/**/*.spec.ts`, `docs/delivery/tasks/PLACE-02{1,2,3}.yaml`) with **zero overlap** with Waves 1–2, and need no decision to start.
- **Engineering effort:** ~1–1.5 weeks combined.
- **Elapsed calendar time:** **Zero additional** if resourced as a separate parallel stream (can run the entire time Waves 1–2 are in progress); +1 week if the same engineers do it sequentially afterward.
- **Release impact:** None directly on the release-readiness verdict; reduces post-launch technical debt and incident-response friction.

### Wave 4 (conditional, not currently scheduled) — Community Product Surfaces
- **Items:** `PRB-008` (verification workflow), `PRB-009` (Community/Reviews/Notifications/Contributions).
- **Status:** **Only exists if `OD2-1` resolves toward full-vision scope.** Per the recommended default (Places-directory v1), this wave does not happen now.
- **If triggered:** the four community modules (`PRB-009`'s G1–G4) are mutually independent (separate module directories, zero shared files) and fully parallelizable against each other and against Waves 1–3; the verification workflow (`PRB-008`) touches `places` only at its cached-status column and is otherwise isolated.
- **Estimated effort if triggered:** 4–10 weeks (per Owner Decision Package v2), not counted in the totals below since it is not currently scheduled.

### Roadmap totals (Waves 1–3 only, per the recommended-default scope decision)
- **Combined engineering effort:** ≈ **2.5–3.5 person-weeks** of work.
- **Elapsed calendar time:** ≈ **1.5–2.5 weeks** if Waves 1 and 3 are resourced in parallel (recommended); ≈ 3–4 weeks if worked by a single engineer sequentially.
- **Release impact:** **E (Not Ready) → D (Staging only) → approaching B/C (Limited Release / Beta-ready)**, contingent on `OD2-1` confirming the narrower scope.

---

## Phase 4 — PLACE Planning (Proposals Only — Not Yet Authorized)

Defined only now that Wave 1 is fully specified, per instruction. **These are candidates, not tasks.** No PLACE number is assigned; nothing here may begin without explicit owner authorization of the named candidate.

### PLACE Candidate A — Build deployable artifact and CI/CD pipeline
- **Scope:** Multi-stage `Dockerfile` for `apps/api` and `apps/web`; a new CI job that builds, tags, and pushes images to the chosen registry; a deploy step bringing the images up in one real environment; a documented, proven rollback path.
- **Objective:** Make a production release physically possible for the first time — implements `OD2-2` through `OD2-9`.
- **Acceptance criteria:** Committed Dockerfiles build both apps; CI pushes tagged images to GHCR (per `OD2-7`); the deployed environment answers `/api/health` with `200`, `database:up`, `redis:up`; a rollback to the previous image tag is demonstrated at least once; WAL/PITR archiving (`OD2-4`) and the chosen offsite backup target (`OD2-5`) are both configured and verified with a real restore test.
- **Estimated effort:** 3–5 days (minimum-viable scope, matching `OD2-9`'s recommended maintenance-window-first approach rather than full blue-green).
- **Dependencies:** Owner approval of `OD2-2`, `OD2-3`, `OD2-4`, `OD2-5`, `OD2-7`, `OD2-8`, `OD2-9`. Best started after (or alongside) Candidate B, since the Dockerfile should be built against the post-CVE-remediation dependency set.

### PLACE Candidate B — Remediate dependency vulnerabilities and add SCA gate
- **Scope:** Upgrade the flagged dependencies (NestJS 10→11 migration path, Next.js patch, and the remaining moderate-severity transitive fixes); add a blocking `npm audit --audit-level=high` step to CI.
- **Objective:** Close the currently-active critical/high-severity CVEs before any deployable image is built — implements `OD2-11`.
- **Acceptance criteria:** `npm audit --omit=dev` reports 0 critical and 0 high; the full existing test suite (221 unit + 44 e2e) passes with only dependency versions changed, no assertion weakened; CI fails the build on any newly-introduced critical/high finding.
- **Estimated effort:** 1–2 days.
- **Dependencies:** Owner approval of `OD2-11`. No dependency on Candidate A or C — can start immediately and in parallel.

### PLACE Candidate C — Harden API bootstrap: rate limiting and CORS
- **Scope:** Add `@nestjs/throttler` (or an equivalent Redis-backed limiter) as a global/per-route guard; replace `enableCors({ origin: true, credentials: true })` with an environment-driven allow-list. **Deliberately scoped as one task**, not two, because both changes land in `apps/api/src/main.ts` — combining them avoids the one real merge-conflict risk this strategy identified.
- **Objective:** Close the two currently-active public-API security gaps — implements `OD2-12` and `OD2-13`.
- **Acceptance criteria:** A test proves requests past the configured rate-limit threshold return `429`; existing 44 e2e tests remain green under normal test-traffic volume; in `NODE_ENV=production`, only the configured origin(s) are accepted for CORS, verified by a test that a disallowed origin is rejected; local/dev behavior is unaffected by either change.
- **Estimated effort:** 1–2 days combined.
- **Dependencies:** Owner approval of `OD2-12` and `OD2-13`. No dependency on Candidate A or B — can start immediately and in parallel.

*(Wave 2's monitoring work and Wave 3's quality/hygiene items are intentionally **not** proposed as candidates yet — Phase 4 defines only the first wave's roadmap, per instruction. They would be the natural next roadmap slice once Wave 1 lands.)*

---

## Phase 5 — Final Recommendation

### The first decision to approve
All 13 non-deferred decisions can be approved in a single sitting — there is no technical reason to stagger them. If forced to name literally one first: **`OD2-1` (release scope)**, because it is free to decide, has zero technical prerequisite, and its answer determines whether the entire roadmap beyond Wave 1 grows by 4–10 weeks or stays at the size modeled here.

### The first execution wave
**Wave 1 (Streams A + B + C)** — the only wave with no decision-scope ambiguity (none of its three streams depends on how `OD2-1` resolves) and the only one that is unconditionally required regardless of product-scope choice.

### The first PLACE candidate
**All three (A, B, C) may reasonably start in parallel**, since they touch disjoint file sets and none blocks another. If resourcing forces a strict single first pick, **Candidate B (dependency remediation)** should lead — it is the shortest-lead-time item, closes a currently-active critical CVE, and Candidate A's Dockerfile should be built against its result rather than before it.

### Expected improvement after completion
Completing Wave 1 (Candidates A + B + C) moves the release recommendation from **E (Not Ready)** to **D (Ready for staging only)** — for the first time, a real, security-hardened, deployable artifact would exist. Reaching **B (Limited Release)** or better additionally requires Wave 2 (monitoring, `OD2-6`) and an explicit resolution of `OD2-1` confirming the release scope.

---

*This document made no decision, wrote no code, modified no runtime, and created no PLACE task. It is a planning deliverable, awaiting explicit owner approval before any PLACE Candidate becomes a PLACE task.*
