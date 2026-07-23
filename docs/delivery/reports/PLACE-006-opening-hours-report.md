# PLACE-006 — Execution Report (GAP-14 opening_hours structure validation)

> Workstream: place · Task: PLACE-006 · Type: data-quality enforcement · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-006.yaml`
> Result: **COMPLETED.** AC1–AC6 (mandatory) PASS, AC7 (optional) PASS.

## 1. Executive Summary
`opening_hours` was accepted as a bare `@IsObject()` on both write DTOs, so any object at all —
`{"foo":"bar"}`, or a structurally wrong `{"regular":{"mon":"08:00"}}` — passed validation and
was written straight to JSONB. It is now validated against the structure in `places.md` §4 by a
reusable `@IsOpeningHours()` decorator built on the `geo-bounds.ts` precedent.

18 specs added, all green (30/30 in the suite). **Mutation-checked:** removing the decorator
fails 9 specs. The SSOT's own example payload is asserted verbatim as a PASS case, which is
what guarantees the rule did not become stricter than the documentation.

## 2. Task Identity and Authority
| item | value |
|---|---|
| Task | PLACE-006 — "Constrain opening_hours to the documented JSONB structure (GAP-14)" |
| Type | `data-quality enforcement` |
| Authorized by | `state.yaml` — `current.task: PLACE-006`, was `ready` |
| depends_on | PLACE-005 (completed 2026-07-22) |

## 3. Task Type
`data-quality enforcement` per §5.10: invariants defined from the SSOT, existing-data
assumptions checked first, false-positive risk assessed, validation only (no normalization),
boundary and malformed cases tested.

## 4. Starting Repository State
Not a git repository — branch/commit/diff unknown, not fabricated. Node v24.18.0 portable.
Working tree carries the PLACE-002…005 changes, all left intact.

## 5. Dependency Verification
PLACE-005 completed on executed evidence: `jest places` 33/33 with mapper specs unmodified,
`apps/api` and `apps/web` `tsc` exit 0, both lints exit 0, AC1–AC6 PASS
(`evidence/PLACE-005-shared-types-evidence-index.md` VO-1..VO-9).

## 6. Problem and Objective
`places.dto.ts:52-53` (Create) and `:81-82` (Update) declared `@IsOptional() @IsObject()` and
typed the field `Record<string, unknown>`. `places.md` §4 specifies a concrete structure —
`timezone`, `regular` keyed by weekday with arrays of `{open, close}`, `is_24h`, `exceptions`
with `date`/`closed`/`hours`/`note`, and `note`. Nothing enforced it, so malformed hours could
be persisted and would fail only later, in the UI that renders them.

Objective: enforce the documented structure at the DTO layer without changing the stored
representation, the response contract or openapi, and without rejecting anything the SSOT allows.

## 7. Approved Scope
In scope: `places.dto.ts` (both write DTOs), a new validator module under `common/`, and
`places.dto.spec.ts`. Out of scope: stored representation, entity, migration, response
contract, openapi, normalization/defaulting, backfill of existing rows, `place_hours`, timezone
database, and the parked GAP-05/10 plus F-17/F-18.

## 8. Execution Approach
1. **Checked existing data first** — the task's first stop condition. Grepped every migration
   for `opening_hours`: the column is created in `InitPlaces`, and
   `SeedPlacesExpansion.ts:13` records that hours were **deliberately left empty** for lack of
   a source. No seeded payload exists, so no stop condition fired and no existing row can be
   invalidated.
2. Enumerated every field from `places.md` §4 and its type.
3. Followed the `geo-bounds.ts` pattern: a pure error-returning function plus a thin
   `registerDecorator` wrapper.
4. Applied the decorator to **both** write DTOs.
5. Wrote specs, including the SSOT example verbatim; mutation-checked; ran validation.

## 9. Files Inspected
`tasks/PLACE-006.yaml`; `docs/data/modules/places.md` §4; `places.dto.ts`;
`places.dto.spec.ts`; `common/geo-bounds.ts`; `place.entity.ts` (`openingHours` jsonb);
`openapi.yaml:1777`; all 20 migrations grepped for `opening_hours`.

## 10. Files Created
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `apps/api/src/common/opening-hours.ts` | task_required | `openingHoursErrors` / `isValidOpeningHours` / `IsOpeningHours` (AC1–AC3) | jest 30/30, eslint, tsc | delete file |

## 11. Files Modified
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `apps/api/src/modules/places/dto/places.dto.ts` | task_required | `@IsOpeningHours()` on Create **and** Update (AC4) + import | jest 30/30, tsc, eslint | remove decorator + import |
| `apps/api/src/modules/places/dto/places.dto.spec.ts` | task_required | 18 new specs (AC1–AC4) | jest 30/30 | remove appended blocks |

No entity, migration, repository, service, controller, mapper, contract or openapi change (AC5).

## 12. Domain Impact
None to Place semantics — identity, lifecycle, status, ownership, publication, verification and
soft-delete are untouched. What changed is the *admissible input domain* for one optional
field: previously "any object", now "any object whose known fields match `places.md` §4".

## 13. Persistence and Migration Impact
No schema, entity, migration or index change. The stored representation is unchanged: the JSONB
column still receives exactly what the client sent — validation **rejects or passes through**,
it never rewrites. Existing rows are unaffected because validation applies only to new writes,
and there are no seeded payloads to conflict with (§8 step 1).

## 14. API and Contract Impact
The response contract is untouched. The *request* contract becomes stricter: previously-accepted
malformed payloads now return 400. That is the intended effect of the task and is aligned with
the SSOT, not a divergence from it.

`openapi.yaml:1777` deliberately declares `opening_hours` as `object` with
`additionalProperties: true`, and was **not** modified (explicit stop condition). The
implementation stays compatible with it: unknown top-level keys are tolerated (§16).

## 15. Compatibility Strategy
None required. No old/new behaviour coexists: there is one validation path, applied to both
write DTOs simultaneously, so no transitional mechanism, flag or deprecation window exists to
retire. Clients sending SSOT-shaped payloads see no change at all.

## 16. Consumer Compatibility
| Consumer | Path | R/W | Contract or behavior | Required change | Validation | Status |
|---|---|---|---|---|---|---|
| places controller/service (create) | `apps/api/src/modules/places` | write | stricter request validation | none | jest 30/30 | compatible_without_change (tested) |
| places controller/service (update) | same | write | stricter request validation | none | jest 30/30 | compatible_without_change (tested) |
| seeds / migrations | `core/database/migrations` | write | **no seeded opening_hours exists** | none | grep across all 20 migrations | not_applicable |
| web frontend | `apps/web/src/modules/places` | read | reads hours, does not submit them | none | not run | not_verified |
| shared types | `@phuquochub/shared-types` | n/a | `PlaceDetail.opening_hours` stays `Record<string, unknown>` | none | tsc exit 0 | compatible_without_change (compiled) |

Deliberate note: the shared **response** type was left as `Record<string, unknown>` rather than
tightened to mirror the validator. Tightening it would be a contract change on the read side,
which is out of scope — recorded as F-20.

## 17. Geospatial Impact
Not applicable to the approved PLACE-006 task. No coordinate, geometry, SRID or spatial
behaviour touched; the `geo-bounds.ts` validators are untouched and their specs still pass
within the same suite.

## 18. Data-Quality Impact
This is the substance of the task.

| item | value |
|---|---|
| **Invariant** | `opening_hours`, when present, matches `places.md` §4: `timezone` string, `regular` keyed by the 7 weekday codes with arrays of `{open, close}` in `HH:MM`, `is_24h` boolean, `exceptions` an array of `{date: YYYY-MM-DD, closed?, hours?, note?}`, `note` string |
| **Normalization** | **none** — the task forbids rewriting user input; values pass through byte-identical |
| **Matching criteria** | structural and type-level only; no semantic or business rule |
| **False-positive risk** | actively managed — see the three decisions below |
| **Existing-data impact** | none: no seeded `opening_hours` exists, so no stored row becomes invalid |
| **Conflict response** | 400 with a field-path message (`opening_hours.regular.mon[0].open`), asserted by a spec |
| **Admin override** | none added; there is no bypass, and none was requested |
| **Migration implications** | none — no stored data is validated retroactively |

Three deliberate looseness decisions, each recorded at the code site (AC7):
1. **Unknown top-level keys are tolerated**, matching openapi's `additionalProperties: true`.
   Rejecting them would be stricter than the SSOT.
2. **`open < close` is NOT enforced.** Overnight ranges (22:00–02:00) are legitimate for bars
   and night markets; enforcing ordering would silently destroy real data. A spec locks this in.
3. **Every field is optional**, because `places.md` §4 marks none as required. `{}` validates.
   Rejecting what the SSOT does not forbid would be a regression, not an improvement.

## 19. Cache, Search, and Event Impact
Not applicable to the approved PLACE-006 task. No cache key, TTL, invalidation, search
document, index mapping, event or job touched. `opening_hours` is not indexed or searched —
`places.md` §4 explicitly defers "currently open" querying.

## 20. Tests Added or Updated
18 specs added across two describe blocks; none removed, none weakened.

**Must-pass (false-positive guards):** the `places.md` §4 example **verbatim**; omitted
`opening_hours`; `{}`; a closed day as `[]`; `is_24h: true`; an overnight range; two ranges in
one day (lunch break); unknown top-level key.

**Must-reject:** `regular.mon` as a string; malformed `HH:MM` (`8h`); out-of-range time
(`25:00`); invalid weekday key (`monday`); `exceptions` as an object; malformed date
(`01/01/2026`); non-boolean `is_24h`.

**Message quality:** one spec asserts the error names the exact path
`opening_hours.regular.mon[0].open`.

**Update path:** two specs run the same shapes through `UpdatePlaceDto`, so a gap in either
write path would fail (AC4).

## 21. Validation Commands and Results
| # | command | cwd | exit | result |
|---|---|---|---|---|
| 1 | `npx jest places.dto` | `apps/api` | **0** | **30/30 pass** (12 pre-existing + 18 new) |
| 2 | `npx eslint "src/modules/places/**/*.ts" "src/common/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean |
| 3 | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean |
| 4 | **mutation check** — `@IsOpeningHours()` removed from both DTOs | `apps/api` | **1** | **9 failed, 21 passed** — every rejection spec failed, every must-pass spec still passed |
| 5 | restore + rerun (cmds 1 and 3) | `apps/api` | **0** | 30/30, tsc clean |
| 6 | `grep -rn opening_hours` across all migrations | repo | 0 | only the column definition + a comment; **no seeded payload** |

