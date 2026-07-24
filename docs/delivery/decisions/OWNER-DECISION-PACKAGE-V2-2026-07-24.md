# Owner Decision Package v2 — Converting the Production Readiness Backlog into Engineering Decisions

- **Date:** 2026-07-24
- **Supersedes:** the initial draft of this document (same date) — restructured to this task's stricter per-decision schema and extended with a dependency graph, decision-wave execution proposal, and a future-task roadmap. Decision IDs (`OD2-1`…`OD2-14`) are preserved unchanged so the Production Readiness Backlog's existing `Blocks: OD2-XX` references remain resolvable.
- **Source:** `docs/delivery/reports/PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md` (release recommendation: **E. NOT READY**) and `docs/delivery/reports/PRODUCTION-READINESS-BACKLOG-2026-07-24.md` (24 items, `PRB-001`…`PRB-024`).
- **Nature:** Governance deliverable only. **No decision is made or implemented by this document. No code is written. No PLACE-026 (or any task) is created.**

---

## Phase 1 — Read Authority & Consistency Verification

| Check | Result | Evidence |
|---|---|---|
| Production Readiness Assessment exists and its verdict is current | ✅ | `docs/delivery/reports/PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md` — verdict **E. NOT READY**, HEAD unchanged since |
| Production Readiness Backlog exists and is the approved source | ✅ | `docs/delivery/reports/PRODUCTION-READINESS-BACKLOG-2026-07-24.md` — 24 items, `PRB-001`…`PRB-024` |
| All delivery findings reviewed | ✅ | `docs/delivery/findings/{F-1,F-6,F-17,F-24,F-34,F-35}.yaml`; all `RESOLVED` or `ACCEPTED` — none open |
| ADRs reviewed | ✅ | 13/16 `Accepted`, 3 `Superseded` (search/AI moved to living docs, Prisma superseded by the ADR-013 addendum, PLACE-025) — no ADR contradicts this package |
| Risk register consistent | ✅ | Assessment's risk register (`R-*`/`AR-*`/`DR-*`/`TD-*`/`E-*`/`FR-*`) maps 1:1 into the backlog's `PRB-*` items with no orphaned risk |
| No active PLACE task / no PLACE-026 | ✅ | `docs/delivery/state.yaml.current.task: none`; `ls docs/delivery/tasks/PLACE-026.yaml` → not found |
| Git state clean | ✅ | `git status --short` → empty; HEAD `3081871` |

**No inconsistency found.** This package proceeds directly from the approved backlog, adding no new finding.

---

## Phase 2 — Decision Extraction

Every one of the 24 backlog items was checked against five decision types (owner / architecture / security / operational / release). **10 of 24 items require no owner decision at all** — they are low-risk, low-ambiguity engineering fixes that can be scheduled directly once a wave is greenlit. The remaining **14 items collapse into exactly 14 decisions** (several backlog items share one decision — see "Groups" column).

| Backlog item(s) | Decision required? | Type | Decision |
|---|---|---|---|
| `PRB-001` | Yes (7-part) | Operational + Architecture | `OD2-2`…`OD2-9` (VPS sizing, media storage, PITR, offsite backup, registry, tile provider, deploy strategy) |
| `PRB-002` | Yes | Security + Engineering | `OD2-11` (dependency-upgrade approach) |
| `PRB-003` | Yes | Security | `OD2-12` (rate-limiting policy) |
| `PRB-004` | Yes | Security | `OD2-13` (CORS allow-list scope) |
| `PRB-005` | Yes | Operational | `OD2-6` (monitoring stack + alert channel) |
| `PRB-006` (README resync) | **No** | — | Pre-authorized engineering fix; no trade-off to adjudicate |
| `PRB-007` (DB credential defaults) | **No** | — | Pre-authorized; mirrors an already-proven pattern in the same file (JWT secret validation) |
| `PRB-008` | Yes | Release + Product | `OD2-1` (release scope) |
| `PRB-009` | Yes | Release + Product | `OD2-1` (same decision — grouped, not duplicated) |
| `PRB-010` (dead logger + correlation IDs) | **No** | — | Engineering judgment call, no business trade-off |
| `PRB-011` (422/400 doc drift) | **No** | — | Mechanical fix, same pattern PLACE-021 already proved |
| `PRB-012` (OpenAPI contract CI check) | **No** | — | Tooling choice is an engineering decision, not an owner one |
| `PRB-013` (coverage gate) | **No** | — | Engineering judgment call |
| `PRB-014` (frontend tests) | **No** | — | Engineering judgment call |
| `PRB-015`, `PRB-016` (governance hygiene) | **No** | — | Trivial, no ambiguity |
| `PRB-017` | Yes (low-stakes) | Architecture | `OD2-14` (Prisma stub disposition) |
| `PRB-018` (liveness/readiness split) | **No** | — | Engineering judgment call |
| `PRB-019` (caching/CDN) | Inherits `OD2-2`/`OD2-3` | — | No *new* decision — depends on infrastructure choices already covered |
| `PRB-020` (BullMQ) | Inherits `OD2-1` | — | No new decision — only relevant if Notifications (`PRB-009`) is in scope |
| `PRB-021` (horizontal scaling) | **No** (not yet) | — | Future roadmap; no decision until real load data exists |
| `PRB-022` | Yes (deferred) | Product + Cost | `OD2-10` (AI budget/kill-switch) — explicitly deferred, not actionable today |
| `PRB-023` (Meilisearch/ES) | **No** (not yet) | — | Future roadmap; revisit at scale |
| `PRB-024` (EXPLAIN proof) | Already decided | — | `OD-B6` (original Owner Decision Package, 2026-07-24) — deferred to scale; not reopened here |

