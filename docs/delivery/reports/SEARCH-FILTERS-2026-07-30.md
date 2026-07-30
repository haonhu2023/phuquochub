# SEARCH FILTERS DELIVERY REPORT

**Date:** 2026-07-30
**Task:** Surface `category`/`ward`/`price_range` filters on `GET /search`, per the approved
execution plan (Decision A = A1: URL-driven Server Component; Decision B = B1: implement category
filter with a new frontend `categories` API module).
**Scope discipline:** No Booking/Availability file touched. No unrelated feature added.

## 1. Files added

Backend:
- `apps/api/src/modules/search/dto/search.dto.spec.ts`

Frontend:
- `apps/web/src/modules/categories/api/categories.api.ts`
- `apps/web/src/modules/categories/api/categories.api.spec.ts`
- `apps/web/src/modules/search/SearchBox.tsx`
- `apps/web/src/modules/search/SearchFilters.tsx`
- `apps/web/src/modules/search/api/search.api.spec.ts`
- `apps/web/src/modules/search/search.module.css`

Report:
- `docs/delivery/reports/SEARCH-FILTERS-2026-07-30.md` (this file)

## 2. Files modified

Backend:
- `apps/api/src/modules/search/dto/search.dto.ts` — added optional `category`/`ward`/`price_range`.
- `apps/api/src/modules/search/search.service.ts` — passes filters through to the repository.
- `apps/api/src/modules/search/search.service.spec.ts` — fixed the now-4-arg mock assertion, added filter pass-through tests.
- `apps/api/src/modules/places/repositories/places.repository.ts` — `searchFullText`/`searchCount` gained an optional `filters` parameter, reusing `list()`'s exact parameterized-WHERE pattern.
- `apps/api/src/modules/places/repositories/places.repository.spec.ts` — added filter-condition tests.
- `apps/api/test/search-contract.e2e-spec.ts` — added 4 new filter e2e cases; all pre-existing baseline assertions verified unchanged.

Frontend:
- `apps/web/src/app/(public)/search/page.tsx` — rewritten from a client-only component to a Server Component reading `searchParams` (Decision A1), matching hotels/restaurants/tours/attractions/beaches.
- `apps/web/src/modules/search/api/search.api.ts` — `searchPlaces()` now takes a params object and returns `{data, meta}` via `apiGetPaginated` (previously discarded pagination `meta`).
- `apps/web/src/modules/search/SearchMapExplorer.tsx` — updated its call site to the new `searchPlaces` signature (a second, unrelated consumer on `/explore`, needed to preserve backward compatibility — not new scope).

Tooling:
- `.claude/launch.json` — added a missing `api` dev-server entry (was `web`-only), used to manually verify this change in-browser.

Documentation:
- `docs/api/openapi.yaml` — `GET /search` now documents `category`/`ward`/`price_range`; also removed pre-existing phantom `lat`/`lng`/`cursor` params that never matched the real `SearchQueryDto` (disclosed cleanup, not new scope).
- `docs/architecture/search.md` — marks `category`/`ward`/`price_range` as implemented; explicitly notes `type`/`rating`/`open_now` remain design-only.
- `docs/product/modules/search.md` — reviewed, left unchanged: it's a product-spec/vision document, not an implementation-status doc, and doesn't overclaim.

## 3. API changes

- `GET /search` — three new optional query params: `category` (uuid, `places.category_id`), `ward` (string), `price_range` (enum: `free|low|mid|high`). All optional; omitting all three reproduces the exact prior response (proven by the e2e baseline test, unchanged). Response shape (`SearchResult[]` inside the pagination envelope) is unchanged.
- `GET /search/suggest`, `POST /search/reindex` — untouched.

## 4. Test results

Backend:
- Unit: **74 suites / 724 tests passed** (up from 73/712 pre-task).
- e2e (search-contract only): **10/10 passed** — 6 pre-existing baseline assertions unchanged, 4 new filter cases (ward narrows results as a subset of baseline, invalid `price_range` → 400, nonsense-filter combination → empty result shape, no-filter query reproduces the exact baseline id order).
- e2e (full suite): **11 suites / 81 tests passed** — zero regression across bookings/health/auth/places/authz/security/observability/geo.

Frontend:
- Unit: **13 suites / 77 tests passed** (up from 11/? pre-task, +2 new suites: `categories.api.spec.ts`, `search.api.spec.ts`).
- Manual browser verification against the live dev DB (Docker Postgres/Redis, already running): confirmed category dropdown populated from real `GET /categories` data (9 real categories), ward filter narrowed "bien" from 20 → 4 results correctly, category filter (Resort) correctly returned only resort-type places, the empty-`q` state renders without calling the API, and `price_range=ultra-luxury` correctly returns 400.

## 5. Build results

- Backend lint (`eslint src/**/*.ts --max-warnings=0`): clean.
- Backend typecheck (`tsc --noEmit`): clean.
- Frontend lint (`eslint . --max-warnings=0`): clean.
- Frontend typecheck (`tsc --noEmit`): clean.
- Full monorepo build (`npm run build`, turbo, 4/4 tasks): succeeded. `/search` correctly classified `ƒ` (dynamic — reads `searchParams`, calls `listCategories()`/`searchPlaces()` server-side).

**Incidental finding, fixed:** while verifying the build, discovered that `nest-cli.json`'s `deleteOutDir: true` combined with `tsc`'s incremental cache (`tsconfig.build.tsbuildinfo`) can produce a **silently no-op "successful" build** — if `dist/` is deleted externally (as happened here when a `nest start --watch` process crashed under this environment's non-pinned Node v24) while the tsbuildinfo survives, tsc's incremental logic decides nothing changed and skips emitting entirely, even though the physical output is gone. Fixed by deleting the stale `tsconfig.build.tsbuildinfo`; re-verified a genuine rebuild (211 source files → 211 compiled JS files, no warning). This is a pre-existing build-tooling fragility, not caused by this task's feature code — flagging it here since it could otherwise mask a broken deploy artifact behind a green build log.

## 6. Commit hashes

| Commit | Scope |
|---|---|
| `874fdaf` | `feat(search)`: backend filter plumbing (DTO/service/repository + tests) |
| `4bbeaef` | `feat(search)`: frontend filter UI (page rewrite, SearchFilters/SearchBox, categories API module) |
| `1529c14` | `docs(search)`: OpenAPI + architecture documentation |

`git status --short` is clean after these commits.

## 7. Scope discipline confirmation

- No file under `apps/api/src/modules/bookings/` or `apps/api/src/modules/availability/` was touched.
- No migration was added or modified (no schema change — `category_id`/`ward`/`price_range` columns already existed on `places`).
- No feature beyond the three named filters (category/ward/price_range) was implemented; `type`/`rating`/`open_now` remain explicitly out of scope, as documented in `architecture/search.md`.