All three declared `validation_commands` executed. No failure occurred outside the deliberate
mutation check, so no failure classification was required.

## 22. Security Review
Net positive, modestly. `opening_hours` is client-controlled data written to a JSONB column and
later rendered by the web app; previously **any** object shape could be stored. Constraining it
narrows what an authenticated contributor can inject into that column — for instance deeply
nested or unexpected structures that a renderer might mishandle.

What this does **not** do, stated plainly: it is not an XSS control. String *contents*
(`note`, `timezone`) are still free text and must be escaped at render time as before; only the
*structure* is constrained. No authentication, authorization, ownership or guard behaviour was
touched, and the validator has no I/O, no dynamic evaluation and no regex vulnerable to
catastrophic backtracking (both patterns are anchored, fixed-length, without nested quantifiers).

## 23. Performance Review
Validation is O(days + exceptions) plain comparisons and two anchored regexes per time/date
string, on a payload bounded by a request body — negligible, and it runs only on create/update,
never on read paths. No query, index or payload size changed. Nothing measured, because there
is nothing here worth measuring.

## 24. Observability Review
Not applicable to the approved PLACE-006 task beyond existing behaviour: rejections surface
through the standard `ValidationPipe` → error-filter path like every other DTO violation, with
a field-path message. No new log, metric, trace or health check was added or required.

