# PLACE-001 — Evidence Index

Concise, categorized index of evidence backing
`docs/delivery/reports/PLACE-001-place-domain-persistence-baseline.md`.
Companion detail: `docs/delivery/evidence/PLACE-001-baseline.md` (field-level tables).
No large source blocks are copied; references use `path:line`.

## Domain
| ID | Reference | Proves | Limitations |
|---|---|---|---|
| D-1 | `apps/api/src/modules/places/entities/place.entity.ts:25-120` | Place is the core aggregate; fields, satellites, relations | static (not executed) |
| D-2 | `apps/api/src/modules/places/place.enums.ts:3-44` | Enum set + GeoJSON `[lng,lat]` value type | — |
| D-3 | `prisma/schema.prisma:400-445` | Reference model; Place back-relations incl. business_claims/members | Prisma is reference-only (ADR-013) |
| D-4 | `1720001000000-InitHotel.ts:3,16-17,30,60-62` + `hotels.repository.ts:25` | Hotel = satellite extension of Place (ADR-002), keyed by place_id | pattern verified for hotel; restaurant/tour inferred from migration presence |

## Persistence
| ID | Reference | Proves | Limitations |
|---|---|---|---|
| P-1 | `1720000400000-InitPlaces.ts:29-63` | `places` schema, enums, `immutable_unaccent`, GIST + FTS + unique-slug + (category_id,status) indexes | not executed |
| P-2 | `1720000400000-InitPlaces.ts:57-63` | **only** 4 place indexes → GAP-06 partial status index absent | not executed |
| P-3 | `core/database/data-source.ts:24` | `synchronize:false` → migrations authoritative | — |
| P-4 | `place.entity.ts:38-39` + `InitPlaces.ts:35` | Single `geography(Point,4326)`; no duplicated scalar coords | PostGIS runtime not verified |

## Migration
| ID | Reference | Proves | Limitations |
|---|---|---|---|
| M-1 | `core/database/migrations/` (19 files) | ordered forward migrations InitExtensions→InitSources | not executed |
| M-2 | `1720000000000-InitExtensions.ts:9-12` | postgis/unaccent/pg_trgm/pgcrypto enabled (idempotent) | not executed |

## API
| ID | Reference | Proves | Limitations |
|---|---|---|---|
| A-1 | `places.controller.ts:22-77` | 7 Place routes + auth guards; slug-only detail | — |
| A-2 | `main.ts:19-21` | global whitelist + forbidNonWhitelisted → unknown params 400 | — |
| A-3 | `docs/api/openapi.yaml:463-471` | openapi declares status/sort/cursor for listPlaces (C-1/GAP-05/10) | doc vs impl divergence |
| A-4 | `places.repository.ts:151-153` | `getDetailBySlug` filters status=published (BUILD_002 intact) | not executed |

## Validation
| ID | Reference | Proves | Limitations |
|---|---|---|---|
| V-1 | `places.dto.ts:17-22` | GeoPointDto global lat/lng only → GAP-07 | — |
| V-2 | `geo.dto.ts:5-13,23-33` | Nearby/Bbox global ranges; radius `@Min(1)` no `@Max` → GAP-07 (radius) | — |
| V-3 | `docs/api/api.md:184` | SSOT requires "tọa độ trong Phú Quốc" | bbox constant not yet documented |
| V-4 | `places.dto.ts:90-105` | ListPlacesQueryDto has no status (BUILD_002) | — |

## Consumer
| ID | Reference | Proves | Limitations |
|---|---|---|---|
| CO-1 | `apps/api/src/modules/geo/*`, `search/*`, `revisions/*` | compiled Place consumers | runtime not verified |
| CO-2 | `apps/web/src/modules/places/{api/places.api.ts,types.ts}` | web consumer; duplicated transport type (GAP-11) | declared dependency |
| CO-3 | `1720000400000-InitPlaces.ts:73` | media.business_id → places(id) (business = place) | — |
| CO-4 | `app.module.ts:15,42` | PlacesModule registered/reachable | — |

## Test
| ID | Reference | Proves | Limitations |
|---|---|---|---|
| T-1 | `places.mapper.spec.ts`, `places-detail.mapper.spec.ts`, `repositories/places.repository.spec.ts`, `dto/places.dto.spec.ts` | present unit specs (mapper/repo/dto) | NOT EXECUTED (no Node) |
| T-2 | absence of `places.service.spec.ts` | service test missing (blocked by `@phuquochub/utils` import) | — |

## Configuration
| ID | Reference | Proves | Limitations |
|---|---|---|---|
| CF-1 | `app.module.ts:1-52` | module registration set incl. Places/Geo/Search/verticals | — |
| CF-2 | `.github/workflows/ci.yml` | intended lint/typecheck/build/unit + e2e (Postgres+Redis) | not run here |

## Validation output
| ID | Reference | Proves | Limitations |
|---|---|---|---|
| VO-1 | prior + this session Node/PATH checks | no `node`/`npm`/`npx`; only Photoshop node.exe | blocks all JS tooling |
| VO-2 | `ls node_modules/@phuquochub/` (empty) + `df -T F:` (non-NTFS) | FAT32 unlinks workspace packages | environmental |
| VO-3 | bash `test -e` on 11 referenced paths | all cited paths resolve | — |

## Documentation
| ID | Reference | Proves | Limitations |
|---|---|---|---|
| DOC-1 | `docs/data/modules/places.md:29,68-69` | authoritative schema + required index list (incl. partial status index) | — |
| DOC-2 | `docs/99-decisions/ADR-001..ADR-002, ADR-013` | Place core; Place extension/satellite; Prisma readiness | — |
