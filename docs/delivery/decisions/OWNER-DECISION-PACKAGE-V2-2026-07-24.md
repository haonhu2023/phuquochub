# Owner Decision Package v2 — Production Readiness Blockers

- **Date:** 2026-07-24
- **Source:** `docs/delivery/reports/PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md` (release recommendation: **E. NOT READY**)
- **Purpose:** Every item below requires an owner decision before it can be authorized as an engineering task. **This package does not implement anything.** It carries forward the 9 unresolved decisions already named in `docs/architecture/deployment.md §15`, plus 5 new decisions this assessment discovered.
- **Status legend:** 🔴 Blocks any release · 🟠 Strongly recommended before GA · 🟡 Low-stakes / can be decided informally.

---

## OD2-1 — Release scope: which product surfaces ship in v1? 🔴

1. **Evidence.** `apps/api/src/modules/{community,contributions,notifications,reviews}` are `.gitkeep`-only stubs — zero implementation. The ADR-008 verification workflow (`verifications`/`verification_events`/`verification_votes` tables) is not migrated; only a cached `verification_status` enum column exists. README's own Wave 2+ line ("Chưa bắt đầu") is accurate for these four modules specifically.
2. **Why it exists.** The project vision (README: "Wikipedia + Reddit + Google Maps cho Phú Quốc") implies community features (reviews, contributions, discussion) as core to the product identity, but the delivered slice so far is Place/Geo/Search/Auth/RBAC + Hotel/Restaurant/Tour satellites — the "Maps" and "Wikipedia" parts, not the "Reddit" part.
3. **Business impact.** Releasing without community features may be a materially different product than what "PhuQuocHub" implies; releasing with a partial verification workflow means "verified" badges won't reflect any real vetting process.
4. **Technical impact.** None either way for the already-built slice; scope determines how much of the Priority-0/1 backlog (B-08 verification workflow) must land before release.
5. **Options.**
   - **v2-A (Recommended): Ship a "Places directory" v1** — Place/Geo/Search/Auth/RBAC + satellites only, explicitly marketed as a maps/directory product; defer Community/Reviews/Notifications/Contributions/Verification-workflow to v1.1+.
   - **v2-B: Full-vision GA** — build all four missing modules + the verification workflow before any release. Matches the original vision but adds an estimated 4–8+ weeks of net-new engineering (B-08 alone is 1–2 weeks; the other four modules are comparable in scope to what Hotels/Restaurants/Tours took).
   - **v2-C: Phased limited release** — ship the Places-directory slice to a small user cohort now (Limited Release, not GA) while building community features in parallel, re-evaluating GA readiness once both land.
6. **Advantages.** A: fastest path to any release, matches what's actually tested and mature. B: matches the full product vision from day one. C: real user feedback earliest, without overclaiming feature completeness.
7. **Disadvantages.** A: product may feel incomplete relative to its own name/positioning. B: large additional timeline, delays all other readiness work. C: requires clear communication that community features are "coming soon," and still needs all Priority-0 infra work regardless.
8. **Compatibility impact.** None — this is a scope choice, not a technical constraint.
9. **Migration impact.** B/C require the ADR-008 verification schema (net-new migrations) if verification is included.
10. **API compatibility impact.** None from this decision alone.
11. **Database impact.** Only if verification workflow (B-08) is in scope.
12. **Test impact.** Whatever new modules are built need the same testing rigor already demonstrated (unit + e2e + architecture tests) — this is a process expectation, not a decision point.
13. **Release risk.** A: low. B: highest (largest scope, most new surface area). C: medium.
14. **Long-term maintenance.** A: cleanest initial footprint. B: most complete from day one but riskiest to rush. C: balances both.
15. **Recommendation — v2-A**, given the exceptionally strong quality bar already demonstrated on the Place/Geo/Search slice; rushing four new modules plus a verification workflow to hit an arbitrary "full vision" GA would risk diluting that quality bar. Ship what's proven, iterate.
16. **Files affected.** None yet — this decision only gates which backlog items (B-08, and by extension any future community-module PLACE tasks) get authorized.
17. **Implementation effort.** Decision itself: none. Downstream: 0 weeks (v2-A) to 4–8+ weeks (v2-B) depending on choice.
18. **Verification effort.** Whatever new modules are built must clear the same bar as existing ones (unit + e2e + architecture tests, evidence-indexed reports).
19. **Acceptance criteria.** A recorded decision naming exactly which modules/features are "v1" vs "deferred," referenced by future task authorizations.
20. **Rollback.** N/A — a scope decision, not a code change.

---

