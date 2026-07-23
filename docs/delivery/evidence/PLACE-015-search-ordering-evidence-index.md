# PLACE-015 — Evidence Index (F-32 search pagination determinism, 2026-07-23)

Backs `docs/delivery/reports/PLACE-015-search-ordering-report.md`. Concise references only.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `state.yaml` `current` | `task: PLACE-015`, `status: ready` | execution authorized before any edit | — |
| S-2 | task authority | `tasks/PLACE-015.yaml` | 8 ACs, 4 validation commands, 4 stop conditions, mutation check REQUIRED | scope/criteria authority | — |

## Dependency
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `tasks/PLACE-014.yaml` | `status: completed`, AC1–AC6 PASS | declared dependency satisfied | — |
| DEP-2 | dependency | re-run 2026-07-23: `npx jest places.repository` | **13/13, exit 0** | PLACE-014's evidence is reproducible, not label-only | pre-existing state, verified before this task edited anything |

## Baseline (captured before editing)
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| B-1 | analysis | `places.repository.ts:362` (pre-edit) | `searchFullText`: `ORDER BY score DESC`, **LIMIT + OFFSET** | non-unique final key + OFFSET ⇒ failure mode (a) | static read |
| B-2 | analysis | `places.repository.ts:340` | `searchCount`: `count(*)`, **no ORDER BY** | unaffected; needs no change | — |
| B-3 | consumer | `search.service.ts:16` | `searchFullText(dto.q, limit, (page-1)*limit)` | OFFSET pagination is real, public and user-facing | — |
| B-4 | consumer | `search.service.ts:31` | `searchFullText(dto.q, 8, 0)` | `suggest()` uses offset 0 ⇒ never exposed to the defect | — |
| B-5 | contract | `openapi.yaml:1359-1380` | `/search` declares q/type/lat/lng/page/cursor + `SearchResult`; **no ordering or stability guarantee** | AC8 — quality fix, **not** a contract fix | — |

## Implementation
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| IMP-1 | implementation | `places.repository.ts:372` | `ORDER BY score DESC, p.id ASC` + F-32 doc comment | AC1; `p.id` is PK ⇒ unique, NOT NULL ⇒ total order | — |
| IMP-2 | scope | `places.repository.ts` lines 169, 250, 287, 306, 334 | all other ORDER BY clauses (and the two with none) **byte-unchanged** | AC6 — no other repository method touched | verified by grep |
| IMP-3 | scope | `apps/api/src/modules/search/` | `search.service.ts`, `search.service.spec.ts`, DTO, controller all unmodified (mtimes 2026-07-13/17) | AC6, AC7 | — |
| IMP-4 | test | `places.repository.spec.ts` | 3 specs: ORDER BY shape parsed from real SQL; two-page disjoint+complete under rotation; `searchCount` has no ORDER BY | AC2, AC3, AC5 | simulation of planner freedom, **not** PostgreSQL |

## Validation output — executed 2026-07-23
| id | category | command | cwd | exit | result | classification |
|---|---|---|---|---|---|---|
| VO-1 | test | `npx jest places.repository` | `apps/api` | **0** | 16/16 (13 prior + 3 new) | focused |
| VO-2 | test | **mutation**: `, p.id ASC` removed | `apps/api` | **1** | **2 failed, 14 passed** — exactly the two new determinism specs, no collateral | deliberate; restored immediately |
| VO-3 | test | `npx jest places` (post-restore) | `apps/api` | **0** | **97/97, 7 suites** (94 + 3) | full regression |
| VO-4 | test | `npx jest search` | `apps/api` | **0** | **3/3, 1 suite** — specs UNMODIFIED | AC7 |
| VO-5 | lint | `npx eslint places + search --max-warnings=0` | `apps/api` | **0** | clean | declared command |
| VO-6 | type-check | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean | declared command |

VO-2 is the required mutation check. Its failure message is the substantive evidence:

```
Expected: 6
Received: 4
> 290 |     expect(new Set([...first, ...second]).size).toBe(6);
```

Four distinct Places across two pages instead of six — duplication **and** omission, i.e. the F-32
defect reproduced on demand. VO-3 confirms no mutation was left in the tree.

## Not executed / not claimed
| id | category | item | result | limitations |
|---|---|---|---|---|
| NX-1 | integration | observing PostgreSQL reorder score-tied rows across two OFFSET queries | NOT RUN | Docker absent; the mechanism rests on documented SQL semantics + simulation |
| NX-2 | data quality | proof that real Vietnamese corpus data produces `ts_rank` ties | NOT RUN | argued from how ts_rank works, **not** demonstrated |
| NX-3 | performance | index for the new sort key | NOT CREATED | F-15 territory; unjustifiable without EXPLAIN, which needs Docker |
| NX-4 | type-check | `apps/web tsc` | NOT RUN | no shared contract changed — an SQL ORDER BY is invisible to `shared-types` |
| NX-5 | build | `nest build`, e2e | NOT RUN | Docker absent; not declared commands |
| NX-6 | state | `git diff` | UNAVAILABLE | F-3 — repository is not under version control |

## Findings
| id | category | source | result | disposition |
|---|---|---|---|---|
| **F-32** | implementation | this task | `searchFullText` OFFSET pagination over non-unique `score` — **RESOLVED**: unique final key `p.id ASC` appended, mutation-checked, 97/97 | closed |
| F-15 | performance | IMP-1 | new sort key has no supporting index | unchanged — needs EXPLAIN, needs Docker |
| F-33 | dead code | — | `PlacesRepository.bbox()` has no consumer | unchanged — backlog removal task |
| F-34 | product | — | `bboxClusters` truncation at 500 is arbitrary | unchanged — needs a product decision |

No release blocker was resolved, downgraded, or re-classified by this task.
