# Owner Approval Session — 2026-07-24

- **Source:** `docs/delivery/decisions/OWNER-DECISION-PACKAGE-V2-2026-07-24.md` (14 decisions) and `docs/delivery/reports/EXECUTION-STRATEGY-2026-07-24.md` (wave/sequencing analysis).
- **Nature:** Governance approval record only. **No code implemented. No PLACE-026 or any PLACE task created.**
- **Framing note:** Phase 2 below is a *recommendation* — the evidence-based disposition (APPROVE/DEFER/REJECT) this analysis supports for each decision. Packaging it into "Approved/Deferred/Rejected" sets in Phase 3 records that recommendation in the requested format; it is not a substitute for the repository owner's own final sign-off, which remains the owner's separately-exercised authority. Per instruction, **nothing here authorizes PLACE-026** — that requires one further explicit step, stated again at the end of this document.

---

## Phase 1 — Review Decisions

All 14 decisions from Owner Decision Package v2:

| ID | Title | Current recommendation (from ODP v2) | Dependencies | Release impact | Engineering effort |
|---|---|---|---|---|---|
| `OD2-1` | Release scope: which product surfaces ship in v1? | **A** — Places-directory v1; defer Community/Reviews/Notifications/Contributions/Verification workflow | None | Determines whether public launch needs +0 or +4–10 weeks | Decision: none. Downstream: 0 wks (A) or 4–10 wks (B/C) |
| `OD2-2` | Production VPS sizing & Staging co-location | **(b)** — start smaller, scale with real data; co-locate Dev+Staging | None | Blocks any release (feeds `PRB-001`) | Decision: none. Downstream: part of `PRB-001`'s 3–5 days |
| `OD2-3` | Media storage: R2 vs. self-hosted MinIO | **(a)** — Cloudflare R2 | None (soft: informs `OD2-5`) | Blocks any release | Same as above |
| `OD2-4` | Enable PITR/WAL archiving from day one? | **(a)** — yes, from day one | None | Blocks any release | +0.5–1 day to `PRB-001` |
| `OD2-5` | Offsite backup location + RPO/RTO | **(a)** — same provider family as `OD2-3`; RPO ≤15min / RTO ≤2-4h | `OD2-3` (soft) | Blocks any release | Part of `PRB-001` |
| `OD2-6` | Monitoring stack + alert channel | **(b)** — Netdata + one alert channel | Logically follows `PRB-001` (execution only) | Must complete before public launch | 2–4 days |
| `OD2-7` | Container registry + prune policy | **(a)** — GHCR | None | Blocks any release (trivially resolved) | Part of `PRB-001` |
| `OD2-8` | Map tile provider | **(a)** — MapTiler | None | Isolated to map feature | Hours |
| `OD2-9` | Blue-green vs. maintenance window | **(b)** — maintenance window first, blue-green later | Soft: `OD2-2` | Shapes `PRB-001`'s complexity | Part of `PRB-001` |
| `OD2-10` | AI budget threshold & kill-switch | **Defer entirely** — no AI code exists | AI feature scheduling (not yet planned) | None currently | N/A |
| `OD2-11` | Dependency-upgrade approach for CVE remediation | **(a)** — full migration, re-verified against existing suite | None | Blocks any release (active critical CVE) | 1–2 days |
| `OD2-12` | Rate-limiting policy | **(b)** — tuned per-route, **(a)** global as immediate stopgap | Cloudflare tuning depends on `OD2-2` (soft) | Blocks public-facing release | 1–2 days |
| `OD2-13` | CORS allow-list scope | **(a)** now — single origin; **(c)** later once Public/Partner channels exist | Final origin depends on `OD2-2`'s domain | Blocks public-facing release | Hours |
| `OD2-14` | `packages/database` (Prisma stub) disposition | **(a)** — archive/delete | None | None | Minutes |

---

## Phase 2 — Approval Recommendation

