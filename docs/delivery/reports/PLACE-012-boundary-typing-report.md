# PLACE-012 — Execution Report (F-19 / F-20 boundary typing)

> Workstream: place · Task: PLACE-012 · Type: API contract alignment · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-012.yaml`
> Result: **COMPLETED.** AC1–AC7 (mandatory) PASS, AC8 (optional) PASS.

## 1. Executive Summary
The shared read contract now describes what the API actually returns. `opening_hours` is typed
by a structured `OpeningHours` type derived from `places.md` §4 instead of
`Record<string, unknown>` (F-20), and `toPlaceDetail` emits ISO strings for the timestamps its
own wire type declares as `string` (F-19).

**No byte of emitted JSON changed** — `JSON.stringify` already turned those `Date`s into exactly
the ISO-8601 strings now produced explicitly. All 92 specs pass **unmodified**, and both
`apps/api` and `apps/web` type-check clean after the tightening.

## 2. Task Identity and Authority
| item | value |
|---|---|
| Task | PLACE-012 — "Resolve the remaining boundary-typing findings F-19 and F-20" |
| Type | `API contract alignment` |
| Authorized by | `state.yaml` — `current.task: PLACE-012`, was `ready` |
| depends_on | PLACE-011 (completed 2026-07-22, cast removed, 92/92 unmodified) |

## 3. Dependency Verification
PLACE-011 completed on executed evidence: `jest places` 92/92 unmodified, api + web `tsc` exit 0,
eslint exit 0, and the cast provably removed (grep → 0 occurrences)
(`evidence/PLACE-011-row-typing-evidence-index.md` VO-1..VO-5).

## 4. Starting Repository State
Not a git repository — branch/commit/diff unknown, not fabricated. Node v24.18.0 portable.

## 5. Problem and Objective
Two inaccuracies remained at the read boundary. F-19: the mapper's return type was **not
assignable** to the type describing its own response, so nobody could annotate it. F-20: the
write path had been structurally validated since PLACE-006 while the read type still said "some
object" — the contract knew less than the validator.

Objective: make the shared contract describe the real payload without changing the payload.

## 6. F-20 — `OpeningHours` (AC1, AC2)
Derived from `places.md` §4 **and** from the already-validated shape in
`common/opening-hours.ts`, so the declared type and the enforced rules cannot disagree:

| SSOT field | type | optional | note |
|---|---|---|---|
| `timezone` | `string` | yes | IANA name; not validated beyond being a string (PLACE-006 decision) |
| `regular` | `Partial<Record<'mon'…'sun', OpeningHoursRange[]>>` | yes | empty array = closed that day |
| `is_24h` | `boolean` | yes | |
| `exceptions` | `OpeningHoursException[]` | yes | `{ date, closed?, hours?, note? }` |
| `note` | `string` | yes | |
| *(any other key)* | `unknown` | — | index signature |

Two properties were preserved deliberately, because tightening them would have made the read
type **stricter than the write validator** — which would describe data the API itself accepts as
invalid:
1. **Every field is optional.** PLACE-006 established that `places.md` §4 marks none required
   and that `{}` validates.
2. **Unknown top-level keys remain legal**, via an index signature — matching
   `openapi.yaml:1777` (`additionalProperties: true`) and decision 1 of `opening-hours.ts`.

`OpeningHoursRange` carries `open`/`close` as plain strings with no ordering constraint,
mirroring PLACE-006's deliberate refusal to enforce `open < close` (overnight ranges are real).

## 7. F-19 — timestamps (AC3)
`toPlaceDetail` now returns `row.created_at.toISOString()` / `row.updated_at.toISOString()`.

**Why the emitted JSON is unchanged, stated rather than assumed:** `JSON.stringify` serializes a
`Date` by calling its `toJSON`, which delegates to `toISOString()`. The two paths therefore
produce the *same* string — e.g. `new Date('2026-01-01T00:00:00Z')` yields
`"2026-01-01T00:00:00.000Z"` either way. The change moves the conversion from the serializer to
the mapper; the bytes on the wire are identical.

The payoff is that the mapper's return type is now assignable to the wire type it claims to
produce, so the trap F-19 described is gone.

## 8. Files Modified
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `packages/shared-types/src/place.ts` | task_required | `OpeningHoursRange`, `OpeningHoursException`, `OpeningHours`; `PlaceDetail.opening_hours` retyped (AC1, AC2) | pkg build, both typechecks | restore `Record<string, unknown>`, drop the three types |
| `apps/api/src/modules/places/places.mapper.ts` | task_required | ISO-string timestamps + explanatory comment (AC3) | jest 92/92, tsc | restore `row.created_at` / `row.updated_at` |
| `packages/shared-types/dist/**`, `node_modules/@phuquochub/shared-types/**` | generated | rebuild + FAT32 re-materialization | api tsc exit 0 | rebuild and re-copy |

`common/opening-hours.ts` was **not** modified — see §9. No entity, migration, repository,
service, controller, DTO rule or `openapi.yaml` change (AC6).

## 9. Validator-Reuse Decision (AC8)
The task permitted `common/opening-hours.ts` to import the shared type. **Decision: it does
not, deliberately.**

The validator's job is to *reject* malformed input at runtime; the shared type's job is to
*describe* the payload at compile time. Importing the type would not strengthen a single runtime
check — the checks are hand-written predicates over `unknown`, and a TypeScript type contributes
nothing at runtime. It would, however, couple a validation module to a wire-contract package and
invite a future reader to assume the type is enforcing something.

The two are kept in agreement the way that actually works: the type was **derived from** the
validator's established rules (§6), and PLACE-006's specs still pass unmodified, so a divergence
would show up as a failing test rather than as a silently wrong type.

## 10. Consumer Compatibility
| Consumer | Path | R/W | Contract or behavior | Required change | Validation | Status |
|---|---|---|---|---|---|---|
| web detail page | `apps/web/src/app/(public)/places/[slug]/page.tsx:204` | read | `openingHoursEntries` iterates `Object.entries(oh)` generically | **none** — the index signature keeps it compiling | web tsc exit 0 | compatible_without_change (compiled) |
| web hotels / restaurants / tours | `modules/{hotels,restaurants,tours}/api/*.api.ts` | read | consume `PlaceDetail` | none | web tsc exit 0 | compatible_without_change (compiled) |
| places mapper + specs | `apps/api/src/modules/places` | read | timestamps now ISO strings | none | jest 92/92 | **updated (tested)** |
| places DTO validation | `apps/api/src/common/opening-hours.ts` | write | **unchanged** | none | jest 92/92 incl. all PLACE-006 specs | compatible_without_change (tested) |

The index signature was the load-bearing choice: the web helper reads arbitrary keys by design,
so a closed type would have broken it — the first stop condition, avoided by widening the type
rather than editing the consumer.

## 11. Tests
**None added, none modified.** That is the AC4/AC5 evidence: the mapper specs assert output
shape and the DTO specs assert PLACE-006's validation rules, and both pass untouched. Editing
either would have destroyed the proof that this was a typing change.

## 12. Validation Commands and Results
| # | command | cwd | exit | result |
|---|---|---|---|---|
| 1 | `npm run build` | `packages/shared-types` | **0** | `dist/place.*` re-emitted |
| 2 | re-copy `dist` + `package.json` → `node_modules/@phuquochub/shared-types` | repo root | 0 | `OpeningHours` present **7×** in the copied `place.d.ts` |
| 3 | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean, first attempt |
| 4 | `npx tsc --noEmit` | `apps/web` | **0** | clean — the tightening broke no consumer |
| 5 | `npx jest places` | `apps/api` | **0** | **92/92 pass, 7 suites** — unmodified |
| 6 | `npx eslint "src/modules/places/**/*.ts" "src/common/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean |

