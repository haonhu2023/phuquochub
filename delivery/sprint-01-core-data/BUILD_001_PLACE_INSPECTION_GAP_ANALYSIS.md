# Place Module Inspection Report

> Task: BUILD_001 — Place Module Repository Inspection & Gap Analysis
> Mode: Enterprise Repository Inspection (read-only)
> Date: 2026-07-22
> Scope: Place domain only. No production code modified.

---

## 1. Executive Summary

The Place module is **substantially implemented and internally coherent**, not a greenfield stub. It has a real TypeORM entity, a matching hand-written SQL migration (PostGIS + FTS), a parameterized repository, an application service with lifecycle + revision + audit coordination, request DTOs with global validation, snake_case response mappers, a NestJS controller with permission guards, plus downstream geo/search modules and a Next.js web UI (list/detail/map/search).

**Strengths**
- Entity ↔ migration ↔ root Prisma model are closely aligned; `synchronize: false` (migrations authoritative).
- Geo/FTS access is centralized in the repository via parameterized raw SQL (no interpolation observed).
- The BUILD_002 security remediation is present and verified in source: `getDetailBySlug` filters `status = 'published'`; the public `ListPlacesQueryDto` no longer accepts `status`.
- Response envelope + pagination + frontend unwrap are mutually consistent (no list-shape break).

**Major gaps**
- **Environmental (blocks verification):** no Node.js runtime is available in this session, and workspace packages are unlinked because the repo lives on a **FAT32** volume (no symlink/junction). Lint, type-check, build, and any suite importing `@phuquochub/*` cannot be executed or verified here.
- **Persistence (P1):** the authoritative partial index `BTREE(status) WHERE deleted_at IS NULL` (places.md §3) is **not created** by any migration.
- **Validation (P1):** coordinate validation enforces only global lat/lng ranges, not the "tọa độ trong Phú Quốc" bound required by api.md §11.
- **Contract (P1, needs owner adjudication):** `docs/api/openapi.yaml` declares `status`, `sort`, and `cursor` query params for `listPlaces`; the implementation uses offset `page`/`limit`, has no `sort`/`cursor`, and rejects unknown params with `400` (`forbidNonWhitelisted`).
- **Shared contract (Medium):** there are **no shared Place types**; the API `PlaceCard`/`PlaceDetail` and the web `PlaceCard`/`PlaceDetail` are independently duplicated → drift risk.

**Readiness decision: READY WITH CONSTRAINTS.** The module is clear enough to continue implementation. Constraints: full verification is blocked by the environment (Node absent; FAT32 unlinks workspace packages), and three P1 gaps plus one contract adjudication remain open.

---

## 2. Repository Architecture

- **Monorepo:** npm workspaces (`apps/*`, `packages/*`) + Turborepo. `packageManager: npm@10.8.2`, Node ≥ 20.
- **API app (`apps/api`):** NestJS (decorators; `experimentalDecorators` + `emitDecoratorMetadata` in `tsconfig.base.json`). Global `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`, `TransformInterceptor`, `AllExceptionsFilter`, `LoggingInterceptor` (`apps/api/src/main.ts`).
- **Persistence:** **TypeORM** over PostgreSQL + **PostGIS**. DataSource at `apps/api/src/core/database/data-source.ts` (`synchronize: false`, `SnakeNamingStrategy`, migrations glob). Migrations under `apps/api/src/core/database/migrations/`.
- **Prisma:** a root `prisma/schema.prisma` exists as a model/SSOT reference (ADR-013 "prisma-readiness"), but `packages/database/prisma/migrations/` and `packages/database/src/` are **empty stubs** (`.gitkeep` only). Prisma is not the runtime ORM.
- **Web app (`apps/web`):** Next.js App Router. Public routes include `(public)/places`, `(public)/places/[slug]`, `map`, `search`, `explore`.
- **Shared packages:** `shared-types` (envelope/pagination/health only — **no Place types**), `utils` (`slugify`), `config`, `ui`.
- **Place module location:** `apps/api/src/modules/places/`.

