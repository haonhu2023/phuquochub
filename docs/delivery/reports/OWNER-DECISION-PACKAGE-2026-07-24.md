# Owner Decision Package — Remaining Blockers to Production Release

- **Date:** 2026-07-24
- **Baseline:** D: certified green (commit `04a51c8`; lint/typecheck/unit 210 + e2e 22 green; Docker/DB up; F-2 & F-3 RESOLVED per PLACE-020).
- **Purpose:** Give the owner the evidence and options needed to adjudicate every remaining blocker. **No implementation is proposed here** — each item ends at a recommended option awaiting owner sign-off.
- **Status legend:** 🔴 Release blocker · 🟠 Release risk (should fix before GA) · 🟡 Optimization / maintenance (non-blocking).

Items: **B1 GAP-05/10** 🔴 · **B2 F-24** 🟠 · **B3 F-34** 🟠 · **B4 SearchResult.score** 🟡 · **B5 PROVISIONAL bbox** 🟠 · **B6 GAP-06/F-15** 🟡 · **B7 GAP-15** 🟡.

---

## B1 — GAP-05 / GAP-10 · List-params & pagination contract 🔴 (sole release blocker)

1. **Repository evidence.** `docs/api/openapi.yaml:461-522` (`listPlaces`) documents offset `page`/`limit`, fixed server order, and marks `status`/`sort`/`cursor` `deprecated: true` (return HTTP 400). `ListPlacesQueryDto` (`apps/api/src/modules/places/dto/places.dto.ts:98-113`) accepts only `category`, `ward`, `price_range`, `page`, `limit`. `main.ts` runs `whitelist + forbidNonWhitelisted` → unknown params ⇒ 400. `PlacesRepository.list()` (`places.repository.ts:215-263`) uses `LIMIT/OFFSET`. ADR-010 (API Versioning) is **`Proposed`, not Accepted** (`docs/99-decisions/decision-register.md:20`).
2. **Why it exists.** The published contract (openapi/api.md) once advertised `status`/`sort`/`cursor`; the implementation never built them and rejects them. PLACE-017 reconciled the *documentation* to runtime but deliberately left the params `deprecated` rather than deleted — the underlying **contract authority decision** (offset vs. cursor, and whether to keep advertising sort/status) was reserved for the owner.
3. **Business impact.** Pagination is the public discovery surface (list/map/search). Choosing offset vs. cursor affects deep-pagination correctness, client integration effort, and whether the deprecated params can ever be removed without a breaking change.
4. **Technical impact.** Offset pagination is O(n) at deep offsets and can drift under concurrent writes; keyset/cursor is stable and scalable but changes the request/response shape and needs a versioning policy (ADR-010).
5. **Options.**
   - **B1-A (Recommended): Ratify offset pagination as the contract; keep the deprecated params documented until a versioned removal.** Accept ADR-010 to define the deprecation/removal window. No runtime change now.
   - **B1-B: Implement cursor/keyset pagination.** Requires ADR-010 accepted, a new `cursor` contract, repository keyset queries, and client migration.
   - **B1-C: Remove the deprecated params from openapi now** (hard contract cut) — documentation-only.
