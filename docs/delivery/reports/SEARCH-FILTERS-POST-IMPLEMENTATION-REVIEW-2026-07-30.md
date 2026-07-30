# SEARCH FILTERS POST IMPLEMENTATION REVIEW

**Date:** 2026-07-30
**Scope:** Full re-read of every file changed in the Search Filters milestone (commits `874fdaf`,
`4bbeaef`, `1529c14`, `fa8ee4c`), compared against the approved implementation plan. Read-only
review except for 3 real defects found and fixed (commit `41b2136`), plus one deterministic
pre-existing build defect uncovered and fixed in the same commit.

## 1. Overall assessment

The milestone is sound. All 20 changed files were re-read in full. Conventions established by
Hotels/Restaurants/Tours/Attractions/Beaches were followed consistently — no ad hoc pattern was
invented where a precedent existed. SQL remains fully parameterized throughout. Three genuine,
if minor, defects were found during review (one wasted network call, one documentation
inconsistency, one under-strict test assertion) and have been fixed. A fourth, more serious issue
was uncovered while re-validating the build: a deterministic, reproducible build-tooling defect
unrelated to the feature code itself, now also fixed at its root cause rather than worked around.

**READY FOR RELEASE.**

## 2. Code quality

### Conventions followed correctly
- Backend filter validation (`SearchQueryDto.category/ward/price_range`) mirrors
  `ListPlacesQueryDto` exactly, including the deliberate `@IsString()` (not `@IsUUID()`) choice for
  `category`, matching the existing loose convention rather than introducing a stricter one that
  would diverge from `/hotels`/`/restaurants`/etc.
- `PlacesRepository.searchFullText`/`searchCount`'s new `filters` parameter reuses `list()`'s exact
  parameterized-WHERE-clause shape (`conds`/`args` array pattern), extracted into a small private
  `searchFilterConds()` helper shared by both methods — this is a correct, appropriately-scoped
  abstraction (not over-engineered, not duplicated between the two call sites).
- Frontend: `/search/page.tsx`'s Server Component + `SearchFilters` client component split matches
  `attractions/page.tsx` + `AttractionFilters.tsx` structurally (URL-param mutation, `page` reset on
  filter change, `q` preserved automatically since `URLSearchParams(searchParams.toString())`
  starts from the full current param set). `search.api.ts`/`categories.api.ts` match
  `attractions.api.ts`'s exact shape (`apiGetPaginated`, params object, `URLSearchParams` builder).
- `robots: { index: false }` on `/search`'s metadata is a deliberate, correct deviation from
  `/hotels`/`/attractions` (which have no `robots` override, i.e. are indexable) — search-results
  pages should not be indexed; this is standard SEO practice, not an inconsistency.

### Real defects found and fixed
1. **Wasted API call** (`apps/web/src/app/(public)/search/page.tsx`): `listCategories()` was
   called unconditionally before the `if (!q)` early-return branch, even though `SearchFilters`
   (its only consumer) never renders in that branch. Every landing on a bare `/search` (arguably
   the single most common entry state for this page) triggered an unnecessary `GET /categories`
   round trip whose result was discarded. Fixed by moving the call into a `Promise.all` alongside
   `searchPlaces()`, reached only once `q` is confirmed present — this also improves the query path
   itself (was accidentally sequential/blocking before `searchPlaces()`; is now concurrent).
   Verified via the API's own request log: no `/categories` call on `GET /search` (empty `q`); one
   call on `GET /search?q=bien`.
2. **OpenAPI schema-ref inconsistency** (`docs/api/openapi.yaml`): the new `price_range` param on
   `GET /search` inlined `enum: [free, low, mid, high]` instead of referencing
   `#/components/schemas/PriceRange` — the shared schema component used by all 5 other
   `price_range` params in the file (`/restaurants`, `/tours`, `/attractions`, plus 2 response
   schemas). A literal, duplicated enum is exactly the kind of drift risk this review was asked to
   check for: if `PriceRange`'s values ever changed, this one param would silently go stale. Fixed
   to use the shared ref.
3. **Under-strict e2e assertion** (`apps/api/test/search-contract.e2e-spec.ts`): the ward-filter
   test asserted `ids.length <= BASELINE_BIEN_IDS.length` — a bound that would still pass even if
   the ward filter silently became a no-op (returning the full, unfiltered baseline). Strengthened
   to strict `<` (plus an explicit `> 0` to rule out over-filtering to nothing), verified against
   real seed data (`ward=Dương Đông` narrows 20 → 4).

### Minor observations (not fixed — not defects)
- `apps/web/src/modules/search/search.module.css`'s `.searchButton` duplicates
  `places.module.css`'s `.btn` styling almost exactly (border/color/hover using `var(--accent)`).
  Reusing `placesStyles.btn` would have avoided this small CSS duplication. Low severity, purely
  cosmetic, zero behavioral risk — noted as a follow-up, not fixed here to avoid unnecessary churn
  in a file outside this task's direct responsibility boundary.
