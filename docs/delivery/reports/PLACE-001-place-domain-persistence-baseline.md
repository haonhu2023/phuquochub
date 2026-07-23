# PLACE-001 — Place Domain and Persistence Baseline

> Workstream: place · Task: PLACE-001 (analysis) · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-001.yaml`, `docs/delivery/README.md`
> Mode: inspection-first, read-only product code, evidence-driven, no fabricated completion.
> Note: this run **supersedes** the lighter first pass (`evidence/PLACE-001-baseline.md`, retained as
> evidence) with the full PLACE-001 deliverable set.

## 1. Executive Summary

Place is the **canonical core aggregate** of PhuQuocHub (ADR-001). It is substantially
implemented across persistence (TypeORM + PostGIS), repository, service, DTO, mapper,
controller, and downstream geo/search/revisions modules, plus a Next.js web UI. The
vertical modules **Hotel / Restaurant / Tour are satellite extensions of Place** (ADR-002),
not separate aggregates: they add 1:1 detail tables and 1:N child tables keyed by
`place_id`, and are classified by `categories.slug`. The BUILD_002 security remediation
(unpublished content not exposed publicly) is intact.

The baseline is coherent enough to implement on. Confirmed open items: one authoritative
persistence index missing (GAP-06, P1), coordinate validation not bounded to Phú Quốc plus
an unbounded search radius (GAP-07, P1), and an API list-contract divergence requiring
owner adjudication (GAP-05/10, P1). Verification tooling could **not** run in this
environment (no Node runtime; FAT-family volume unlinks workspace packages), so all
test/lint/typecheck results are recorded as NOT EXECUTED. No release or production evidence
exists; those states are `not_started`.

Selected next task: **PLACE-002 — Place coordinate & geo-input validation (GAP-07)**.

## 2. Scope and Method

Read-only inspection of `apps/api/src/modules/places/**` and dependencies (geo, search,
revisions, media, contacts, prices, categories, hotels), the Place migrations, the web
Place module, `prisma/schema.prisma`, and `docs/{data,api,99-decisions}`. Every material
claim cites `path:line`. Where tooling could not run, the limitation is stated, not
worked around. Framework files under `docs/delivery/` were updated; **no product source
was modified.**

## 3. Repository and Runtime Context

- Monorepo: npm workspaces + Turborepo (`package.json:6-9`), Node ≥ 20.
- API: NestJS ^10.4; global `ValidationPipe({whitelist,transform,forbidNonWhitelisted})`
  (`apps/api/src/main.ts:19-21`), `TransformInterceptor`, `AllExceptionsFilter`.
- Persistence: PostgreSQL + PostGIS via TypeORM; `data-source.ts:24` `synchronize:false`
  (migrations authoritative). Cache: Redis (`core/redis`).
- Prisma: `prisma/schema.prisma` is a reference model (ADR-013); `packages/database` is an
  empty stub — **not** the runtime ORM.
- VCS: `F:\PhuQuochub` is **not a git repository** (`git rev-parse` fails) → branch/commit/
  working-tree = `unknown`.
- Verification environment: no `node`/`npm`/`npx` on PATH; `node_modules/@phuquochub/*`
  empty (FAT-family volume, no symlinks). Lint/typecheck/build/tests **NOT EXECUTED**.

## 4. Place Domain Inventory

| Object | Path | Role |
|---|---|---|
| `Place` (entity) | `apps/api/src/modules/places/entities/place.entity.ts:25` | Core aggregate |
| `PlaceFaq` | `.../entities/place-faq.entity.ts` | 1:N satellite |
| `PlaceSeo` | `.../entities/place-seo.entity.ts` | 1:1 satellite |
| `PlaceAiSummary` | `.../entities/place-ai-summary.entity.ts` | 1:1 satellite |
| Enums | `.../place.enums.ts:3-38` | PlaceStatus, PriceRange, VerificationStatus, FaqStatus, AiSummaryStatus |
| `GeoJSONPoint` | `.../place.enums.ts:41-44` | Coordinate value type `[lng,lat]` |

Place identity: `id` uuid pk (`place.entity.ts:26-27`), immutable. Lifecycle dimensions are
**distinct**: `status` (draft/pending/published/archived) vs `verification_status` (6-value)
vs soft-delete (`deleted_at`). Audit: `created_by`/`updated_by`/`created_at`/`updated_at`
(`:89-99`). Cache fields (job-synced): `rating_avg`, `rating_count`, `view_count`.

## 5. Persistence and Entity Mapping

| Domain Object | Entity Path | Table | PK | Key Relations | Migration | Status |
|---|---|---|---|---|---|---|
| Place | `place.entity.ts` | `places` | `id` uuid | category_id→categories, cover_image_id→media | `1720000400000-InitPlaces.ts:29-56` | implemented_unverified |
| PlaceFaq | `place-faq.entity.ts` | `place_faqs` | `id` | place_id→places CASCADE | `:113-127` | implemented_unverified |
| PlaceSeo | `place-seo.entity.ts` | `place_seo` | `place_id` | place_id→places CASCADE | `:129-139` | implemented_unverified |
| PlaceAiSummary | `place-ai-summary.entity.ts` | `place_ai_summary` | `place_id` | place_id→places CASCADE | `:141-151` | implemented_unverified |
| (satellite) hotel | — (raw SQL) | `place_hotel_details` | `place_id` | place_id→places CASCADE | `1720001000000-InitHotel.ts:16-24` | implemented_unverified |

Entity ↔ migration ↔ Prisma field alignment: **CONFIRMED aligned** (full field table in
`evidence/PLACE-001-baseline.md §A`). All classifications are `implemented_unverified`
because migrations cannot be executed here (no Node/DB). `synchronize:false` means the
entity `@Index(['categoryId','status'])` (`place.entity.ts:24`) is descriptive only.

## 6. Migration Inventory

19 forward migrations (`InitExtensions` → `InitSources`). Place-relevant:

| Migration | Purpose | Risk | Notes |
|---|---|---|---|
| `1720000000000-InitExtensions` | postgis/unaccent/pg_trgm/pgcrypto | low | idempotent |
| `1720000200000-InitCategories` | categories (Place FK target) | low | precedes places |
| `1720000400000-InitPlaces` | places + satellites + media + contacts + price_history + `immutable_unaccent` + GIST + FTS | medium | core; **index gap GAP-06** |
| `1720000700000-InitWikiRevisions` | wiki_revisions (Place history) | low | consumer |
| `1720000900000-SeedInitialPlaces` | seed | low | data |
| `1720001000000-InitHotel` | `place_hotel_details`/`hotel_room_types`/`amenities`/`place_amenities` (ADR-002) | medium | satellites keyed by place_id |
| `1720001100000-InitRestaurant`, `1720001200000-InitTour` | restaurant/tour satellites | medium | same pattern (verified for hotel) |
| `1720001600000-SeedPlacesExpansion` | seed | low | data |

Detected: **entity fields all covered** by migration; no orphan columns found in `places`.
**Missing index:** `BTREE(status) WHERE deleted_at IS NULL` (see §20 GAP-06). No destructive
op, rename, or nullable→non-null transition observed in the Place path. Migrations **NOT
EXECUTED** (no Node/DB).

## 7. Repository and Service Flows

Repository `places.repository.ts` — parameterized raw SQL (geo/FTS centralized):

| Flow | Method | Evidence |
|---|---|---|
| create Place | `createPlace` | `:96-121` (`ST_MakePoint($4,$5)` lng,lat) |
| read by id (card) | `getCardById` | `:131-137` (`deleted_at IS NULL`) |
| read by slug (card) | `getCardBySlug` | `:123-129` — **no consumer (dead code)** |
| read detail by slug | `getDetailBySlug` | `:145-156` (`status=$2` published — BUILD_002) |
| list | `list` | `:202-244` (filters + offset; default published `:225`) |
| update scalars / location | `updateScalars`/`updateLocation` | `:170-183` |
| archive / setStatus | `archive`/`setStatus` | `:185-194` |
| nearby / bbox / clusters | `nearby`/`bbox`/`bboxClusters` | `:247-318` (ST_DWithin/ST_Intersects) |
| search | `searchFullText`/`searchCount` | `:320-347` (FTS + ts_rank) |

Service `places.service.ts`: create (`:101-139`, → status pending, uniqueSlug, revision
pending), update (`:141-183`, `!==undefined` patch semantics, revision approved), archive
(`:185-201`, + audit), approve (`:203-218`, → published + audit). Transaction boundaries:
single-statement writes; `hotels.repository.ts:68-77` uses `manager.transaction` for
`replaceRooms` (evidence the pattern exists). N+1: `getBySlug` issues 4 bounded parallel
satellite queries (`:68-73`) — acceptable. **Absent flows:** explicit unpublish/restore;
public read-by-id (only by slug).

## 8. DTO, Validation, and Mapper Contracts

DTOs (`dto/places.dto.ts`): `GeoPointDto` (`:17-23` global lat/lng ranges), `CreatePlaceDto`
(`:25-54`), `UpdatePlaceDto` (`:56-83` all optional), `ListPlacesQueryDto` (`:90-105`,
**no status** — BUILD_002). Mappers (`places.mapper.ts`): `toPlaceCard` (`:24-46`),
`toPlaceDetail` (`:50-61`) — snake_case, numeric coercion for `rating_avg`/`osm_id`.
Confirmed mismatches: openapi vs DTO list params (§20 GAP-05/10); API `PlaceCard` (enum-typed,
`places.mapper.ts:6-21`) vs web `PlaceCard` (`string`-typed, `apps/web/src/modules/places/types.ts:6-21`)
(GAP-11). Patch semantics correct (service `:154-161`).

## 9. API Surface

| Method | Route | Handler | Request | Response | Auth | Status |
|---|---|---|---|---|---|---|
| GET | `/api/places` | `list` (`places.controller.ts:30-33`) | `ListPlacesQueryDto` | `PlaceCard[]` (paginated env) | `@Public` | implemented_unverified |
| GET | `/api/places/:id/revisions` | `listRevisions` (`:37-41`) | uuid | revisions | `@Public` | implemented_unverified |
| GET | `/api/places/:slug` | `getBySlug` (`:43-47`) | slug | `Place` detail | `@Public` | implemented_unverified |
| POST | `/api/places` | `create` (`:49-54`) | `CreatePlaceDto` | `PlaceCard` | `Place.Create` | implemented_unverified |
| PATCH | `/api/places/:id` | `update` (`:56-64`) | `UpdatePlaceDto` | `PlaceCard` | `Place.Edit.Managed` | implemented_unverified |
| DELETE | `/api/places/:id` | `archive` (`:66-70`) | uuid | null | `Place.Archive` | implemented_unverified |
| POST | `/api/places/:id/approve` | `approve` (`:72-76`) | uuid | null | `Place.Approve` | implemented_unverified |

Route order: `:id/revisions` (2-seg) before `:slug` (1-seg) — no collision. Detail is
slug-only (no public read-by-id). Error handling via global `AllExceptionsFilter`.

## 10. Consumer Matrix

| Consumer | Path | R/W | Fields | Contract Source | Dependency Class |
|---|---|---|---|---|---|
| geo module | `apps/api/src/modules/geo/*` | R | card + distance | `places.repository` | compiled (not runtime-verified) |
| search module | `apps/api/src/modules/search/*` | R | card + score | `places.repository` | compiled |
| revisions | `apps/api/src/modules/revisions/*` | R/W | snapshot | service | compiled |
| hotels/restaurants/tours | `apps/api/src/modules/{hotels,restaurants,tours}/*` | R/W | places JOIN satellite | raw SQL on `places` | compiled |
| web list/detail | `apps/web/src/modules/places/*`, `app/(public)/places/*` | R | card/detail | duplicated `types.ts` | declared |
| media/contacts/prices | polymorphic `owner_type='place'` | R/W | owner_id | repositories | compiled |

Per README evidence policy, **runtime/production dependency = not verified** (no deployment/
telemetry evidence). Imports alone are treated as declared/compiled, not runtime.

## 11. Shared Contract Analysis

`@phuquochub/shared-types` (`packages/shared-types/src/`) contains envelope/pagination/health
only (`api-response.ts`, `health.ts`) — **no Place transport types**. The Place contract is
therefore **duplicated**: API `places.mapper.ts:6-21` vs web `types.ts:6-21`. Conclusion:
**no single authoritative Place transport contract**; the persistence/domain SSOT is
`docs/data/modules/places.md` + the entity, but the wire contract is split (GAP-11).

## 12. Geospatial Analysis

Single `geography(Point,4326)` column (`place.entity.ts:38-39`; migration `:35`) — one source
of truth, no duplicated scalar lat/lng columns. Coordinate order consistent: write `(lng,lat)`
(`places.repository.ts:101,107-108`), read `ST_Y=lat/ST_X=lng` (`:81`), GeoJSON `[lng,lat]`
(`place.enums.ts:44`), response `{lat,lng}` (`places.mapper.ts:37`). GIST index present
(`migration :59`). `ST_DWithin`/`ST_Intersects` used index-appropriately. **No reversed-axis,
no missing spatial index.** Gap: no Phú Quốc coordinate bound; unbounded `radius` (§20 GAP-07).
PostGIS runtime functioning **not verified** (no DB).

## 13. Place–Business Ownership Analysis

There is **no separate Business entity table**. "Business" semantics attach to a **Place**:
`media.business_id` is `REFERENCES places(id)` (`1720000400000-InitPlaces.ts:73`), and the
Prisma `Place` model carries back-relations `business_claims BusinessClaim[]` and
`business_members BusinessMember[]` (`schema.prisma:443-444`). Ownership direction: a Place
may be claimed/owned via `business_claims`/`business_members` (claim workflow), not via a
`business_id` on Place. Orphan/lifecycle: Place exists independently of any claim. Model
classification: **single canonical Place + claim/membership overlay** (no competing ownership
model detected in the API module).

## 14. Category and Vertical-Module Analysis (critical)

**Confirmed: Hotel/Restaurant/Tour are satellite extensions of Place (ADR-002), classified
by category — not separate aggregates or duplicates.** Evidence:
- `1720001000000-InitHotel.ts:3` — "Hotel (ADR-002 satellite của Place, discriminator =
  categories.slug='hotel')".
- `place_hotel_details.place_id uuid PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE`
  (`:16-17`) — 1:1 extension; `hotel_room_types`/`place_amenities` keyed by `place_id`
  (`:30,60-62`).
- `hotels.repository.ts:25` — `FROM places p JOIN place_hotel_details hd ON hd.place_id = p.id`.

Category model: **single category per Place** — `place.entity.ts:35-36` `categoryId` (one
uuid, NOT NULL), FK→categories. Multi-category is not implemented on Place. Restaurant and
Tour follow the same satellite pattern (migrations `1720001100000`/`1720001200000` present;
pattern verified in depth for hotel). Implication: the canonical aggregate is Place; verticals
must never be modeled as parallel Place copies.

## 15. Data Provenance and Content Lifecycle

Present: `osm_id` external identifier (`place.entity.ts:86-87`); `sources` module + polymorphic
`source_attributions` (source.md); `wiki_revisions` for Place history (`InitWikiRevisions`,
consumed by `revisions` service; service records revisions on create/update
`places.service.ts:129-137,172-181`); `verification_status` cache (ADR-008); `status`
draft/pending/published/archived workflow; audit via `AuditService` (`places.service.ts:192-199`,
ADR-016). Community submissions land as `pending` (`:121`). Current capability supports the
community-data direction at a foundational level; full moderation/claim workflows are
Sprint-4 scope (per service comments). Not proposing a provenance subsystem here.

## 16. Test Inventory and Validation Results

| Type | Path | Subject | Executable here |
|---|---|---|---|
| unit (mapper) | `places.mapper.spec.ts` | `toPlaceCard` | NOT EXECUTED (no Node) |
| unit (mapper) | `places-detail.mapper.spec.ts` | `toPlaceDetail` | NOT EXECUTED |
| unit (repo) | `repositories/places.repository.spec.ts` | status filter + list default | NOT EXECUTED |
| unit (dto) | `dto/places.dto.spec.ts` | rejects `status` | NOT EXECUTED |
| — | (missing) `places.service.spec.ts` | — | blocked (imports `@phuquochub/utils`) |

Missing: service, controller, meaningful e2e assertions. **Commands executed:** none of
lint/typecheck/jest/e2e could run — see §26. Path-existence checks passed.

## 17. Configuration and Registration

`PlacesModule` is **registered** in `app.module.ts:15,42`; wired with TypeOrmModule.forFeature
+ deps in `places.module.ts:16-28`. Geo/Search/Hotels/Restaurants/Tours modules also registered
(`app.module.ts:43-48`). DataSource config `data-source.ts` (env-driven; `synchronize:false`).
Classification: **registered** and reachable.

## 18. Documentation Authority and Drift

- SSOT (authoritative per ADR-001/B7): `docs/data/modules/places.md` (schema + index list
  `:29,68-69`).
- API contract: `docs/api/api.md` (`:182-186`), `docs/api/openapi.yaml` (`:458-471`).
- Decisions: `docs/99-decisions/ADR-001` (Place core), `ADR-002` (Place extension/satellite),
  `ADR-013` (Prisma readiness), `ADR-008`, `ADR-016`.
- Governance: `enterprise-engineering-framework/00-governance/authority-and-scope.md`.
Drift: openapi lists `status`/`sort`/`cursor` for `listPlaces` not honored by impl (§20
GAP-05/10). Prisma vs TypeORM dual-source (GAP-15). Authority order (SSOT → ADR → migrations →
entity → openapi → tests) governs conflicts.

## 19. Contradiction Register

| ID | Subject | Evidence A | Evidence B | Impact | Severity | Confidence | Resolution direction |
|---|---|---|---|---|---|---|---|
| C-1 | List query params | `openapi.yaml:467,468,470` (status/sort/cursor) | `places.dto.ts:90-105` (absent) + `main.ts:20` (400) | public callers using documented params get 400 | high | high | Owner adjudication; then sync doc or DTO |
| C-2 | Place transport contract | `places.mapper.ts:6-21` (enum types) | `apps/web/.../types.ts:6-21` (string types) | drift risk on enum/shape change | medium | high | Introduce shared-types Place contract |
| C-3 | ORM source of truth | `prisma/schema.prisma:400` | `core/database/migrations/*` (TypeORM) | dual model can drift | medium | high | Record ADR-013 authority; Prisma = reference |
| C-4 | Pagination meta key | `pagination.ts` comment ("limit") | emits `pageSize` (`api-response.ts:32-37`) | cosmetic; frontend ignores meta | low | high | Align comment/field |
| C-5 | `getCardBySlug` vs convention | `places.repository.ts:123-129` (no status filter, no consumer) | public reads filter published | latent if wired later | low | high | Remove or add filter |

## 20. Gap Register

| ID | Category | Description | Evidence | Class | Treatment | Candidate task |
|---|---|---|---|---|---|---|
| GAP-06 | persistence | Missing partial `BTREE(status) WHERE deleted_at IS NULL` | `InitPlaces.ts:57-63` vs `places.md:68-69` | required before production | forward-only migration | PLACE-003 |
| GAP-07 | validation | Coordinates not bounded to Phú Quốc; `radius` no `@Max` | `places.dto.ts:17-22`; `geo.dto.ts:5-13,23-33`; `api.md:184` | required for MVP correctness | DTO validation + spec | **PLACE-002** |
| GAP-05/10 | API | openapi `status`/`sort`/`cursor` not honored | `openapi.yaml:467-470` vs `places.dto.ts:90-105` | required before production | owner adjudication then sync | later |
| GAP-11 | mapping | No shared Place transport type (API vs web duplication) | `places.mapper.ts:6-21` vs `types.ts:6-21` | recommended later | shared-types Place contract | later |
| GAP-12 | data quality | List order lacks unique tie-breaker | `places.repository.ts:239` | recommended later | add `p.id` tie-breaker | later |
| GAP-15 | documentation | Prisma vs TypeORM dual-source; `packages/database` empty | `schema.prisma` vs migrations | recommended later | ADR note | later |
| GAP-13 | domain | `getCardBySlug` dead code | `places.repository.ts:123-129` | optional | remove/guard | later |
| GAP-14 | validation | `opening_hours` unstructured | `places.dto.ts:49-50` | optional | schema when contract set | later |
| GAP-16 | mapping | meta `pageSize` vs comment | `pagination.ts:8-15` | optional | align | later |

Resolved: GAP-02/04 (unpublished exposure) — `places.repository.ts:151-153`, `places.dto.ts:90-105`.

## 21. Risk Register

| Risk | Likelihood | Impact | Severity | Evidence | Mitigation | Owner |
|---|---|---|---|---|---|---|
| Verification blocked (no Node; FAT32) | certain (now) | high | high | `node_modules/@phuquochub` empty; no node | relocate to NTFS + Node ≥20 | unassigned |
| Missing published-list index (perf) | medium | medium | medium | GAP-06 | PLACE-003 migration | place workstream |
| Out-of-region / unbounded geo input | medium | medium | medium | GAP-07 | PLACE-002 | place workstream |
| List-contract 400 for documented params | medium | medium | high | C-1 | adjudication | unassigned (owner) |
| Transport-type drift | low | medium | medium | C-2 | shared-types contract | place workstream |
| Hidden runtime consumers | unknown | medium | medium | no telemetry | keep `not verified` | unassigned |
| Seed incompatibility | unknown | medium | medium | seeds not runnable | verify once DB available | place workstream |
| Unsupported rollback (no VCS) | certain | low | low | not a git repo | init VCS | unassigned |

## 22. Current-State Classification

| Area | Classification |
|---|---|
| domain model | partial (core solid; ownership via claim overlay) |
| persistence model | implemented_unverified |
| migrations | implemented_unverified (not executed) |
| repository layer | implemented_unverified |
| service layer | implemented_unverified |
| API | implemented_unverified |
| shared contracts | partial (duplicated; no shared Place type) |
| frontend consumption | implemented_unverified |
| tests | partial (mappers/dto/repo present; service/controller/e2e missing) |
| deployment | not_started |
| production | not_started |

No area is `validated_locally` (no successful command output). None is `release_ready` or
`production_verified`.

## 23. Recommended Target Direction

1. **Canonical aggregate:** `Place` (`places` table) remains the single core aggregate (ADR-001).
2. **Verticals:** Hotel/Restaurant/Tour stay as **satellite extensions** of Place (ADR-002),
   keyed by `place_id`, classified by `category` — never parallel Place copies.
3. **Ownership:** business ownership stays as a **claim/membership overlay** on Place
   (`business_claims`/`business_members`), not a `business_id` column.
4. **Persistence SoT:** TypeORM migrations (`synchronize:false`); Prisma schema is reference
   only (ADR-013) — record explicitly (GAP-15).
5. **Canonical API contract:** reconcile `openapi.yaml` with the offset implementation after
   owner adjudication (C-1); then generate/share a single Place transport type (GAP-11).
6. **Geospatial:** keep single `geography(Point,4326)`, `{lat,lng}` response, `[lng,lat]`
   GeoJSON; add Phú Quốc bounds + radius cap (GAP-07).
7. **Compatibility to preserve:** existing slugs, published-only public reads (BUILD_002),
   snake_case response shape, `{lat,lng}` location.
8. **Solve before implementation-at-scale:** GAP-07 (now), GAP-06 (needs DB), C-1 adjudication.
9. **Defer:** GAP-11/12/13/14/15/16.
10. **Smallest safe slice:** PLACE-002 (coordinate/geo validation — DTO-only, no DB, no adjudication).

Separation: items 1-3 and 6 are **confirmed repository truth**; 4-5 mix truth + **recommendation**;
"exact Phú Quốc bbox values" is an **assumption requiring approval** (not yet a documented constant).

## 24. Selected Next Task

**PLACE-002 — Place coordinate & geo-input validation (GAP-07)** — see
`docs/delivery/tasks/PLACE-002.yaml`. Smallest coherent, locally-validatable slice resolving a
confirmed P1 with no DB and no adjudication.

## 25. Files Inspected

`apps/api/src/main.ts`, `app.module.ts`; `modules/places/**` (entity, satellites, enums, dto +
spec, repository + spec, service, controller, module, mappers + 2 specs); `modules/geo/{dto,controller,service}`,
`modules/search/*`, `modules/hotels/{repositories,*}`; `core/database/{data-source.ts,
migrations/1720000000000-InitExtensions.ts, 1720000400000-InitPlaces.ts, 1720001000000-InitHotel.ts}`;
`common/{pagination.ts,interceptors/transform.interceptor.ts}`; `packages/shared-types/src/api-response.ts`;
`apps/web/src/{lib/{api.ts,http.ts}, modules/places/{api/places.api.ts,types.ts}, app/(public)/places/page.tsx}`;
`prisma/schema.prisma`; `docs/data/modules/places.md`, `docs/api/{api.md,openapi.yaml}`; `.github/workflows/ci.yml`.

## 26. Commands Executed

| Command | Result | Cause |
|---|---|---|
| lint / typecheck / build / jest / e2e | **NOT EXECUTED** | no Node runtime; FAT32 unlinks `@phuquochub/*`; e2e also needs DB/Redis |
| YAML lint (python) | NOT EXECUTED | `python` is a non-functional WindowsApps stub |
| grep / file reads / path-existence | executed OK | used for evidence |

CI reference for how checks should run: `.github/workflows/ci.yml`.

## 27. Files Created or Modified (this task)

Created: `docs/delivery/reports/PLACE-001-place-domain-persistence-baseline.md` (this),
`docs/delivery/evidence/PLACE-001-evidence-index.md`. Rewritten to full spec:
`docs/delivery/tasks/PLACE-002.yaml`. Updated: `docs/delivery/state.yaml`,
`docs/delivery/tasks/PLACE-001.yaml`, `docs/delivery/workstreams/place.yaml`,
`docs/delivery/history/README.md`. Retained: `docs/delivery/evidence/PLACE-001-baseline.md`
(prior pass). **No product source modified.**

## 28. Explicit Non-Claims

PLACE-001 does **not** claim: implementation completion; migration execution; deployment
completion; canary completion; hypercare completion; production stabilization; consumer
migration completion; backfill completion; legacy cleanup readiness. No test/lint/typecheck/
build was executed; those results are NOT EXECUTED with cause. No production or telemetry
evidence exists.
