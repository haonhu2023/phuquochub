# PLACE-005 — Evidence Index (GAP-11 shared Place types, 2026-07-22)

Backs `docs/delivery/reports/PLACE-005-shared-types-report.md`. Concise references only.

> Distinct from `PLACE-005-evidence-index.md`, which records the earlier **BLOCKED** preflight
> attempt made when no PLACE-005 task file existed. Retained as history.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `state.yaml` `current` | `task: PLACE-005`, `status: ready` at preflight | state-authorized before any edit | — |
| S-2 | task authority | `tasks/PLACE-005.yaml` | 7 ACs, 6 validation commands, 4 stop conditions, rollback | scope/criteria authority | — |

## Dependency
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `evidence/PLACE-004-ordering-evidence-index.md` VO-1..VO-4 | jest 11/11, eslint + tsc exit 0, mutation check | PLACE-004 complete on executed evidence | — |

## Analysis
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| AN-1 | contract | `places.mapper.ts:6-21` (before) | local `PlaceCard` interface | duplication site 1 | — |
| AN-2 | contract | `apps/web/src/modules/places/types.ts` (before) | 7 local interfaces | duplication site 2 | — |
| AN-3 | contract | `packages/shared-types/src/index.ts` (before) | only `api-response`, `health` | the shared package had no Place types, matching `place.yaml` | — |
| AN-4 | consumer | importer sweep: 8 web files import `@/modules/places/types`; API `geo.service.ts:4` imports `toPlaceCard` only | all web imports are `import type` | re-export is transparent; no runtime import created | text search, confirmed by compile |
| AN-5 | contract | `openapi.yaml:1754-1785` | `PlaceCard` has no `status`/`score`; `Place` has `status` | SSOT and implementation diverge → **F-17** | openapi not modified (out of scope) |
| AN-6 | build | `apps/web/tsconfig.json`, `apps/web/package.json:15` | `typecheck` script exists; `@phuquochub/shared-types: "*"` declared | the web half is verifiable here → stop condition 2 not triggered | — |
| AN-7 | implementation | throwaway TS probe (scratchpad), `--strict` | **exit 0** — string-enum members assign to their literal union | AC7 decision made on evidence: unions work without forcing API casts on `status`/`price_range` | probe file only, no repo file |

## Implementation
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| IMP-1 | contract | `packages/shared-types/src/place.ts` (new) | GeoPoint, 4 value unions, PlaceCard, 4 satellites, PlaceDetail | AC1 | type-only; no runtime validation |
| IMP-2 | contract | `packages/shared-types/src/index.ts` | `export * from './place'` | AC1 barrel | — |
| IMP-3 | contract | `places.mapper.ts:1,7` | `import type { PlaceCard }` + `export type { PlaceCard }` | AC2; import paths preserved for existing consumers | — |
| IMP-4 | contract | `apps/web/src/modules/places/types.ts` | pure re-export block, zero declarations | AC3 | — |
| IMP-5 | implementation | `places.mapper.ts` `verification_status` | narrowed with a documented cast at the mapper boundary | resolves the TS2322 in VO-4 without touching the repository | **unchecked** cast — sound only while the DB enum holds (**F-18**) |

## Validation output — executed 2026-07-22
| id | category | command | cwd | exit | result | classification |
|---|---|---|---|---|---|---|
| VO-0 | type-check | `npx tsc --noEmit` **before any edit** | `apps/web` | **0** | web already clean | baseline — proves later exit 0 is not a pre-existing pass being reused |
| VO-1 | type-check | `npx tsc -p tsconfig.json --noEmit` | `packages/shared-types` | **0** | new module type-checks | — |
| VO-2 | build | `npm run build` | `packages/shared-types` | **0** | `dist/place.{js,d.ts,js.map}` emitted | — |
| VO-3 | build | re-copy `dist` + `package.json` → `node_modules/@phuquochub/shared-types` | repo root | 0 | copied `index.d.ts` exports `./place`; `place.d.ts` present (3227 B) | FAT32 copy, not a symlink — **must** repeat after every package edit |
| VO-4 | type-check | `npx tsc -p tsconfig.json --noEmit` (1st) | `apps/api` | **2** | `places.mapper.ts(21,5) TS2322` | **introduced_by_PLACE-005**; fixed by IMP-5 |
| VO-5 | type-check | `npx tsc -p tsconfig.json --noEmit` (2nd) | `apps/api` | **0** | clean | — |
| VO-6 | type-check | `npx tsc --noEmit` | `apps/web` | **0** | web consumes the shared declarations and compiles | `tsc` only — **not** `next build` |
| VO-7 | test | `npx jest places` | `apps/api` | **0** | **33/33 pass, 5 suites** | mapper specs **unmodified** → AC4 payload-unchanged evidence |
| VO-8 | lint | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean | — |
| VO-9 | lint | `npx eslint src --max-warnings=0` | `packages/shared-types` | **0** | clean | — |

VO-7 is the load-bearing evidence for AC4: the pre-existing mapper specs assert output shape
and were not touched, so their passing shows the payload did not change.

## Not executed / not claimed
| id | category | item | result | limitations |
|---|---|---|---|---|
| NX-1 | build | `next build` (apps/web) | NOT RUN | web verified by `tsc --noEmit` only; no bundle or render evidence |
| NX-2 | build | `nest build` (apps/api) | NOT RUN | not a declared validation command |
| NX-3 | integration | any HTTP request against a running API | NOT RUN | "payload unchanged" rests on specs + types, not an observed response |
| NX-4 | consumer | browser rendering of any web page | NOT RUN | consumers `compiled`, never `runtime_verified` |
| NX-5 | state | `git diff` | UNAVAILABLE | repository not under version control |

## Findings carried
| id | category | source | result | limitations |
|---|---|---|---|---|
| F-17 | contract | `openapi.yaml:1754-1768` vs `place.ts` | openapi `PlaceCard` omits `status`/`score` that both implementations use | needs owner adjudication; same family as parked GAP-05/10 |
| F-18 | persistence | `places.repository.ts:18` | `verification_status: string` for a DB enum column, forcing the IMP-5 cast | repository change, out of PLACE-005 scope |
| F-19 | contract | `places.mapper.ts:50-61` vs `place.ts` `PlaceDetail` | `toPlaceDetail()` returns `Date` where the wire type says `string` | correct today via HTTP serialization; documented at both sites |
