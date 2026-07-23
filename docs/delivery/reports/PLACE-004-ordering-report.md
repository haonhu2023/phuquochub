# PLACE-004 — Execution Report (GAP-12 list ordering tie-breaker)

> Workstream: place · Task: PLACE-004 · Type: implementation · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-004.yaml`
> Result: **COMPLETED.** AC1–AC5 (mandatory) PASS, AC6 (optional) PASS.

> `PLACE-004-execution-report.md` is a *different, older* file — a block report from when
> PLACE-004 was an undefined ID. Retained as history; this report is the PLACE-004 record.

## 1. Executive Summary
`PlacesRepository.list()` paginated with `ORDER BY p.rating_avg DESC NULLS LAST, p.created_at
DESC` — no unique final key, so tied rows could be ordered differently between page requests
and a row could appear twice or vanish while a caller walks the list. The ordering now ends
with `p.id ASC`. Four specs were added, including a **mutation-checked** pagination test:
with the tie-breaker removed exactly the two meaningful specs fail; restored, all 11 pass.

## 2. Task Identity and Authority
| item | value |
|---|---|
| Task | PLACE-004 — "Add a unique tie-breaker to Place list ordering (GAP-12)" |
| Type | `implementation` |
| Authorized by | `state.yaml` — `current.task: PLACE-004`, was `ready` |
| depends_on | PLACE-003 (completed 2026-07-22, jest migrations 11/11) |

## 3. Task Type
`implementation`, per §4.2: only authorized files modified, specs added, validation run,
compatibility and rollback documented.

## 4. Starting Repository State
Not a git repository — branch/commit/diff unknown, not fabricated. Node v24.18.0 portable.
Pre-existing working-tree contents from PLACE-002/003 left intact.

## 5. Dependency Verification
PLACE-003 completed on executed evidence: `jest migrations` 11/11, eslint exit 0, tsc exit 0,
AC1–AC6 PASS (`evidence/PLACE-003-migration-evidence-index.md` VO-1..VO-4). Verified before
any edit. PLACE-003's migration is `implemented_not_executed`, which does not affect
PLACE-004 — this task touches no schema.

## 6. Problem and Objective
**Problem.** `rating_avg` is `numeric(2,1)` (few distinct values, plus a large NULL group for
unrated places) and `created_at` defaults to a shared `now()` on seed/import, so the two sort
keys do not produce a total order. PostgreSQL is free to return tied rows in any order, and
`LIMIT/OFFSET` slices that unstable order.

**Objective.** Make pagination deterministic without changing caller-visible ordering.

## 7. Approved Scope
In scope: `places.repository.ts` `list()` ORDER BY, and `places.repository.spec.ts`. Out of
scope: primary sort keys, keyset/cursor pagination (GAP-05/10), other query methods, any new
index or migration, DTO/controller/service/mapper/entity/shared-type/OpenAPI.

## 8. Execution Approach
Read `list()` and both call sites → confirmed `places.id` is the PK → appended `p.id ASC` as
the **last** key → confirmed the count query is unaffected → added specs following the
existing `createMock` + `sql()` convention → mutation-checked → ran validation.

## 9. Files Inspected
`tasks/PLACE-004.yaml`; `places.repository.ts`; `places.repository.spec.ts`;
`1720000400000-InitPlaces.ts:31` (PK); `test/helpers/create-mock`; `docs/api/openapi.yaml`
(listPlaces specifies no ordering, so no contract constrains this).

## 10. Files Created
None.

## 11. Files Modified
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `apps/api/src/modules/places/repositories/places.repository.ts` | task_required | append `p.id ASC` to `list()` ORDER BY (AC1) + explanatory comment | jest 11/11, eslint, tsc | remove `, p.id ASC` |
| `apps/api/src/modules/places/repositories/places.repository.spec.ts` | task_required | 4 new ordering specs (AC3) | jest 11/11 | remove the added describe block |

Change is confined to one SQL clause. No other method, file or module touched.

## 12. Domain Impact
None. Ordering is a read-path presentation concern: no identity, lifecycle, status transition,
ownership, publication, verification or soft-delete semantic changed.

## 13. Persistence and Migration Impact
No schema change, no migration, no entity change. `places.id` was already the primary key
(`InitPlaces.ts:31`, `uuid PRIMARY KEY`), so the new sort key is unique and non-null by
existing constraint — nothing had to be added to make it so.

## 14. API and Contract Impact
**Behaviour-preserving for every documented contract.** `openapi.yaml`'s `listPlaces` states
no ordering guarantee, and the two primary keys keep their position and direction — `p.id`
only arbitrates rows already equal under both. A caller can observe a difference only where
the previous behaviour was undefined. No field, type, default or serialization changed.

## 15. Compatibility Strategy
None required — the change strictly narrows previously-undefined behaviour. No alias, dual
read, flag or deprecation window exists, so none needs retiring.

## 16. Consumer Compatibility
| Consumer | Path | R/W | Contract or behavior | Required change | Validation | Status |
|---|---|---|---|---|---|---|
| places service/controller | `apps/api/src/modules/places` | read | unchanged | none | jest 11/11, tsc | compatible_without_change (tested) |
| geo / search / revisions | `apps/api/src/modules/{geo,search,revisions}` | read | do not call `list()` | none | tsc exit 0 | compatible_without_change (compiled) |
| web frontend | `apps/web/src/modules/places` | read | consumes list payload; ordering now stable | none | not run | not_verified |
| shared packages | `@phuquochub/{shared-types,utils}` | n/a | unchanged | none | resolved during tsc | compatible_without_change (compiled) |

Nothing runtime- or production-verified: no server or database was started.

## 17. Geospatial Impact
Not applicable to the approved PLACE-004 task. `nearby()`, `bbox()` and `bboxClusters()` were
explicitly out of scope and are unmodified.

## 18. Data-Quality Impact
None. No invariant, normalization, uniqueness or duplicate rule added — the fix relies on an
existing PK constraint rather than introducing one.

## 19. Cache, Search, and Event Impact
Not applicable to the approved PLACE-004 task. No cache key, TTL, invalidation, search
document, index mapping, event or job touched. `searchFullText()` ordering is unchanged.

## 20. Tests Added or Updated
Four specs added; none removed, none weakened:
1. The emitted ORDER BY **ends** with a unique key — parsed from the real SQL, not hard-coded.
2. The two original keys keep position and direction (guards AC2 against regression).
3. The count query has no ORDER BY, so it is provably unaffected.
4. **Determinism under a hostile planner:** six rows sharing `rating_avg` *and* `created_at`;
   the input array is rotated between the two page requests to model PostgreSQL's freedom to
   reorder equal rows; the two pages must still be disjoint and cover all six.

Specs 1 and 4 derive their comparator from the ORDER BY text the repository actually emits, so
they cannot pass by accident if the clause changes.

## 21. Validation Commands and Results
| # | command | cwd | exit | result |
|---|---|---|---|---|
| 1 | `npx jest places.repository` | `apps/api` | **0** | **11/11 pass** (7 pre-existing + 4 new) |
| 2 | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean |
| 3 | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | whole package type-checks |
| 4 | **mutation check** — same jest run with `, p.id ASC` removed | `apps/api` | **1** | **2 failed, 9 passed** — specs 1 and 4 failed exactly as intended; clause restored and rerun green |

All three declared `validation_commands` executed. No failure occurred outside the deliberate
mutation check, so no failure classification was required.

## 22. Security Review
No new surface. Ordering does not affect authentication, authorization, ownership, guards,
validation or serialization. No interpolation introduced: `p.id ASC` is a fixed literal and
all filters remain parameterized (`$1..$n`); the pre-existing injection-safety spec still
passes. Deterministic pagination slightly reduces the chance a caller silently misses rows —
an integrity improvement, not a security control.

## 23. Performance Review
A third sort key costs nothing measurable at comparison level. The index question is
**decided and recorded** rather than acted on (AC6):
- A fully covering index would be `(rating_avg DESC NULLS LAST, created_at DESC, id ASC)
  WHERE deleted_at IS NULL` — a three-column partial index serving one query shape.
- **Decision: do not create it.** The task's `out_of_scope` forbids new indexes, and
  justifying one needs `EXPLAIN` evidence that does not exist (Docker not installed).
  Creating it speculatively is exactly what the operating mode prohibits.
- Recorded as F-15 for the DB-backed validation task, alongside PLACE-003's still-unverified
  `idx_places_status_active`.

Nothing was measured: no baseline, no `EXPLAIN`, no timing.

## 24. Observability Review
Not applicable to the approved PLACE-004 task. No log, metric, trace, audit event or health
check added or required — no new failure mode exists.

## 25. Rollback or Recovery Review
Delete `, p.id ASC` from one line and remove the added describe block. No schema, data,
contract or configuration involved, so rollback is complete and non-destructive.

## 26. Deviations From the Approved Task
1. **Mutation check performed** — not required by the task, but the only way to show the new
   specs actually constrain behaviour. Clause restored immediately, suite reran green; both
   runs recorded in §21.
2. Nothing else. No index created (stop condition respected), no pagination model changed
   (GAP-05/10 untouched), no other query method modified.

## 27. Remaining Findings
| id | finding | evidence | disposition |
|---|---|---|---|
| F-15 | The list ORDER BY has no supporting index, and PLACE-003's `idx_places_status_active` remains unproven. Both need one `EXPLAIN` session. | §23 | DB-backed validation task (needs Docker) |
| F-16 | `nearby()`, `bbox()` and `bboxClusters()` also use `LIMIT` without a unique final key. They sort by distance/geometry rather than paginating with OFFSET, so the defect does not follow automatically — but it was not analysed here. | `places.repository.ts:268,287,315` | backlog — needs its own analysis |

F-1 … F-14 from earlier reports remain open and unchanged.

## 28. Risks
| risk | severity | note |
|---|---|---|
| No DB-backed validation anywhere in the workstream | high | unchanged; now two index questions depend on it |
| FAT32 removable volume, no VCS | high | unchanged |
| PROVISIONAL Phú Quốc bbox unconfirmed | medium | unchanged |

## 29. Acceptance-Criteria Evaluation
| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | Page query ORDER BY ends with a unique, non-null column | yes | **PASS** | spec 1; `InitPlaces.ts:31` PK |
| AC2 | Primary sort keys and directions unchanged and still leading | yes | **PASS** | spec 2 |
| AC3 | Spec asserts ORDER BY shape + stable non-overlapping pagination | yes | **PASS** | specs 1–4; mutation check §21 cmd 4 |
| AC4 | No DTO/controller/service/mapper/entity/migration/index/contract change | yes | **PASS** | change register §11 (2 files) |
| AC5 | jest / eslint / tsc all exit 0 | yes | **PASS** | §21 cmds 1–3 |
| AC6 | Index question explicitly decided and recorded | **no** | **PASS** | §23 |

All five mandatory criteria **PASS**. The optional criterion also passes.

## 30. Recommended Delivery-State Transition
Applied: `current.task: PLACE-005`, `status: ready`. Gates `implementation` and `testing`
remain `in_progress`; deployment/canary/hypercare/stabilization remain `not_started`.

## 31. Selected PLACE-005 Task
`docs/delivery/tasks/PLACE-005.yaml` — derived from the highest-priority remaining gap that is
executable in this environment; rationale recorded in that file.

## 32. Explicit Non-Claims
This report does **not** claim any unverified: **production deployment, production migration
application, production backfill completion, complete external consumer migration, complete
cache propagation, complete search reindexing, complete event propagation, canary success,
hypercare completion, production stabilization, compatibility retirement readiness, or legacy
schema cleanup readiness.**

Specifically not claimed: no database was queried, so the pagination fix is proven by
structural and simulation specs — **not** by observing PostgreSQL. No `EXPLAIN` evidence, no
index created, no e2e execution, no `nest build`, no runtime or production consumer
verification, no telemetry, and no git branch, commit or diff.
