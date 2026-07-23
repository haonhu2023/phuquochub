# PLACE-011 — Execution Report (F-18 row typing / cast removal)

> Workstream: place · Task: PLACE-011 · Type: persistence remediation · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-011.yaml`
> Result: **COMPLETED.** AC1–AC6 (mandatory) PASS, AC7 (optional) PASS.

## 1. Executive Summary
`PlaceCardRow.verification_status` was typed `string` although the column is a `NOT NULL` DB
enum, which had forced an unchecked `as VerificationStatusValue` assertion into
`places.mapper.ts` during PLACE-005. The row is now typed correctly at its declaration and the
cast is gone. Two files, no runtime change; the mapper and repository specs pass **unmodified**.

## 2. Task Identity and Authority
| item | value |
|---|---|
| Task | PLACE-011 — "Type PlaceCardRow.verification_status against the shared union and remove the unchecked cast (F-18)" |
| Type | `persistence remediation` |
| Authorized by | `state.yaml` — `current.task: PLACE-011`, was `ready` |
| depends_on | PLACE-010 (completed 2026-07-22, readiness assessment, no product code changed) |

## 3. Task Type
`persistence remediation` per §5.4: the row/entity/migration alignment was inspected, data
compatibility preserved, and the change confined to a declaration.

## 4. Starting Repository State
Not a git repository — branch/commit/diff unknown, not fabricated. Node v24.18.0 portable.
Working tree carries PLACE-002…010 changes, all intact.

## 5. Dependency Verification
PLACE-010 completed on executed evidence: `jest places` 92/92, `jest migrations` 11/11, api and
web `tsc` exit 0, no product code changed
(`evidence/PLACE-010-readiness-evidence-index.md` VO-1..VO-4, AS-6).

## 6. Problem and Objective
The assertion was sound but load-bearing on an assumption stated only in a comment. Typing the
row at its declaration moves the guarantee from prose into the type system.

## 7. Soundness Basis
`1720000400000-InitPlaces.ts:47` declares:

```
"verification_status" "verification_status" NOT NULL DEFAULT 'pending'
```

a PostgreSQL `ENUM` column, `NOT NULL`, whose value set is exactly
`pending | verified | official | community_verified | expired | rejected`. The value set is
closed and non-null at the database, so typing the row as that union describes reality rather
than hoping for it. This is the difference between the removed cast and the new declaration: the
cast asserted the invariant, the type now *states* it.

## 8. Import-Direction Decision (AC6)
Importing `VerificationStatusValue` from `@phuquochub/shared-types` — a **wire-contract**
package — into a **persistence** file is a coupling worth justifying rather than doing quietly.

**Decision: acceptable here, deliberately.** The union is not a presentation concern that
happens to match; it *is* the DB enum's value set, and `packages/shared-types` is already the
single source for it after PLACE-005. Declaring a second local copy in the repository would
recreate exactly the duplication GAP-11 was opened to remove, and the two copies would drift
the moment the enum gained a value. The import is `import type`, so it erases at compile time
and adds no runtime dependency from persistence to the contract package.

Precedent check: the file already imports `PlaceStatus` and `PriceRange` from `place.enums.ts`
for the same purpose, so typing row fields against enum value sets is the established pattern
here; only the *source* of the union is new.

## 9. Files Inspected
`tasks/PLACE-011.yaml`; `places.repository.ts`; `places.mapper.ts`;
`packages/shared-types/src/place.ts`; `1720000400000-InitPlaces.ts:47`;
`places.mapper.spec.ts`; `places.repository.spec.ts`.

## 10. Files Created
None.

## 11. Files Modified
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `apps/api/src/modules/places/repositories/places.repository.ts` | task_required | `verification_status: string` → `VerificationStatusValue` (AC1), plus the `import type` and a comment citing the DB enum | jest 92/92, tsc, eslint | restore `string`, drop the import |
| `apps/api/src/modules/places/places.mapper.ts` | task_required | cast and its justifying comment removed (AC2); now-unused `VerificationStatusValue` import dropped | same | re-add the cast, comment and import |

**Before / after**

| site | before | after |
|---|---|---|
| `places.repository.ts` `PlaceCardRow` | `verification_status: string;` | `verification_status: VerificationStatusValue;` |
| `places.mapper.ts` `toPlaceCard` | `row.verification_status as VerificationStatusValue,` (+6 comment lines) | `row.verification_status,` |

The comment was removed **with** the cast, deliberately: a comment explaining an assertion that
no longer exists sends the next reader looking for code that is gone.

## 12. Domain Impact
None. No identity, lifecycle, status transition, ownership, publication, verification semantic,
provenance, audit or soft-delete behaviour changed. `verification_status` carries the same
values it always did; only its declared type narrowed.

## 13. Persistence Impact
No SQL, query shape, migration, entity, index, constraint, seed or fixture change. Entity and
migration remain aligned — this task moved the *TypeScript row projection* into agreement with
a schema that was already correct. `PlaceDetailRow` inherits the narrowed field automatically
and needed no edit.

## 14. API and Contract Impact
None. The value serialized to clients is byte-identical; `PlaceCard.verification_status` in
`shared-types` was **already** this union, which is precisely why the cast existed. This task
removed the discrepancy on the persistence side rather than changing anything the wire sees.

## 15. Compatibility Strategy
Not applicable — no old/new behaviour coexists. A compile-time narrowing has no transitional
path and nothing to retire.

## 16. Consumer Compatibility
| Consumer | Path | R/W | Contract or behavior | Required change | Validation | Status |
|---|---|---|---|---|---|---|
| places mapper + specs | `apps/api/src/modules/places` | read | unchanged | cast removed | jest 92/92 | **updated (tested)** |
| geo / search / revisions | `apps/api/src/modules/{geo,search,revisions}` | read | consume `toPlaceCard`, not the raw row field | **none** | tsc exit 0 | compatible_without_change (compiled) |
| web frontend | `apps/web` | read | unchanged payload | none | web tsc exit 0 | compatible_without_change (compiled) |
| shared-types | `packages/shared-types` | n/a | **unchanged** — no rebuild or re-materialization needed | none | api+web tsc exit 0 | compatible_without_change (compiled) |

The first stop condition — cross-module errors from the tightening — **did not fire**. No module
outside `places` reads the raw row field, so nothing surfaced and nothing was widened.

## 17. Geospatial / Data-Quality / Cache-Search-Event Impact
Not applicable to the approved PLACE-011 task. No coordinate, geometry, validation rule, cache
key, search document or event touched.

## 18. Tests Added or Updated
**None — and that is the evidence.** AC4 required the existing mapper and repository specs to
pass **unmodified**, because needing to edit them would have meant behaviour changed rather than
typing. The suite total is unchanged at 92, from the same 7 suites: no spec was added, removed
or edited.

## 19. Validation Commands and Results
| # | command | cwd | exit | result |
|---|---|---|---|---|
| 1 | `npx jest places` | `apps/api` | **0** | **92/92 pass, 7 suites** — identical to the pre-change count |
| 2 | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean |
| 3 | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean — **first attempt**, no iteration |
| 4 | `npx tsc --noEmit` | `apps/web` | **0** | clean |
| 5 | grep `as VerificationStatusValue` in `places.mapper.ts` | repo | 0 | **0 occurrences** — cast provably gone |

All four declared `validation_commands` executed, plus the cast-removal check. No failures, so
no failure classification was required.

Command 3 passing on the first attempt is the substantive result: had the DB-facing row and the
contract union disagreed anywhere else, the tightening would have surfaced it immediately.

## 20. Security Review
Small and positive. An unchecked type assertion is a place where the type system stops helping:
if the underlying value had ever fallen outside the union, the cast would have propagated it
silently into the response. That assertion is gone, and the guarantee now rests where it belongs
— the DB enum plus `NOT NULL`.

No runtime validation was added, deliberately (third stop condition): a redundant check would
misrepresent where the invariant actually lives. No authentication, authorization, guard,
serialization or query behaviour changed.

## 21. Performance Review
No runtime impact whatsoever — types erase at compile time and no value is converted. Nothing
measured; nothing to measure.

## 22. Observability Review
Not applicable to the approved PLACE-011 task. No runtime behaviour changed, so no log, metric,
trace or audit surface is affected.

## 23. Rollback or Recovery Review
Restore `verification_status: string`, re-add the cast, comment and import. Two edits, no
schema, data or contract involved. Because nothing runtime changed, a revert cannot leave
inconsistent state behind — and unlike PLACE-005, **no shared-types rebuild or node_modules
re-copy is needed**, since the package itself was not touched.

## 24. Deviations From the Approved Task
None. Two files, both in `in_scope`. F-19 and F-20 were left untouched as instructed, no other
row field was swept, no runtime validation added, and no spec edited.

## 25. Remaining Findings
| id | finding | evidence | disposition |
|---|---|---|---|
| F-29 | `PlaceCardRow.status` is typed `PlaceStatus` (the API's internal TS enum) while `verification_status` is now typed from the shared union. Both are correct and both compile, but the row now mixes two sources for the same kind of concept. Worth unifying when the enum sources are next revisited — not worth a change on its own. | `places.repository.ts` `PlaceCardRow` | backlog — cosmetic consistency, no defect |

AC7 is satisfied by this: the tightening surfaced one observation, and it was recorded rather
than fixed in passing.

F-1 … F-28 remain as classified by the PLACE-010 assessment, **except F-18, which this task
resolves**.

## 26. Risks
| risk | severity | note |
|---|---|---|
| 5 release blockers from PLACE-010 (F-1, F-2, F-3, F-6, F-17) | high | unchanged — this task addressed a NON_BLOCKING item, by design, since all five blockers sit outside the repository or need an owner |
| No DB-backed validation | high | unchanged |
| FAT32 volume, no VCS | high | unchanged |

## 27. Acceptance-Criteria Evaluation
| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | Row field typed as the enum's value union, not `string` | yes | **PASS** | §11 before/after |
| AC2 | Unchecked cast and its justifying comment removed | yes | **PASS** | §19 cmd 5 — 0 occurrences |
| AC3 | No SQL/query/migration/entity/DTO/service/controller/contract change; no runtime value converted differently | yes | **PASS** | §11 change register (2 files); §13–14 |
| AC4 | Mapper and repository specs pass **unmodified** | yes | **PASS** | §18; §19 cmd 1 — 92/92 from the same 7 suites |
| AC5 | api jest/eslint/tsc and web tsc all exit 0 | yes | **PASS** | §19 cmds 1–4 |
| AC6 | Import-direction decision recorded with reasoning | yes | **PASS** | §8 |
| AC7 | Surfaced assumptions recorded, not fixed in passing | **no** | **PASS** | §25 F-29 |

All six mandatory criteria **PASS**. The optional criterion also passes.

## 28. Recommended Delivery-State Transition
Applied: `current.task: PLACE-012`, `status: ready`. No gate changes — this task removed a
typing inaccuracy, which moves no gate.

## 29. Selected PLACE-012 Task
`docs/delivery/tasks/PLACE-012.yaml` — **"Resolve the remaining boundary-typing findings F-19
and F-20"**, type `API contract alignment`. They are the two remaining inaccuracies in the
PLACE-010 typing cluster, both on the **read** contract, and they belong together: `toPlaceDetail`
returns `Date` where the wire type declares `string` (F-19), and `PlaceDetail.opening_hours` is
still `Record<string, unknown>` although writes are now structurally validated (F-20).

## 30. Explicit Non-Claims
This report does **not** claim any unverified: **production deployment, production migration
application, production backfill completion, complete external consumer migration, complete
cache propagation, complete search reindexing, complete event propagation, canary success,
hypercare completion, production stabilization, compatibility retirement readiness, or legacy
schema cleanup readiness.**

Specifically not claimed: no database was queried, so the soundness of the new type rests on
**reading the migration's enum definition**, not on observing stored values. Nothing verifies
what a live `places` table actually contains. No `nest build`, no e2e, no telemetry, and no git
branch, commit or diff.