All five declared `validation_commands` executed, plus the re-materialization check. No
failures, so no failure classification was required. Command 2 is not optional bookkeeping: on
FAT32 the package is a copy, so skipping it would have left both apps type-checking against a
stale `dist` (PLACE-005's standing hazard).

## 13. Domain / Persistence / Geospatial / Cache-Search-Event Impact
None. No semantics, schema, migration, stored data, coordinate handling, cache key, search
document or event touched. `opening_hours` remains an untouched JSONB column.

## 14. Data-Quality Impact
Compile-time only, and positive: a web consumer that mistypes `place.opening_hours.regular.mon`
or assumes `exceptions` is an object now fails to compile. No runtime rule changed — the write
path enforces exactly what PLACE-006 established.

## 15. Security Review
No surface change. No auth, guard, validation rule, query or serialization behaviour was
touched; all new declarations are types, erased at compile time. The index signature keeps the
read type permissive, which is honest rather than lax: the API genuinely accepts unknown keys,
and a type that pretended otherwise would mislead consumers.

## 16. Performance / Observability Review
No runtime cost beyond two `toISOString()` calls per detail response, replacing work the
serializer performed anyway. Nothing measured. No observability surface changed.

## 17. Rollback or Recovery Review
Revert both source files, then **rebuild and re-copy** `shared-types` into `node_modules` — the
second step is mandatory, or the apps type-check against a stale `dist`. No schema, data or
emitted payload is involved.

## 18. Deviations From the Approved Task
None. No JSON change, no `openapi.yaml` edit, no relaxation of PLACE-006's rules, no consumer
edited, no spec touched.

## 19. Remaining Findings
| id | finding | evidence | disposition |
|---|---|---|---|
| F-30 | `OpeningHours` and `common/opening-hours.ts` now describe the same structure in two places — a type and a set of runtime predicates — kept in agreement by convention and by PLACE-006's specs, not by construction. A schema-first approach (one source generating both) would remove the duplication; that is a design change, not a fix. | §9 | backlog — deliberate for now, reasoning recorded |

**F-19 and F-20 are RESOLVED by this task.** F-1 … F-18, F-21 … F-29 remain as classified by the
PLACE-010 assessment (F-18 resolved by PLACE-011).

## 20. Acceptance-Criteria Evaluation
| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | `OpeningHours` matches §4, all fields optional, unknown keys permitted | yes | **PASS** | §6 |
| AC2 | `PlaceDetail.opening_hours` typed with it | yes | **PASS** | §8 |
| AC3 | Timestamps match the wire type; JSON-unchanged argument stated | yes | **PASS** | §7 |
| AC4 | JSON byte-identical; mapper specs pass unmodified | yes | **PASS** | §7, §11, §12 cmd 5 |
| AC5 | PLACE-006 runtime validation unchanged; DTO specs unmodified | yes | **PASS** | §9, §12 cmd 5 |
| AC6 | No openapi/entity/migration/repository/service/controller/DTO-rule change | yes | **PASS** | §8 change register |
| AC7 | shared-types rebuilt **and** re-materialized; all four checks exit 0 | yes | **PASS** | §12 cmds 1–6 |
| AC8 | Validator-reuse decision recorded with reasoning | **no** | **PASS** | §9 |

All seven mandatory criteria **PASS**. The optional criterion also passes.

## 21. Delivery-State Transition
Applied: `current.task: PLACE-013`, `status: ready`. No gate changes — boundary typing moves no
gate.

## 22. Selected PLACE-013 Task
`docs/delivery/tasks/PLACE-013.yaml` — **"Place build-hygiene remediation (F-12, F-23)"**. With
the typing cluster now exhausted, these are the only remaining NON_BLOCKING findings actionable
without Docker, version control or an owner decision. F-12 is a genuine defect: a spec file
inside `migrations/` is matched by the TypeORM glob and would be loaded as a migration.

## 23. Explicit Non-Claims
This report does **not** claim any unverified: **production deployment, production migration
application, production backfill completion, complete external consumer migration, complete
cache propagation, complete search reindexing, complete event propagation, canary success,
hypercare completion, production stabilization, compatibility retirement readiness, or legacy
schema cleanup readiness.**

Specifically not claimed: the "JSON unchanged" conclusion rests on the documented behaviour of
`JSON.stringify`/`Date.prototype.toJSON` plus unmodified mapper specs — **no HTTP response was
observed**, because no server was started. `next build` was not run; only `tsc --noEmit`. No
database, e2e, telemetry, or git branch/commit/diff.