6. **Advantages.** A: zero runtime risk, honest with the shipped behavior, defers cost until scale demands it. B: correct/scalable deep pagination, future-proof. C: cleanest contract surface immediately.
7. **Disadvantages.** A: leaves three deprecated params visible. B: largest effort; breaking for any client expecting offset; premature at 49 rows. C: risk if an unknown external consumer still reads those params (no client registry exists).
8. **Compatibility impact.** A: fully backward compatible. B: breaking (new pagination shape) — must be a new API version. C: contract-doc breaking only (runtime already 400s them).
9. **Migration impact.** A/C: none (no data). B: none for data; client-side migration required.
10. **API compatibility impact.** A: none. B: **breaking** — gated behind ADR-010 versioning. C: removes advertised (already-nonfunctional) params.
11. **Database impact.** A/C: none. B: keyset needs a stable, indexed sort key (see B6); the existing `ORDER BY rating_avg, created_at, id` is keyset-able but `rating_avg`/`created_at` are non-unique (composite cursor required).
12. **Test impact.** A: openapi-vs-DTO contract check already exists (PLACE-017); add none. B: new repository + e2e pagination tests, cursor determinism tests. C: update the contract check.
13. **Release risk.** A: **low** — recommended path to unblock GA. B: high (scope/breaking). C: low-medium (external-consumer uncertainty).
14. **Long-term maintenance.** A: one deferred cleanup (remove params at next major). B: best long-term ergonomics at cost of versioning machinery. C: minimal.
15. **Recommendation — B1-A + accept ADR-010.** The runtime is already correct and deterministic (`id` tie-breaker, PLACE-004/015). At 49 rows offset pagination is entirely adequate; cursor is a scale optimization, not a release requirement. Accepting ADR-010 gives a governed path to later remove the deprecated params (or introduce cursor as a v2) without a chaotic breaking change. This **unblocks GA** with no code change.
16. **Files affected.** Decision: `docs/99-decisions/ADR-010-api-versioning.md` (→ Accepted), `docs/99-decisions/decision-register.md`. If later removing params: `docs/api/openapi.yaml`, `docs/api/api.md`. B path (future): `places.repository.ts`, `places.dto.ts`, `openapi.yaml`.
17. **Implementation effort.** B1-A: ~0.5 day (ADR + register). B1-B: ~3–5 days. B1-C: ~0.25 day.
18. **Verification effort.** B1-A: re-run contract check + full suites (~0.25 day). B1-B: ~1–2 days.
19. **Acceptance criteria.** B1-A: ADR-010 Accepted with a defined deprecation window; contract check green; openapi unchanged at runtime; GA-blocker GAP-05/10 marked RESOLVED-by-decision.
20. **Rollback.** Documentation/ADR only → `git revert`. No runtime rollback.

---

## B2 — F-24 · `getCardById` status-filter omission (privileged vs public card) 🟠

1. **Repository evidence.** `places.repository.ts:144-150` — `getCardById` filters only `deleted_at IS NULL` (no `status`), by design (comment `:136-143`). All 5 callers are in `places.service.ts:160,178,203,223,241` — moderation/write flows (approve/archive/update), reached only through **permission-gated** controller routes. The public read path `getDetailBySlug` (`:158-169`) DOES filter `status = PUBLISHED`.
2. **Why it exists.** Moderation must read unpublished Places by id; adding a `status` filter would break approve/archive. PLACE-007 removed the sibling `getCardBySlug` (public-shaped, unfiltered) but kept `getCardById` for privileged use and raised F-24: the guarantee "never wired to a public route" is currently only a convention.
3. **Business impact.** If a future public endpoint reuses `getCardById`, unpublished (draft/pending/rejected) content leaks — the exact class of the previously-patched GAP-02/04 exposure.
4. **Technical impact.** No current defect; a latent trap. The method name doesn't signal its privileged semantics.
5. **Options.**
   - **B2-A (Recommended): Encode the invariant** — rename to `getCardByIdPrivileged` (or add an explicit doc + an architectural test asserting no `@Public` controller path reaches it) and keep behavior identical.
   - **B2-B: Split methods** — `getCardByIdForModeration` (unfiltered) + a status-filtered public variant; callers pick explicitly.
   - **B2-C: Accept as-is**, documented, relying on the existing comment + controller permission gates.
6. **Advantages.** A: makes misuse self-evident, zero behavior change, cheap. B: strongest separation. C: no work.
7. **Disadvantages.** A: rename touches 5 call sites. B: more surface for a use case that doesn't exist yet (YAGNI). C: leaves the trap latent.
8. **Compatibility impact.** All options: internal only — no API/wire change.
9. **Migration impact.** None (no data/schema).
10. **API compatibility impact.** None.
11. **Database impact.** None.
12. **Test impact.** A: add an architectural/unit test (no `@Public` route reaches the privileged method) + update controller/service specs for the rename. B: new tests for both methods.
13. **Release risk.** A: very low. B: low-medium. C: low now, but carries a latent security risk into GA.
14. **Long-term maintenance.** A: best signal-to-effort. B: heavier. C: risk compounds as the codebase grows.
15. **Recommendation — B2-A.** Convert an implicit convention into an enforced, named invariant with a regression test, without changing behavior. Smallest correct closure of a security-shaped finding.
16. **Files affected.** `apps/api/src/modules/places/repositories/places.repository.ts`, `places.service.ts` (call sites), `places.service.spec.ts` / `places.controller.spec.ts`, a new architectural test; docs note.
17. **Implementation effort.** ~0.5 day.
18. **Verification effort.** ~0.25 day (module specs + full suite).
19. **Acceptance criteria.** Privileged method clearly named/documented; a test fails if any `@Public` route can reach it; jest places unchanged in count except the added test; behavior byte-identical.
20. **Rollback.** Pure refactor → `git revert`; no runtime/data effect.

