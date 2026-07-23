# PLACE-001 — Place Domain and Persistence Baseline (evidence record)

- Task: `PLACE-001` (Place Domain and Persistence Baseline Analysis)
- Run: 2026-07-22
- Mode: read-only inspection; no production code modified.
- Method: every claim below cites `path:line` in the current source (verified this run,
  not copied from BUILD_001/002). Commands that could not run are marked NOT EXECUTED.

---

## A. Entity ↔ migration ↔ Prisma alignment (checklist item 1) — CONFIRMED aligned

Field/type/nullability/enum cross-check of `places`:

| Field | Entity | Migration | Prisma | Match |
|---|---|---|---|---|
| id uuid pk | `place.entity.ts:26-27` | `1720000400000-InitPlaces.ts:31` | `schema.prisma:401` | ✓ |
| name varchar(200) NOT NULL | `:29-30` | `:32` | `:402` | ✓ |
| slug varchar(220) unique | `:32-33` | `:33` + `:57` (`uq_places_slug`) | `:403` | ✓ |
| category_id uuid FK NO ACTION | `:35-36`,`:104-106` | `:34` | `:404`,`:426` | ✓ |
| location geography(Point,4326) | `:38-39` | `:35` | `:405` (`Unsupported`) | ✓ |
| address/ward/description/short_description | `:41-51` | `:36-39` | `:406-409` | ✓ |
| opening_hours jsonb | `:53-54` | `:40` | `:410` | ✓ |
| price_range enum nullable | `:56-57` | `:41` | `:411` | ✓ |
| cover_image_id uuid FK SET NULL | `:59-60`,`:108-110` | `:42` + `:108-110` | `:412`,`:427` | ✓ |
| rating_avg numeric(2,1) | `:63-64` | `:43` | `:413` | ✓ |
| rating_count / view_count | `:66-70` | `:44-45` | `:414-415` | ✓ |
| status enum NOT NULL | `:72-73` | `:46` | `:416` | ✓ |
| verification_status enum default pending | `:75-81` | `:47` | `:417` | ✓ |
| verified_at / osm_id / created_by / updated_by | `:83-93` | `:48-51` | `:418-421` | ✓ |
| created_at / updated_at / deleted_at | `:95-102` | `:52-54` | `:422-424` | ✓ |

Enums match: `place.enums.ts:3-25` (`PlaceStatus` draft/pending/published/archived;
`PriceRange` free/low/mid/high; `VerificationStatus` 6 values) ==
`1720000400000-InitPlaces.ts:10-14` == `schema.prisma` PlaceStatus/PriceRange/VerificationStatus.
Runtime ORM authority: `data-source.ts:24` `synchronize: false` (migrations authoritative;
the entity `@Index(['categoryId','status'])` at `place.entity.ts:24` is descriptive only).

## B. PostGIS coordinate convention (checklist item 2) — CONFIRMED consistent

- Write: `places.repository.ts:101` `ST_SetSRID(ST_MakePoint($4,$5),4326)` with args
  `input.lng`(`:107`), `input.lat`(`:108`) → order **(lng, lat)**.
- Update: `places.repository.ts:180` same `ST_MakePoint($2,$3)` with `(lng, lat)` (`:182`... call site `places.service.ts:164` passes `lng, lat`).
- Read: `places.repository.ts:81` `ST_Y(location)=lat`, `ST_X(location)=lng`.
- GeoJSON contract: `place.enums.ts:41-44` `coordinates: [number, number] // [lng, lat]`.
- API/response shape: mapper emits `location: {lat, lng}` (`places.mapper.ts:37`).
- No reversed-axis inconsistency found. Nearby uses `ST_DWithin` on the geography column
  (`places.repository.ts:266`) — index-friendly (does not wrap the indexed column).

## C. Index set vs places.md §3 (checklist item 3) — GAP-06 CONFIRMED OPEN

