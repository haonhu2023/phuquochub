# PLACE-012 — Evidence Index (F-19 / F-20 boundary typing, 2026-07-22)

Backs `docs/delivery/reports/PLACE-012-boundary-typing-report.md`. Concise references only.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `state.yaml` `current` | `task: PLACE-012`, `status: ready` at preflight | state-authorized | — |
| S-2 | task authority | `tasks/PLACE-012.yaml` | 8 ACs, 5 validation commands, 3 stop conditions | scope/criteria authority | — |

## Dependency
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `evidence/PLACE-011-row-typing-evidence-index.md` VO-1..VO-5 | 92/92 unmodified, api+web tsc exit 0, cast grep → 0 | PLACE-011 complete on executed evidence | — |

## Analysis
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| AN-1 | contract | `docs/data/modules/places.md` §4 | timezone / regular (7 weekday codes → ranges) / is_24h / exceptions / note | the structure to declare; **no field marked required** | — |
| AN-2 | contract | `apps/api/src/common/opening-hours.ts` decisions 1–3 | unknown keys tolerated; `open < close` not enforced; all fields optional | the type must not be stricter than the validator, or it would describe data the API itself accepts | — |
| AN-3 | contract | `openapi.yaml:1777` | `additionalProperties: true` | an index signature is required, not a convenience | openapi deliberately unmodified |
| AN-4 | consumer | `apps/web/src/app/(public)/places/[slug]/page.tsx:204-209` | `openingHoursEntries` runs `Object.entries(oh)` over arbitrary keys | a closed type would break it → widen the type, do not edit the consumer (stop condition 1) | — |
| AN-5 | contract | `places-detail.mapper.spec.ts:25-26,29-40` | spec sets `created_at`/`updated_at` but asserts neither | changing their representation cannot break the spec — checked **before** editing | — |

## Implementation
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| IMP-1 | contract | `packages/shared-types/src/place.ts` | `OpeningHoursRange`, `OpeningHoursException`, `OpeningHours` (all fields optional + index signature) | AC1 | type-only; enforcement stays in the validator |
| IMP-2 | contract | same, `PlaceDetail` | `opening_hours: OpeningHours \| null` | AC2 | — |
| IMP-3 | contract | `places.mapper.ts` `toPlaceDetail` | `row.created_at.toISOString()` / `row.updated_at.toISOString()` + comment | AC3 | — |
| IMP-4 | data quality | `common/opening-hours.ts` | **unmodified** — validator deliberately does not import the shared type | AC8; runtime checks untouched (stop condition 3 respected) | duplication acknowledged as F-30 |

## JSON-invariance argument (AC4)
| id | category | basis | result | limitations |
|---|---|---|---|---|
| JI-1 | contract | `JSON.stringify` invokes `Date.prototype.toJSON`, which delegates to `toISOString()` | both paths emit the same ISO-8601 string (e.g. `"2026-01-01T00:00:00.000Z"`) — the conversion moved from serializer to mapper, the bytes did not change | **argued from documented behaviour, not from an observed HTTP response** — no server was started |
| JI-2 | test | `npx jest places` after the change | 92/92 unmodified, incl. both mapper specs | corroborates JI-1 at the mapper's output | mapper output, not wire output |

## Validation output — executed 2026-07-22
| id | category | command | cwd | exit | result | classification |
|---|---|---|---|---|---|---|
| VO-1 | build | `npm run build` | `packages/shared-types` | **0** | `dist/place.*` re-emitted | — |
| VO-2 | build | re-copy `dist` + `package.json` → `node_modules/@phuquochub/shared-types` | repo root | 0 | `OpeningHours` appears **7×** in the copied `place.d.ts` | mandatory on FAT32 — a copy, not a symlink |
| VO-3 | type-check | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean, first attempt | — |
| VO-4 | type-check | `npx tsc --noEmit` | `apps/web` | **0** | clean | the read-contract tightening broke **no** web consumer (AN-4 held) |
| VO-5 | test | `npx jest places` | `apps/api` | **0** | **92/92 pass, 7 suites** | mapper **and** PLACE-006 DTO specs unmodified → AC4, AC5 |
| VO-6 | lint | `npx eslint "src/modules/places/**/*.ts" "src/common/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean | — |

VO-4 is the decisive one for a read-contract change: tightening a shared type is only safe if
the far side still compiles, and it does.

## Not executed / not claimed
| id | category | item | result | limitations |
|---|---|---|---|---|
| NX-1 | API | an observed HTTP response proving byte-identical JSON | NOT RUN | JI-1 argues it from documented serializer behaviour; no server started |
| NX-2 | build | `next build` | NOT RUN | web verified by `tsc --noEmit` only |
| NX-3 | integration | e2e / database | NOT RUN | Docker absent |
| NX-4 | state | `git diff` | UNAVAILABLE | F-3 |

## Findings carried
| id | category | source | result | limitations |
|---|---|---|---|---|
| F-30 | contract | §9 of the report | the `opening_hours` structure is now expressed twice — a shared TYPE and runtime PREDICATES — kept aligned by convention and by PLACE-006's specs rather than by construction | a schema-first single source would remove it; that is a design change, not a fix |
| **F-19**, **F-20** | — | this task | **RESOLVED** | — |