---

## 3. Place File Inventory

| File | Purpose | Status | Issues |
|---|---|---|---|
| `apps/api/src/modules/places/entities/place.entity.ts` | TypeORM `Place` entity | Active | `@Index(['categoryId','status'])` duplicates migration index (harmless; `synchronize:false`) |
| `.../entities/place-faq.entity.ts` | `place_faqs` satellite | Active (not fully read; referenced by module) | — |
| `.../entities/place-seo.entity.ts` | `place_seo` satellite | Active | — |
| `.../entities/place-ai-summary.entity.ts` | `place_ai_summary` satellite | Active | — |
| `.../place.enums.ts` | `PlaceStatus`, `PriceRange`, `VerificationStatus`, `FaqStatus`, `AiSummaryStatus`, `GeoJSONPoint` | Active | Enums match migration + Prisma |
| `.../dto/places.dto.ts` | `GeoPointDto`, `CreatePlaceDto`, `UpdatePlaceDto`, `ListPlacesQueryDto` | Active | Coordinate bounds global only (GAP-07); `status` correctly removed from list query |
| `.../repositories/places.repository.ts` | Parameterized SQL repo (CRUD, list, nearby, bbox, clusters, FTS) | Active | `getCardBySlug` has no consumer (dead code) |
| `.../places.service.ts` | Create/update/archive/approve + revision + audit | Active | Imports `@phuquochub/utils` (`slugify`) → unlinked on FAT32 |
| `.../places.mapper.ts` | `toPlaceCard`, `toPlaceDetail` (snake_case) | Active | — |
| `.../places.controller.ts` | Routes: list, `:id/revisions`, `:slug`, create, update, archive, approve | Active | Detail by slug only (no `:id` detail) |
| `.../places.module.ts` | Wiring (TypeOrmModule.forFeature + deps) | Active | Complete |
| `.../places.mapper.spec.ts` | Unit test `toPlaceCard` | Present | Not executed (no Node) |
| `.../places-detail.mapper.spec.ts` | Unit test `toPlaceDetail` | Present | Not executed; static review consistent with mapper |
| `.../repositories/places.repository.spec.ts` | BUILD_002 regression (status filter, list default) | Present | Not executed |
| `.../dto/places.dto.spec.ts` | BUILD_002 regression (rejects `status`) | Present | Not executed |
| `apps/api/src/core/database/migrations/1720000400000-InitPlaces.ts` | Creates `places` (+ satellites, media, contacts, price_history), enums, `immutable_unaccent`, GIST + FTS + uq indexes | Active | Missing partial `status` index (GAP-06) |
| `.../migrations/1720000000000-InitExtensions.ts` | `postgis`, `unaccent`, `pg_trgm`, `pgcrypto` | Active | Idempotent |
| `.../migrations/1720000900000-SeedInitialPlaces.ts`, `1720001600000-SeedPlacesExpansion.ts` | Seed data | Present (not deep-read) | Compatibility unverified (no DB) |
| `apps/api/src/modules/geo/geo.controller.ts` / `geo.service.ts` | Consumes `repo.nearby`, `repo.bboxClusters` | Active | Coordinate bounds unverified (see GAP-07) |
| `apps/api/src/modules/search/search.service.ts` | Consumes `repo.searchFullText`, `repo.searchCount` | Active | — |
| `apps/web/src/modules/places/api/places.api.ts` | Web client `listPlaces`, `getPlace` | Active | Ignores pagination meta (returns array) |
| `apps/web/src/modules/places/types.ts` | Web `PlaceCard`/`PlaceDetail`/… | Active | Duplicates API contract (GAP-11); enums typed as `string` |
| `apps/web/src/app/(public)/places/{page,[slug]/page,...}.tsx` | Place list/detail SSR pages | Active | — |

---

## 4. Domain Model Findings