**Result: 14 distinct decisions (`OD2-1` through `OD2-14`), zero duplicates.** `OD2-1` is the single highest-leverage decision — it is the only one that gates two backlog items (`PRB-008`, `PRB-009`) and indirectly shapes three more (`PRB-005`'s monitoring scope, `PRB-020`'s relevance, and Wave 2's total effort in the backlog).

---

## Phase 3 — Decision Package

Status legend: 🔴 Blocks any release · 🟠 Strongly recommended before GA · 🟡 Low-stakes, decide anytime.

### OD2-1 — Release scope: which product surfaces ship in v1? 🔴
- **Background:** The project vision (README: "Wikipedia + Reddit + Google Maps cho Phú Quốc") implies community features as core to product identity, but the delivered slice is Place/Geo/Search/Auth/RBAC + Hotel/Restaurant/Tour — the "Maps"/"Wikipedia" parts, not the "Reddit" part.
- **Repository evidence:** `apps/api/src/modules/{community,contributions,notifications,reviews}` are `.gitkeep`-only (zero implementation); ADR-008's verification workflow tables are not migrated (only a cached `verification_status` column exists); README's own Wave 2+ framing is accurate for exactly these items.
- **Available options:**
  - **A. Places-directory v1** — ship Place/Geo/Search/Auth/RBAC + satellites only; defer Community/Reviews/Notifications/Contributions/Verification-workflow.
  - **B. Full-vision GA** — build all four missing modules + verification workflow before release.
  - **C. Phased limited release** — ship the Places-directory slice to a small cohort now while building community features in parallel.
- **Advantages:** A — fastest path to any release, matches what's tested and mature. B — matches the full vision from day one. C — earliest real feedback without overclaiming.
- **Disadvantages:** A — product may feel incomplete relative to its name. B — 4–8+ additional weeks, delays all other readiness work. C — needs clear "coming soon" messaging; still needs all Wave 1 infra work regardless.
- **Engineering impact:** Determines whether `PRB-008`/`PRB-009` (≈5–10 weeks combined) are executed now, later, or never; reshapes Wave 2 of the backlog's execution roadmap entirely.
- **Cost estimate:** A/C — no direct cost beyond engineering time already counted elsewhere. B — 4–8+ weeks of engineering time is the dominant cost; no new infrastructure spend implied.
- **Time estimate:** A: 0 additional weeks. B: +4–8 weeks. C: phased, ongoing in parallel with other waves.
- **Risks:** A — market/positioning risk if "PhuQuocHub" branding sets community-feature expectations. B — timeline risk, largest single addition to the critical path. C — messaging/expectation-management risk.
- **Recommendation:** **A**, given the exceptionally strong quality bar already demonstrated on the delivered slice (221 unit + 44 e2e, deterministic, mutation-checked); rushing four new modules to hit an arbitrary "full vision" date risks diluting that bar. Ship what's proven, iterate.

### OD2-2 — Production VPS sizing & Staging co-location 🔴
- **Background:** `deployment.md §10` proposes a starting point of "KVM 4" (4 vCPU/16GB/200GB NVMe), sized against a theoretical 100k-MAU target that has never been load-tested against this codebase.
- **Repository evidence:** `deployment.md §10` (theoretical sizing table); no load-test artifact exists anywhere in the repository.
- **Available options:** (a) provision at the proposed KVM4 size immediately; (b) start smaller, scale once real traffic data exists; (c) co-locate Dev+Staging on one smaller VPS (as the doc itself suggests) vs. separate VPSes from day one.
- **Advantages:** (a) — headroom from day one, no resize surprises. (b) — lower initial cost, avoids over-provisioning for unverified demand. (c) — meaningful cost savings for two of three environments.
- **Disadvantages:** (a) — pays for capacity with zero evidence it's needed yet. (b) — a resize event may be needed later (generally low-friction on VPS providers). (c) — Dev and Staging share fate (an outage affects both).
- **Engineering impact:** Shapes `PRB-001`'s deploy target; no application code impact either way.
- **Cost estimate:** (a) higher fixed monthly VPS cost from month one. (b)+(c) lower initial spend; `deployment.md §10` frames Dev+Staging co-located at "~2 vCPU/8GB/160GB" vs. Production's "4 vCPU/16GB/200GB" — roughly half the resource footprint for the shared environment.
- **Time estimate:** No difference in setup time between options.
- **Risks:** (a) — budget risk (paying for unused capacity). (b) — a mid-flight resize could require brief downtime if not planned for. (c) — reduced blast-radius isolation between Dev and Staging.
- **Recommendation:** **(b) + co-located Dev/Staging**, matching the document's own cost-optimization suggestion — nothing has been load-tested, so provisioning for a theoretical peak before real usage data exists is premature spend.

### OD2-3 — Media storage: Cloudflare R2 vs. self-hosted MinIO 🔴
- **Background:** Media (photos) is identified in `deployment.md §10` as "the single largest capacity factor" (~0.4–1TB at the 1M-image MVP target).
- **Repository evidence:** `deployment.md §6.6,§10` — R2 recommended for disk economy and DR simplicity; MinIO already runs locally via `docker-compose.yml` for dev.
- **Available options:** (a) Cloudflare R2 (managed, offloads VPS disk); (b) self-hosted MinIO (already used in local dev, needs ≥1TB disk in production); (c) hybrid — MinIO for now, migrate to R2 later.
- **Advantages:** (a) — smallest VPS disk footprint, R2 has no egress fees behind Cloudflare, fastest DR (nothing to restore, just re-point). (b) — no new vendor relationship, reuses existing local-dev tooling. (c) — defers the decision without blocking initial launch.
- **Disadvantages:** (a) — new vendor dependency. (b) — large VPS disk requirement (≥1TB) and self-managed backup/versioning burden. (c) — a migration event later adds one-time engineering cost.
- **Engineering impact:** Shapes `PRB-001`'s storage integration and `PRB-005`'s DR-monitoring scope.
- **Cost estimate:** (a) — R2 pricing is usage-based (storage + minimal request cost, no egress); order-of-magnitude low at MVP media volume. (b) — VPS disk upgrade cost to reach ≥1TB, plus any backup-storage cost. (c) — sum of both, plus one migration effort.
- **Time estimate:** (a)/(b) similar setup effort (both S3-compatible APIs); (c) adds a future migration task.
- **Risks:** (a) — vendor lock-in risk (low, given S3 API compatibility eases future migration). (b) — operational burden of self-managed object storage at scale. (c) — decision-deferral risk (kicking the can).
- **Recommendation:** **(a) R2**, per the document's own stated rationale (RTO speed, disk economy) — no repository evidence contradicts that reasoning.

### OD2-4 — Enable PITR/WAL archiving from day one? 🔴
- **Background:** `deployment.md §11.1` recommends continuous WAL archiving for a ≤15-minute RPO on relational data (places, reviews, contributions, verifications).
- **Repository evidence:** `deployment.md §11.1`; no backup automation exists in the repository today.
- **Available options:** (a) enable WAL archiving + nightly `pg_dump` from day one; (b) start with nightly `pg_dump` only, add WAL archiving later; (c) no automated backup initially (not recommended).
- **Advantages:** (a) — smallest possible RPO, protects genuinely irreplaceable community-contributed data. (b) — simpler to operate initially. (c) — no engineering cost (but see disadvantages).
- **Disadvantages:** (a) — marginal ongoing storage cost for WAL segments. (b) — up to 24h of data loss possible in an incident. (c) — unacceptable data-loss exposure for a community-content product.
- **Engineering impact:** Shapes `PRB-001`'s backup-tooling scope.
- **Cost estimate:** (a) — low; WAL storage is small relative to media storage already budgeted under `OD2-3`. (b) — marginally lower than (a). (c) — zero direct cost, but see risk.
- **Time estimate:** (a) adds roughly 0.5–1 day to `PRB-001`'s implementation versus (b).
- **Risks:** (a) — none significant. (b) — real risk of losing up to a day of user contributions in an incident. (c) — unacceptable risk of total data loss with no recovery path.
- **Recommendation:** **(a), enable from day one** — the marginal cost is low relative to the risk of losing unrecoverable community data.

### OD2-5 — Offsite backup location + encryption + RPO/RTO commitment 🔴
- **Background:** `deployment.md §11` designs a full disaster-recovery posture but names no concrete provider or commitment.
- **Repository evidence:** `deployment.md §11.1-11.5` (fully designed, zero implemented — no backup script, no offsite target configured anywhere).
- **Available options:** (a) same provider family as `OD2-3`'s choice (R2/Backblaze) for operational simplicity; (b) a distinct dedicated backup vendor; (c) no offsite copy (VPS-local backups only — not recommended).
- **Advantages:** (a) — one fewer vendor relationship, reuses credentials/tooling already set up for media. (b) — provider diversification (a VPS-provider-level incident wouldn't also take out backups). (c) — no added cost.
- **Disadvantages:** (a) — correlated-failure risk if the same provider has an outage affecting both media and backups. (b) — one more vendor to manage. (c) — a VPS-level disaster destroys backups along with production data — defeats the purpose of DR.
- **Engineering impact:** Shapes `PRB-001`'s backup-target configuration.
- **Cost estimate:** (a)/(b) — low, storage-based pricing for backup volumes (dumps + WAL are far smaller than media). (c) — zero cost, unacceptable risk.
- **Time estimate:** No meaningful difference in setup time between (a) and (b).
- **Risks:** (a) — correlated provider-outage risk (mitigated by R2/Backblaze's own multi-region durability). (c) — total, unrecoverable data-loss risk on any VPS-level incident.
- **Recommendation:** **(a)**, same provider family as `OD2-3`; commit to `deployment.md §11.5`'s own proposed **RPO ≤15min / RTO ≤2-4h** unless the owner has a different risk tolerance.

### OD2-6 — Monitoring stack: Prometheus/Grafana vs. Netdata + alert channel 🔴
- **Background:** `deployment.md §12` designs seven monitoring domains (infra/DB/API/queue/AI/search/storage); none are implemented today — confirmed by an empty `package.json` dependency search for any monitoring tool.
- **Repository evidence:** `deployment.md §12`; no Prometheus/Grafana/Sentry/Netdata dependency anywhere in the repository.
- **Available options:** (a) full Prometheus/Grafana stack from day one; (b) lightweight Netdata (per the document's own "GĐ đầu"/early-phase framing) + a single alert channel; (c) managed SaaS APM (e.g., a hosted error-tracking + uptime service) instead of self-hosted tooling.
- **Advantages:** (a) — most complete observability, matches the full long-term design. (b) — fastest to stand up, lowest operational overhead initially. (c) — least self-hosted maintenance burden.
- **Disadvantages:** (a) — meaningful setup + ongoing maintenance effort for a project with no traffic yet to observe. (b) — will need to be upgraded once real operational needs grow. (c) — recurring SaaS subscription cost.
- **Engineering impact:** Directly shapes `PRB-005`'s implementation.
- **Cost estimate:** (a) — self-hosted, so mainly VPS resource cost (already counted in `OD2-2`), zero subscription. (b) — Netdata's free tier is sufficient at this scale; low cost. (c) — ongoing subscription cost, typically usage/seat-based, scales with error/event volume.
- **Time estimate:** (a) — several days. (b) — under a day for the health/uptime layer per `PRB-005`'s own estimate (2–4 days total including error tracking). (c) — under a day for basic wiring, plus vendor account setup.
- **Risks:** (a) — over-engineering relative to current need. (b) — coverage gaps until upgraded. (c) — vendor dependency, cost scales with growth.
- **Recommendation:** **(b), Netdata initially** + one alert channel (Telegram or Slack), matching `deployment.md`'s own early-phase framing and `PRB-005`'s minimum-viable scope; upgrade to full Prometheus/Grafana once real operational needs justify it.

### OD2-7 — Container registry choice + prune policy + source mirror 🟠
- **Background:** `deployment.md §6.8` names GHCR (GitHub Container Registry) as the default option; not yet configured anywhere.
- **Repository evidence:** `deployment.md §6.8`; no registry configuration exists in `.github/workflows/`.
- **Available options:** (a) GHCR (free with the existing GitHub account, no new vendor); (b) a third-party registry (Docker Hub, etc.); (c) self-hosted registry.
- **Advantages:** (a) — zero new vendor relationship, integrates natively with existing GitHub Actions auth. (b) — potentially broader ecosystem tooling. (c) — full control, no external dependency.
- **Disadvantages:** (a) — tied to GitHub's own availability/policies. (b) — one more vendor/credential to manage. (c) — added operational burden with no clear benefit at this scale.
- **Engineering impact:** Shapes `PRB-001`'s image-push step.
- **Cost estimate:** (a) — free within GitHub's free-tier storage/bandwidth limits at this project's likely image count/size. (b)/(c) — variable, generally higher.
- **Time estimate:** No meaningful difference; (a) is marginally faster to wire given existing GitHub integration.
- **Risks:** (a) — minimal. (c) — self-hosting a registry adds an availability dependency the deploy pipeline itself relies on (circular risk).
- **Recommendation:** **(a) GHCR** — free, no new vendor relationship needed, and the repository already lives on GitHub.

### OD2-8 — Map tile provider: MapTiler vs. self-host 🟠
- **Background:** The web app already depends on `maplibre-gl` (confirmed in `apps/web/package.json`), which works with either a managed tile provider or a self-hosted tile server.
- **Repository evidence:** `apps/web/package.json` (`maplibre-gl` dependency); `deployment.md §14`/`architecture.md §11` name this as an open question.
- **Available options:** (a) MapTiler (managed); (b) self-host a tile server (e.g., via OpenMapTiles); (c) another managed provider (Mapbox, etc.).
- **Advantages:** (a) — no ops burden, generous free tier for MVP scale. (b) — no per-request cost at high volume, full control over styling/data freshness. (c) — similar to (a), different vendor ecosystem.
- **Disadvantages:** (a) — usage-based cost at scale; vendor dependency. (b) — meaningful setup + storage + ongoing tile-refresh operational burden. (c) — similar trade-offs to (a).
- **Engineering impact:** Isolated to the map feature only; no broader architectural impact.
- **Cost estimate:** (a)/(c) — usage-based, low at current scale (49 seeded places, low map-view volume). (b) — VPS/storage cost for tile data + ongoing refresh compute, generally higher fixed cost regardless of usage.
- **Time estimate:** (a)/(c) — hours to integrate an API key. (b) — days to set up and validate a self-hosted tile pipeline.
- **Risks:** (a)/(c) — cost could grow with map-heavy usage; low risk at current scale. (b) — self-hosting adds a new operational surface with no current justification.
- **Recommendation:** **(a) MapTiler** — self-hosting tile infrastructure is meaningful added ops burden for no clear benefit at current scale.

### OD2-9 — Zero-downtime deploys from day one, or accept a maintenance window initially? 🟠
- **Background:** `deployment.md §9` designs blue-green deployment; no deploy pipeline exists at all yet (`PRB-001`/`R-01`).
- **Repository evidence:** `deployment.md §9`; absence of any deploy job in `.github/workflows/ci.yml`.
- **Available options:** (a) build blue-green from the very first deploy pipeline iteration; (b) accept a short maintenance window for the first several releases, add blue-green once the basic pipeline is proven reliable; (c) rolling restart (partial middle ground, single-instance limits its benefit here since the app isn't yet horizontally scaled).
- **Advantages:** (a) — zero-downtime from day one, matches the full design. (b) — meaningfully simpler to build and verify first, lower risk of the whole pipeline being late. (c) — some improvement over a hard restart with modest added complexity.
- **Disadvantages:** (a) — doubles the initial infrastructure/pipeline complexity before it's even proven reliable once. (b) — early releases have brief visible downtime. (c) — limited benefit on a single-instance deployment (no second instance to roll onto yet).
- **Engineering impact:** Shapes how `PRB-001` is built, not whether it's built.
- **Cost estimate:** (a) — no direct infra cost difference at single-VPS scale (blue-green here means two containers on one host, not two hosts), but higher initial engineering time. (b)/(c) — lower initial engineering time.
- **Time estimate:** (a) — adds a meaningful chunk of `PRB-001`'s "+2-3 weeks full design" tier rather than its "3-5 day MVP" tier. (b) — fits the 3-5 day MVP tier.
- **Risks:** (a) — risk of the entire deploy pipeline slipping because it's trying to do too much at once. (b) — a handful of brief, planned maintenance windows during early releases (acceptable given no real users yet).
- **Recommendation:** **(b)** — accept a short maintenance window for the first few releases; add blue-green once the basic pipeline is proven reliable.

### OD2-10 — AI budget threshold & kill-switch 🟡 (deferred — not currently applicable)
- **Background:** `docs/ai/ai-architecture.md` (living doc, successor to Superseded ADR-012) designs AI-assisted features with a cost/kill-switch model; no AI code exists in the repository.
- **Repository evidence:** `ls apps/api/src/modules | grep -i ai` → no hits.
- **Available options:** Not applicable until AI features are actually scheduled — deferring the decision is itself the only sensible option today.
- **Advantages / Disadvantages:** N/A — no feature exists to attach a budget policy to.
- **Engineering impact:** None currently.
- **Cost estimate:** None currently — any estimate today would be speculative against a feature with zero code.
- **Time estimate:** N/A.
- **Risks:** Deciding a budget/kill-switch policy this early would be pure speculation with no implementation to validate it against.
- **Recommendation:** **Defer entirely** until AI features are actually scheduled (Future Roadmap, `PRB-022`).

### OD2-11 — Dependency-upgrade approach for CVE remediation 🔴
- **Background:** The dependency tree has aged since Sprint 0 without a scheduled upgrade pass; several transitive vulnerabilities now sit at high/critical severity.
- **Repository evidence:** `npm audit --omit=dev`: 1 critical (`tar`), 6 high (`@nestjs/platform-express`, `next`, `multer`, `lodash`, `postcss`, `@mapbox/node-pre-gyp`), 10 moderate — 17 total; `npm audit fix --force` reports installing `@nestjs/typeorm@11.0.3` and other majors as breaking changes.
- **Available options:** (a) full `npm audit fix --force`, accepting the NestJS 11.x / Next.js major-version migration, re-verified against the full existing test suite; (b) targeted manual bumps of only the vulnerable packages' direct parents, avoiding a full major-version migration; (c) accept the risk and do nothing (not recommended).
- **Advantages:** (a) — closes ALL flagged CVEs at once, follows a documented upgrade path. (b) — smaller, more contained change surface. (c) — zero engineering time (but see risk).
- **Disadvantages:** (a) — a NestJS major-version bump can carry breaking API changes requiring a compatibility pass. (b) — may leave some moderate-severity findings unresolved if their fix requires the same major bump anyway. (c) — ships known-exploitable dependency versions to production.
- **Engineering impact:** Directly implements `PRB-002`; the repository's extensive test suite (221 unit + 44 e2e) provides a strong safety net for re-verifying (a).
- **Cost estimate:** No new infrastructure/vendor cost either way — this is entirely engineering time.
- **Time estimate:** (a) — 1–2 days including full-suite re-verification. (b) — potentially similar or slightly less time but with residual risk.
- **Risks:** (a) — regression risk from the major-version bump, mitigated by the existing test suite. (c) — active exploitation risk on a public-facing stack (Next.js is directly internet-facing).
- **Recommendation:** **(a)** — given how disciplined this repository's testing has been, a full migration pass with re-verification against the same suites is feasible and closes every flagged CVE at once rather than leaving some unresolved via partial patching.

### OD2-12 — Rate-limiting policy: global default vs. tuned per-route limits 🔴
- **Background:** Zero rate limiting exists anywhere on the public API today.
- **Repository evidence:** `apps/api/src/main.ts` (no throttler guard registered); no `@nestjs/throttler` or equivalent dependency anywhere; `deployment.md §10` estimates origin RPS of ~30–80 at 100k MAU (post-CDN-cache).
- **Available options:** (a) a single global default limit (fast to ship, e.g. `@nestjs/throttler`'s out-of-box per-IP default); (b) tuned per-route limits (stricter on write endpoints, looser on public reads), matched to `deployment.md §10`'s traffic estimate; (c) defer to Cloudflare edge rate-limiting only, skip application-level limiting entirely.
- **Advantages:** (a) — fastest to ship. (b) — most precisely matched to actual traffic shape and risk profile per endpoint. (c) — offloads the work to infrastructure already planned.
- **Disadvantages:** (a) — one-size-fits-all may be too loose for writes or too strict for reads. (b) — more tuning/testing effort upfront. (c) — Cloudflare is not yet provisioned (depends on `OD2-2`'s domain/VPS decisions), leaving a gap until it's live.
- **Engineering impact:** Directly implements `PRB-003`.
- **Cost estimate:** No new cost — application-level middleware, no new infrastructure spend.
- **Time estimate:** (a) — under a day. (b) — 1–2 days including tuning. (c) — zero application engineering time, but not available until Cloudflare (part of `OD2-2`'s domain work) is live.
- **Risks:** (a) — under/over-throttling specific endpoints. (b) — tuning risk (limits set too aggressively could throttle legitimate users). (c) — leaves the API fully exposed until Cloudflare is provisioned.
- **Recommendation:** **(b), tuned per-route limits**, with **(a) as an immediate stopgap** shipped first — since Cloudflare isn't provisioned yet, relying solely on (c) leaves a real exposure gap.

### OD2-13 — Production CORS allow-list scope 🟠
- **Background:** `enableCors({ origin: true, credentials: true })` currently reflects any origin while allowing credentialed requests.
- **Repository evidence:** `apps/api/src/main.ts:18`; ADR-010 designs four API channels (Web, Mobile, Public, Partner) with potentially different origin-trust levels.
- **Available options:** (a) a single allow-list entry for the production web app's own domain only; (b) a configurable allow-list covering Web + any known Partner origins; (c) per-channel CORS policy matching ADR-010's four-channel split.
- **Advantages:** (a) — simplest, closes the immediate exposure with minimal effort. (b) — accommodates known integration partners without full complexity. (c) — most architecturally complete, matches the long-term multi-channel design.
- **Disadvantages:** (a) — would need revisiting once Public/Partner channels exist. (b) — requires maintaining a partner-origin list. (c) — premature complexity given Public/Partner channels aren't implemented yet.
- **Engineering impact:** Directly implements `PRB-004`; final origin value also depends on `OD2-2`'s domain decision.
- **Cost estimate:** No cost impact — configuration-only change.
- **Time estimate:** Hours, regardless of option chosen.
- **Risks:** (a) — none beyond needing a follow-up decision later. (c) — building infrastructure for channels that don't exist yet is speculative effort.
- **Recommendation:** **(a) now**, revisit as **(c)** once Public/Partner channels are actually built — those channels don't appear implemented yet (only Web-consumed endpoints exist today).

### OD2-14 — `packages/database` (Prisma stub) disposition 🟡
- **Background:** An empty, `.gitkeep`-only directory left over from the pre-TypeORM design phase.
- **Repository evidence:** `find packages/database -type f` → `.gitkeep` only; ADR-013's addendum (PLACE-025) already confirms Prisma is reference-only, not runtime.
- **Available options:** (a) archive/delete the empty stub now; (b) leave it as a placeholder for a possible future package; (c) repurpose the directory for something else entirely.
- **Advantages:** (a) — removes dead repository surface. (b) — preserves the name/slot if ever needed. (c) — reclaims the namespace for concrete future use.
- **Disadvantages:** (a) — none meaningful. (b) — perpetuates a confusing empty stub. (c) — speculative, no concrete plan exists for reuse.
- **Engineering impact:** Directly implements `PRB-017`; purely cosmetic/hygiene, zero functional impact either way.
- **Cost estimate:** None.
- **Time estimate:** Minutes, once decided.
- **Risks:** None meaningful in any option.
- **Recommendation:** **(a) archive/delete** — low-stakes cleanup; nothing currently depends on this directory existing.

---

## Phase 4 — Dependency Graph

```
                         ┌─────────────────────────────────────────┐
                         │   OD2-1  Release scope (Places-only vs. │
                         │          full-vision vs. phased)         │
                         │   ── THE single highest-leverage node ── │
                         └───────────────┬───────────────────────────┘
                                         │ gates
                     ┌───────────────────┴───────────────────┐
                     ▼                                       ▼
            PRB-008 (verification workflow)         PRB-009 (4 community modules)
                     │                                       │
                     └──────────────┬────────────────────────┘
                                    (if in scope, feeds Wave 2's
                                     effort total; PRB-020 BullMQ
                                     becomes relevant only if
                                     Notifications is included)

  ── Independent of OD2-1 — can proceed in parallel ──────────────────────────────

  OD2-2 (VPS sizing) ──┐
  OD2-3 (media R2/MinIO) ─┤
  OD2-4 (PITR/WAL) ───────┼──► all feed ──► PRB-001 (deploy pipeline)
  OD2-5 (offsite backup) ─┤                        │
  OD2-7 (registry) ───────┤                        │ once built, enables
  OD2-8 (tile provider) ──┤                        ▼
  OD2-9 (deploy strategy) ┘                PRB-019 (caching/CDN) — inherits
                                            OD2-2/OD2-3, no new decision needed

  OD2-6 (monitoring stack) ──► PRB-005 (monitoring & alerting)
       (logically follows PRB-001 — needs something deployed to monitor,
        but the DECISION itself has no dependency on OD2-1..9)

  OD2-11 (dependency upgrade) ──► PRB-002 (CVE remediation)      ─┐
  OD2-12 (rate-limit policy)  ──► PRB-003 (rate limiting)         ├── all three are
  OD2-13 (CORS scope)         ──► PRB-004 (CORS allow-list)      ─┘   independent of
                                                                       each other and
                                                                       of OD2-1..9

  OD2-14 (Prisma stub) ──► PRB-017 — fully independent, zero dependencies

  OD2-10 (AI budget) ──► PRB-022 — deferred, no current dependency chain
```

### Critical path
**`OD2-1` → (if scope includes community features) `PRB-008`+`PRB-009` → 4–10 additional weeks before public launch.**
Independently, **`OD2-2`…`OD2-9` → `PRB-001` (deploy pipeline)** is the critical path for *any* release regardless of scope — nothing else in the backlog matters until this exists.

### Parallelizable work
- `OD2-2`…`OD2-9` (infrastructure) can be decided in parallel with `OD2-11`/`OD2-12`/`OD2-13` (security) — no dependency between the two groups.
- `OD2-1` (release scope) can be decided in parallel with all of the above — it only gates `PRB-008`/`PRB-009`, not `PRB-001`…`004`.
- `OD2-14` (Prisma stub) and `OD2-10` (AI budget, deferred) are fully independent of everything else.

### Blocking relationships
- `PRB-001` (deploy pipeline) blocks `PRB-005` (monitoring needs something deployed) and `PRB-019` (caching/CDN needs the environment to exist).
- `OD2-1` blocks `PRB-008`, `PRB-009`, and transitively `PRB-020` (BullMQ, only needed if Notifications ships).
- No decision blocks `OD2-11`/`OD2-12`/`OD2-13` (security) — these can start immediately upon approval, independent of everything else.

### Release impact
- Deciding **only** `OD2-2`…`OD2-9`, `OD2-11`, `OD2-12`, `OD2-13` (i.e., deferring `OD2-1` and treating community features as out-of-scope by default) is **sufficient to reach "Staging only" or "Limited Release"** readiness.
- Reaching **"Public launch ready"** additionally requires `OD2-6` (monitoring) decided and built, plus an explicit resolution of `OD2-1` (even if the resolution is "defer community features" — the decision must be made, not left silent).
- `OD2-1` resolving toward full-vision scope is the only path that materially changes the overall timeline (adds 4–10 weeks).

---

## Phase 5 — Execution Proposal (Decision Waves)

### Wave 0 — Release Scope (prerequisite to all other waves)
- **Decision:** `OD2-1`.
- **Why first:** It is the only decision that reshapes the effort estimate of another wave (Operations, via `PRB-008`/`PRB-009`); every other wave's scope is unaffected by when it's decided, but deciding it early avoids re-litigating Wave C's plan later.
- **Estimated effort to decide:** No engineering effort — a single owner adjudication. Recommend deciding within days, not weeks, given how much downstream sequencing depends on it.

### Wave A — Infrastructure
- **Decisions:** `OD2-2`, `OD2-3`, `OD2-4`, `OD2-5`, `OD2-7`, `OD2-8`, `OD2-9` (+ `OD2-14` as a zero-cost housekeeping item that can be decided alongside).
- **Why grouped:** All seven feed directly into one engineering deliverable (`PRB-001`, the deploy pipeline); deciding them together avoids rework from deciding them piecemeal mid-build.
- **Estimated effort to decide:** No engineering effort — these are largely vendor/sizing choices resolvable in a single owner review session, given this package's recommendations are all pre-analyzed.
- **Downstream engineering effort unlocked:** ~3–5 days (MVP) once decided, per `PRB-001`.

### Wave B — Security
- **Decisions:** `OD2-11`, `OD2-12`, `OD2-13`.
- **Why grouped:** All three are security-hardening decisions with zero dependency on Wave A or Wave 0; can be decided the same day as Wave A, in parallel, by the same or a different reviewer.
- **Estimated effort to decide:** No engineering effort — three independent, self-contained recommendations.
- **Downstream engineering effort unlocked:** ~3–5 days combined (`PRB-002`+`PRB-003`+`PRB-004`), all parallelizable with Wave A's engineering work.

### Wave C — Operations
- **Decisions:** `OD2-6`.
- **Why here:** Logically sequenced after Wave A since monitoring is most useful once something is deployed, but the *decision itself* has no hard dependency and could be made simultaneously with Waves 0/A/B.
- **Estimated effort to decide:** No engineering effort — one recommendation.
- **Downstream engineering effort unlocked:** 2–4 days (`PRB-005`), ideally executed once `PRB-001` has produced a deployed environment to monitor.

### Wave D — Performance
- **Decisions:** **None currently open.** `PRB-019` (caching/CDN), `PRB-021` (horizontal scaling), `PRB-023` (Meilisearch/ES) all inherit choices already made in Wave A (`OD2-2`/`OD2-3`) or require real traffic data that doesn't exist yet.
- **Recommendation:** No decision-making action needed in this wave today; revisit once Wave A is built and real usage data accumulates.

### Wave E — Future Roadmap
- **Decisions:** `OD2-10` (AI budget/kill-switch) — explicitly deferred, not actionable until AI features are scheduled.
- **Estimated effort to decide:** None currently — this decision is intentionally not being made now.

**Total decision-making effort across all waves: a small number of owner review sessions (no engineering time) — the entire 14-decision package is designed to be adjudicated in one sitting, since every item already carries a repository-evidence-grounded recommendation.** The *engineering* effort unlocked by these decisions is tracked in the Production Readiness Backlog, not here.

---

## Phase 6 — Future PLACE Roadmap (Contingent on Approval — Not Yet Authorized)

**This section proposes what future engineering tasks would look like once the corresponding decisions above are approved. No task described here is authorized. No PLACE number is assigned. Nothing here may begin until its named decision(s) are explicitly approved by the owner.**

Ten backlog items (`PRB-006`, `007`, `010`…`016`, `018`) require no owner decision at all (see Phase 2) and are therefore **not** listed as "Future Tasks" below — they can be scheduled directly as ordinary engineering work once any wave is greenlit, without waiting on this package.

| Future Task | Implements decision(s) | Scope (exactly one concern each) | Measurable acceptance criteria |
|---|---|---|---|
| **Future Task A** | `OD2-2`…`OD2-9` | Provision infrastructure + build the CI/CD deploy pipeline | A committed `Dockerfile` builds `api`/`web`; a CI job pushes images to the chosen registry; a deploy step brings them up in the chosen environment; `/api/health` returns 200 there; one proven rollback (redeploy prior tag) |
| **Future Task B** | `OD2-11` | Remediate dependency vulnerabilities + add SCA gate | `npm audit --omit=dev` reports 0 critical/0 high; full unit+e2e suite passes with only dependency versions changed; CI fails on any new critical/high finding |
| **Future Task C** | `OD2-12` | Add rate limiting to public endpoints | A test proves requests past a configured threshold return `429`; existing 44 e2e tests remain green under normal test volume |
| **Future Task D** | `OD2-13` | Restrict production CORS to an explicit allow-list | In `NODE_ENV=production`, only the configured origin(s) are accepted; a test confirms a disallowed origin is rejected; dev/local behavior unaffected |
| **Future Task E** | `OD2-6` | Stand up minimum-viable monitoring & alerting | At least one uptime monitor is configured against the deployed environment; at least one error-tracking integration is live; one alert channel verified with a test alert |
| **Future Task F** | `OD2-1` (if verification is in scope) | Build the ADR-008 verification workflow (schema + service) | Migration creates the three `database.md §9` tables; repository/service/controller implemented with unit+e2e+architecture-test rigor matching the Place workstream; existing `verification_status` behavior unchanged unless the decision explicitly supersedes it |
| **Future Task G1** | `OD2-1` (if in scope) | Build the Reviews module | Controller+service+repository+DTOs+tests reach the same bar as Hotels/Restaurants/Tours; an execution report + evidence index exist |
| **Future Task G2** | `OD2-1` (if in scope) | Build the Notifications module | Same acceptance bar as G1; if async delivery is needed, depends on Future Task I (BullMQ) |
| **Future Task G3** | `OD2-1` (if in scope) | Build the Contributions module | Same acceptance bar as G1 |
| **Future Task G4** | `OD2-1` (if in scope) | Build the Community module | Same acceptance bar as G1 |
| **Future Task H** | `OD2-10` (once un-deferred) | Build AI feature(s) per `ai-architecture.md`, with an enforced budget/kill-switch | Budget threshold configurable; kill-switch verified to halt AI calls when triggered; cost/output-quality dashboard exists per `ai-architecture.md §5.5` |
| **Future Task I** | `OD2-1` (only if Notifications, G2, is in scope) | Implement a BullMQ-backed async job queue | A job can be enqueued, processed, and observed (backlog/failure metrics) end-to-end; used by Future Task G2, no other module depends on it prematurely |
| **Future Task J** | `OD2-14` | Archive/remove the `packages/database` Prisma stub | Directory removed (or explicitly documented as an intentional placeholder) from the repository; no other package references it |

No two Future Tasks share scope — each implements exactly one decision, and the four community-module tasks (G1–G4) are split per module specifically to avoid overlapping scope, matching the same discipline the Place workstream itself used (one bounded module per task).

---

## Phase 7 — Final Report

### Complete Owner Decision Package v2
14 decisions (`OD2-1`…`OD2-14`), zero duplicates, every one traced to a specific Production Readiness Backlog item and, transitively, to the original Production Readiness Assessment's risk register. Full per-decision analysis in Phase 3.

### Dependency graph
See Phase 4. Two independent dependency chains dominate: (1) `OD2-1` → `PRB-008`/`PRB-009` (release-scope-driven, optional 4–10 week addition), and (2) `OD2-2`…`OD2-9` → `PRB-001` (infrastructure-driven, mandatory for any release). Security decisions (`OD2-11`/12/13) and the Prisma-stub/AI-budget decisions (`OD2-14`/`OD2-10`) are fully independent of both chains.

### Recommended approval order
1. **Wave 0 (`OD2-1`)** and **Wave A (`OD2-2`…`OD2-9`, `OD2-14`)** and **Wave B (`OD2-11`…`OD2-13`)** — approve all three in the same sitting; none depends on the others, and this unlocks the entire engineering critical path at once.
2. **Wave C (`OD2-6`)** — approve alongside the above; execution is simply sequenced after `PRB-001` completes.
3. **Wave D** — no action needed now.
4. **Wave E (`OD2-10`)** — explicitly leave deferred; do not force a decision.

### Phased execution roadmap
Once Waves 0/A/B/C are approved: Future Tasks A (infrastructure), B/C/D (security), and E (monitoring) can all begin — A, B, C, and D are mutually parallelizable engineering work; E should follow A. Future Tasks F/G1–G4/I only become authorizable if `OD2-1`'s resolution includes them in scope. Future Task H remains dormant until `OD2-10` is un-deferred. Future Task J can happen anytime, independent of everything.

### Future implementation roadmap
12 Future Tasks defined (A, B, C, D, E, F, G1–G4, H, I, J), none PLACE-numbered, none authorized, each implementing exactly one decision with its own measurable acceptance criteria and no scope overlap.

---

*This document made no decision, implemented no code, modified no runtime, and created no PLACE task. It is a governance deliverable only, ready for owner adjudication.*