---

## B3 — F-34 · `bboxClusters` truncation policy (nondeterministic drop at 500) 🟠

1. **Repository evidence.** `geo.service.ts:12,46` calls `bboxClusters` with `limit: BBOX_MAX = 500`. `places.repository.ts:312-334` groups by grid cell with **`LIMIT 500` and NO `ORDER BY`** → when >500 cells match, which 500 survive is planner-dependent (nondeterministic); dropped clusters are arbitrary.
2. **Why it exists.** A safety cap to bound map payloads; the *policy* for which clusters to keep when capping was flagged as a product decision (PLACE-014), never decided.
3. **Business impact.** On dense/zoomed-out map views the same viewport can show different clusters between requests, and meaningful (dense) clusters can be silently omitted. At current data (49 places) the cap is never hit, so impact is future/scale-bound.
4. **Technical impact.** Nondeterministic result set; no correctness contract on the map endpoint (openapi declares no ordering guarantee).
5. **Options.**
   - **B3-A (Recommended): Deterministic priority** — add `ORDER BY cnt DESC, <grid cell key> ASC` before `LIMIT`, keeping the densest clusters and a stable tie-break. Small, behavior-improving.
   - **B3-B: Raise/remove the cap** (e.g., cap by cell size/zoom instead of a fixed 500).
   - **B3-C: Accept as-is**, document "best-effort, capped, unordered" on the endpoint.
6. **Advantages.** A: deterministic + keeps most useful clusters; cheap. B: fewer drops. C: no work.
7. **Disadvantages.** A: an ordering choice (densest-first) that the owner should ratify. B: larger payloads / perf risk. C: leaves nondeterminism in a user-facing endpoint.
8. **Compatibility impact.** A: response ordering becomes defined (additive); shape unchanged. B: potentially larger arrays. C: none.
9. **Migration impact.** None.
10. **API compatibility impact.** A: additive (was "no guarantee" → now "densest-first"); non-breaking. B/C: none.
11. **Database impact.** A: `ORDER BY cnt` is over the grouped/aggregated set (small); no index needed. B: could increase scan/agg cost.
12. **Test impact.** A: a determinism spec (two identical calls over >500 synthetic cells return the same set) + tie-break spec.
13. **Release risk.** A: low. B: medium (perf). C: low now, correctness debt at scale.
14. **Long-term maintenance.** A: closes the finding cleanly. B: needs perf tuning. C: recurring bug reports at scale.
15. **Recommendation — B3-A**, pending owner ratification of "densest-first" as the truncation semantics. Deterministic, minimal, and improves what the user sees.
16. **Files affected.** `apps/api/src/modules/places/repositories/places.repository.ts` (`bboxClusters` ORDER BY), a repository spec; optional openapi note on `/geo/bbox`.
17. **Implementation effort.** ~0.5 day.
18. **Verification effort.** ~0.25 day.
19. **Acceptance criteria.** Truncation deterministic; densest clusters retained; mutation check (remove ORDER BY) fails the new determinism spec; jest geo/places green.
20. **Rollback.** Single query change → `git revert`; no data/schema effect.

---

## B4 — SearchResult.score · public exposure of internal ts_rank 🟡

1. **Repository evidence.** `search.service.ts:19-26` emits `score: r.score ?? 0` in the public `/search` response. `places.repository.ts:29-36,358-373` computes `score` = `ts_rank(...)` and comments it as an INTERNAL ranking signal; PLACE-018 already removed `score` from `PlaceCard` but kept it on `PlaceCardRow` because `SearchResult` consumes it. openapi `SearchResult` schema governs the public shape.
2. **Why it exists.** FTS relevance is exposed as a raw float; whether that is a public contract field (vs. internal ordering only) was never decided.
3. **Business impact.** A raw `ts_rank` value is not meaningful to clients and can leak ranking-algorithm behavior; removing it later is a breaking change if clients depend on it.
4. **Technical impact.** Couples the public contract to a Postgres-specific scoring function (search.md plans Meilisearch/ES later, whose scores differ).
5. **Options.**
   - **B4-A (Recommended): Keep `score` internal** — drop it from `SearchResult`, use it only for ordering. Contract-cleanup.
   - **B4-B: Normalize + document** `score` as a stable 0–1 relevance field.
   - **B4-C: Keep raw `ts_rank`** as the public field (status quo).