`Place` is the core entity (ADR-001). Fields (entity ↔ migration ↔ Prisma consistent): `id` (uuid pk), `name` (varchar 200), `slug` (varchar 220 unique), `categoryId` (uuid FK→categories NO ACTION), `location` (`geography(Point,4326)`), `address`, `ward`, `description`, `shortDescription`, `openingHours` (jsonb), `priceRange` (enum), `coverImageId` (uuid FK→media SET NULL), `ratingAvg` (numeric(2,1), job-synced cache), `ratingCount` (int), `viewCount` (bigint), `status` (enum), `verificationStatus` (enum, default pending), `verifiedAt`, `osmId` (bigint), `createdBy`/`updatedBy` (uuid FK→users NO ACTION), `createdAt`/`updatedAt`, `deletedAt` (soft delete).

Relations: `@ManyToOne` Category and Media (cover); `@OneToMany` PlaceFaq; `@OneToOne` PlaceSeo, PlaceAiSummary. Contacts and prices are **polymorphic** (`contacts.owner_type`/`price_history.entity_type = 'place'`) — read via separate repositories in `getBySlug`, not TypeORM relations.

**Two distinct state dimensions are correctly kept separate:** `status` (draft/pending/published/archived) vs `verification_status` (pending/verified/official/community_verified/expired/rejected); soft-delete (`deleted_at`) is distinct from `archived`. `archive()` sets both `status='archived'` and `deleted_at`.

Place functions as the central entity: Prisma back-relations show Media, Review, Contribution, CommunityPost, Verification, BusinessClaim/Member, view aggregates all reference `places`.

---

## 5. Database Findings

- **Migration ↔ entity alignment:** strong. `1720000400000-InitPlaces` creates the table, enums (`place_status`, `price_range`, `verification_status`, `faq_status`, `ai_summary_status`, media enums), `immutable_unaccent(text)` (IMMUTABLE wrapper so it is index-safe), and satellites, exactly matching entity column types/nullability.
- **Indexes present:** `uq_places_slug` (unique), `idx_places_category_status` (`category_id,status`), `idx_places_location` (GIST), `idx_places_fts` (GIN on `to_tsvector('simple', immutable_unaccent(name || ' ' || description))`).
- **Index gap (GAP-06):** places.md §3 (line 69) authoritatively lists `BTREE (status) WHERE deleted_at IS NULL`. **No migration creates it.** Every public query filters `deleted_at IS NULL AND status='published'`; this partial index is the intended support and is absent.
- **PostGIS:** `geography(Point,4326)`; extension enabled in `1720000000000-InitExtensions`. Coordinate order is consistent: writes `ST_MakePoint(lng,lat)`; reads `ST_X→lng`, `ST_Y→lat`; GeoJSON `[lng,lat]` per `place.enums.ts`.
- **No spatial/FTS inconsistency** between entity, migration, and repository SQL.
- **Prisma vs TypeORM:** root Prisma model matches the entity; but Prisma migrations dir is an empty stub. Dual-model governance drift risk (see §16).
- Migration count: 19 forward migrations (InitExtensions → InitSources). Cannot run `migration:run` (no Node/DB).

---

## 6. API Findings

Existing Place endpoints (`places.controller.ts`, prefix `/api`):

| Method | Route | Auth | Handler → Service |
|---|---|---|---|
| GET | `/api/places` | `@Public` | `list(query)` (offset page/limit; published-only) |
| GET | `/api/places/:id/revisions` | `@Public` | `revisionsService.listByPlace` (placed before `:slug`) |
| GET | `/api/places/:slug` | `@Public` | `getBySlug` (published-only; 404 otherwise) |
| POST | `/api/places` | `Place.Create` | `create` (→ status `pending`) |
| PATCH | `/api/places/:id` | `Place.Edit.Managed` | `update` |
| DELETE | `/api/places/:id` | `Place.Archive` | `archive` (soft delete + status archived) |
| POST | `/api/places/:id/approve` | `Place.Approve` | `approve` (→ published) |
| GET | `/api/geo/nearby`, `/api/geo/bbox` | `@Public` | geo module → `repo.nearby`/`bboxClusters` |
| GET | `/api/search` (place type) | `@Public` | search module → `repo.searchFullText` |

