# PLACE-023 — Deterministic bbox cluster truncation (B3 / F-34)

- **Task:** PLACE-023 (`docs/delivery/tasks/PLACE-023.yaml`)
- **Type:** correctness_hardening
- **Date:** 2026-07-24
- **Outcome:** **COMPLETED — F-34 RESOLVED**
- **Authority:** OD-B3 (B3-A) + explicit owner authorization to activate & execute PLACE-023, 2026-07-24
- **Evidence index:** `docs/delivery/evidence/PLACE-023-bbox-deterministic-ordering-evidence-index.md`

## 1. What & why

`PlacesRepository.bboxClusters` truncated with `LIMIT 500` but **no `ORDER BY`**, so when >500 grid
cells matched, which 500 survived was planner-dependent (nondeterministic; dense clusters could be
dropped arbitrarily). OD-B3/B3-A: make truncation deterministic via
`ORDER BY cnt DESC, <stable cell key> ASC` — **ordering only**.

## 2. Selected stable ordering column: `sample_id`

The SELECT already returns `sample_id = (array_agg(p.id ORDER BY p.id))[1]` — the **minimum `p.id` per
cell**. It **uniquely and stably identifies the cluster cell** (each place is in exactly one cell, so
the per-cell min id is distinct across cells; `p.id` is an immutable PK), it is an **existing returned
field** (not invented), and it reuses the repository's universal ordering key — `p.id ASC` is already
the unique final key in `list()`, `nearby()` and `searchFullText()`. No new key, no new column, no
index, no migration.

## 3. Before → after SQL

**Before** (truncation clause):
```
GROUP BY floor(ST_X(p.location::geometry) / $5), floor(ST_Y(p.location::geometry) / $5)
LIMIT $6
```
**After** (only the ORDER BY line added):
```
GROUP BY floor(ST_X(p.location::geometry) / $5), floor(ST_Y(p.location::geometry) / $5)
ORDER BY cnt DESC, sample_id ASC
LIMIT $6
```
`SELECT` list, `GROUP BY`, cell size (`$5`), aggregation, `WHERE` and the `LIMIT $6` parameter are
**byte-identical**. Verified by SQL-shape unit tests.

## 4. Execution-plan impact

Negligible. The added `ORDER BY` introduces a Sort node over the already-aggregated result (the number
of grid cells, bounded and small), applied **before** `LIMIT` — which is exactly what makes truncation
deterministic. No index was added (out of scope / not needed); no change to the scan, the
`ST_Intersects` filter, or the `HashAggregate`. At the current seed the cap is never reached, so the
sort is over a handful of rows.

## 5. Runtime impact

Ordering only. Counts, cluster contents, centroids and returned schema are unchanged; the result is now
in a **deterministic** order (densest-first, unique tie-break). No DTO, HTTP contract, pagination,
authorization, DB schema, migration, index or randomness change.

## 6. Files changed

- `apps/api/src/modules/places/repositories/places.repository.ts` — one `ORDER BY` line + rationale comment.
- `apps/api/src/modules/places/repositories/places.repository.spec.ts` — +4 SQL-shape tests (F-34 describe).
- `apps/api/test/geo-bbox-determinism.e2e-spec.ts` — **new** real-DB determinism spec (5 tests).
- Governance: PLACE-023 task/report/evidence-index, `findings/F-34.yaml`, `workstreams/place.yaml`, `state.yaml`.

## 7. Tests

**Unit (SQL shape, 4):** `ORDER BY cnt DESC, sample_id ASC` immediately before `LIMIT`; the extracted
truncation ORDER BY equals `[cnt DESC, sample_id ASC]` ending in the unique key `sample_id`; grouping/
cell-size/aggregation/WHERE/`LIMIT $6` unchanged; a comparator derived from the real ORDER BY proves a
total order over cnt-tied cells.

**E2E (real DB, 5):** byte-identical output across 5 consecutive fetches at zoom 9 (clusters) and zoom
14 (mostly single-point cells → cnt ties); densest-first (cnt non-increasing); tie handling (equal-cnt
single-point cells strictly ascending by id); identical cluster count across runs.

## 8. Repeated deterministic evidence

- **E2E suite executed 5 consecutive times** (Phase 5.5) — 5/5 passed every time (each run internally
  compares 5 identical fetches per zoom).
- **Live HTTP** (booted production build): `/api/geo/bbox?...&zoom=14` fetched 5× → **single identical
  SHA-256**, 37 items, 1 distinct hash.

## 9. Verification (Node v20.20.2 / npm 10.8.2)

| Check | Result |
|---|---|
| Affected lint / typecheck | ✅ |
| Repository spec | ✅ **21/21** (17 + 4 new) |
| Determinism e2e | ✅ 5/5 · **run 5× consecutively, all pass** |
| Full lint / typecheck | ✅ |
| Full unit | ✅ **220/220** (216 + 4), 30 suites |
| Full API e2e | ✅ **38/38** (33 + 5), 7 suites |
| Clean build (`turbo --force`, tsbuildinfo purged) | ✅ 4/4; artifacts `main.js`/`app.module.js`/`core/`; **153 == 153**; no spec in dist; web `.next` |
| Boot + `/api/health` | ✅ 200, db up, redis up |
| Web `/` | ✅ 200 |
| bbox endpoint repeated 5× (live) | ✅ single identical hash |
| Processes / ports | ✅ terminated; 4000 & 3000 FREE |

## 10. F-34 resolution

`decision_status: APPROVED` (OD-B3) · `implementation_status: DONE` (PLACE-023) ·
`validation_status: PASSED` · `release_blocker_status: NOT_A_BLOCKER` → **F-34 RESOLVED**. Truncation is
now deterministic (densest-first, unique tie-break); proven by SQL shape + repeated identical real-DB
and HTTP output.

## 11. Non-claims

Only truncation ordering changed. No clustering/cell-size/aggregation/schema change; no index or
migration; no B4–B7 work. LIMIT-500 is never reached at the current seed (<500 cells) — determinism is
guaranteed by the ORDER-before-LIMIT shape and demonstrated by repeated identical output.