## OD2-2 — Production VPS sizing & Staging co-location 🔴
*(Carried forward from `deployment.md §15` item 1.)*
- **Evidence:** `deployment.md §10` proposes a starting point of "KVM 4" (4 vCPU/16GB RAM/200GB NVMe) for Production, sized against a theoretical 100k-MAU/10k-place target — never load-tested.
- **Options:** (a) provision at the proposed KVM4 size now; (b) start smaller and scale up once real traffic data exists; (c) co-locate Dev+Staging on one smaller VPS (as the doc itself suggests) vs. separate VPSes from day one.
- **Recommendation:** Start with (b) + co-located Dev/Staging, matching the doc's own cost-optimization suggestion — nothing here has been load-tested, so provisioning for a theoretical peak before any real usage data exists is premature spend.
- **Blocks:** B-02 (deploy pipeline needs a target to deploy to).

## OD2-3 — Media storage: Cloudflare R2 vs. self-hosted MinIO 🔴
*(Carried forward, item 2.)*
- **Evidence:** `deployment.md §6.6,§10` recommends R2 for smaller VPS disk footprint and DR simplicity; MinIO is self-hosted but needs ≥1TB disk.
- **Recommendation:** R2, per the document's own stated rationale (RTO speed, disk economy) — no evidence in this assessment contradicts that reasoning.
- **Blocks:** B-02 (deploy pipeline / infra provisioning needs this settled first).

## OD2-4 — Enable PITR/WAL archiving from day one? 🔴
*(Carried forward, item 3.)*
- **Evidence:** `deployment.md §11.1` recommends WAL archiving for RPO ≤15min; adds ongoing storage cost.
- **Recommendation:** Enable from day one — the marginal cost is low relative to the risk of losing unrecoverable community-contributed data (reviews, verifications, contributions) with only a 24h dump-based RPO instead.
- **Blocks:** B-02.

## OD2-5 — Offsite backup location + encryption + RPO/RTO commitment 🔴
*(Carried forward, item 4.)*
- **Evidence:** `deployment.md §11` designs this fully but names no concrete provider/commitment.
- **Recommendation:** Same provider family as OD2-3 (R2/Backblaze) for operational simplicity; commit to the document's own proposed RPO ≤15min / RTO ≤2-4h unless the owner has a different risk tolerance.
- **Blocks:** B-02.

