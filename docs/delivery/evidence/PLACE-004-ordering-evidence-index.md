# PLACE-004 — Evidence Index (GAP-12 ordering tie-breaker, 2026-07-22)

Backs `docs/delivery/reports/PLACE-004-ordering-report.md`. Concise references only.

> Distinct from `PLACE-004-evidence-index.md`, which records the earlier **BLOCKED** preflight
> attempt made when no PLACE-004 task file existed. That file is retained as history.

## State / task authority
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| S-1 | state | `docs/delivery/state.yaml` `current` | `task: PLACE-004`, `status: ready` at preflight | task was state-authorized before any edit | — |
| S-2 | task authority | `docs/delivery/tasks/PLACE-004.yaml` | 6 ACs, 3 validation commands, rollback, 3 stop conditions | scope/criteria authority | — |

## Dependency
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| DEP-1 | dependency | `evidence/PLACE-003-migration-evidence-index.md` VO-1..VO-4 | jest 11/11, eslint ×2 exit 0, tsc exit 0 | PLACE-003 complete on executed evidence | migration itself `implemented_not_executed` |
| DEP-2 | dependency | `tasks/PLACE-003.yaml` `status`, `run_status` | `completed`; AC1..AC6 PASS | declared dependency satisfied | irrelevant to PLACE-004's surface (no schema touched) |

## Analysis
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| AN-1 | persistence | `places.repository.ts:237-242` (before) | `ORDER BY p.rating_avg DESC NULLS LAST, p.created_at DESC` | no unique final key → total order not guaranteed | static read |
| AN-2 | persistence | `1720000400000-InitPlaces.ts:31` | `"id" uuid PRIMARY KEY DEFAULT gen_random_uuid()` | `places.id` is unique and non-null already — valid tie-breaker, no constraint needed | — |
| AN-3 | persistence | `InitPlaces.ts:44,52` | `rating_avg numeric(2,1)` nullable; `created_at ... DEFAULT now()` | tie density is real, not hypothetical (small value domain + shared seed timestamps) | no row-count evidence (no DB) |
| AN-4 | contract | `docs/api/openapi.yaml` `listPlaces` | no ordering guarantee declared | narrowing tie order breaks no documented contract | — |
| AN-5 | implementation | `places.repository.ts:229-233` count query | has no `ORDER BY` | count path provably unaffected | asserted executably by T-3 |

## Implementation
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| IMP-1 | implementation | `places.repository.ts` `list()` page query | ORDER BY now ends `, p.id ASC` + rationale comment | AC1, AC2 | one clause; no other method touched |

## Tests
| id | category | source | result | proves | limitations |
|---|---|---|---|---|---|
| T-1 | test | spec "ORDER BY kết thúc bằng khoá DUY NHẤT" | parses real emitted SQL; last key = `id ASC` | AC1 | structural |
| T-2 | test | spec "hai khoá sắp xếp gốc giữ nguyên" | keys[0]/[1] unchanged with direction + NULLS LAST | AC2 | structural |
| T-3 | test | spec "query đếm KHÔNG có ORDER BY" | count SQL has no ORDER BY | AN-5 executably | — |
| T-4 | test | spec "hai trang liên tiếp trên dữ liệu TRÙNG KHOÁ" | 6 fully-tied rows, input rotated between pages; pages disjoint and complete | AC3 — determinism survives planner reordering | simulation of Postgres tie freedom, **not** Postgres itself |

## Validation output — executed 2026-07-22
| id | category | command | cwd | exit | result | classification |
|---|---|---|---|---|---|---|
| VO-1 | test | `npx jest places.repository` | `apps/api` | **0** | **11/11 pass** (7 existing + 4 new) | — |
| VO-2 | lint | `npx eslint "src/modules/places/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean | — |
| VO-3 | type-check | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | package type-checks | — |
| VO-4 | test | **mutation check**: same run with `, p.id ASC` removed | `apps/api` | **1** | **2 failed, 9 passed** — exactly T-1 and T-4 | deliberate; clause restored, VO-1 rerun green |

VO-4 is the strongest evidence here: it proves the new specs constrain the behaviour rather
than merely describing it.

## Not executed / not claimed
| id | category | item | result | limitations |
|---|---|---|---|---|
| NX-1 | performance | `EXPLAIN` on the new ORDER BY | **NOT EXECUTED** | Docker not installed; no index decision may be justified by measurement |
| NX-2 | integration | any query against PostgreSQL | **NOT EXECUTED** | determinism proven structurally + by simulation only |
| NX-3 | consumer | `apps/web` list rendering | NOT RUN | `not_verified` |
| NX-4 | build | `nest build` | NOT RUN | not a declared validation command |
| NX-5 | state | `git diff` | UNAVAILABLE | repository is not under version control |

## Findings carried
| id | category | source | result | limitations |
|---|---|---|---|---|
| F-15 | performance | report §23 | list ORDER BY unsupported by any index; `idx_places_status_active` unproven | both need one `EXPLAIN` session |
| F-16 | persistence | `places.repository.ts:268,287,315` | `nearby`/`bbox`/`bboxClusters` also `LIMIT` without a unique final key | not OFFSET-paginated, so not automatically defective — unanalysed |