6. **Advantages.** A: decouples contract from engine; simplest public shape. B: gives clients a usable, stable signal. C: no work.
7. **Disadvantages.** A: clients lose a (dubiously useful) field. B: normalization semantics must be defined + kept stable across engine changes. C: locks a Postgres-specific float into the public API.
8. **Compatibility impact.** A: removes a field (breaking if consumed). B: changes value semantics. C: none.
9. **Migration impact.** None.
10. **API compatibility impact.** A: breaking-ish (field removal) — pair with ADR-010 window. B: value-semantics change. C: none.
11. **Database impact.** None (score still computed for ORDER BY).
12. **Test impact.** A: update search specs to assert `score` absent from the public payload. B: normalization tests.
13. **Release risk.** 🟡 non-blocking either way; A/B best done before GA to avoid a later breaking removal.
14. **Long-term maintenance.** A: least coupling (survives engine swap). B: must maintain normalization. C: highest coupling.
15. **Recommendation — B4-A**, ideally before GA so the field never becomes a depended-upon contract. Order stays identical (server-side by score).
16. **Files affected.** `apps/api/src/modules/search/search.service.ts`, `docs/api/openapi.yaml` (SearchResult), search specs; `PlaceCardRow.score` stays (ordering).
17. **Implementation effort.** ~0.25 day.
18. **Verification effort.** ~0.25 day.
19. **Acceptance criteria.** `/search` no longer emits `score`; ordering unchanged (mutation check); openapi SearchResult updated; search specs green.
20. **Rollback.** `git revert`; no data effect.

---

## B5 — PROVISIONAL Phú Quốc boundary 🟠

1. **Repository evidence.** `apps/api/src/common/geo-bounds.ts:1-30` — `PHU_QUOC_BOUNDS` (`minLat 9.7, maxLat 10.6, minLng 103.7, maxLng 104.2`) is explicitly **PROVISIONAL**, derived from seed coordinates, not an authoritative source. OD-F-1 (PLACE-016) already changed it from a hard reject to an audit-only warning; global `@IsNumber/@Min/@Max` still reject truly invalid coordinates.
2. **Why it exists.** No authoritative Phú Quốc boundary constant exists in the docs/SSOT; the box was inferred to bootstrap validation.
3. **Business impact.** Coordinates outside the provisional box (e.g., Thổ Chu archipelago, legitimately part of Phú Quốc city) generate audit noise but are accepted (post OD-F-1), so no data is wrongly rejected — but the "in Phú Quốc" SSOT requirement (api.md §11, place.md:102) is not authoritatively enforced.
4. **Technical impact.** Warning signal may be inaccurate at the margins; no correctness bug (reject path already softened).
5. **Options.**
   - **B5-A (Recommended): Owner supplies an authoritative boundary** (official bbox or polygon); update the 4 constants (or move to a polygon check). Data-quality closure.
   - **B5-B: Keep provisional** with the audit-only warning (status quo), documented as accepted risk.
   - **B5-C: Remove the boundary signal entirely**, relying only on global coordinate validity.
6. **Advantages.** A: accurate warnings, satisfies SSOT. B: zero effort. C: removes misleading warnings.
7. **Disadvantages.** A: requires an external authoritative source (owner input). B: audit noise persists. C: loses a useful data-quality signal.
8. **Compatibility impact.** All: internal validation/logging only; no wire contract change (post OD-F-1).
9. **Migration impact.** None (49 seeded rows already within box).
10. **API compatibility impact.** None.
11. **Database impact.** None.
12. **Test impact.** A: update bounds specs to the authoritative values (+ any polygon logic). C: remove bounds specs.
13. **Release risk.** 🟠 not a hard blocker (rejects already softened) but a documented GA caveat until authoritative bounds exist.
14. **Long-term maintenance.** A: one-time constant/polygon update. B: recurring "why the warning?" noise. C: less signal.
15. **Recommendation — B5-A when the owner can supply an authoritative boundary; otherwise B5-B is an acceptable GA posture** given rejection is already audit-only. This is the one item that genuinely needs an external product input.
16. **Files affected.** `apps/api/src/common/geo-bounds.ts` (constants or polygon), its specs; docs note in `place.md`/`api.md`.
17. **Implementation effort.** A: ~0.5 day (constants) to ~1–2 days (polygon). B: 0.
18. **Verification effort.** ~0.25–0.5 day.
19. **Acceptance criteria.** Authoritative source cited; constants/polygon updated; specs assert the new box; seeded data still inside; warning fires only outside the authoritative area.
20. **Rollback.** `git revert` to the provisional constants.