## OD2-6 — Monitoring stack: Prometheus/Grafana vs. Netdata + alert channel 🔴
*(Carried forward, item 5.)*
- **Evidence:** `deployment.md §12` designs 7 monitoring domains against either stack; none implemented (confirmed, this assessment).
- **Recommendation:** Start with the lighter Netdata option (per the doc's own "GĐ đầu" framing) plus a single alert channel (Telegram or Slack), matching B-02d's "minimum viable" framing; upgrade to full Prometheus/Grafana once real operational needs justify it.
- **Blocks:** B-02d (cannot build monitoring without a stack decision).

## OD2-7 — Container registry choice + prune policy + source mirror 🟠
*(Carried forward, item 6.)*
- **Evidence:** `deployment.md §6.8` names GHCR as the default option.
- **Recommendation:** GHCR (free with GitHub, no new vendor relationship needed); a secondary source mirror is a "nice to have," not blocking.
- **Blocks:** B-02 (deploy pipeline needs somewhere to push images).

## OD2-8 — Map tile provider: MapTiler vs. self-host 🟠
*(Carried forward, item 7.)*
- **Evidence:** `deployment.md §14` / `architecture.md §11` name this as an open question; the web app already uses `maplibre-gl` (confirmed dependency in `apps/web/package.json`), which works with either.
- **Recommendation:** MapTiler (managed) initially — self-hosting tile servers is meaningful added ops burden for no clear benefit at current scale.
- **Blocks:** Nothing in the Priority-0 backlog directly, but the web map feature's production behavior depends on it.

## OD2-9 — Zero-downtime deploys from day one, or accept a maintenance window initially? 🟠
*(Carried forward, item 8.)*
- **Evidence:** `deployment.md §9` designs blue-green deployment; not implemented (no deploy pipeline exists at all yet, per R-01).
- **Recommendation:** Accept a short maintenance window for the *first* few releases (simpler to build and verify) and add blue-green once the basic deploy pipeline (B-02) is proven reliable — trying to build both at once increases the risk of the whole pipeline being late.
- **Blocks:** Shapes how B-02 is built, not whether it's built.

## OD2-10 — AI budget threshold & kill-switch 🟡 (deferred — not currently applicable)
*(Carried forward, item 9.)*
- **Evidence:** No AI module exists in the codebase at all (`ls apps/api/src/modules | grep -i ai` → no hits); ADR-012 (AI Architecture) is Superseded, tracked only as a living design doc.
- **Recommendation:** **Defer this decision entirely** until AI features are actually scheduled for implementation (Future Roadmap FR-01) — deciding a budget/kill-switch policy for a feature with zero code today would be speculative.
- **Blocks:** Nothing currently.

---

## New decisions discovered by this assessment

## OD2-11 — Dependency upgrade approach for CVE remediation 🔴
1. **Evidence.** `npm audit --omit=dev`: 1 critical (`tar`), 6 high (`@nestjs/platform-express`, `next`, `multer`, `lodash`, `postcss`, `@mapbox/node-pre-gyp`), 10 moderate. `npm audit fix --force` reports installing `@nestjs/typeorm@11.0.3` and other majors as "breaking changes."
2. **Why it exists.** The dependency tree has aged since Sprint 0 without a scheduled upgrade pass; several transitive vulnerabilities now sit at high/critical severity.
3. **Options:** (a) full `npm audit fix --force`, accepting the NestJS 11.x / Next.js major-version migration and re-verifying the full test suite; (b) targeted manual bumps of only the vulnerable packages' direct parents, avoiding a full major-version migration; (c) do nothing and accept the risk (not recommended).
4. **Recommendation — (a) if the migration effort is acceptable, else (b) as a stopgap** — the NestJS 10→11 migration is a known, documented path; given how disciplined this repository's testing has been (221 unit + 44 e2e, all currently green), a full migration pass with re-verification against the same suites is very feasible and closes ALL flagged CVEs at once rather than leaving some unresolved via partial patching.
5. **Blocks:** B-02a, and by extension B-02 (should not ship a first deployable image with known critical CVEs already present).

## OD2-12 — Rate limiting policy: global default vs. tuned per-route limits 🔴
1. **Evidence.** Zero rate limiting exists anywhere (R-03). `deployment.md §10` estimates origin RPS of 30-80 at 100k MAU (post-CDN-cache).
2. **Options:** (a) a single global default limit (fast to ship, e.g. `@nestjs/throttler`'s out-of-box per-IP limit); (b) tuned per-route limits (stricter on write endpoints, looser on public reads) matching the traffic estimate in `deployment.md §10`; (c) defer to Cloudflare edge rate-limiting only (per `deployment.md §13`'s "hai lớp" design) and skip application-level limiting.
3. **Recommendation — (b)**, but ship (a) first as an immediate stopgap if timeline pressure exists — Cloudflare is not yet provisioned (depends on OD2-2's domain/VPS decisions), so relying solely on (c) leaves a gap until that's live.
4. **Blocks:** B-02b.

## OD2-13 — Production CORS allow-list scope 🟠
1. **Evidence.** `enableCors({ origin: true, credentials: true })` (R-04); ADR-010 designs four channels (Web `/api/v1`, Mobile, Public `/public/v1`, Partner `/partner/v1`) with potentially different origin trust levels.
2. **Options:** (a) a single allow-list entry for the production web app's own domain only; (b) a configurable allow-list covering Web + any known Partner origins; (c) per-channel CORS policy matching ADR-010's four-channel split (stricter for Public/Partner, matching their "quota by key"/"OAuth2 scope" trust model).
3. **Recommendation — (a) now, (c) once Public/Partner channels are actually built** — Public/Partner API channels don't appear implemented yet (only the internal Web-consumed endpoints exist), so a single-origin allow-list is sufficient today; revisit when those channels ship.
4. **Blocks:** B-02c; final origin value also depends on OD2-2's domain decision.

## OD2-14 — `packages/database` (Prisma stub) disposition 🟡
1. **Evidence.** `.gitkeep`-only directory; ADR-013's addendum (PLACE-025) already confirms Prisma is reference-only, not runtime.
2. **Options:** (a) archive/delete the empty stub now; (b) leave it as a placeholder for a possible future package; (c) repurpose the directory name for something else entirely.
3. **Recommendation — (a)**, low-stakes cleanup; nothing currently depends on this directory existing.
4. **Blocks:** Nothing — purely hygiene (backlog B-12).

---

## Decision summary table

| ID | Topic | Priority | Blocks |
|---|---|---|---|
| OD2-1 | Release scope (which modules ship in v1) | 🔴 | B-08 and all future community-module work |
| OD2-2 | VPS sizing / Staging co-location | 🔴 | B-02 |
| OD2-3 | Media storage (R2 vs MinIO) | 🔴 | B-02 |
| OD2-4 | PITR/WAL archiving from day one | 🔴 | B-02 |
| OD2-5 | Offsite backup location + RPO/RTO | 🔴 | B-02 |
| OD2-6 | Monitoring stack + alert channel | 🔴 | B-02d |
| OD2-7 | Container registry + prune policy | 🟠 | B-02 |
| OD2-8 | Map tile provider | 🟠 | (web map feature quality) |
| OD2-9 | Blue-green now vs. maintenance window first | 🟠 | shapes B-02 |
| OD2-10 | AI budget/kill-switch | 🟡 deferred | nothing currently |
| OD2-11 | Dependency-upgrade approach for CVEs | 🔴 | B-02a, B-02 |
| OD2-12 | Rate-limiting policy | 🔴 | B-02b |
| OD2-13 | CORS allow-list scope | 🟠 | B-02c |
| OD2-14 | `packages/database` stub disposition | 🟡 | B-12 only |

**Nothing in this package has been implemented.** Once the owner adjudicates these, the corresponding Production Readiness Backlog items become authorizable as scoped engineering tasks — numbered sequentially (PLACE-026 onward) **only upon explicit owner authorization of specific items**, not as a blanket resumption of the PLACE sequence.
