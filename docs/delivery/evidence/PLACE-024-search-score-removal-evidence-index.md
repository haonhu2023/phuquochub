# PLACE-024 — Evidence Index (SearchResult.score removal, 2026-07-24)

Backs `docs/delivery/reports/PLACE-024-search-score-removal-report.md`. All commands on the D:
checkout under pinned **Node v20.20.2 / npm 10.8.2**.

## Authority
| id | source | proves |
|---|---|---|
| S-1 | owner instruction 2026-07-24 — "activation and execution of PLACE-024 — OD-B4" | activation authorized |
| S-2 | `decisions/OWNER-DECISIONS-2026-07-24.md` OD-B4 (B4-A) | remove public score; keep ts_rank internal; preserve ordering |
| S-3 | `tasks/PLACE-024.yaml` | scope; F-35 assigned |
| S-4 | PLACE-023 completed (`3a09709`), full suites green | dependency satisfied |

## Data-flow investigation (Phase 2, verified against live source)
| id | evidence | result |
|---|---|---|
| D-1 | `places.repository.ts` `searchFullText()` | `ts_rank(...) AS score`; `ORDER BY score DESC, p.id ASC` — internal |
| D-2 | `PlaceCardRow.score?: number` (`:36`) | already documented internal-only per F-17/OD-F-17 comment |
| D-3 | `search.service.ts` (before) | `score: r.score !== undefined ? Number(r.score) : 0` — the public leak |
| D-4 | `search.controller.ts` | `@Public` routes pass service result straight through |
| D-5 | `docs/api/openapi.yaml:1996` | `SearchResult.score: {type: number}` |
| D-6 | `apps/web/.../search.api.ts:8` | `SearchResult.score: number` |
| D-7 | `grep -rn "\.score\b" apps/web/src` | **zero** hits beyond the interface declaration — no component reads it |
| D-8 | `docs/api/api.md §22` | response line implied a relevance-score field ("điểm liên quan") |
| D-9 | caching/analytics/logging grep | no implemented caching/logging of `score` anywhere in `apps/api/src` |
| D-10 | snapshot files | none exist (`find apps -name "*.snap"` empty) |

Stop-condition check: no legitimate client dependency on the numeric score found → **not triggered.**

## Baseline capture (pre-change, production build)
| id | query | captured |
|---|---|---|
| B-1 | `q=bien&limit=20` | 20 ids in order; `has score: true` |
| B-2 | `q=phu quoc&limit=20` | 20 ids in order |
| B-3 | `q=zzzznoresultzzzz` | `{success:true,data:[],meta:{page:1,pageSize:20,total:0,totalPages:0}}` |
| B-4 | `q=bien&page=2&limit=3` | 3 ids; `meta:{page:2,pageSize:3,total:20,totalPages:7}` |

Saved to scratchpad `baseline-search-{bien,phuquoc,empty,page2}.json`.

## Change (Phase 3/4)
| id | file | change |
|---|---|---|
| C-1 | `search.service.ts` | removed `score` from the public mapping; `ts_rank`/SQL untouched |
| C-2 | `openapi.yaml` | removed `SearchResult.score` |
| C-3 | `api.md §22` | reworded response line (no field claim) |
| C-4 | `search.api.ts` (web) | removed `SearchResult.score` interface field |

## Tests
| id | test | result |
|---|---|---|
| T-1 | unit: public result has no `score`, even when row does | ✅ |
| T-2 | e2e: recursive scan — no `score/rank/ts_rank/searchRank` key at any depth | ✅ (3 queries + suggest) |
| T-3 | e2e: `q=bien` id order == pre-change baseline | ✅ exact match |
| T-4 | e2e: `q=phu quoc` id order == pre-change baseline | ✅ exact match |
| T-5 | e2e: `page=2&limit=3` order + meta == baseline | ✅ exact match |
| T-6 | e2e: empty-result shape unchanged | ✅ |
| T-7 | e2e: repeated identical query → byte-identical output | ✅ |
| T-8 | `places.repository.spec.ts` (SQL ranking) | ✅ **21/21 unchanged** — ts_rank/ORDER BY untouched |

## Verification ladder (Phase 6)
| id | command | result |
|---|---|---|
| V-1 | scope (`git status`) | only search module + docs + web type + new test |
| V-2 | governance YAML parse | 27/27 |
| V-3 | OpenAPI parse | PASS |
| V-4 | `eslint` (search module, then full `src/**`) | exit 0 |
| V-5 | `tsc` (api + web) | exit 0 both |
| V-6 | `jest places.repository` | 21/21 |
| V-7 | `jest search.service` | 4/4 |
| V-8 | `jest search-contract` (e2e) | 6/6 |
| V-9 | `jest` (full unit) | **221/221**, 30 suites |
| V-10 | `jest --config test/jest-e2e.json` (full e2e) | **44/44**, 8 suites |
| V-11 | `turbo run build --force` (tsbuildinfo purged) | 4/4, 0 cached |
| V-12 | artifacts | main.js/app.module.js/core; 153==153; no `*.spec.js`; web `.next` |
| V-13 | boot + `/api/health` | 200, db=up, redis=up |
| V-14 | web `/` | 200 |
| V-15 | live `/api/search?q=bien` post-change | 0 score occurrences; `diff` vs baseline id-list = **no output (identical)** |
| V-16 | live no-result / pagination | shape/meta unchanged, no score |
| V-17 | live repeated query ×3 | single identical SHA-256 |
| V-18 | terminate + ports | PIDs killed; 4000/3000 FREE |

## Runtime-unchanged proof
| id | evidence | result |
|---|---|---|
| P-1 | `ts_rank` expression + `ORDER BY score DESC, p.id ASC` | byte-identical (SQL-level spec unaffected) |
| P-2 | result id order (2 queries + paginated) | identical pre/post, live + contract-test |
| P-3 | pagination metadata + empty shape | unchanged |
| P-4 | `git diff` scope | no DB schema/migration/index/contract-breaking file |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | ts_rank expression / weights / ORDER BY / query parsing / FTS config | NOT changed |
| NX-2 | search redesign / new field replacing score | NOT done |
| NX-3 | B5..B7 | NOT implemented |