- `search.service.spec.ts` has two tests ("tìm không dấu" and "không truyền filter nào") that both
  prove "no filter → filters object all `undefined`"; the second fully subsumes the first (adds
  page/limit variation and also checks `searchCount`). Redundant but not wrong — flagged under Test
  Quality below, not fixed (removing a passing, non-brittle test for minor redundancy isn't a
  defect fix).

## 3. Comparison against the approved implementation plan

**Completed exactly as planned:**
- Phase 1 (backend filter plumbing), Phase 2 (frontend data layer), Phase 3 (frontend UI, Decision
  A1), Phase 4 (documentation), Phase 5 (full validation) — all delivered.
- Decision A = A1 (URL-driven Server Component): implemented exactly.
- Decision B = B1 (category filter with new `categories.api.ts`): implemented exactly.
- All required validation commands (lint/typecheck/unit/e2e/build) were run and passed before each
  commit, per instruction.

**Partially completed (by deliberate, disclosed judgment call, not omission):**
- The plan listed `docs/product/modules/search.md` as a documentation target to "check and update
  if it describes /search's current UI capability." It was reviewed and left unchanged — it's a
  product-spec/vision document, not an implementation-status doc, and already describes filtering
  as a planned capability without overclaiming `rating`/`open_now`. This was explicitly reasoned in
  the delivery report, not silently skipped.
- The plan tentatively listed a possible new `apps/web/src/modules/search/types.ts` ("TBD, small")
  for a typed sort/filter union. Not created — `/search` has no sort concept, so this was correctly
  judged unnecessary rather than added speculatively.

**Omitted:** none identified against the plan's actual required scope.

