# PLACE-014 — Evidence Index (F-16 geo ordering analysis, 2026-07-22)

Backs `docs/delivery/reports/PLACE-014-geo-ordering-analysis.md`. Concise references only.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `state.yaml` `current` | `task: PLACE-014`, `status: ready` | execution authorized before any edit | — |
| S-2 | task authority | `tasks/PLACE-014.yaml` | 7 ACs, 3 validation commands, 3 stop conditions; remediation allowed only if "trivially safe AND clearly warranted" | scope/criteria authority | — |

## Dependency
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `tasks/PLACE-013.yaml` | `status: completed`, AC1–AC6 PASS | declared dependency satisfied | — |
| DEP-2 | dependency | `evidence/PLACE-013-build-hygiene-evidence-index.md` VO-1..VO-6 | migrations 11/11 pre+post, places 92/92, eslint + tsc exit 0 | completion is evidence-backed, not label-only | — |

## Baseline (AC1) — captured before editing
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| B-1 | analysis | `places.repository.ts:268` | `nearby`: `ORDER BY distance_m ASC`, LIMIT, **no OFFSET**, limit from `clampLimit` | failure mode (b) only | static read |
| B-2 | analysis | `places.repository.ts:287` | `bbox`: **no ORDER BY**, LIMIT, no OFFSET | mode (b) — if it had a caller | — |
| B-3 | analysis | `places.repository.ts:315` | `bboxClusters`: `GROUP BY`, **no ORDER BY**, fixed `LIMIT 500` | mode (b), truncation is arbitrary | — |
| B-4 | analysis | `places.repository.ts:343` | `searchFullText`: `ORDER BY score DESC`, **LIMIT + OFFSET** | **mode (a)** — the GAP-12 defect, out of scope → F-32 | — |
| B-5 | consumer | `geo.service.ts:25,40` + `geo.controller.ts:14,20` | `GeoService.nearby` → `repo.nearby`; `GeoService.bbox` → **`repo.bboxClusters`** | `repo.bbox()` has **no consumer** → F-33 | text + read; no runtime observation |
| B-6 | consumer | `search.service.ts:16,31` | `searchFullText(dto.q, limit, (page-1)*limit)` | OFFSET pagination is real and user-facing | — |
| B-7 | contract | `openapi.yaml:559-592` | neither `/geo/nearby` nor `/geo/bbox` declares ordering, stability, or a `limit` param | AC3 — a quality issue, **not** a contract violation; and the fix changes no declared behaviour | — |

## Decision (AC4)
| id | category | method | classification | basis |
|---|---|---|---|---|
| D-1 | analysis | `nearby()` | **FIX_WARRANTED** | B-1 + co-located Places produce exact `ST_Distance` ties; tie at the LIMIT boundary decides what a user sees |
| D-2 | analysis | `bbox()` | **NO_ACTION** (ordering) | B-5 — no consumer; ordering a dead method has no observable effect. Deadness recorded as F-33, removal out of scope |
| D-3 | analysis | `bboxClusters()` | **NEEDS_PRODUCT_DECISION** | B-3 — an ORDER BY would decide *which* clusters survive truncation; stop condition 1 applies |
| D-4 | analysis | `searchFullText()` | **out of scope → F-32** | task `in_scope` excludes the search module |

## Implementation
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| IMP-1 | implementation | `places.repository.ts` `nearby` | `ORDER BY distance_m ASC, p.id ASC` + doc comment | AC5; PLACE-004's proven-safe pattern | `bbox`, `bboxClusters`, `searchFullText` byte-unchanged |
| IMP-2 | test | `places.repository.spec.ts` | 2 specs: ORDER BY shape (parsed from real SQL), and identical slice under rotated input with 4 co-located rows at LIMIT 2 | tests mode (b) specifically, not GAP-12's mode (a) | simulation of planner freedom, **not** PostgreSQL |

## Validation output — executed 2026-07-22
| id | category | command | cwd | exit | result | classification |
|---|---|---|---|---|---|---|
| VO-1 | test | `npx jest places.repository` | `apps/api` | **0** | 13/13 | focused |
| VO-2 | test | **mutation**: `, p.id ASC` removed | `apps/api` | **1** | **2 failed, 11 passed** — exactly the two new specs, no collateral | deliberate; restored immediately |
| VO-3 | test | `npx jest places` (post-restore) | `apps/api` | **0** | **94/94, 7 suites** | full regression; 92 prior + 2 new |
| VO-4 | test | `npx jest migrations` | `apps/api` | **0** | 11/11, 3 suites | untouched surface confirmed |
| VO-5 | lint | `npx eslint places + geo --max-warnings=0` | `apps/api` | **0** | clean | geo included since it is the caller |
| VO-6 | type-check | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean | — |

VO-2 is the required mutation check: it proves the two new specs constrain the tie-breaker rather
than describing it, and VO-3 confirms no mutation was left in the tree.

## Not executed / not claimed
| id | category | item | result | limitations |
|---|---|---|---|---|
| NX-1 | integration | observing PostgreSQL reorder tied rows | NOT RUN | Docker absent; mode (b) rests on documented SQL semantics + simulation |
| NX-2 | data quality | proof that co-located Places exist in real data | NOT RUN | the tie scenario is argued as plausible from the data model, not demonstrated |
| NX-3 | type-check | `apps/web tsc` | NOT RUN | no shared contract changed — an SQL ORDER BY is invisible to `shared-types` |
| NX-4 | build | `nest build`, e2e | NOT RUN | Docker absent; not declared commands |
| NX-5 | state | `git diff` | UNAVAILABLE | F-3 |

## Findings
| id | category | source | result | disposition |
|---|---|---|---|---|
| **F-16** | analysis | this task | **RECLASSIFIED / PARTIALLY RESOLVED** — `nearby` resolved, `bbox` closed as not-applicable (superseded by F-33), `bboxClusters` reclassified as a product decision (F-34) | — |
| **F-32** | analysis | B-4, B-6 | `searchFullText` paginates with OFFSET over non-unique `score` — GAP-12's defect on a live user-facing endpoint | **PLACE-015** |
| **F-33** | analysis | B-5 | `PlacesRepository.bbox()` has no consumer; same class as GAP-13, but no security trap (it filters `status = 'published'`) | backlog — removal task |
| **F-34** | analysis | B-3, D-3 | `bboxClusters` truncation at 500 is arbitrary and unstable; deterministic truncation requires a policy | backlog — **product decision** |