## 25. Rollback or Recovery Review
Remove `@IsOpeningHours()` (two sites) and its import, delete `common/opening-hours.ts`, and
remove the appended spec blocks. No schema, stored data, migration or contract is involved, so
rollback is complete and non-destructive. Because nothing was normalized, no stored value needs
repair after a revert.

## 26. Deviations From the Approved Task
1. **Mutation check performed** (not required) — the decisive evidence that the specs constrain
   behaviour rather than describe it. Restored immediately; both runs in §21.
2. Nothing else: no normalization, no openapi edit, no response-type tightening, no backfill,
   and no change to any file outside the three listed.

## 27. Remaining Findings
| id | finding | evidence | disposition |
|---|---|---|---|
| F-20 | The **response** type `PlaceDetail.opening_hours` in shared-types is still `Record<string, unknown>`, so the read side is untyped while the write side is now structured. Tightening it is a read-contract change. | `packages/shared-types/src/place.ts`; `common/opening-hours.ts` | backlog — needs its own contract task |
| F-21 | Validation applies to new writes only. If `opening_hours` data is ever imported outside the DTO path (seed, importer, direct SQL), nothing enforces the structure. No such path exists today. | §8 step 1; `SeedPlacesExpansion.ts:13` | backlog — revisit when an importer is built |

