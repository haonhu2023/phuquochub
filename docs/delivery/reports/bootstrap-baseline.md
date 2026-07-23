# Bootstrap Baseline Report

> Delivery framework bootstrap — repository truth capture
> Date: 2026-07-22 · Mode: inspection-first, evidence-driven, non-destructive

## 1. Executive summary

PhuQuocHub is a real, substantially-built monorepo. The Place domain — the intended core
entity — is implemented across persistence, API, and web layers and is internally
consistent. The prior `BUILD_001…BUILD_014` chain was blocked purely because report
numbering was used as an execution gate while only `BUILD_002` existed. This bootstrap
replaces that mechanism with a state-driven framework (`docs/delivery/`) grounded in
repository evidence, registers `place` as the first workstream, and sets `PLACE-001`
(Place Domain and Persistence Baseline Analysis) as the first executable task. No
implementation, deployment, canary, hypercare, or stabilization evidence was fabricated;
none exists.

## 2. Repository inspection scope

Inspected: root `package.json`, `turbo.json`, `tsconfig.base.json`, `.github/workflows/ci.yml`,
`docker-compose.yml`, `.env.example`, `infrastructure/`, `apps/api/` (modules + core),
`apps/web/`, `packages/*`, `prisma/schema.prisma`, `docs/` (SSOT, ADRs, api, data),
`delivery/sprint-01-core-data/`, and the full Place module plus its geo/search/revisions
and web consumers.

## 3. Actual repository architecture

- **Monorepo:** npm workspaces (`apps/*`, `packages/*`) + Turborepo. `npm@10.8.2`, Node ≥ 20.
- **API:** NestJS ^10.4 (`apps/api`), global `ValidationPipe({whitelist,transform,forbidNonWhitelisted})`,
  `TransformInterceptor`, `AllExceptionsFilter` (`apps/api/src/main.ts`).
- **Persistence:** PostgreSQL + PostGIS via **TypeORM** (`synchronize:false`);
  DataSource `apps/api/src/core/database/data-source.ts`; migrations under
  `apps/api/src/core/database/migrations/` (19 forward migrations). Cache: Redis
  (`apps/api/src/core/redis`).
- **Prisma:** `prisma/schema.prisma` is a reference model (ADR-013); `packages/database`
  is an empty stub (Prisma is not the runtime ORM).
- **Web:** Next.js App Router (`apps/web`) with public `places`, `places/[slug]`, `map`,
  `search`, `explore` routes.
- **Domain modules (23):** auth, authz, categories, community, contacts, contributions,
  events, geo, health, hotels, media, notifications, **places**, prices, rbac,
  restaurants, reviews, revisions, search, sources, tours, users.
- **CI:** `.github/workflows/ci.yml` — job 1 (typecheck/lint/build/unit, node 20), job 2
  (API e2e on Postgres+Redis, runs migrations).
- **VCS:** the working directory is **not a git repository** (`git rev-parse` fails), so
  branch/commit/working-tree are `unknown`.

## 4. Existing Place implementation inventory

| Layer | File | State |
|---|---|---|
| Entity | `apps/api/src/modules/places/entities/place.entity.ts` | Complete; `geography(Point,4326)`, soft-delete, status + verification_status |
| Satellites | `place-faq/seo/ai-summary.entity.ts` | Present |
| Enums | `place.enums.ts` | `PlaceStatus/PriceRange/VerificationStatus/...`, matches migration + Prisma |
| DTOs | `dto/places.dto.ts` | Create/Update/ListQuery/GeoPoint; `status` correctly absent from list query (BUILD_002) |
| Repository | `repositories/places.repository.ts` | Parameterized SQL: CRUD, list, nearby, bbox, clusters, FTS |
| Service | `places.service.ts` | create/update/archive/approve + revision + audit |
| Mapper | `places.mapper.ts` | `toPlaceCard`/`toPlaceDetail` (snake_case) |
| Controller | `places.controller.ts` | list, `:id/revisions`, `:slug`, create, PATCH, DELETE, approve |
| Module | `places.module.ts` | Wired (TypeOrmModule.forFeature + deps) |
| Migration | `.../migrations/1720000400000-InitPlaces.ts` | Table + enums + GIST + FTS + unique-slug + `(category_id,status)` |
| Web | `apps/web/src/modules/places/*`, `app/(public)/places/*` | List/detail SSR + client + types |

## 5. Existing Place tests

Present: `places.mapper.spec.ts`, `places-detail.mapper.spec.ts`,
`repositories/places.repository.spec.ts` (BUILD_002 regression),
`dto/places.dto.spec.ts` (BUILD_002 regression). Missing: `places.service` unit tests
(blocked — imports `@phuquochub/utils`), controller tests, meaningful e2e assertions.
**None were executed this session** (no Node runtime).

