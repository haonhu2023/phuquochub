# PLACE-006 — Evidence Index (GAP-14 opening_hours validation, 2026-07-22)

Backs `docs/delivery/reports/PLACE-006-opening-hours-report.md`. Concise references only.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `state.yaml` `current` | `task: PLACE-006`, `status: ready` at preflight | state-authorized before any edit | — |
| S-2 | task authority | `tasks/PLACE-006.yaml` | 7 ACs, 3 validation commands, 4 stop conditions | scope/criteria authority | — |

## Dependency
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `evidence/PLACE-005-shared-types-evidence-index.md` VO-1..VO-9 | api jest 33/33, api+web tsc exit 0, both lints exit 0 | PLACE-005 complete on executed evidence | — |

## Requirement (SSOT)
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| REQ-1 | data quality | `docs/data/modules/places.md` §4 | concrete JSONB structure: timezone, regular (7 weekdays → `{open,close}[]`), is_24h, exceptions, note | the invariant is documented, not invented | no field marked required → all treated optional |
| REQ-2 | contract | `openapi.yaml:1777` | `opening_hours: { type: [object,'null'], additionalProperties: true }` | unknown top-level keys must be tolerated; openapi not to be tightened here | — |
| REQ-3 | persistence | `place.entity.ts` `openingHours` / `InitPlaces.ts:40` | `jsonb` nullable | representation unchanged by this task | — |

## Analysis (existing-data safety — stop condition 1)
| id | category | source / command | result | proves | limitations |
|---|---|---|---|---|---|
| AN-1 | data quality | `grep -rn "opening_hours"` across all 20 migrations | only `InitPlaces.ts:40` (column) and `SeedPlacesExpansion.ts:13` (a comment saying hours were **deliberately left empty** for lack of a source) | **no seeded payload exists** → new strictness cannot invalidate existing data; stop condition 1 not triggered | migrations only; a live DB was not inspected (none available) |
| AN-2 | implementation | `places.dto.ts:52-53, :81-82` (before) | `@IsOptional() @IsObject()` on both write DTOs | the gap was real and on **both** write paths | — |
| AN-3 | implementation | `common/geo-bounds.ts` | pure predicate + `registerDecorator` wrapper, Vietnamese doc block | established validator convention followed rather than invented | — |

## Implementation
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| IMP-1 | data quality | `common/opening-hours.ts` (new) | `openingHoursErrors` (path-aware messages), `isValidOpeningHours`, `IsOpeningHours` | AC1–AC3 | structural/type checks only; no semantic rules |
| IMP-2 | implementation | `places.dto.ts` Create + Update | `@IsOptional() @IsObject() @IsOpeningHours()` | AC4 — neither write path left open | — |
| IMP-3 | data quality | `opening-hours.ts` header, decisions 1–3 | unknown keys tolerated; `open < close` not enforced; all fields optional | AC7 — false-positive risk actively managed | each decision locked by a spec |

## Tests
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| T-1 | test | spec "payload mẫu của SSOT nguyên văn" | PASS | AC1 — the rule is not stricter than the documentation | — |
| T-2 | test | 7 must-pass specs (omitted, `{}`, `sun: []`, `is_24h`, overnight, lunch break, unknown key) | PASS | AC3 — no SSOT-permitted payload rejected | — |
| T-3 | test | 7 rejection specs (string day value, `8h`, `25:00`, `monday`, object `exceptions`, `01/01/2026`, `is_24h:'yes'`) | PASS | AC2 | DTO layer only |
| T-4 | test | spec asserting the message contains `opening_hours.regular.mon[0].open` | PASS | errors are actionable, not generic | — |
| T-5 | test | `UpdatePlaceDto` describe block (2 specs) | PASS | AC4 executably | — |

## Validation output — executed 2026-07-22
| id | category | command | cwd | exit | result | classification |
|---|---|---|---|---|---|---|
| VO-1 | test | `npx jest places.dto` | `apps/api` | **0** | **30/30 pass** (12 pre-existing + 18 new) | — |
| VO-2 | lint | `npx eslint "src/modules/places/**/*.ts" "src/common/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean | — |
| VO-3 | type-check | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean | — |
| VO-4 | test | **mutation check** — `@IsOpeningHours()` removed from both DTOs | `apps/api` | **1** | **9 failed, 21 passed** | deliberate; every rejection spec failed and every must-pass spec still passed — proving the specs test the validator, not the base `@IsObject()` |
| VO-5 | test/type-check | restore + rerun VO-1, VO-3 | `apps/api` | **0** | 30/30, tsc clean | — |

VO-4 is the load-bearing evidence: it separates "the specs pass" from "the specs would pass
anyway", and its 21 survivors confirm the must-pass guards are not vacuous.

## Not executed / not claimed
| id | category | item | result | limitations |
|---|---|---|---|---|
| NX-1 | integration | a real POST/PATCH `/api/places` with a malformed payload | NOT RUN | rejection proven via `class-validator` in-process, not over HTTP |
| NX-2 | data quality | inspection of stored `opening_hours` rows | NOT RUN | no database (Docker not installed); AN-1 shows no seeded payload exists |
| NX-3 | build | `nest build` | NOT RUN | not a declared validation command |
| NX-4 | consumer | web rendering of hours | NOT RUN | `not_verified` |
| NX-5 | state | `git diff` | UNAVAILABLE | repository not under version control |

## Findings carried
| id | category | source | result | limitations |
|---|---|---|---|---|
| F-20 | contract | `packages/shared-types/src/place.ts` | response type `opening_hours` still `Record<string, unknown>` while writes are now structured | tightening it is a read-contract change, out of scope |
| F-21 | data quality | AN-1 | structure enforced on the DTO write path only | no non-DTO write path exists today; revisit when an importer is built |
| F-22 | analysis | `grep -rn getCardBySlug` → 1 occurrence (its own definition) vs `getCardById` → 5 call sites | GAP-13 dead code confirmed; it also lacks the `status` filter its sibling `getDetailBySlug` has | basis for PLACE-007 |