F-1 … F-19 from earlier reports remain open and unchanged.

## 28. Risks
| risk | severity | note |
|---|---|---|
| No DB-backed validation anywhere in the workstream | high | unchanged |
| `node_modules/@phuquochub/shared-types` is a FAT32 copy | high | unchanged (PLACE-005 made it load-bearing) |
| FAT32 removable volume, no VCS | high | unchanged |
| Structure validated on write only | low | F-21; no non-DTO write path exists today |

## 29. Acceptance-Criteria Evaluation
| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | `places.md` §4 example validates verbatim | yes | **PASS** | spec "chấp nhận payload mẫu của SSOT nguyên văn"; §21 cmd 1 |
| AC2 | Malformed payloads rejected (wrong `regular` value type, bad `HH:MM`, bad date, non-array `exceptions`) | yes | **PASS** | 7 rejection specs; mutation check §21 cmd 4 |
| AC3 | Field stays optional; empty array and `is_24h` remain valid; nothing SSOT-permitted rejected | yes | **PASS** | 8 must-pass specs |
| AC4 | Both Create and Update enforce it | yes | **PASS** | `UpdatePlaceDto` describe block; decorator applied at both sites |
| AC5 | No entity/migration/repository/service/controller/mapper/contract/openapi change; representation unchanged; no input rewritten | yes | **PASS** | change register §10–11; validator returns booleans only |
| AC6 | jest / eslint / tsc exit 0 | yes | **PASS** | §21 cmds 1–3 |
| AC7 | Unknown-key posture and non-validation of `open < close` recorded with reasoning | **no** | **PASS** | `opening-hours.ts` header decisions 1–3; §18 |

All six mandatory criteria **PASS**. The optional criterion also passes.

## 30. Recommended Delivery-State Transition
Applied: `current.task: PLACE-007`, `status: ready`. Gates unchanged.

## 31. Selected PLACE-007 Task
`docs/delivery/tasks/PLACE-007.yaml` — **"Retire or justify `PlacesRepository.getCardBySlug`
dead code (GAP-13)"**, type `analysis`. A repository-wide sweep during this task confirmed
`getCardBySlug` has exactly **one** occurrence — its own definition — while the sibling
`getCardById` has five call sites. It also lacks the `status` filter its sibling
`getDetailBySlug` carries, so reviving it carelessly would expose unpublished places. That
makes it worth resolving deliberately rather than leaving as a trap.

## 32. Explicit Non-Claims
This report does **not** claim any unverified: **production deployment, production migration
application, production backfill completion, complete external consumer migration, complete
cache propagation, complete search reindexing, complete event propagation, canary success,
hypercare completion, production stabilization, compatibility retirement readiness, or legacy
schema cleanup readiness.**

Specifically not claimed: no database or HTTP server was started, so validation is proven at the
DTO layer via `class-validator` only — **not** by observing a rejected API request. No stored
`opening_hours` data was inspected in a live database (none exists in seeds); no e2e execution;
no `nest build`; no telemetry; and no git branch, commit or diff.