| ID | Recommendation | Why |
|---|---|---|
| `OD2-1` | **APPROVE** | Free to decide, zero technical prerequisite, and the recommended option (A) is the one *evidence supports*: the delivered slice is deep and well-tested for exactly what it covers (Place/Geo/Search/Auth/RBAC), while the four deferred modules are literally empty stubs. Approving now locks Wave 2's true scope instead of leaving it open-ended. |
| `OD2-2` | **APPROVE** | No load-test evidence exists to justify provisioning at the larger theoretical size; starting smaller and scaling from real data is the lower-risk, lower-cost path with no functional downside. |
| `OD2-3` | **APPROVE** | R2 matches `deployment.md`'s own stated rationale (RTO speed, disk economy); no repository evidence contradicts it. |
| `OD2-4` | **APPROVE** | Marginal cost is low relative to the risk of losing unrecoverable community-contributed data; this is the kind of decision that's cheap now and expensive to regret later. |
| `OD2-5` | **APPROVE** | Following `OD2-3`'s provider family avoids a second vendor relationship for no added benefit; the proposed RPO/RTO figures are the document's own considered estimate, not an invented number. |
| `OD2-6` | **APPROVE** | Matches the project's own "early phase" framing; a lightweight stack now is proportionate to current traffic (effectively none) and upgradeable later. |
| `OD2-7` | **APPROVE** | Zero new vendor relationship, native GitHub Actions integration, free at this project's scale. |
| `OD2-8` | **APPROVE** | Self-hosting tile infrastructure is meaningful added ops burden for no demonstrated benefit at current scale; MapTiler is a low-risk, reversible choice. |
| `OD2-9` | **APPROVE** | Building blue-green before the basic pipeline has even been proven once risks the whole pipeline slipping; a maintenance window is an acceptable trade-off with no real users yet. |
| `OD2-10` | **DEFER** | There is no code to attach a budget/kill-switch policy to. Approving or rejecting a policy for a nonexistent feature would be speculation, not a decision. Correctly re-raised only once AI work is actually scheduled. |
| `OD2-11` | **APPROVE** | This is the one decision tied to an already-active, currently-exploitable condition (1 critical + 6 high CVEs in production dependencies). The repository's own 221+44 test suite is a strong, existing safety net for verifying the migration. Waiting has a real, live cost; approving has none beyond ordinary engineering time. |
| `OD2-12` | **APPROVE** | The public API is unthrottled today; a global stopgap costs under a day and closes the most acute exposure immediately, with the tuned version following once traffic patterns are known. |
| `OD2-13` | **APPROVE** | The current `origin: true` + `credentials: true` configuration is a live cross-origin credential-exposure pattern; a single-origin allow-list is a same-day fix with no functional downside for the current (Web-only) channel. |
| `OD2-14` | **APPROVE** | Costs nothing to decide now; leaving an empty, confusing stub directory in the repository indefinitely has no offsetting benefit. |

**No decision is recommended REJECT.** Every one of the 14 decisions in Owner Decision Package v2 already carries at least one evidence-supported, low-regret option — none represents a trade-off severe enough to warrant rejecting the underlying concern outright (e.g., "reject" would mean deciding CORS should stay wide-open, or that the critical CVE should not be fixed — neither is defensible on the evidence). The **Rejected Decision Set is legitimately empty.**

---

## Phase 3 — Approval Package

Every decision appears exactly once.

### Approved Decision Set (13)
`OD2-1`, `OD2-2`, `OD2-3`, `OD2-4`, `OD2-5`, `OD2-6`, `OD2-7`, `OD2-8`, `OD2-9`, `OD2-11`, `OD2-12`, `OD2-13`, `OD2-14`

### Deferred Decision Set (1)
`OD2-10` — AI budget/kill-switch. Re-raise only when AI feature work is actually scheduled; no current action, no current cost to waiting.

### Rejected Decision Set (0)
*(Empty — see Phase 2 justification. No decision in this package was found to warrant outright rejection.)*

---

## Phase 4 — Execution Authorization

Using **only** the Approved Decision Set, three groups of decisions can begin immediate downstream engineering work. Grouping mirrors the file-overlap analysis from `EXECUTION-STRATEGY-2026-07-24.md` — deliberately structured so no two groups touch the same files.

### Execution Group A — Infrastructure
- **Decisions:** `OD2-2`, `OD2-3`, `OD2-4`, `OD2-5`, `OD2-7`, `OD2-8`, `OD2-9`
- **Unlocks:** a deployable artifact + CI/CD pipeline (new `Dockerfile`s, `.github/workflows/` deploy job, `infrastructure/nginx/` config)
- **Dependencies:** None on other groups. Internally, `OD2-5`'s execution should follow `OD2-3`'s (same provider family), and `OD2-9` is best fixed before deploy-pipeline work starts (shapes its complexity) — both are sequencing notes within the group, not blockers on other groups.
- **Can begin immediately:** Yes.

### Execution Group B — Security
- **Decisions:** `OD2-11`, `OD2-12`, `OD2-13`
- **Unlocks:** dependency-vulnerability remediation (`package.json`/lockfile changes) + API bootstrap hardening (`apps/api/src/main.ts`, rate-limit + CORS)
- **Dependencies:** None on Group A or C. `OD2-12`'s fully-tuned version depends on Cloudflare being live (part of Group A's domain work), but the immediate global-stopgap version does not.
- **Can begin immediately:** Yes, fully in parallel with Group A (disjoint files).

### Execution Group C — Scope Lock & Housekeeping
- **Decisions:** `OD2-1`, `OD2-14`
- **Unlocks:** `OD2-1`'s approval *is* the action — it locks release scope to "Places-directory v1," which means no new engineering is triggered (the four community modules and the verification workflow stay out of scope, as they already are today). `OD2-14`'s approval unlocks a trivial cleanup (remove/archive the empty `packages/database` stub).
- **Dependencies:** None on Group A or B.
- **Can begin immediately:** Yes — `OD2-1` is already "complete" upon approval (no code follows); `OD2-14` is a same-day cleanup.

