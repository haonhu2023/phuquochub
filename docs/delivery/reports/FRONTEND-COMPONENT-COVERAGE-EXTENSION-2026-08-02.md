# FRONTEND COMPONENT COVERAGE EXTENSION — FINAL STATUS

**Date:** 2026-08-02
**Milestone:** Frontend Component Coverage Extension, per the Owner-approved governance
assessment. Extends the component-rendering test pattern established by the Frontend Component
Test Coverage Foundation (2026-08-01) to the 9 browse-page card/filter components that milestone's
own §12 explicitly named as deferred. No backend change, no database change, no new product
behavior — test files only.

## 1. Status

Complete. All 9 components covered, full validation green (including two consecutive full-suite
runs), live governance-approved scope honored exactly (no moderation/business-claim/scheduler/
gallery/Transport work touched).

## 2. Previously covered components (Foundation, 2026-08-01)

`AttractionCard`, `AttractionFilters`, `SearchFilters`, `Pagination` (`components/ui`) — the
representative card + filter pair the Foundation milestone chose, plus the shared cross-module
pagination component.

## 3. Newly covered components (this milestone)

| Module | Card | Filters |
|---|---|---|
| Hotels | `HotelCard` | `HotelFilters` |
| Restaurants | `RestaurantCard` | `RestaurantFilters` |
| Tours | `TourCard` | `TourFilters` |
| Beaches | `BeachCard` | `BeachFilters` |
| Places | `PlaceCard` | — (no dedicated filter component; `PlaceCard` is the shared card used by `/places` and search results) |

9 components, 9 new `.spec.tsx` files.

## 4. Files added

- `apps/web/src/modules/hotels/HotelCard.spec.tsx` (10 tests)
- `apps/web/src/modules/hotels/HotelFilters.spec.tsx` (5 tests)
- `apps/web/src/modules/restaurants/RestaurantCard.spec.tsx` (7 tests)
- `apps/web/src/modules/restaurants/RestaurantFilters.spec.tsx` (5 tests)
- `apps/web/src/modules/tours/TourCard.spec.tsx` (9 tests)
- `apps/web/src/modules/tours/TourFilters.spec.tsx` (7 tests)
- `apps/web/src/modules/beaches/BeachCard.spec.tsx` (8 tests)
- `apps/web/src/modules/beaches/BeachFilters.spec.tsx` (6 tests)
- `apps/web/src/modules/places/PlaceCard.spec.tsx` (8 tests)

**65 new tests total.**

## 5. Files modified

- `docs/delivery/reports/MVP-GAP-ANALYSIS-AND-ROADMAP-2026-07-25.md` — roadmap item #6 (frontend
  test coverage) marked ✅ DONE, covering both the Foundation and this extension. Item #4 (Image
  Upload UI) also corrected from a stale "Still open" to ✅ DONE — narrowly scoped, factual, made
  only because item #6 in the same list section was already being edited (per instruction), not an
  opportunistic rewrite of unrelated content.
- `docs/delivery/state.yaml` — governance entry (see §14).

No component, page, or route file was modified — every target's actual behavior was read in full
before writing its test, and no test required a source change to pass.

## 6. Behaviors tested

Each file targets what is genuinely distinct about that component — no assertion was copied
blindly across files. Notable component-specific behaviors verified (not exhaustive; see each
spec file for the full list):

- **`HotelCard`**: `hotel_type` label-map fallback — an unrecognized type string (e.g.
  `'houseboat'`) renders as-is rather than being hidden or crashing, proving the `?? hotel.hotel_type`
  fallback in the source. `star_rating` renders as repeated `★` characters with an `aria-label`,
  entirely separate from `rating_avg`.
- **`RestaurantCard`**: `cuisines` array renders joined by `" · "` only when non-empty;
  `is_local_specialty` gates a dedicated badge not present on any other card.