**Supported:** create, read-by-slug, list (filter category/ward/price_range, offset paginate), update, archive (soft delete), approve (publish), nearby, bbox clustering, full-text search, revision history.
**Not present / by-design-deferred:** read-by-id (public), explicit unpublish/restore, tag filtering (no tags module wired to Place yet), dedicated moderation/preview endpoint for non-published content.

**Contract mismatch (GAP-05/GAP-10 — needs adjudication):** `openapi.yaml` `listPlaces` declares params `status` (:467), `sort` (:1581), `cursor` (:1577); api.md §11 (:182) shows `?...&status=&sort=&page/cursor`. The implementation uses `page`/`limit` offset, has no `sort`/`cursor`, removed `status`, and `forbidNonWhitelisted` turns any of those into `400`. Authority conflict (documentation vs current implementation) — see §16.

Route-ordering: `:id/revisions` (2-segment) declared before `:slug` (1-segment); no collision because segment counts differ. No static GET route collides with `:slug`.

---

## 7. Validation Findings

- `GeoPointDto`: `lat ∈ [-90,90]`, `lng ∈ [-180,180]`, both `@IsNumber` (rejects NaN/strings). Zero preserved.
- `CreatePlaceDto`: `name` (string ≤200, required), `category_id` (UUID), `location` (nested validated), optional `address` ≤300, `ward` ≤120, `description`, `short_description` ≤300, `opening_hours` (`@IsObject` only), `price_range` (enum).
- `UpdatePlaceDto`: all optional; omission preserved via service `!== undefined` checks (correct patch semantics).
- `ListPlacesQueryDto`: `category`, `ward`, `price_range` (enum), `page`/`limit` (coerced `@Type(Number) @IsInt @Min(1)`). **No `status`** (BUILD_002 remediation).

**Gaps:**
- **GAP-07 (P1):** no Phú Quốc coordinate bound (api.md §11 requires "tọa độ trong Phú Quốc"). Global ranges accept any point on Earth. Applies to create/update `GeoPointDto` and likely the geo `nearby`/`bbox` DTOs.
- `opening_hours` accepts any object shape (no day/time structural validation). Medium/Low.
- Duplicate-prevention is slug-only (via `uniqueSlug` loop); no name+address/proximity dedupe (acceptable for Sprint 01).

---

## 8. Geographic Findings

- Storage: single `geography(Point,4326)` column (no duplicated scalar lat/lng columns) → one source of truth; scalars derived via `ST_X/ST_Y` at read.
- Coordinate order consistent (writes lng,lat; reads to lat/lng); GeoJSON `[lng,lat]` documented.
- Queries: `nearby` uses `ST_DWithin` on the GIST index (index-friendly; does not wrap the indexed column in a transform); `bbox`/`bboxClusters` use `ST_Intersects(location::geometry, ST_MakeEnvelope(...))`; distance via `ST_Distance` (meters, geography).
- Risks: **no radius upper bound** validation observed in repository (bound would live in geo DTO — unverified, flag for geo review); coordinate bounds not restricted to Phú Quốc (GAP-07). No reversed-axis risk found. No missing spatial index (GIST present).

---

## 9. Search and Filtering Findings