## 6. Existing migration and persistence state

`1720000000000-InitExtensions` enables postgis/unaccent/pg_trgm/pgcrypto;
`1720000400000-InitPlaces` creates `places` + satellites + media + contacts +
price_history, plus `uq_places_slug`, `idx_places_category_status`, `idx_places_location`
(GIST), `idx_places_fts` (GIN on `immutable_unaccent`). Seed migrations
`1720000900000-SeedInitialPlaces` and `1720001600000-SeedPlacesExpansion` exist.
Migrations cannot be run here (no Node/DB). **Confirmed gap:** the authoritative partial
index `BTREE(status) WHERE deleted_at IS NULL` (places.md §3) is not created.

## 7. Existing frontend / consumer dependencies

- Web: `apps/web/src/modules/places/api/places.api.ts` (`listPlaces`/`getPlace`),
  `types.ts` (duplicated `PlaceCard`/`PlaceDetail`), rendered by
  `app/(public)/places/{page,[slug]/page}.tsx`. Envelope flow is consistent
  (`paginate` → `TransformInterceptor` passthrough → web `apiGet` unwraps `data`).
- API consumers: `geo` (nearby/bbox), `search` (FTS), `revisions` (history).
- Shared types: `@phuquochub/shared-types` provides envelope/pagination only — **no Place
  transport types** (duplication/drift risk).

## 8. Documentation and governance artifacts found

- SSOT: `docs/data/modules/places.md` (authoritative Place schema per ADR-001/B7),
  `docs/data/database.md`, `docs/data/erd.md`.
- API: `docs/api/api.md`, `docs/api/openapi.yaml`.
- Decisions: `docs/99-decisions/ADR-001..ADR-016` + `decision-register.md`.
- Governance: `enterprise-engineering-framework/00-governance/{authority-and-scope,validation-commands}.md`.

## 9. Legacy BUILD-chain findings

`delivery/sprint-01-core-data/` contains `BUILD_002_PLACE_PRIORITY_REMEDIATION.md` and now
`BUILD_001_PLACE_INSPECTION_GAP_ANALYSIS.md` (authored 2026-07-22). `BUILD_003…BUILD_014`
were never produced. The chain is deprecated as an execution gate (ADR-DELIVERY-001);
reports are retained as evidence only.

## 10. Contradictions or uncertain areas

- **Contract authority (open):** `openapi.yaml` `listPlaces` declares `status`/`sort`/`cursor`;
  implementation uses offset `page`/`limit` and `400`s unknown params — needs owner ruling.
- **Prisma vs TypeORM dual-source:** aligned today, but two model sources = drift risk.
- **Verification unknowns:** no test/lint/typecheck/build could run; their pass/fail state
  is `not_verified` here.
- **VCS unknown:** not a git repo → branch/commit/working-tree unknown.

## 11. Current truthful delivery state

`phase: analysis · workstream: place · task: PLACE-001 · status: ready`.
Gates: repository_inspection `passed`; architecture_baseline `partial`;
place_domain_analysis `pending`; implementation/testing/deployment/canary/hypercare/
stabilization all `not_started`. Full detail in [`../state.yaml`](../state.yaml).

## 12. Recommended next task

**PLACE-001 — Place Domain and Persistence Baseline Analysis**
([`../tasks/PLACE-001.yaml`](../tasks/PLACE-001.yaml)). It is executable without any legacy
BUILD report. Its recommended follow-on is **PLACE-002** (Phú Quốc coordinate validation,
GAP-07 — DTO-only, SSOT-backed, no DB/adjudication).

## 13. Files created or modified during bootstrap

**Created (documentation only):**
- `docs/delivery/README.md`
- `docs/delivery/state.yaml`
- `docs/delivery/project-registry.yaml`
- `docs/delivery/workstreams/place.yaml`
- `docs/delivery/tasks/PLACE-001.yaml`
- `docs/delivery/reports/bootstrap-baseline.md` (this file)
- `docs/delivery/evidence/README.md`
- `docs/delivery/decisions/ADR-DELIVERY-001.md`
- `docs/delivery/history/README.md`

**Modified:** none (no production source, migration, DTO, entity, contract, or seed).
Note: `delivery/sprint-01-core-data/BUILD_001_PLACE_INSPECTION_GAP_ANALYSIS.md` was
authored in a **prior** task, not during this bootstrap.

## 14. No-fabrication statement

No implementation, deployment, canary, hypercare, or stabilization evidence was fabricated
or implied. Those gates are `not_started`. Verification commands (lint/typecheck/build/
test/e2e) were **NOT EXECUTED** — no Node.js runtime is available and the FAT-family `F:`
volume leaves workspace packages unlinked; this is recorded, not worked around.
