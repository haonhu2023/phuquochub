# PLACE-003 — Execution Report (GAP-06 partial index migration)

> Workstream: place · Task: PLACE-003 · Type: migration · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-003.yaml`
> Result: **COMPLETED WITH FINDINGS.** AC1–AC6 (mandatory) PASS, AC7 (optional) PASS.

> Note: `docs/delivery/reports/PLACE-003-execution-report.md` is a *different, older* file —
> a block report written when PLACE-003 was still an undefined ID. This report supersedes it
> as the PLACE-003 record; the older file is retained as history (finding F-10).

## 1. Executive Summary
The last open P1 in the Place gap register other than the parked contract question is closed.
`docs/data/modules/places.md` §3 specifies `BTREE (status) WHERE deleted_at IS NULL` on
`places`; that index did not exist in any migration. A forward-only migration now creates it:

```sql
CREATE INDEX "idx_places_status_active" ON "places" ("status") WHERE "deleted_at" IS NULL
```

Five migration specs were added and all three mandatory validation commands executed green.
The migration is **implemented, not executed** — no database was touched (Docker is not
installed), which is exactly what the task authorized.

## 2. Task Identity and Authority
| item | value |
|---|---|
| Task | PLACE-003 — "Add partial index BTREE(status) WHERE deleted_at IS NULL on places (GAP-06)" |
| Type | `migration` |
| Authorized by | `state.yaml:22-26` — `current.task: PLACE-003`, was `ready` |
| depends_on | PLACE-002 (completed 2026-07-22) |

## 3. Task Type
`migration`, executed per §4.3 / §10: migration history inspected, only the approved index
created, forward and rollback behavior validated structurally, nothing applied to a database.

## 4. Starting Repository State
Not a git repository (`git rev-parse` → exit 128) — branch, commit and diff are **unknown,
not fabricated**. `F:` is FAT32 removable. Node v24.18.0 portable, off system PATH.
Pre-existing working-tree state: the five PLACE-002 source files (unmodified by this task)
and the `node_modules/@phuquochub/*` materialized copies from the PLACE-007 session.

## 5. Dependency Verification
PLACE-002 is completed **on evidence, not on a status field**: `PLACE-002-evidence-index.md`
VO-7 (jest places.dto 12/12), VO-8 (jest geo.dto 9/9), VO-9 (eslint exit 0), VO-10 (tsc exit
0), with AC1–AC5 all PASS. Verified before any file was modified.

## 6. Problem and Objective
**Problem.** `places.md:69` requires the partial index; `1720000400000-InitPlaces.ts:57-63`
creates only `uq_places_slug`, `idx_places_category_status (category_id, status)`,
`idx_places_location` (GIST) and `idx_places_fts` (GIN). The composite index cannot serve a
status-only lookup because `category_id` is its leading column.

**Confirmed against source.** `PlacesRepository.list()`
([places.repository.ts:210-243](apps/api/src/modules/places/repositories/places.repository.ts:210))
always builds `p.deleted_at IS NULL AND p.status = $n`, and `category` is optional — so the
default public list path filters on status with no usable index. `getDetailBySlug`, `nearby`,
`bbox`, `bboxClusters`, `searchCount` and `searchFullText` carry the same predicate pair but
are driven by `uq_places_slug`, GIST or FTS respectively.

**Objective.** Author the forward-only migration, validate it structurally, do not apply it.

## 7. Approved Scope
In scope: the new migration, a migration spec, and `place.entity.ts` *only* if needed for
entity–migration alignment. Out of scope: applying the migration, altering any existing index,
query/repository changes, GAP-05/10, entity column/nullability/relation changes.

## 8. Execution Approach
1. Verified the index is absent from **every** migration, not just InitPlaces.
2. Confirmed the next free timestamp by listing the directory.
3. Read the repo's existing partial-index and migration-spec conventions.
4. Implemented `up()` / `down()`.
5. Decided the `CONCURRENTLY` question against actual config, and recorded it.
6. Added specs; ran the three validation commands narrowest-first.

## 9. Files Inspected
`state.yaml`; `tasks/PLACE-00{2,3}.yaml`; `workstreams/place.yaml`;
`evidence/PLACE-002-evidence-index.md`; `docs/data/modules/places.md:55-80`;
migrations directory listing (20 files); `1720000400000-InitPlaces.ts`;
`1720000800000-NormalizeDiscriminatorsAndMediaIndex.ts`; `1720001700000-InitSources.ts`;
`__tests__/1720001700000-InitSources.spec.ts`; `core/database/data-source.ts`;
`apps/api/package.json`; `places/entities/place.entity.ts`;
`places/repositories/places.repository.ts`; `sources/entities/source.entity.ts`;
`@Index` usage across all `apps/api/src/modules` entities.

## 10. Files Created
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `apps/api/src/core/database/migrations/1720001900000-AddPlacesStatusPartialIndex.ts` | task_required | the GAP-06 index (AC1–AC3) | jest + tsc + eslint | delete file |
| `apps/api/src/core/database/migrations/__tests__/1720001900000-AddPlacesStatusPartialIndex.spec.ts` | task_required | AC4 | jest 5/5 | delete file |

## 11. Files Modified
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `apps/api/src/modules/places/entities/place.entity.ts` | task_supporting | **comment only** (3 lines) recording that the partial index lives in the migration — the convention `Source` entity already documents at `source.entity.ts:14-15` | eslint + tsc exit 0 | remove the comment lines |
| `docs/delivery/state.yaml` | documentation | start transition, then completion transition | js-yaml parse | revert file |
| `docs/delivery/tasks/PLACE-003.yaml` | documentation | `in_progress` → `completed` + results | js-yaml parse | revert file |
| `docs/delivery/workstreams/place.yaml` | documentation | GAP-06 → resolved | js-yaml parse | revert file |

**No product behavior changed.** The only non-generated source edit is a comment. No entity
column, relation, nullability, index decorator, query, service or contract was touched.

### Entity-alignment decision
`place.entity.ts` keeps `@Index(['categoryId', 'status'])` and gains **no** new decorator.
Repository convention, verified across every entity: partial `WHERE` indexes are created in
migrations only and *not* declared via `@Index` — `source.entity.ts:14-15` states this
explicitly ("Index đầy đủ (gồm 2 index partial WHERE) tạo ở migration"), and `places` already
omits its GIST and FTS indexes for the same reason. Adding a `where`-qualified `@Index` would
introduce a pattern the repo does not use. Alignment was therefore documented, not decorated.

## 12. Domain Impact
None. No Place identity, aggregate boundary, lifecycle, status transition, ownership,
publication, verification, provenance, audit, soft-delete or localization semantics changed.
An index is a read-path artifact only.

## 13. Persistence and Migration Impact
| item | value |
|---|---|
| Object | `idx_places_status_active` on `places` |
| Definition | `BTREE ("status") WHERE "deleted_at" IS NULL` |
| Ordering | `1720001900000` — unique, and greater than the previous highest `1720001800000` |
| Existing migrations modified | **none** |
| Entity–migration alignment | maintained (see §11) |
| Existing-data compatibility | total — additive, no column, constraint, type or row touched |
| Reversibility | `down()` drops only this index; data-safe |
| **Execution state** | **`implemented_not_executed`** |

### Locking, build cost, deployment ordering (AC7)
- `CREATE INDEX` (non-concurrent) takes a `SHARE` lock on `places`: it blocks writes for the
  build, reads continue. On the current seeded dataset this is milliseconds.
- **`CONCURRENTLY` deliberately not used.** `data-source.ts` does not set
  `migrationsTransactionMode`, so TypeORM defaults to wrapping each migration in a
  transaction, and `CREATE INDEX CONCURRENTLY` cannot run inside one. Changing that setting
  is a global configuration change and out of PLACE-003's scope. Rationale is recorded in the
  migration file itself, not only here.
- **If `places` is ever large at deploy time**, revisit: either run this index build in a
  maintenance window, or split it to a `CONCURRENTLY` path with
  `migrationsTransactionMode: 'none'`. That decision needs production volume evidence which
  does not exist in this repository.
- Ordering: application and migration are independent — the index affects no application
  code, so old and new application versions both work with the index present or absent.

## 14. API and Contract Impact
Not applicable to the approved PLACE-003 task. No route, DTO, validation, service, mapper,
response shape, shared type or OpenAPI document changed. `tsc --noEmit` exit 0 confirms
`apps/api` still type-checks whole.

## 15. Compatibility Strategy
No transitional mechanism required: the change is purely additive and invisible to every
consumer. No compatibility alias, dual read/write, feature flag or deprecation window exists
or is needed, therefore nothing needs a retirement plan.

## 16. Consumer Compatibility
| Consumer | Path | R/W | Contract or behavior | Required change | Validation | Status |
|---|---|---|---|---|---|---|
| places module | `apps/api/src/modules/places` | both | unchanged | none | tsc + eslint exit 0 | compatible_without_change (compiled) |
| geo module | `apps/api/src/modules/geo` | read | unchanged | none | tsc exit 0 | compatible_without_change (compiled) |
| search / revisions | `apps/api/src/modules/{search,revisions}` | read | unchanged | none | tsc exit 0 | compatible_without_change (compiled) |
| migrations suite | `core/database/migrations` | n/a | new file added | none | jest 11/11 | updated (tested) |
| shared packages | `@phuquochub/{shared-types,utils}` | n/a | unchanged | none | resolved during tsc | compatible_without_change (compiled) |
| web frontend | `apps/web/src/modules/places` | read | unchanged | none | not run | not_verified |
| seeds / fixtures | `core/database/migrations/*Seed*` | write | unchanged | none | not run | not_verified |

Nothing is `runtime_verified` or `production_verified`: no server and no database were started.

## 17. Geospatial Impact
Not applicable to the approved PLACE-003 task. `idx_places_location` (GIST) is untouched;
no coordinate order, SRID, geometry type, distance unit, bbox semantic or serialization
changed. The spec asserts the GIST index name is not present in the `down()` statement.

## 18. Data-Quality Impact
None. No uniqueness, normalization, duplicate rule or constraint added. The new index is
non-unique, so it cannot reject any row that is valid today.

## 19. Cache, Search, and Event Impact
Not applicable to the approved PLACE-003 task. No Redis key, TTL, invalidation path, search
document, index mapping, event publisher/consumer or background job touched. No reindexing
is required: a Postgres index is not a search document.

## 20. Tests Added or Updated
Added `__tests__/1720001900000-AddPlacesStatusPartialIndex.spec.ts` — 5 specs, no existing
test modified or weakened:

1. `up()` emits exactly one statement, on `places ("status")`, with the `WHERE "deleted_at"
   IS NULL` predicate (regex-asserted — the predicate is the specification).
2. `up()` does not contain `CONCURRENTLY` (locks in the §13 decision).
3. `down()` emits exactly one `DROP INDEX IF EXISTS` and names **none** of the four existing
   places indexes (AC5 as an executable assertion).
4. Round-trip: the identifier `down()` drops is the identifier `up()` creates.
5. Non-duplication: replaying `InitPlaces.up()` shows all four original indexes present and
   no status-only index — proving the new index is additive, not a redefinition.

Spec placement follows `InitSources.spec.ts`: inside `__tests__/`, because the TypeORM glob
in `data-source.ts:22` is `migrations/*.{ts,js}` and does not match subdirectories, so the
spec cannot be loaded as a migration.

## 21. Validation Commands and Results
| # | command | cwd | exit | result |
|---|---|---|---|---|
| 1 | `npx jest migrations` | `apps/api` | **0** | **11/11 pass**, 3 suites (5 of them new) |
| 2 | `npx eslint "src/core/database/migrations/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean |
| 3 | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean (covers the edited entity) |
| 4 | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | whole package type-checks |
| 5 | `grep -ln idx_places_status *.ts` (excl. new files) | migrations | 0 | **NONE** — index absent everywhere before this task |
| 6 | timestamp uniqueness / max check | migrations | 0 | `1720001900000` unique and highest |

Commands 1, 2 and 4 are PLACE-003's three declared `validation_commands`; 3, 5 and 6 are
required-evidence checks. **Zero failures — no failure classification was required.** Node was
prepended to PATH per shell as the task file instructs.

## 22. Security Review
No new attack surface. An index does not change authentication, authorization, ownership,
guards, validation, serialization or error content. Two observations, both neutral-to-positive:
- No raw SQL was added beyond a fixed DDL string with **no interpolation** — no injection path.
- The index makes the *published-only* public list cheaper, which marginally reduces the cost
  of an unauthenticated list request. It does not widen what that request can reach:
  `list()` still defaults to `status = 'published'` and `deleted_at IS NULL`.

No task-scoped security issue found; none left unresolved.

## 23. Performance Review
**Intent, evidence-backed:** the composite `idx_places_category_status` leads with
`category_id`, so the uncategorised public list — the default path — has no usable index for
`status = 'published' AND deleted_at IS NULL`. The new partial index covers exactly that, and
being partial it excludes soft-deleted rows, keeping it smaller than a full `BTREE(status)`.

**Measured:** nothing. No baseline, no `EXPLAIN`, no timing.
| item | value |
|---|---|
| risk | the planner may still prefer a sequential scan at small table sizes, and `status` is low-cardinality (4 values) so selectivity for `published` may be poor |
| reason unverified | Docker is not installed; no Postgres/PostGIS instance exists |
| required environment | `npm run db:up` + `migration:run`, then `EXPLAIN (ANALYZE, BUFFERS)` on `list()` |
| recommended validation | the DB-backed validation task (see §26) |

PLACE-003's stop conditions explicitly forbid claiming `EXPLAIN` evidence. None is claimed.

## 24. Observability Review
Not applicable to the approved PLACE-003 task. No runtime code path changed, so no log,
metric, trace, audit event or health check was added or needed. Migration application status
would be observable through TypeORM's `migrations` table once a database exists — unverified.

## 25. Rollback or Recovery Review
Three independent levels, all usable:
1. **Repository:** delete the two new files and the three comment lines in `place.entity.ts`.
   Nothing else is touched.
2. **Schema (if ever applied):** `npm run migration:revert` executes `down()`, which drops
   only `idx_places_status_active`. Dropping a non-unique index destroys no data and breaks
   no constraint.
3. **Data:** none at risk — the migration reads and writes no rows.

Since the migration is `implemented_not_executed`, no database state currently exists to reverse.

## 26. Deviations From the Approved Task
1. **Entity touched for a comment.** `in_scope` permits editing `place.entity.ts` only if an
   `@Index` decorator is required. On inspection the convention said no decorator — so I made
   the smaller change the convention *does* use (a note), rather than either adding an
   off-convention decorator or leaving the entity silent. Recorded here rather than absorbed.
2. **Two extra evidence commands** (lint on `places`, absence/timestamp greps) beyond the
   three declared — required by `required_evidence`, and read-only.
3. **Report filename** is `PLACE-003-migration-report.md`; `PLACE-003-execution-report.md` was
   already taken by an unrelated older block report. The task permits a task-specific suffix.

No scope was expanded: no query was tuned, no dead code removed, no unrelated file formatted.

## 27. Remaining Findings
| id | finding | evidence | disposition |
|---|---|---|---|
| F-12 | **`1720001500000-InitAuditLogs.spec.ts` sits inside `migrations/`**, so the TypeORM glob `migrations/*.{ts,js}` loads a test file as a migration. Pre-existing; already called out in `InitSources.spec.ts:5-8`. It is also why two files share timestamp `1720001500000`. | migrations dir listing; `data-source.ts:22` | backlog — real defect, but moving it is unrelated to GAP-06 |
| F-13 | Index selectivity for `status='published'` is unproven and may be poor (4-value enum). The index is SSOT-mandated regardless, but its *benefit* is an assumption until `EXPLAIN` runs. | §23 | folded into the DB-backed validation task |
| F-14 | `getCardBySlug` remains dead code (GAP-13), and `list()` still lacks a unique tie-breaker (GAP-12) — both visible while reading the repository for this task. | `places.repository.ts:123-129`, `:239` | GAP-12 selected as PLACE-004 |

F-1 … F-11 from earlier Place reports remain open and unchanged.

## 28. Risks
| risk | severity | note |
|---|---|---|
| No DB-backed validation anywhere in the workstream | high | migration, PostGIS, SRID, spatial index and e2e all unproven; needs Docker |
| Working from a FAT32 removable stick with no VCS | high | no diff-verified scope proof; a single unplug loses everything |
| Index build lock on a large future `places` table | medium | non-concurrent build; mitigation documented in §13, not implemented |
| PROVISIONAL Phú Quốc bbox still unconfirmed | medium | unchanged from PLACE-002 |

## 29. Acceptance-Criteria Evaluation
| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | New forward-only migration creates `BTREE(status) WHERE deleted_at IS NULL` matching `places.md:69` | yes | **PASS** | migration `up()`; spec 1; §21 cmd 1 |
| AC2 | `down()` reverses by dropping only the new index | yes | **PASS** | migration `down()`; specs 3 & 4 |
| AC3 | Timestamp > `1720001800000`; no existing migration modified | yes | **PASS** | §21 cmd 6; change register §10–11 |
| AC4 | A spec asserts expected up/down operations and passes | yes | **PASS** | 5 specs, 11/11 suite green (§21 cmd 1) |
| AC5 | No existing index dropped/renamed/altered; no entity column/relation/nullability change | yes | **PASS** | spec 3 asserts it executably; §11 (comment-only edit) |
| AC6 | `tsc --noEmit` and `eslint` pass for changed files | yes | **PASS** | §21 cmds 2, 3, 4 — all exit 0 |
| AC7 | Locking, build cost, deployment ordering and the CONCURRENTLY decision documented | **no** | **PASS** | §13; rationale also in the migration file |

All six mandatory criteria **PASS**. The optional criterion also passes.

## 30. Recommended Delivery-State Transition
Applied:
```yaml
current:
  phase: implementation
  workstream: place
  task: PLACE-004
  status: ready
gates:
  implementation: in_progress   # second slice landed; NOT passed
  testing: in_progress          # DTO + migration specs green; service/controller/e2e absent
```
Deployment, canary, hypercare and stabilization gates remain `not_started` and were not touched.

## 31. Selected PLACE-004 Task
`docs/delivery/tasks/PLACE-004.yaml` — **"Add a unique tie-breaker to the Place list ordering
(GAP-12)"**, type `implementation`, `depends_on: [PLACE-003]`.

**Why this and not the two nominally higher-priority items**, stated plainly:
- *DB-backed validation* (PLACE-003's own `next_candidate_task` suggestion) is the largest
  unverified surface, but it is blocked on installing Docker — an environment prerequisite,
  not a code task. Scheduling it now would produce an immediate BLOCKED at preflight.
- *GAP-05/10* (openapi vs implementation list params) is P1 but explicitly **parked pending
  owner adjudication**; picking a side unilaterally is exactly what ADR-DELIVERY-001 forbids.
- *GAP-12* is a real correctness defect on the very query path this index serves —
  `ORDER BY rating_avg DESC NULLS LAST, created_at DESC` has no unique final key, so rows can
  repeat or vanish across pages when values tie. It is repository-local, fully testable
  without a database, and needs no owner decision.

## 32. Explicit Non-Claims
This report does **not** claim the migration was applied to any database, nor any unverified:
**production deployment, production migration application, production backfill completion,
complete external consumer migration, complete cache propagation, complete search reindexing,
complete event propagation, canary success, hypercare completion, production stabilization,
compatibility retirement readiness, or legacy schema cleanup readiness.**

Specifically not claimed: no `EXPLAIN` evidence, no proof the planner will use the new index,
no index creation on any live database, no e2e execution, no `nest build`, no database-backed
geospatial validation, no runtime or production consumer verification, no telemetry, and no
git branch, commit or diff. The exit codes and test counts in §21 are real, executed and
reproducible; every other status is recorded as unverified with its cause.
