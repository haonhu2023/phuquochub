# PLACE-003 — Evidence Index (migration execution, 2026-07-22)

Backs `docs/delivery/reports/PLACE-003-migration-report.md`. Concise references only.

> Distinct from `PLACE-003-evidence-index.md`, which records the earlier **BLOCKED** preflight
> attempt made when no PLACE-003 task file existed. That file is retained as history and was
> not overwritten. This index is the evidence for the executed migration task.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `docs/delivery/state.yaml:22-26` | `task: PLACE-003`, `status: ready` at preflight | task was state-authorized before any file changed | — |
| S-2 | task authority | `docs/delivery/tasks/PLACE-003.yaml` | full spec: type `migration`, 7 ACs, 3 validation commands, rollback, stop conditions | scope/criteria authority; objective is concrete | — |

## Dependency
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `evidence/PLACE-002-evidence-index.md` VO-7..VO-10 | jest 12/12 + 9/9, eslint exit 0, tsc exit 0 | PLACE-002 complete on executed evidence, not a status field | DTO layer only |
| DEP-2 | dependency | `tasks/PLACE-002.yaml:7,30` | `status: completed`; AC1..AC5 PASS | declared dependency satisfied | — |

## Requirement (SSOT)
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| REQ-1 | persistence | `docs/data/modules/places.md` §3 index block | `BTREE (status) WHERE deleted_at IS NULL` | the index is specified, not invented | SSOT gives no index name |
| REQ-2 | persistence | `1720000400000-InitPlaces.ts:57-63` | only `uq_places_slug`, `idx_places_category_status`, `idx_places_location`, `idx_places_fts` | the specified index was absent | — |
| REQ-3 | performance | `places.repository.ts:210-243` `list()` | builds `deleted_at IS NULL AND status = $n`; `category` optional | composite index unusable when category omitted (leading column) | static read; no EXPLAIN |

## Analysis
| id | category | source / command | result | proves | limitations |
|---|---|---|---|---|---|
| AN-1 | migration | `grep -ln "idx_places_status" *.ts` in migrations, excluding new files | **NONE** | index absent from **every** migration, not just InitPlaces | name-based; an equivalent index under a different name would need DB introspection |
| AN-2 | migration | migrations dir listing + `cut/sort` on timestamps | `1720001900000` unused and highest; previous max `1720001800000` | ordering is correct (AC3) | — |
| AN-3 | migration | `1720000400000-InitPlaces.ts:96-104,176` | `idx_media_place`, `idx_media_event`, `uq_contacts_primary` use `WHERE` predicates | partial-index convention exists and was followed | — |
| AN-4 | persistence | `sources/entities/source.entity.ts:14-15` + `@Index` sweep over all module entities | partial `WHERE` indexes are migration-only; `@Index` mirrors regular indexes only | entity-alignment decision (no decorator) matches convention | — |
| AN-5 | migration | `core/database/data-source.ts:22-24` | `migrations: migrations/*.{ts,js}`; no `migrationsTransactionMode`; `synchronize: false` | (a) `__tests__/` spec cannot load as a migration; (b) migrations run in a transaction → `CONCURRENTLY` unusable | — |

## Implementation
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| IMP-1 | migration | `migrations/1720001900000-AddPlacesStatusPartialIndex.ts` `up()` | `CREATE INDEX "idx_places_status_active" ON "places" ("status") WHERE "deleted_at" IS NULL` | AC1 | file authored; **not applied to any database** |
| IMP-2 | migration | same file `down()` | `DROP INDEX IF EXISTS "idx_places_status_active"` | AC2 — reversible, drops only the new index | — |
| IMP-3 | rollback | same file, header comment | CONCURRENTLY decision + rationale recorded in-code | AC7 | mitigation for large tables documented, not implemented |
| IMP-4 | persistence | `places/entities/place.entity.ts:21-25` | comment-only edit (3 lines); `@Index(['categoryId','status'])` unchanged | AC5 — no column/relation/nullability/decorator change | — |

## Tests
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| T-1 | test | `__tests__/1720001900000-AddPlacesStatusPartialIndex.spec.ts` | 5 specs: up shape + WHERE predicate, no CONCURRENTLY, down isolation, up/down round-trip, non-duplication vs InitPlaces | AC4; AC5 asserted executably | structural only — no DB, so no proof the index is *usable* |
| T-2 | test | spec placement in `__tests__/` | mirrors `InitSources.spec.ts` | spec cannot be mis-loaded as a migration (see AN-5) | — |

## Validation output — executed 2026-07-22
| id | category | command | cwd | exit | result | classification |
|---|---|---|---|---|---|---|
| VO-1 | test | `npx jest migrations` | `apps/api` | **0** | **11/11 pass**, 3 suites | — |
| VO-2 | lint | `npx eslint "src/core/database/migrations/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean | — |
| VO-3 | lint | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean (covers edited entity) | — |
| VO-4 | type-check | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | whole `apps/api` type-checks | — |
| VO-5 | state | `js-yaml` parse of `state.yaml` after each edit | repo root | **0** | VALID | — |

No command failed, so no failure classification was required. VO-1/VO-2/VO-4 are the task's
three declared `validation_commands`. Node v24.18.0 portable, prepended to PATH per shell.

## Not executed / not claimed
| id | category | item | result | proves | limitations |
|---|---|---|---|---|---|
| NX-1 | migration | `npm run migration:run` | **NOT EXECUTED** | migration state is `implemented_not_executed` | Docker not installed; no Postgres/PostGIS |
| NX-2 | performance | `EXPLAIN (ANALYZE, BUFFERS)` on `list()` | **NOT EXECUTED** | no proof the planner uses the index | task stop conditions forbid claiming this |
| NX-3 | build | `nest build` | NOT RUN | build unverified | not a declared validation command |
| NX-4 | consumer | web frontend, seeds | NOT RUN | consumers `compiled` at best, never `runtime_verified` | — |
| NX-5 | state | `git diff` | UNAVAILABLE | no diff-verified scope proof exists | repository is not under version control |

## Findings carried
| id | category | source | result | limitations |
|---|---|---|---|---|
| F-12 | migration | migrations dir listing; `data-source.ts:22`; `InitSources.spec.ts:5-8` | `1720001500000-InitAuditLogs.spec.ts` sits inside `migrations/` and matches the migration glob — pre-existing defect, also the cause of the duplicate `1720001500000` timestamp | out of PLACE-003 scope; backlog |
| F-13 | performance | §23 of the report | index selectivity on a 4-value enum unproven | needs the DB-backed validation task |
| F-14 | persistence | `places.repository.ts:239` | `ORDER BY rating_avg DESC NULLS LAST, created_at DESC` — no unique tie-breaker (GAP-12) | selected as PLACE-004 |
