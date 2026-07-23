# PLACE-011 — Evidence Index (F-18 row typing, 2026-07-22)

Backs `docs/delivery/reports/PLACE-011-row-typing-report.md`. Concise references only.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `state.yaml` `current` | `task: PLACE-011`, `status: ready` at preflight | state-authorized | — |
| S-2 | task authority | `tasks/PLACE-011.yaml` | 7 ACs, 4 validation commands, 3 stop conditions | scope/criteria authority | — |

## Dependency
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `evidence/PLACE-010-readiness-evidence-index.md` VO-1..VO-4, AS-6 | 92/92 + 11/11, api+web tsc exit 0, no product code changed | PLACE-010 complete on executed evidence | — |

## Soundness basis
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| SB-1 | persistence | `1720000400000-InitPlaces.ts:47` | `"verification_status" "verification_status" NOT NULL DEFAULT 'pending'` | the column is a DB **ENUM** and **NOT NULL** → the value set is closed and non-null, so the union describes reality rather than asserting it | read from the migration; **no live table inspected** |
| SB-2 | contract | `packages/shared-types/src/place.ts` | `VerificationStatusValue` = the same 6 values | one source for the value set; a local copy would recreate GAP-11's duplication | — |
| SB-3 | persistence | `places.repository.ts` imports of `PlaceStatus`, `PriceRange` | typing row fields against enum value sets is already the file's pattern | only the *source* of the union is new, not the technique | — |

## Implementation
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| IMP-1 | persistence | `places.repository.ts` `PlaceCardRow` | `verification_status: string` → `VerificationStatusValue`, with a comment citing SB-1 | AC1 | `PlaceDetailRow` inherits it — no second edit needed |
| IMP-2 | contract | `places.mapper.ts` `toPlaceCard` | cast + 6 justifying comment lines removed; unused import dropped | AC2 — the comment did not outlive the cast | — |
| IMP-3 | implementation | change register | exactly 2 files; `packages/shared-types` **untouched** | AC3; and no rebuild / node_modules re-copy was required this time | — |

## Validation output — executed 2026-07-22
| id | category | command | cwd | exit | result | classification |
|---|---|---|---|---|---|---|
| VO-1 | test | `npx jest places` | `apps/api` | **0** | **92/92 pass, 7 suites** — identical count and suite set to before the change | AC4: no spec added, removed or edited |
| VO-2 | lint | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean | — |
| VO-3 | type-check | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean on the **first attempt** | had the row and the contract union disagreed elsewhere, this would have surfaced it |
| VO-4 | type-check | `npx tsc --noEmit` | `apps/web` | **0** | clean | shared package sits on both sides, so both were checked |
| VO-5 | contract | grep `as VerificationStatusValue` in `places.mapper.ts` | repo | 0 | **0 occurrences** | AC2 proven, not asserted |

VO-1's unchanged count is the load-bearing evidence for AC4: a behavioural change would have
required editing a spec, and none was.

## Stop conditions
| id | condition | fired? | evidence |
|---|---|---|---|
| SC-1 | tightening surfaces errors outside `places` | **no** | VO-3 clean; geo/search/revisions consume `toPlaceCard`, not the raw row field |
| SC-2 | mapper/repository specs need modification | **no** | VO-1 — 92/92 unmodified |
| SC-3 | change appears to need runtime validation | **no** | SB-1 — the DB enum + NOT NULL is the guarantee; a redundant check was deliberately not added |

## Not executed / not claimed
| id | category | item | result | limitations |
|---|---|---|---|---|
| NX-1 | persistence | inspection of stored `verification_status` values | NOT RUN | soundness rests on the migration's enum definition, not on observed data (Docker absent) |
| NX-2 | build | `nest build`, e2e | NOT RUN | not declared commands; Docker absent |
| NX-3 | state | `git diff` | UNAVAILABLE | F-3 — repository not under version control |

## Findings carried
| id | category | source | result | limitations |
|---|---|---|---|---|
| F-29 | persistence | `places.repository.ts` `PlaceCardRow` | `status` is typed from the internal `PlaceStatus` enum while `verification_status` now comes from the shared union — two sources for the same kind of concept | both correct, both compile; cosmetic consistency only, recorded not fixed (AC7) |
| **F-18** | — | this task | **RESOLVED** | — |