- Search = PostgreSQL FTS: `to_tsvector('simple', immutable_unaccent(name || ' ' || description)) @@ plainto_tsquery('simple', immutable_unaccent($1))`, ranked by `ts_rank`, backed by `idx_places_fts` (GIN). Vietnamese diacritic-insensitive via `immutable_unaccent`. Parameterized (no interpolation).
- Filters (list): `category_id`, `ward`, `price_range`, plus privileged `status` default `published`. All bound by `$n` placeholders built from a growing args array — safe.
- Sorting: list orders `rating_avg DESC NULLS LAST, created_at DESC`. **No unique tie-breaker** (e.g. `id`) → non-deterministic order among equal rating+created_at rows across pages. Low/Medium.
- Pagination: offset (`LIMIT/OFFSET`); `clampLimit` (default 20, max 100), `clampPage` (≥1). Bounded; no unbounded fetch.
- N+1: `getBySlug` issues 4 parallel satellite queries (contacts/prices/media/faqs) — bounded per request, acceptable. `CARD_COLS` uses a correlated subquery for `cover_image_url` per row — mild per-row cost at ≤100 rows, acceptable.

---

## 10. Mapping and Frontend Contract Findings

- **No raw entity exposure:** controllers return service results; the repository returns flat row interfaces; mappers (`toPlaceCard`/`toPlaceDetail`) build explicit snake_case DTOs matching openapi `PlaceCard`/`Place`. Internal fields (`created_by`, `updated_by`, `deleted_at`, `view_count`, `verified_at`) are not mapped into responses.
- **Envelope is consistent end-to-end:** `paginate()` returns `{success, data, meta}`; `TransformInterceptor` passes through payloads that already have `success`+`data` (no double wrap) and otherwise wraps as `{success, data, meta}`; web `apiGet` unwraps `body.data`. **The list happy-path is correct** — `listPlaces(): PlaceCard[]` returns the array; the frontend simply discards pagination `meta` (no pagination UI yet — functional limitation, not a break).
- **Numeric coercion:** `rating_avg` (numeric→`Number`|null), `osm_id` (bigint string→`Number`, safe < 2^53), `distance_m`/`score` added only when present. Consistent with the mapper specs.
- **GAP-11 (Medium):** Place transport types are duplicated — API `places.mapper.ts` `PlaceCard` (enum-typed `status`/`price_range`) vs web `modules/places/types.ts` `PlaceCard` (`string`-typed). No shared-types Place contract; drift risk if either side changes.
- **Meta naming nit:** `pagination.ts` comment says meta uses `limit`, but it emits `pageSize` (per `PaginationMeta`). Frontend ignores meta, so no runtime impact. Low.

---

## 11. Test Findings

Present Place-related tests:

| File | Tests | Executable here? |
|---|---|---|
| `places.mapper.spec.ts` | `toPlaceCard` (location, numeric coercion, optional fields) | Not run (no Node) |
| `places-detail.mapper.spec.ts` | `toPlaceDetail` (osm_id string→number, null) | Not run; imports only local files → not in the GAP-01 failing set |
| `repositories/places.repository.spec.ts` | BUILD_002 regression: `getDetailBySlug` emits `status=$2`; list default published | Not run |
| `dto/places.dto.spec.ts` | BUILD_002 regression: rejects `status=…` | Not run |

**Coverage gaps:**
- **GAP-08:** no `places.service` unit tests and no controller tests. Service tests are **blocked by GAP-01** (service imports `@phuquochub/utils`, which is unlinked on FAT32).
- **GAP-09:** Place e2e self-skips assertions when seed data is absent (per BUILD_002 §11; e2e also blocked — no Postgres/PostGIS/Redis here).
- No web component tests for Place pages.

I did **not** execute any test in this session (see §12); no pass/fail is claimed from execution.

---

## 12. Verification Results

Per §15/§20, only actually-executed commands are reported. **No build/lint/type-check/test command could be executed in this environment.**

| Attempted | Command | Result | Cause |
|---|---|---|---|
| Focused Place tests | `npx jest places` (in `apps/api`, Bash) | **NOT EXECUTED** | `npx: command not found` (Git Bash) |
| Locate Node (PowerShell) | `Get-Command node/npx`, `where.exe node` | **NOT FOUND** | No Node.js on PATH or common install dirs |
| Locate Node (Bash) | `command -v node/npm`; scan `/c` | **NOT FOUND** | Only an unrelated `Adobe Photoshop/node.exe` exists |
| Workspace link state | `ls node_modules/@phuquochub/` | **EMPTY** | FAT32 volume: npm cannot create workspace symlinks/junctions |
| Volume type | `df -T F:` | `UNKNOWN (0x20206)` (non-NTFS) | Confirms FAT-family volume (matches BUILD_002 §10 FAT32 finding) |