---

## B6 — GAP-06 / F-15 · Index-usage (EXPLAIN) evidence 🟡

1. **Repository evidence.** Live DB: `idx_places_status_active` **exists** (`select indexname from pg_indexes where tablename='places'`), i.e. the GAP-06 migration `1720001900000` is applied (migrations table = 20). BUT with **49 rows**, `EXPLAIN` of the public list query returns **`Seq Scan`** (planner cost < index) — so F-15 (proof the index is *chosen*) cannot be demonstrated at this data volume. The `list()` sort keys `rating_avg`/`created_at` are non-unique (no supporting composite index; F-15).
2. **Why it exists.** F-15 asked for DB-backed proof the planner uses the index; it only manifests at scale.
3. **Business impact.** None at current scale; purely a scalability/observability assurance.
4. **Technical impact.** Index presence verified; index *efficacy* unproven; potential future need for a composite sort index if list ordering becomes hot.
5. **Options.**
   - **B6-A (Recommended): Defer with a documented evidence plan** — capture EXPLAIN under a seeded/benchmarked dataset in a later performance task; mark non-blocking.
   - **B6-B: Seed a large synthetic dataset now** and capture `EXPLAIN (ANALYZE)` proving index selection.
   - **B6-C: Add a composite index** for the list sort (`rating_avg DESC NULLS LAST, created_at DESC, id`) and prove usage.
6. **Advantages.** A: no premature optimization. B: concrete evidence. C: pre-optimizes the hot list path.
7. **Disadvantages.** A: F-15 stays open (non-blocking). B: throwaway seed data / effort. C: index maintenance cost for an unproven need.
8. **Compatibility impact.** A/B: none. C: additive migration.
9. **Migration impact.** A/B: none. C: **new migration** (forward-only, reversible) — only if the owner authorizes schema change.
10. **API compatibility impact.** None.
11. **Database impact.** A/B: none. C: one added index.
12. **Test impact.** B/C: EXPLAIN assertion in an integration test.
13. **Release risk.** 🟡 non-blocking.
14. **Long-term maintenance.** A: revisit at scale. C: another index to maintain.
15. **Recommendation — B6-A.** At 49 rows a Seq Scan is correct; forcing index usage now proves nothing. Schedule EXPLAIN evidence for a performance task once realistic volume exists. Do **not** add a schema change without owner authorization.
16. **Files affected.** A: docs only (evidence plan). C (if chosen): a new migration in `apps/api/src/core/database/migrations/` + spec.
17. **Implementation effort.** A: ~0.25 day. B: ~1 day. C: ~0.5 day.
18. **Verification effort.** A: 0. B/C: ~0.5 day.
19. **Acceptance criteria.** A: evidence plan recorded; F-15 classified non-blocking with rationale. B/C: `EXPLAIN` shows `Index Scan using idx_places_status_active` under representative data.
20. **Rollback.** A: docs revert. C: `migration:revert` (down() drops the index).

---

## B7 — GAP-15 · Prisma vs TypeORM dual-source 🟡

1. **Repository evidence.** `prisma/schema.prisma` exists as a **reference model** (ADR-013); `packages/database` is an empty stub (`.gitkeep`); the runtime ORM is TypeORM (`project-registry.yaml:34-39`, `docs/delivery/reports/PLACE-001-*.md:271-321`). ADR-013 is **Superseded** in the register.
2. **Why it exists.** Two schema representations (Prisma reference + TypeORM migrations) with no explicit authority note; risk of drift.
3. **Business impact.** None directly; a governance/maintenance clarity issue.
4. **Technical impact.** Potential confusion about the source of truth; empty `packages/database` stub is dead surface.
5. **Options.**
   - **B7-A (Recommended): Record authority explicitly** — an ADR/registry note stating TypeORM migrations are authoritative and Prisma is reference-only (or retire the stub). Documentation-only.
   - **B7-B: Retire Prisma** — delete `schema.prisma` + `packages/database`.
   - **B7-C: Adopt Prisma** as the runtime ORM (major, out of scope).
