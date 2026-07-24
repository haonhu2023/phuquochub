# PLACE-023 — Evidence Index (deterministic bbox truncation, 2026-07-24)

Backs `docs/delivery/reports/PLACE-023-bbox-deterministic-ordering-report.md`. All commands on the D:
checkout under pinned **Node v20.20.2 / npm 10.8.2**.

## Authority
| id | source | proves |
|---|---|---|
| S-1 | owner instruction 2026-07-24 — "activation and execution of PLACE-023 — OD-B3 / F-34" | activation authorized |
| S-2 | `decisions/OWNER-DECISIONS-2026-07-24.md` OD-B3 (B3-A) | ordering-only; densest-first + stable key |
| S-3 | `tasks/PLACE-023.yaml` | scope = F-34 only |

## Investigation (Phase 2)
| id | evidence | result |
|---|---|---|
| I-1 | `places.repository.ts` bboxClusters (before) | `GROUP BY floor(.../$5), floor(.../$5) LIMIT $6` — **no ORDER BY** |
| I-2 | caller | `GeoService.bbox` calls with `limit: BBOX_MAX = 500` |
| I-3 | endpoint | `GET /api/geo/bbox` (`@Public`) |
| I-4 | ordering convention | `list`/`nearby`/`searchFullText` all end with `p.id ASC` (unique key) |
| I-5 | stable-key candidates | returned `sample_id` = min p.id per cell — unique per cell, PK immutable, reuses `p.id ASC` |

## Change (Phase 3)
| id | file | change |
|---|---|---|
| C-1 | `places.repository.ts` | added `ORDER BY cnt DESC, sample_id ASC` immediately before `LIMIT $6` + rationale comment; everything else byte-identical |

## Unit tests — SQL shape (Phase 4)
| id | test | result |
|---|---|---|
| U-1 | `ORDER BY cnt DESC, sample_id ASC` immediately before `LIMIT` | ✅ |
| U-2 | extracted truncation ORDER BY == `[cnt DESC, sample_id ASC]`, ends in unique `sample_id` | ✅ |
| U-3 | grouping / cell size `$5` / aggregation / WHERE / `LIMIT $6` unchanged | ✅ |
| U-4 | comparator from real ORDER BY: cnt-tied cells strictly ordered by sample_id | ✅ |

`orderKeysFrom` (used for the simple queries) is confounded by the inner `array_agg(p.id ORDER BY p.id)`;
a `truncationOrderKeys` helper extracts the LAST `ORDER BY … LIMIT` (the truncation clause) — robust.

## E2E determinism — real DB (Phase 4/5)
| id | test | result |
|---|---|---|
| E-1 | zoom=9: 5 consecutive fetches byte-identical | ✅ |
| E-2 | zoom=14: 5 consecutive fetches byte-identical | ✅ |
| E-3 | densest-first (cnt non-increasing across sequence) | ✅ |
| E-4 | tie handling: equal-cnt single cells strictly ascending id (sample_id ASC), no dup | ✅ |
| E-5 | identical cluster count across repeated runs | ✅ |
| E-REPEAT | **whole determinism suite run 5× consecutively** | ✅ 5/5 every time |

## Live HTTP determinism (Phase 5)
| id | command | result |
|---|---|---|
| H-1 | boot prod build; `GET /api/geo/bbox?...&zoom=14` ×5, hash `data` | **single identical SHA-256**, 37 items, 1 distinct hash |
| H-2 | `/api/health` | 200, db=up, redis=up |
| H-3 | web `/` | 200 |

## Verification ladder (Phase 5)
| id | command | result |
|---|---|---|
| V-1 | `eslint` (places + geo e2e, then full `src/**`) | exit 0 |
| V-2 | `tsc -p tsconfig.json --noEmit` | exit 0 |
| V-3 | `jest places.repository` | 21/21 |
| V-4 | `jest --config test/jest-e2e.json geo-bbox-determinism` ×5 | 5/5 each |
| V-5 | `jest` (full unit) | **220/220**, 30 suites |
| V-6 | `jest --config test/jest-e2e.json` (full e2e) | **38/38**, 7 suites |
| V-7 | `turbo run build --force` (tsbuildinfo purged) | 4/4, 0 cached |
| V-8 | artifacts | main.js/app.module.js/core; 153==153; no `*.spec.js`; web `.next` |
| V-9 | boot + endpoints | health 200 db/redis up; web 200; bbox ×5 identical |
| V-10 | terminate + ports | PIDs killed; 4000/3000 FREE |

## Runtime-unchanged proof
| id | evidence | result |
|---|---|---|
| P-1 | SELECT/GROUP BY/cell-size/aggregation/WHERE/LIMIT | byte-identical (SQL-shape unit tests) |
| P-2 | returned schema (cnt/lng/lat/sample_*) | unchanged |
| P-3 | `git diff` scope | no DTO/contract/schema/migration/index file |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | clustering / cell size / aggregation / schema | NOT changed |
| NX-2 | index / migration / DB schema | NONE added |
| NX-3 | LIMIT-500 truncation exercised at 500 | NOT reached at seed (<500 cells); determinism proven by ORDER-before-LIMIT + repeated identical output |
| NX-4 | B4..B7 | NOT implemented |