**Consequence:** lint, `tsc --noEmit`, `jest`, and `build` are all unrunnable here. Any suite importing `@phuquochub/*` would additionally fail to resolve until the repo is on NTFS. The BUILD_002-reported failing suites (`transform.interceptor`, `events.service`, `hotels.service`, `restaurants.service`, `search.service`, `tours.service`) are consistent with the GAP-01 (unlinked-workspace) root cause and could not be re-checked here. Findings below are from **static inspection only**.

---

## 13. Gap Register

| ID | Gap | Category | Severity | Priority | Evidence | Recommended Action |
|---|---|---|---|---|---|---|
| GAP-01 | Workspace packages unlinked (`node_modules/@phuquochub/` empty) — FAT32 has no symlink/junction | production readiness / tooling | Critical | P0 (env) | empty dir; `df -T F:` non-NTFS; service imports `@phuquochub/utils` | Move repo to an **NTFS** volume, reinstall; unblocks typecheck/build/service+e2e suites |
| ENV-1 | No Node.js runtime available in session | verification blocker | Critical | P0 (env) | `where node` not found; only Photoshop node.exe | Provide Node ≥20 to run lint/typecheck/tests |
| GAP-06 | Missing partial index `BTREE(status) WHERE deleted_at IS NULL` | database mismatch | High | P1 | places.md §3 line 69 vs `1720000400000-InitPlaces` (absent) | New forward migration adding the partial index; verify with `EXPLAIN` on published-list query |
| GAP-07 | Coordinate validation not bounded to Phú Quốc | incorrect/incomplete validation | High | P1 | api.md §11 (:184) vs `GeoPointDto` (global ranges) | Add Phú Quốc bbox check in `GeoPointDto` (+ geo DTOs); DTO-spec test |
| GAP-05/10 | openapi `listPlaces` declares `status`/`sort`/`cursor`; impl uses offset `page`/`limit` and `400`s unknown params | inconsistent contract | High | P1 | openapi.yaml :467/:1577/:1581, api.md :182 vs `ListPlacesQueryDto` + `main.ts` `forbidNonWhitelisted` | **Owner adjudication** (authority: contract vs implementation) before syncing either side |
| GAP-11 | No shared Place transport types; API & web duplicate `PlaceCard`/`PlaceDetail` | maintainability | Medium | P2 | `places.mapper.ts` vs `apps/web/.../types.ts` (enum vs string) | Introduce Place types in `@phuquochub/shared-types`; consume both sides |
| GAP-12 | List sort has no unique tie-breaker | data integrity (pagination stability) | Medium | P2 | `repo.list` `ORDER BY rating_avg DESC NULLS LAST, created_at DESC` | Append `, p.id DESC` as final tie-breaker |
| GAP-13 | `getCardBySlug` unused (dead code); also lacks status filter | maintainability / latent security | Low | P3 | no consumer in `apps/api/src` | Remove, or add status filter if a caller is introduced |
| GAP-14 | `opening_hours` accepts arbitrary object (no structural validation) | incomplete validation | Low | P3 | `CreatePlaceDto.opening_hours` `@IsObject` only | Define/validate opening-hours shape when the contract is finalized |
| GAP-15 | Prisma model vs TypeORM runtime dual-source; `packages/database` migrations empty | documentation/governance | Medium | P2 | root `prisma/schema.prisma` vs `core/database/migrations`; empty `packages/database` | Record ADR-013 authority explicitly; keep Prisma as reference or retire the stub |
| GAP-16 | Pagination meta emits `pageSize` while comment claims `limit` | inconsistent contract (minor) | Low | P3 | `pagination.ts` vs `PaginationMeta` | Align field name or comment; confirm against openapi Meta |
| — | (Resolved) unpublished exposed via detail/list `status` | security | — | Closed | `getDetailBySlug` `status=$2`; `ListPlacesQueryDto` has no `status` (BUILD_002) | Regression specs present (`places.repository.spec`, `places.dto.spec`) |