**Unexpected additions (relative to the original written plan, all justified):**
- `apps/web/src/modules/search/SearchMapExplorer.tsx` was modified — a second, unrelated consumer
  of `searchPlaces()` (used on `/explore`) that the original plan did not name, discovered only
  during implementation. Required to preserve backward compatibility (explicit requirement #3) once
  `searchPlaces()`'s signature changed. Correctly identified and fixed, not scope creep.
- `.claude/launch.json` gained an `api` dev-server entry (previously `web`-only) — added to enable
  manual browser verification of this change. A dev-tooling convenience, zero production impact,
  disclosed in the delivery report.
- The `tsconfig.build.json` fix (this review, commit `41b2136`) — a real, out-of-plan build defect
  fix, disclosed both here and in the delivery report addendum.

## 4. Test quality

- **Meaningful:** all new tests assert an actual behavioral property (filter pass-through,
  parameterized SQL shape, validation boundaries, backward-compatible defaults) rather than
  incidental implementation details.
- **Brittle assertions:** none found beyond the one already fixed (item 3, §2). The exact-index SQL
  placeholder assertions (`p.category_id = $2`, etc.) mirror the pre-existing style already used by
  `PlacesRepository.list()`'s own tests — an established, accepted convention in this file, not a
  new brittleness introduced by this task.
- **Duplicated coverage:** one minor instance noted (§2, `search.service.spec.ts`), not fixed.
- **Edge cases covered:** empty/no-filter (backward-compat), single-filter, all-three-filters,
  invalid enum value, filter combination matching zero rows, exact-boundary SQL parameter indices.
  Not covered (consistent with repo-wide precedent, not a gap specific to this task): no dedicated
  component/rendering test for `search/page.tsx` — **zero** `app/**/page.tsx` files anywhere in this
  repository have dedicated tests (confirmed via repo-wide search), so this is a pre-existing,
  repo-wide characteristic, not something this task should have uniquely addressed.

## 5. Documentation quality

- **OpenAPI vs implementation:** now matches exactly, including the fix in §2 item 2. Also
  correctly removed pre-existing phantom `lat`/`lng`/`cursor` params that never existed in the real
  `SearchQueryDto` (drift from before offset-only pagination was ratified, OD-B1/PLACE-021) —
  a disclosed cleanup while already touching that block, not scope creep.
- **Architecture docs vs implementation:** `docs/architecture/search.md` now correctly distinguishes
  implemented (`category`/`ward`/`price_range`) from design-only (`type`, `rating`, `open_now`) —
  accurate, not overclaiming.
- **Product docs vs implementation:** `docs/product/modules/search.md` reviewed, correctly left
  unchanged (§3).

## 6. Security review

- **SQL injection:** not possible. Every filter value reaches SQL exclusively as a bound parameter
  (`$n` placeholder); only placeholder *indices*, never values, are string-interpolated into the
  query text. Confirmed by direct reading of `searchFilterConds()` and both call sites.
- **Invalid enum handling:** `price_range` outside `PriceRange` → 400 via `class-validator`'s
  `@IsEnum`, confirmed both at the unit level and against a live server (e2e).
- **Invalid UUID handling:** `category` is validated as `@IsString()`, not `@IsUUID()` — an
  arbitrary non-UUID string simply matches zero rows (not an error), identical to
  `ListPlacesQueryDto`'s existing, accepted behavior for the same column. Not a new gap.
- **Malformed query parameters:** unknown/extra query params are rejected 400 by the existing
  global `ValidationPipe` (`whitelist: true, forbidNonWhitelisted: true`), inherited unchanged.
- **Pagination abuse / unexpected large limits:** `limit` has no DTO-level `@Max()` (matching
  `ListPlacesQueryDto`, which also has none), but `clampLimit()` (shared helper) caps the
  effective value at 100 server-side regardless of what's requested — confirmed unchanged and
  still in effect. `page` has no upper bound (matching every other paginated endpoint in this
  repo) — a large `page` produces a large `OFFSET`, a pre-existing, repo-wide characteristic, not
  introduced or worsened here.
- **Input validation:** complete for the 3 new fields, matching the established DTO conventions
  exactly; no gap identified.

## 7. Performance review

- **Query plan impact:** the new `category`/`ward`/`price_range` conditions are added via `AND` to
  the existing FTS `WHERE` clause, identical in shape to `PlacesRepository.list()`'s own filtering.
  `category_id` benefits from the existing `idx_places_category_status (category_id, status)`
  compound index (confirmed present, `InitPlaces` migration). `ward` and `price_range` have **no**
  supporting index — but this is a pre-existing characteristic already true for `list()`'s identical
  filters on `/hotels`/`/restaurants`/`/tours`/`/attractions`/`/beaches`, and empirical
  index-planner proof was explicitly **deferred** by Owner decision (OD-B6, PLACE-020: "Defer
  EXPLAIN/index-planner proof to a future performance task at scale. Do NOT add or alter indexes
  now"). This task correctly did not add new indexes on its own initiative, consistent with that
  standing decision.
- **Unnecessary joins:** none introduced — the query still reads only `places`, no new join.
- **Repeated database calls:** `searchFullText`/`searchCount` remain exactly 2 calls per request
  (unchanged from before this task — a pre-existing `Promise.all` pattern, not newly introduced).
  The one *new* repeated-call risk (`listCategories()` fetched on every filtered search) was
  identified and could not be fully eliminated (the dropdown genuinely needs it every time a
  query exists) — it's now at least not called wastefully in the no-query case (§2, defect 1).
- **Reuse of existing indexes:** `idx_places_fts` (GIN) remains the primary driver for the FTS
  condition, unchanged; `idx_places_category_status` is now also usable when `category` is filtered.

## 8. Technical debt

- **Introduced:** none beyond the disclosed, low-severity CSS duplication (§2) and the
  test-coverage redundancy (§2) — both noted as follow-ups below, not urgent.
- **Possible future refactoring:** if a third consumer of the `list()`-style filter-building
  pattern appears, extracting `searchFilterConds`-equivalent logic into a shared repository-level
  helper (rather than duplicated between `PlacesRepository.list()` and
  `PlacesRepository.searchFullText`/`searchCount`) would become worth doing — not yet, per this
  repo's own established "two places is fine, three is when you extract" convention (seen verbatim
  in `wards.ts`'s own comment).
- **Reusable abstractions:** `categories.api.ts` is now a real, reusable frontend module — a
  genuine gap-fill (backend `GET /categories` existed with zero frontend consumers before this
  task); future category-filter UI elsewhere in the app (e.g. a `/places` category filter) can
  reuse it directly.

## 9. Follow-up recommendations

1. (Low priority) Reuse `placesStyles.btn` instead of `search.module.css`'s near-duplicate
   `.searchButton`.
2. (Low priority) Consider removing or merging the redundant `search.service.spec.ts` test noted in
   §2/§4.
3. (Informational, not urgent) `ward`/`price_range` filtering across `list()` and now
   `searchFullText`/`searchCount` remains unindexed — already a known, Owner-deferred item (OD-B6);
   revisit if/when that deferred performance task is picked up, not specific to this milestone.
4. (Process) The build-tooling defect fixed in this review (`tsconfig.build.json`) should be spot-
   checked once against a genuinely clean CI run (not just this local re-validation) the next time
   CI executes a build, to confirm the fix holds outside this local environment too.

## Whether the milestone is READY FOR RELEASE

**Yes.** All required validation (lint, typecheck, unit tests, e2e tests, full monorepo build) was
re-run after the review fixes and passed:
- Backend: 74/74 unit suites (724 tests), 11/11 e2e suites (81 tests, including the strengthened
  ward-filter assertion).
- Frontend: 13/13 unit suites (77 tests).
- Full monorepo build: 4/4 tasks succeeded, confirmed genuine (not a stale/poisoned cache replay)
  by forcing a bypass rebuild and by running the build task 3 times consecutively with no source
  changes to prove the `tsconfig.build.json` fix holds.
- Manual browser re-verification confirmed the `listCategories()` fix behaves correctly (no
  `/categories` call on empty `q`, one call once a query exists) via the API's own request log.

No Booking or Availability file was touched at any point in this milestone or this review.

## Commit hash

`41b2136` (`fix(search): post-implementation review fixes`), on top of `fa8ee4c` (the original
delivery report commit). `git status --short` is clean.
