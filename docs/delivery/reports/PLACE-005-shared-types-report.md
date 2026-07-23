# PLACE-005 — Execution Report (GAP-11 single-source Place response types)

> Workstream: place · Task: PLACE-005 · Type: API contract alignment · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-005.yaml`
> Result: **COMPLETED WITH FINDINGS.** AC1–AC6 (mandatory) PASS, AC7 (optional) PASS.

> `PLACE-005-execution-report.md` is a *different, older* file — a block report from when
> PLACE-005 was an undefined ID. Retained as history; this report is the PLACE-005 record.

## 1. Executive Summary
The Place response shape was declared twice and independently — `places.mapper.ts` in the API
and `modules/places/types.ts` in the web app — with nothing linking them. Both now import from
`@phuquochub/shared-types`, which gained `src/place.ts`. The JSON payload is byte-identical;
this was a declaration consolidation, not a contract change, and the pre-existing mapper specs
passed **unmodified** as proof.

Two real divergences surfaced while doing it, both recorded rather than papered over: openapi
omits `status`/`score` from `PlaceCard` although both implementations return them (F-17), and
`PlaceCardRow.verification_status` is typed `string` where the shared contract says enum (F-18).

## 2. Task Identity and Authority
| item | value |
|---|---|
| Task | PLACE-005 — "Single-source the Place response types in @phuquochub/shared-types (GAP-11)" |
| Type | `API contract alignment` |
| Authorized by | `state.yaml` — `current.task: PLACE-005`, was `ready` |
| depends_on | PLACE-004 (completed 2026-07-22, jest 11/11 + mutation check) |

## 3. Task Type
`API contract alignment` per §5.7 / §4: the request→response path was traced, declaration
sites aligned, backward compatibility preserved, and contract-focused checks run on **both**
sides of the contract.

## 4. Starting Repository State
Not a git repository — branch/commit/diff unknown, not fabricated. Node v24.18.0 portable.
**Baseline captured before editing:** `apps/web` `npx tsc --noEmit` exit **0**, which was a
precondition — PLACE-005's second stop condition required abandoning the web half if the web
could not be type-checked here. It could, so the full scope proceeded.

## 5. Dependency Verification
PLACE-004 completed on executed evidence: `jest places.repository` 11/11, eslint exit 0,
tsc exit 0, plus a mutation check, AC1–AC5 PASS
(`evidence/PLACE-004-ordering-evidence-index.md` VO-1..VO-4).

## 6. Problem and Objective
`places.mapper.ts:6-21` declared `PlaceCard`; `apps/web/src/modules/places/types.ts` declared
`PlaceCard`, `PlaceDetail`, `GeoPoint`, `PlaceContact`, `PlacePrice`, `PlaceMedia`, `PlaceFaq`.
`packages/shared-types` — whose stated purpose is "DTO/enum/interface dùng chung giữa FE và
BE" — held only `api-response.ts` and `health.ts`. The two declarations agreed only because a
human kept them in step, and had already begun diverging in strictness (API used enums,
web used bare `string`).

Objective: one declaration, imported by both, with no change to the wire payload.

## 7. Approved Scope
In scope: new `packages/shared-types/src/place.ts`, its barrel export, `places.mapper.ts`,
`apps/web/src/modules/places/types.ts`, plus the rebuild + re-materialization step. Out of
scope: the JSON payload, `openapi.yaml`, GAP-05/10, entity/migration/repository/service/
controller/DTO, and web components.

## 8. Execution Approach
1. Captured the `apps/web` typecheck baseline (stop-condition gate).
2. Read `openapi.yaml` `PlaceCard`/`Place` as the authoritative shape.
3. **Probed** whether TS string-enum members are assignable to string-literal unions, with a
   throwaway file — they are (exit 0). That settled the AC7 representation decision on
   evidence rather than recollection.
4. Authored `place.ts` following `api-response.ts`'s style and comment language.
5. Repointed both consumers; enumerated every importer first.
6. Rebuilt the package and re-copied `dist` + `package.json` into `node_modules`.
7. Ran validation on both sides; fixed the one type error surfaced, within scope.

## 9. Files Inspected
`tasks/PLACE-005.yaml`; `packages/shared-types/{package.json,src/index.ts,src/api-response.ts}`;
`places.mapper.ts`; `places.mapper.spec.ts`; `places-detail.mapper.spec.ts`;
`places.repository.ts`; `place.enums.ts`; `apps/web/{package.json,tsconfig.json}`;
`apps/web/src/modules/places/{types.ts,api/places.api.ts}`; `docs/api/openapi.yaml:1754-1785`;
plus a full importer sweep of `PlaceCard` (API) and `@/modules/places/types` (web).

## 10. Files Created
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `packages/shared-types/src/place.ts` | task_required | the single declaration (AC1) | pkg tsc, both app typechecks | delete file |

## 11. Files Modified
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `packages/shared-types/src/index.ts` | task_required | export the new module (AC1) | pkg tsc exit 0 | remove one line |
| `apps/api/src/modules/places/places.mapper.ts` | task_required | import + re-export instead of declaring (AC2); narrow `verification_status` | jest 33/33, tsc, eslint | restore the local interface |
| `apps/web/src/modules/places/types.ts` | task_required | re-export instead of declaring (AC3) | web tsc exit 0 | restore the declarations |
| `packages/shared-types/dist/**` + `node_modules/@phuquochub/shared-types/**` | generated | rebuild + FAT32 re-materialization | api tsc exit 0 | `npm run build` and re-copy |

No entity, migration, repository, service, controller, DTO or `openapi.yaml` change (AC5).

## 12. Domain Impact
None. No identity, aggregate boundary, lifecycle, status transition, ownership, publication,
verification, provenance, audit or soft-delete semantic changed. Type declarations only.

## 13. Persistence and Migration Impact
Not applicable to the approved PLACE-005 task. No entity, migration, index, constraint, seed
or fixture touched. `PlaceCardRow`/`PlaceDetailRow` (the DB-facing row types) were deliberately
left alone — see F-18.

## 14. API and Contract Impact
**The wire payload is unchanged.** Every field keeps its name, presence, nullability and
JSON type. What changed is where the *type declaration* lives.

| element | old state | new state | compatibility | evidence |
|---|---|---|---|---|
| `PlaceCard` (API) | local interface in `places.mapper.ts` | imported + re-exported from shared-types | identical shape | mapper specs unmodified, 33/33 |
| `PlaceCard`/`PlaceDetail` + satellites (web) | 7 local interfaces | re-exported from shared-types | identical shape | web tsc exit 0 |
| `price_range`, `status` | API enum / web `string` | shared string-literal union | narrower on the web side, same values | both typechecks exit 0 |
| `verification_status` | API `string` / web `string` | shared union | narrower on both, matches openapi | api tsc exit 0 after mapper narrowing |
| `created_at`/`updated_at` | web `string`; API returns `Date` | shared type declares `string` (JSON truth) | unchanged on the wire | F-17 |

The strictness increases are compile-time only; no runtime value was converted, added or
dropped anywhere.

## 15. Compatibility Strategy
None needed, and none created. This is not a coexistence problem: the old and new declarations
describe the same payload, so there is no transitional path, feature flag or deprecation window
to retire. `places.mapper.ts` re-exports `PlaceCard` so existing import paths keep working —
that is import-path stability, not a compatibility shim, and it needs no retirement plan.

## 16. Consumer Compatibility
| Consumer | Path | R/W | Contract or behavior | Required change | Validation | Status |
|---|---|---|---|---|---|---|
| places mapper + specs | `apps/api/src/modules/places` | read | unchanged payload | import swap | jest 33/33 | **updated (tested)** |
| geo service | `apps/api/src/modules/geo/geo.service.ts:4` | read | imports `toPlaceCard` only | none | tsc exit 0 | compatible_without_change (compiled) |
| web places api + card | `apps/web/src/modules/places/{api/places.api.ts,PlaceCard.tsx}` | read | unchanged | none — path preserved | web tsc exit 0 | compatible_without_change (compiled) |
| web place detail page | `apps/web/src/app/(public)/places/[slug]/page.tsx:7` | read | unchanged | none | web tsc exit 0 | compatible_without_change (compiled) |
| web map / search | `modules/map/{MapView.tsx,api/geo.api.ts}`, `modules/search/SearchMapExplorer.tsx` | read | unchanged | none | web tsc exit 0 | compatible_without_change (compiled) |
| web hotels / restaurants / tours | `modules/{hotels,restaurants,tours}/api/*.api.ts` | read | unchanged | none | web tsc exit 0 | compatible_without_change (compiled) |
| shared-types package | `packages/shared-types` | n/a | additive export | new module | pkg tsc + build exit 0 | **updated (compiled)** |

All eight web importers use `import type`, so the re-export is transparent to them. Nothing is
`runtime_verified` or `production_verified`: neither app was started.

## 17. Geospatial Impact
`GeoPoint` moved declaration sites; its shape (`{ lat, lng }`) is unchanged, and it remains the
post-extraction representation the mapper produces from `geography(Point,4326)`. No coordinate
order, SRID, projection or serialization change. `MapView.tsx` and `SearchMapExplorer.tsx`
consume it unchanged and still type-check.

## 18. Data-Quality Impact
Marginally positive and compile-time only: `verification_status`, `status`, `price_range` and
FAQ `status` are now closed unions instead of open `string`, so a typo in web code that
compares against a non-existent status becomes a compile error. No runtime validation was added
and no stored data is affected.

## 19. Cache, Search, and Event Impact
Not applicable to the approved PLACE-005 task. No cache key, TTL, invalidation, search
document, index mapping, event or job touched. `score` remains an optional field on the card,
declared as before.

## 20. Tests Added or Updated
**None added, none modified — deliberately.** The existing `places.mapper.spec.ts` and
`places-detail.mapper.spec.ts` are precisely the right instrument: they assert the mapper's
output shape, and they pass **unmodified** against the shared types. Editing them would have
destroyed that evidence. This is the AC4 proof that the payload did not change.

Type-level correctness is enforced by the two `tsc` runs rather than by new unit tests, which
is the appropriate instrument for a declaration-only change.

## 21. Validation Commands and Results
| # | command | cwd | exit | result |
|---|---|---|---|---|
| 0 | `npx tsc --noEmit` (**baseline, before any edit**) | `apps/web` | **0** | web was already clean — stop condition not triggered |
| 1 | `npx tsc -p tsconfig.json --noEmit` | `packages/shared-types` | **0** | new module type-checks |
| 2 | `npm run build` | `packages/shared-types` | **0** | `dist/place.{js,d.ts,js.map}` emitted |
| 3 | re-copy `dist` + `package.json` → `node_modules/@phuquochub/shared-types` | repo root | 0 | `index.d.ts` in node_modules confirmed to export `./place` |
| 4 | `npx tsc -p tsconfig.json --noEmit` (**first attempt**) | `apps/api` | **2** | 1 × TS2322 — `verification_status` `string` → union |
| 5 | `npx tsc -p tsconfig.json --noEmit` (after mapper narrowing) | `apps/api` | **0** | clean |
| 6 | `npx tsc --noEmit` | `apps/web` | **0** | clean — web genuinely consumes the shared types |
| 7 | `npx jest places` | `apps/api` | **0** | **33/33 pass, 5 suites** — mapper specs unmodified |
| 8 | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean |
| 9 | `npx eslint src --max-warnings=0` | `packages/shared-types` | **0** | clean |

All six declared `validation_commands` executed, plus the baseline and the re-materialization
check.

## 22. Failure Classification
One failure occurred, at command 4:
| failure | classification | evidence | resolution |
|---|---|---|---|
| `places.mapper.ts(21,5): TS2322: Type 'string' is not assignable to type 'VerificationStatusValue'` | **introduced_by_PLACE-005** | it appeared only after the shared type tightened `verification_status`, in a file this task edits | narrowed at the mapper boundary with a documented cast; command 5 then exit 0 |

Honest framing: the error was *caused* by this task, but it *exposed* a pre-existing looseness
— the API had typed an enum column as bare `string` since it was written. Fixing the row type
belongs to the repository and is out of scope, so it is recorded as F-18 rather than absorbed.

## 23. Security Review
No new surface. No authentication, authorization, ownership, guard, validation, serialization,
error-handling or query path changed; no runtime code was added at all on the web side (all
exports are `type`-only, so nothing enters the client bundle).

One deliberate weakening worth naming: `row.verification_status as VerificationStatusValue` is
an **unchecked** cast. It is sound only because the DB column is an `ENUM
"verification_status"` (`InitPlaces1720000400000`, `places."verification_status" NOT NULL
DEFAULT 'pending'`), so out-of-set values cannot exist. That reasoning is written at the cast
site. If the column type ever loosened, the cast would silently lie — which is exactly why
F-18 proposes fixing the row type instead.

## 24. Performance Review
No runtime impact whatsoever: type declarations are erased at compile time, and the web side
imports types only, so no module is added to the client bundle. No query, index, payload size
or serialization changed. Nothing to measure, and nothing measured.

## 25. Observability Review
Not applicable to the approved PLACE-005 task. No runtime behaviour changed, so no log,
metric, trace, audit event or health check was added or required.

## 26. Rollback or Recovery Review
1. Delete `packages/shared-types/src/place.ts`, remove its barrel line, restore the local
   interface in `places.mapper.ts` and the seven declarations in the web `types.ts`.
2. `npm run build` in `packages/shared-types`, then re-copy `dist` + `package.json` into
   `node_modules/@phuquochub/shared-types`.

Step 2 is mandatory on this volume: the package is a **copy, not a symlink** (FAT32), so a
source revert without a re-copy leaves the API type-checking against a stale `dist`. No schema,
data or wire contract is involved, so rollback is otherwise complete and non-destructive.

## 27. Deviations From the Approved Task
1. **A cast was added inside the mapper** (`as VerificationStatusValue`). The alternative fixes
   — loosening the shared type, or retyping `PlaceCardRow` — would have contradicted openapi or
   breached `out_of_scope` respectively. The mapper is in scope and is the correct boundary.
   Recorded here rather than absorbed silently.
2. **A throwaway TS probe** was compiled in the scratchpad to settle the enum-vs-union question
   empirically. No repository file was involved.
3. Nothing else: no payload change, no openapi edit, no repository/service/DTO change, no web
   component touched, and no existing test modified.

## 28. Remaining Findings
| id | finding | evidence | disposition |
|---|---|---|---|
| F-17 | **openapi `PlaceCard` omits `status` and `score`**, yet `places.mapper.ts` returns both and the web consumes them. The SSOT and the implementation disagree about the card contract. | `openapi.yaml:1754-1768`; `place.ts` `PlaceCard` | backlog — same family as the parked GAP-05/10 contract-authority question; needs owner adjudication, **not** a unilateral fix |
| F-18 | `PlaceCardRow.verification_status` is `string` although the column is a DB enum, forcing an unchecked cast in the mapper. Retyping the row would remove the cast. | `places.repository.ts:18`; mapper cast site | backlog — repository change, out of PLACE-005 scope |
| F-19 | `toPlaceDetail()` returns `created_at`/`updated_at` as `Date` while the wire type declares `string`. Correct today (HTTP serializes them), but the API's detail return type is therefore *not* the shared `PlaceDetail` — a trap for anyone who later tries to annotate it. | `places.mapper.ts:50-61`; `place.ts` `PlaceDetail` doc comment | backlog — documented at both sites |

F-1 … F-16 from earlier reports remain open and unchanged.

## 29. Risks
| risk | severity | note |
|---|---|---|
| No DB-backed validation anywhere in the workstream | high | unchanged |
| **`node_modules/@phuquochub/shared-types` is a copy, not a link** | high | now materially worse: the package has real Place content, so any future edit to `packages/shared-types` that skips the re-copy makes both apps type-check against stale declarations. Was F-5; this task made it load-bearing. |
| FAT32 removable volume, no VCS | high | unchanged |
| Unchecked cast at the mapper | low | sound while the DB enum holds; F-18 removes it |

## 30. Acceptance-Criteria Evaluation
| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | Types declared exactly once in shared-types and exported from the barrel | yes | **PASS** | `place.ts`; `index.ts`; both apps now import |
| AC2 | API mapper consumes shared types; every existing importer still compiles | yes | **PASS** | importer sweep; §21 cmds 5, 7 |
| AC3 | Web types module consumes shared types; `PlaceCard.tsx` / `places.api.ts` unchanged | yes | **PASS** | §21 cmd 6; neither file edited |
| AC4 | Wire contract unchanged; existing mapper specs pass unmodified | yes | **PASS** | §21 cmd 7 — 33/33, specs untouched |
| AC5 | No entity/migration/repository/service/controller/DTO/openapi change | yes | **PASS** | change register §10–11 |
| AC6 | api jest + eslint + tsc exit 0 **and** web typecheck exit 0 | yes | **PASS** | §21 cmds 5–9 |
| AC7 | Enum-vs-union decision recorded with client-bundle reasoning | **no** | **PASS** | `place.ts` header; §8 step 3 |

All six mandatory criteria **PASS**. The optional criterion also passes.

## 31. Recommended Delivery-State Transition
Applied: `current.task: PLACE-006`, `status: ready`. Gates unchanged
(`implementation`/`testing` `in_progress`; deployment onward `not_started`).

## 32. Selected PLACE-006 Task
`docs/delivery/tasks/PLACE-006.yaml` — **"Constrain opening_hours to the documented JSONB
structure (GAP-14)"**, type `data-quality enforcement`. `places.dto.ts:52-53,81-82` accepts
`opening_hours` as a bare `@IsObject()`, so any shape passes the public create/update path and
is persisted to JSONB, while `places.md` §4 specifies a concrete structure. It is API-only,
DTO-level, testable without a database, and needs no owner decision — unlike F-17 and the
parked GAP-05/10.

## 33. Explicit Non-Claims
This report does **not** claim any unverified: **production deployment, production migration
application, production backfill completion, complete external consumer migration, complete
cache propagation, complete search reindexing, complete event propagation, canary success,
hypercare completion, production stabilization, compatibility retirement readiness, or legacy
schema cleanup readiness.**

Specifically not claimed: no server, browser or database was started, so consumer compatibility
is `compiled`, never `runtime_verified` — `next build` was **not** run, only `tsc --noEmit`. No
`EXPLAIN` evidence, no e2e execution, no `nest build`, no telemetry, and no git branch, commit
or diff. The payload-unchanged claim rests on unmodified mapper specs plus two type-checks, not
on observing an HTTP response.