### Not yet grouped (approved, but sequenced later)
- **`OD2-6`** (monitoring) is approved but its *execution* logically follows Group A producing a real deployed environment to monitor. It does not block Groups A/B/C from starting, and does not need re-deciding later — only its build-out is deferred in sequence, not its decision.

---

## Phase 5 — PLACE Authorization

**No PLACE task is created here.** The following are eligible candidates only — each implements exclusively Approved-Set decisions, has one coherent scope, touches no files another candidate touches, and has measurable acceptance criteria.

### Eligible PLACE Candidate 1 — Build deployable artifact and CI/CD pipeline
- **Implements:** `OD2-2`, `OD2-3`, `OD2-4`, `OD2-5`, `OD2-7`, `OD2-8`, `OD2-9` (Execution Group A — all Approved).
- **Coherent scope:** infrastructure only — Dockerfiles, CI deploy job, nginx config, backup/PITR wiring.
- **Files:** new `Dockerfile`s (root/`apps/api`/`apps/web`), `.github/workflows/` (new job), `infrastructure/nginx/`. No overlap with Candidates 2 or 3.
- **Acceptance criteria:** Dockerfiles build both apps; CI pushes tagged images to GHCR; the deployed environment answers `/api/health` with `200`/`database:up`/`redis:up`; a rollback to the prior image tag is demonstrated once; WAL/PITR and the offsite backup target are configured and a real restore is verified.

### Eligible PLACE Candidate 2 — Remediate dependency vulnerabilities and add SCA gate
- **Implements:** `OD2-11` (Execution Group B, part 1 — Approved).
- **Coherent scope:** dependency versions and CI scanning only.
- **Files:** `package.json`/`package-lock.json` (root, `apps/api`, `apps/web`), `.github/workflows/ci.yml` (new audit step). No overlap with Candidates 1 or 3.
- **Acceptance criteria:** `npm audit --omit=dev` reports 0 critical/0 high; the full 221-unit + 44-e2e suite passes with only dependency versions changed; CI fails on any new critical/high finding.

### Eligible PLACE Candidate 3 — Harden API bootstrap: rate limiting and CORS
- **Implements:** `OD2-12` + `OD2-13` (Execution Group B, part 2 — both Approved; merged into one candidate specifically because both touch `apps/api/src/main.ts` — combining avoids the one real merge-conflict risk this whole exercise identified).
- **Coherent scope:** public-API request-boundary hardening only.
- **Files:** `apps/api/src/main.ts`, `apps/api/src/core/config/configuration.ts`, a new throttler module. No overlap with Candidates 1 or 2.
- **Acceptance criteria:** requests past a configured rate-limit threshold return `429`; existing 44 e2e tests remain green under normal test volume; in `NODE_ENV=production` only the configured origin(s) are accepted for CORS, verified by a rejected-origin test; dev/local behavior unaffected.

*(`OD2-1`'s and `OD2-14`'s approvals require no PLACE candidate — `OD2-1`'s action is the approval itself; `OD2-14`'s cleanup is small enough to fold into ordinary hygiene work rather than warrant its own candidate. `OD2-6`'s monitoring work is approved but intentionally not proposed as a candidate yet, since it is sequenced after Candidate 1 completes — it would be the natural next candidate once Candidate 1 lands.)*

---

## Phase 6 — Final Governance Report

**Approved decisions (13):** `OD2-1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14`.
**Deferred decisions (1):** `OD2-10` (AI budget/kill-switch — no code exists yet).
**Rejected decisions (0):** none — every decision carried a defensible, evidence-supported option.

**Authorized execution groups:**
- **Group A (Infrastructure)** — `OD2-2,3,4,5,7,8,9` — can begin immediately, no dependency on B or C.
- **Group B (Security)** — `OD2-11,12,13` — can begin immediately, fully parallel with A.
- **Group C (Scope Lock & Housekeeping)** — `OD2-1,14` — already actioned by approval itself (scope) or trivial (stub cleanup); no engineering blocked on anything else.
- **Sequenced-not-grouped:** `OD2-6` (monitoring) — approved, executes after Group A.

**Eligible PLACE candidates:** 1 (deploy pipeline), 2 (dependency remediation), 3 (rate-limit + CORS hardening) — all implement only Approved-Set decisions, share no files, and each has measurable acceptance criteria.

**Recommended first candidate:** **Eligible PLACE Candidate 2** (dependency-vulnerability remediation) — shortest lead time (1–2 days), closes the one currently-active critical-severity exposure, and Candidate 1's Dockerfile should be built against its result rather than before it. Candidates 1 and 3 may run in parallel alongside or immediately after it.

---

**Stop.** This document approves a recommendation set and defines eligible candidates only. **No PLACE task exists. No PLACE-026 is created.** Explicit owner authorization — naming a specific Eligible PLACE Candidate — is required before any engineering work begins.