- Migration indexes on `places`: `uq_places_slug` (`:57`), `idx_places_category_status`
  (`:58`), `idx_places_location` GIST (`:59`), `idx_places_fts` GIN (`:61-63`). **That is all.**
- places.md §3 authoritative index list (`docs/data/modules/places.md:68-69`) requires:
  `BTREE (category_id, status)` (present as `:58`) **and** `BTREE (status) WHERE deleted_at IS NULL`.
- The partial `status` index is **absent** from the migration (no `WHERE "deleted_at" IS NULL`
  index on `places` exists; grep of the file shows partial indexes only on media/contacts).
- **Status: OPEN (P1).** Every public read filters `deleted_at IS NULL AND status='published'`
  (`places.repository.ts:151`, `:210/225`, `:265`, `:285`), which this index would support.

## D. Validation surface vs api.md §11 (checklist item 4) — GAP-07 CONFIRMED OPEN (broader than recorded)

- api.md requirement: `docs/api/api.md:184` — "**tọa độ trong Phú Quốc**" (coordinates within Phú Quốc).
- `places.dto.ts` `GeoPointDto:17-22`: `lat @Min(-90)@Max(90)`, `lng @Min(-180)@Max(180)` — **global** ranges only.
- `geo.dto.ts` `NearbyQueryDto:5-9` and `BboxQueryDto:23-33`: same global ranges; no Phú Quốc bound.
- **Additional finding this run:** `geo.dto.ts:12-13` `radius @IsInt @Min(1)` has **no `@Max`**
  (comment `:11` says "áp trần ở service"). Unbounded radius at the DTO boundary — include in the
  coordinate/geo-validation fix scope.
- **Status: OPEN (P1).** Scope = `GeoPointDto` + `NearbyQueryDto` + `BboxQueryDto` (coordinate bounds)
  and `NearbyQueryDto.radius` (upper bound).

## E. List query contract vs openapi/api.md (checklist item 5) — GAP-05/10 CONFIRMED OPEN (needs adjudication)

- openapi `listPlaces` params (`docs/api/openapi.yaml:463-471`): category(`:464`), ward(`:465`),
  price_range(`:466`), **status(`:467`)**, **SortParam(`:468`)**, PageParam(`:469`),
  **CursorParam(`:470`)**, LimitParam(`:471`).
- Implementation `ListPlacesQueryDto` (`places.dto.ts:90-105`): category, ward, price_range,
  page, limit **only**. No status / sort / cursor.
- `main.ts:20` `forbidNonWhitelisted: true` → `?status=`/`?sort=`/`?cursor=` → HTTP 400.
- Nuance confirmed this run: `page`+`limit` (offset) **do** appear in openapi (`:469`,`:471`) and
  match the impl; the divergence is specifically **status, sort, cursor** (openapi-only).
- **Status: OPEN (P1) — owner adjudication required** (governance authority order: SSOT/ADR →
  migrations → entity → openapi → tests). Do not silently pick a side.

## F. Response envelope + pagination flow (checklist item 6) — CONFIRMED consistent (no break)

- `pagination.ts:5-16` `paginate()` returns `{ success:true, data:items, meta }` (meta uses
  `page`,`pageSize`,`total`,`totalPages`).
- `transform.interceptor.ts:13-19` passes through payloads that already have `success`+`data`
  (no double-wrap); else wraps as `{success,data,meta}`.
- Web `http.ts:30-49` `apiGet` returns `body.data`; `places.api.ts:12-21` `listPlaces` therefore
  yields the array `PlaceCard[]`; pagination `meta` is discarded (no pagination UI — functional
  limitation, not a break).
- Minor: `pagination.ts` comment claims meta key `limit`, but it emits `pageSize`
  (`shared-types api-response.ts:32-37`). Frontend ignores meta → no runtime impact (GAP-16, P3).

## G. BUILD_002 remediation still present (checklist item 7) — CONFIRMED PRESENT