6. **Advantages.** A: clarity, zero risk. B: removes dead surface. C: n/a.
7. **Disadvantages.** A: keeps a reference file. B: loses the reference model. C: huge migration; contradicts current architecture.
8. **Compatibility impact.** A: none. B: none (unused). C: total.
9. **Migration impact.** A/B: none. C: full re-platform.
10. **API compatibility impact.** None.
11. **Database impact.** A/B: none. C: total.
12. **Test impact.** A/B: none/minimal. C: everything.
13. **Release risk.** 🟡 non-blocking.
14. **Long-term maintenance.** A: removes drift ambiguity. B: less surface. C: not recommended.
15. **Recommendation — B7-A** (optionally B7-B later). Cheapest way to remove the ambiguity; TypeORM is already the proven runtime.
16. **Files affected.** `docs/99-decisions/` (authority note/ADR), `decision-register.md`; optionally delete `prisma/`, `packages/database` (B7-B).
17. **Implementation effort.** A: ~0.25 day. B: ~0.25 day.
18. **Verification effort.** ~0.1 day (build still green).
19. **Acceptance criteria.** Authority note recorded and cross-linked; no runtime change; build/tests green.
20. **Rollback.** `git revert` (docs) / restore stub.

---

## Dependency graph

```
RELEASE BLOCKERS (must clear for GA)
  B1 GAP-05/10  ──requires──▶  ADR-010 (Proposed → Accepted)
       │
       └─(if B1-B cursor chosen)──▶ needs B6/composite sort index

RELEASE RISKS (strongly recommended before GA; independent of each other)
  B2 F-24            (independent)
  B3 F-34            (independent)
  B5 PROVISIONAL bbox (independent; needs OWNER external input)
  B4 SearchResult.score (independent; best before GA to avoid breaking removal)

OPTIMIZATION / MAINTENANCE (non-blocking; any time)
  B6 GAP-06/F-15   (independent; only couples to B1 if cursor/keyset chosen)
  B7 GAP-15        (independent)
```

- **Prevents future tasks:** `ADR-010` gates B1's clean resolution and any future cursor pagination. Nothing else gates another item, except **B1-B (cursor)** would pull in **B6/composite index**.
- **Independent (no cross-deps):** B2, B3, B4, B5, B6, B7 are mutually independent and independent of B1 under the recommended options.
- **Parallelizable:** With the recommended options, **B2, B3, B4, B7** can proceed in parallel (small, code/doc-local, disjoint files). **B5 and B6** are gated on owner input (authoritative boundary) / scale, respectively.
- **Release blockers vs optimization:** 🔴 **B1** is the only hard release blocker. 🟠 **B2, B3, B5** are release risks (correctness/security/data-quality) recommended before GA. 🟡 **B4, B6, B7** are optimization/maintenance.

## Proposed execution roadmap (current baseline → production)

> Every step is owner-gated by the decisions above; nothing starts without sign-off. Effort in engineer-days.

- **Milestone 0 — Decisions (owner, ~0 dev).** Ratify: B1-A + accept ADR-010; B2-A; B3-A (densest-first); B4-A; B5 (supply authoritative boundary or accept provisional); B6-A (defer); B7-A. Record as OWNER-DECISION-* records.
- **Milestone 1 — GA-blocker closure (~1 day).** B1-A: accept ADR-010, update decision register, mark GAP-05/10 RESOLVED-by-decision. **This clears the only release blocker.**
- **Milestone 2 — Release-risk hardening (parallel, ~1.5–2 days total).** B2-A (encode privileged invariant + test), B3-A (deterministic truncation), B4-A (drop public score). Independent files → parallelizable.
- **Milestone 3 — Data quality (~0.5–2 days, owner-input-gated).** B5-A if authoritative boundary supplied; else record B5-B accepted-risk caveat.
- **Milestone 4 — Pre-GA certification.** Full lint/typecheck/unit/e2e; clean Turbo build; boot + endpoint checks; re-run the contract check; produce a release-readiness report. (Gates: `implementation`/`testing` may advance once EXPLAIN plan (B6) is scheduled and remaining risks are closed.)
- **Milestone 5 — Post-GA / at scale (non-blocking).** B6 (EXPLAIN under realistic data; composite index if warranted), B7 (retire Prisma stub if desired), and B1-B (cursor pagination as a v2 under ADR-010) if/when deep pagination becomes hot.

**Critical path to GA:** Milestone 0 → Milestone 1 (B1-A/ADR-010) → Milestone 2 (B2/B3/B4) → Milestone 4 certification. Estimated **~3–4.5 engineer-days** of implementation after decisions, excluding B5 if it needs external boundary sourcing.

## Non-claims
This package recommends but does not implement. No code, schema, contract, or gate value is changed by producing it. GAP-05/10 remains the sole hard release blocker until the owner adjudicates B1.