- **`TourCard`**: `formatDuration()`'s real contract — `0` (not just `null`) hides the duration
  line, distinct from every other numeric-field test in this batch; `formatTourType()`'s
  unknown-value fallback (same "raw string, not hidden" pattern as `HotelCard`'s type, verified
  independently since it's a different formatter function); `difficulty` rendered only when
  present, unlike `tour_type` which is unconditional.
- **`BeachCard`**: links to `/places/{slug}`, **not** `/beaches/{slug}` — `BeachCard` is the only
  card of the five that does not have its own detail route (beaches have no satellite table, per
  `types.ts`'s own comment); explicitly asserted, not assumed. `price_range` is verified to never
  default to "free" for a null value (the source's own inline comment calls this out as a
  deliberate anti-assumption).
- **`PlaceCard`**: `distance_m` formatting boundary (`<1000` → meters, `≥1000` → kilometers to 1
  decimal) and its optional (`number | undefined`, not `| null`) nature — only appears on
  `/geo/nearby` results, verified absent by default.
- **All filter components**: default value for every `<select>` when its query param is absent;
  `updateParam`'s real, shared contract — setting a param preserves unrelated existing params,
  clearing a param (`"Tất cả"`) removes exactly that key, and **every** change unconditionally
  drops `page` (verified per-component, not assumed identical, since this is the one behavior that
  actually is byte-for-byte the same `updateParam` implementation across Hotel/Restaurant/Tour/
  Beach — confirmed by reading all four source files, not inferred from one).
- **`TourFilters`**: the one filter component with 6 fields (sort/type/difficulty/
  max_duration_minutes/price_range/departure_area) — tested a representative subset (not all 15
  pairwise combinations) plus one full default-state check across every field, avoiding
  combinatorial low-value duplication while still proving the shared `updateParam` contract via
  two different param changes.
- **`BeachFilters`**: `ward`/`departure_area` values render correctly when they contain Vietnamese
  diacritics in the pushed URL (`URLSearchParams`' real UTF-8 percent-encoding of "Hàm Ninh"/"An
  Thới") — verified against real encoded output, not hand-waved.

No test asserts on full HTML strings or CSS class names — all queries use
`getByRole`/`getByLabelText`/`getByText` with specific, human-meaningful matchers.

## 7. Shared test utilities

**Not added — kept inline, deliberately.** All 4 new filter-component spec files
(`HotelFilters`/`RestaurantFilters`/`TourFilters`/`BeachFilters`) use the identical
`jest.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: () => new
URLSearchParams(searchParamsString) }))` shape already established by `AttractionFilters.spec.tsx`
and `SearchFilters.spec.tsx` — meeting the "≥3 files" threshold for considering extraction.
Not extracted because of a concrete technical constraint, not just a style preference: Jest hoists
`jest.mock()` calls above all imports in a file, and its factory function may only reference
variables Jest can statically prove are safe (module-level `const`s declared above the call in the
**same file**, or identifiers prefixed `mock`). A truly shared helper would require either (a) a
`__mocks__/next/navigation.ts` manual mock wired via `moduleNameMapper` — a bigger structural
change touching `jest.config.js` and how every consumer accesses the mock's internals
(`import { __setSearchParams } from 'next/navigation'`-style), which is **more** indirection for
four call sites, not less; or (b) passing the mutable `push`/`searchParamsString` bindings into an
imported factory, which Jest's hoisting rules reject outright. The actual duplicated surface is
five lines per file, already using an identical, previously-reviewed shape — inlining keeps each
test file fully self-contained and immediately readable without cross-referencing a shared module,
matching this milestone's instruction to only extract when it clearly helps.

## 8. New test count

**65 new tests** across 9 new suites.

## 9. Full frontend test results (including consecutive runs)

| Run | Suites | Tests |
|---|---|---|
| New 9 files in isolation | 9 passed / 9 | 65 passed / 65 |
| Full suite, run 1 | **30 passed / 30** | **189 passed / 189** |
| Full suite, run 2 (determinism check) | 30 passed / 30 | 189 passed / 189, identical | 

Up from 21 suites / 124 tests (post Error/Loading Boundary Completion) — zero regression in any
pre-existing suite, both runs. No console warnings, no React `act()` warnings, in either run.

## 10. Typecheck result

`tsc --noEmit`: clean, exit 0.

## 11. Lint result

`eslint . --max-warnings=0`: clean, exit 0.

## 12. Frontend build result

`next build`: clean, all 17 routes generated (unchanged route count — test files are not routes).

## 13. Monorepo validation result

`turbo build`: 4/4. `turbo typecheck`: 6/6. `turbo lint`: 6/6. All green. `git diff --check`:
clean (only benign LF→CRLF autocrlf notices). Secret scan: no matches.

## 14. Documentation/governance updates

- This report.
- `MVP-GAP-ANALYSIS-AND-ROADMAP-2026-07-25.md` — roadmap items #4 and #6 reconciled (§5 above).
- `docs/delivery/state.yaml` — new `current.task` comment entry, prior entry preserved under a
  `---- prior state (...) ----` marker, per established convention.

## 15. Remaining coverage gaps

Explicitly **not** claimed as closed by this milestone:
- No full-page **Server Component** integration tests (data-fetching + client filter component
  together) exist yet — both this milestone and the Foundation deliberately scope to
  component-level tests only (mocking an entire Server Component page's data tree trades a little
  coverage for a lot of brittleness, per the Foundation report §5's original reasoning, unchanged
  here).
- No visual/screenshot regression testing.
- `@testing-library/user-event` still not added — every target component here, like the
  Foundation's, only exposes plain `<select onChange>` controls; `fireEvent.change` remains a
  fully faithful simulation. Unchanged trigger condition for reconsidering it (a future component
  needing realistic multi-step keyboard/focus interaction).
- Detail-page components (e.g. the five `[slug]` pages themselves, `ReviewsSection`'s already-
  tested surface aside) and non-browse-page components (map widgets, dashboard) remain untested —
  out of scope for a "browse-page card/filter" extension.

This milestone does **not** claim complete frontend coverage — it closes exactly the gap the
Foundation's own §12 named, nothing more.

## 16. Final git status

Clean after commit (verified via `git status --short` immediately before and after).

## 17. Commit hashes

| Commit | Scope |
|---|---|
| `20a12bb` | `test(web)`: extend component coverage |
| `<filled in below>` | `docs(web)`: record component coverage extension |