- `places.repository.ts:145-156` `getDetailBySlug` WHERE includes `AND p.status = $2`
  (`:151`) with params `[slug, PlaceStatus.PUBLISHED]` (`:153`) — unpublished detail returns null.
- `places.dto.ts:90-105` `ListPlacesQueryDto` has **no** `status` field (documented `:85-89`);
  `places.service.ts:52-58` does not pass status → repo default `published`
  (`places.repository.ts:225`).
- Regression specs present: `repositories/places.repository.spec.ts`, `dto/places.dto.spec.ts`.
- **Status: RESOLVED (GAP-02/04), remediation intact.**

## H. Test inventory + executability (checklist item 8)

| Test file | Imports workspace pkg? | Executable here? |
|---|---|---|
| `places.mapper.spec.ts` | no (local only) | would run — but NOT EXECUTED (no Node) |
| `places-detail.mapper.spec.ts` | no (local only) | would run — NOT EXECUTED |
| `repositories/places.repository.spec.ts` | no | would run — NOT EXECUTED |
| `dto/places.dto.spec.ts` | no | would run — NOT EXECUTED |
| `places.service.spec.ts` | — (does not exist) | missing; blocked by `@phuquochub/utils` import in service |

Controller tests and meaningful e2e assertions are absent (e2e also needs Postgres/PostGIS/Redis).

## I. Commands attempted this run

| Command | Result | Cause |
|---|---|---|
| `node`/`npm`/`npx` (prior session checks) | NOT FOUND | no Node.js runtime on PATH |
| lint / typecheck / build / jest / e2e | **NOT EXECUTED** | no Node runtime; FAT32 leaves `node_modules/@phuquochub/*` empty; e2e also needs DB/Redis |
| YAML lint (python) | NOT EXECUTED | `python` is a non-functional WindowsApps stub |
| Referenced-path existence (bash `test -e`) | PASSED | all cited paths resolve |

CI reference for how these should run: `.github/workflows/ci.yml`.

---

## Gap status summary (confirmed against current source)

| ID | Priority | Status | Anchor evidence |
|---|---|---|---|
| GAP-02/04 | — | RESOLVED | `places.repository.ts:151-153`; `places.dto.ts:90-105` |
| GAP-06 | P1 | OPEN | `1720000400000-InitPlaces.ts:57-63` vs `places.md:68-69` |
| GAP-07 | P1 | OPEN (incl. radius `@Max`) | `places.dto.ts:17-22`; `geo.dto.ts:5-13,23-33`; `api.md:184` |
| GAP-05/10 | P1 | OPEN (adjudication) | `openapi.yaml:467-470` vs `places.dto.ts:90-105`; `main.ts:20` |
| GAP-11 | P2 | OPEN | `places.mapper.ts:6-21` vs `apps/web/src/modules/places/types.ts:6-21` |
| GAP-12 | P2 | OPEN | `places.repository.ts:239` (no unique tie-breaker) |
| GAP-15 | P2 | OPEN | `prisma/schema.prisma:400` vs TypeORM migrations; `packages/database` empty |
| GAP-13 | P3 | OPEN | `places.repository.ts:123-129` (`getCardBySlug`, no consumer) |
| GAP-14 | P3 | OPEN | `places.dto.ts:49-50` (`opening_hours @IsObject` only) |
| GAP-16 | P3 | OPEN | `pagination.ts:8-15` vs `api-response.ts:32-37` |

## Baseline verdict

The Place domain + persistence baseline is **established and internally consistent**; the
BUILD_002 security remediation is intact. No open gap blocks starting implementation on the
narrowest P1. **Recommended first implementation task: PLACE-002** — coordinate/geo validation
(GAP-07), DTO-only, SSOT-backed (`api.md:184`), no DB/migration, no owner adjudication, testable
via a DTO spec matching existing patterns.

No implementation, deployment, canary, hypercare, or stabilization evidence was produced or
implied. No production code, migration, DTO, entity, or contract was modified.