---

## 14. Recommended Implementation Sequence

Based on repository evidence (dependency order + what is unblocked without DB/Node/owner input):

1. **Environment unblock (highest leverage, outside code):** relocate repo to NTFS and provide a Node runtime — restores typecheck/build and the service/e2e test suites (GAP-01/ENV-1).
2. **GAP-07 — Phú Quocô coordinate validation** (DTO-only, SSOT-backed, no adjudication, no DB). Narrowest unblocked P1.
3. **GAP-06 — partial `status` index migration** (forward-only; verify plan once DB is available).
4. **GAP-12 — deterministic list ordering** (append `p.id` tie-breaker; cheap, correctness).
5. **GAP-05/10 — contract adjudication** (owner decides openapi vs implementation for `status`/`sort`/`cursor`), then sync the chosen side.
6. **GAP-11/GAP-15 — shared Place types + Prisma/TypeORM authority note.**
7. **GAP-08/09 — service/controller/e2e tests** (unblocked only after step 1).

---

## 15. Files Expected to Change Later (do not modify now)

- `apps/api/src/modules/places/dto/places.dto.ts` (GAP-07) and geo DTOs.
- A new migration under `apps/api/src/core/database/migrations/` (GAP-06).
- `apps/api/src/modules/places/repositories/places.repository.ts` (GAP-12 ordering; GAP-13 dead code).
- `docs/api/openapi.yaml` and/or `ListPlacesQueryDto` (GAP-05/10, after adjudication).
- `packages/shared-types/src/*` + `apps/web/src/modules/places/types.ts` + `places.mapper.ts` (GAP-11).
- New `places.service.spec.ts` / controller / e2e tests (GAP-08/09).

---

## 16. Risks and Blockers

- **Environment (P0):** FAT32 unlinks workspace packages; no Node runtime — full verification impossible here. This is the single highest-leverage fix.
- **Contract authority unresolved (P1):** openapi vs implementation for list params. Per `authority-and-scope.md`, must not silently pick a side; needs owner ruling. Documentation authority order (SSOT → ADR → migrations → entity → openapi → shared types → tests) suggests the current implementation is defensible, but the divergence must be reconciled explicitly.
- **Verification debt:** all test/lint/typecheck claims are deferred; nothing was executed. Do not treat any suite as green until run on NTFS + Node.
- **Moderator preview:** no authorized path to view non-published Place content (intentionally closed by BUILD_002); depends on future authz work (Sprint 4).

---

## 17. Readiness Decision

**READY WITH CONSTRAINTS.**

Evidence: the Place domain, persistence, repository, service, DTOs, mappers, controller, geo/search, and web UI exist and are mutually consistent; the prior security remediation is present. Constraints that must accompany any further work: (1) verification is blocked by the environment (NTFS + Node required); (2) three P1 gaps (GAP-06 index, GAP-07 coordinate bound, GAP-05/10 contract adjudication) remain open; (3) service/e2e coverage is blocked until the environment is fixed.

---

## 18. Next Recommended Task

**Place DTO coordinate validation (GAP-07).** It is the narrowest remaining P1 that is (a) SSOT-backed (api.md §11 "tọa độ trong Phú Quốc"), (b) requires no owner adjudication, (c) needs no database or migration, and (d) is testable via a DTO spec of the kind already in the repo. Recommend in parallel (outside code) the NTFS relocation + Node provisioning to lift GAP-01/ENV-1, which unblocks type-check, build, and the service/e2e suites.

---

*This report is evidence-based and read-only. No production code, migration, schema, dependency, or test was modified. No command output was fabricated; every command that could not run is marked NOT EXECUTED / NOT FOUND with its cause.*
