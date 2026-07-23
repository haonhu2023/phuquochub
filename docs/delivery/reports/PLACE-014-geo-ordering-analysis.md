# PLACE-014 — Execution Report (F-16 geo LIMIT determinism analysis)

> Workstream: place · Task: PLACE-014 · Type: analysis · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-014.yaml`
> Result: **COMPLETED.** AC1–AC6 (mandatory) PASS, AC7 (optional) PASS.

## 1. Executive Summary
F-16 asked whether `nearby()`, `bbox()` and `bboxClusters()` share the GAP-12 defect. The answer
is **no, not as stated** — and the analysis found two things F-16 did not name.

- **`nearby()` — FIX_WARRANTED, fixed.** Exact `distance_m` ties are rare but real (two
  businesses at one address have identical coordinates), and with more matches than `LIMIT` the
  cut was planner-dependent. `p.id ASC` appended; mutation-checked.
- **`bbox()` — NO_ACTION on ordering, but it has NO CONSUMER.** `GeoService.bbox()` calls
  `bboxClusters()`, not `bbox()`. It is dead code of exactly the class GAP-13 removed. Recorded
  as **F-33**, not removed — removal is outside this task's scope.
- **`bboxClusters()` — NEEDS_PRODUCT_DECISION.** It has no `ORDER BY` and a fixed `LIMIT 500`,
  so which clusters survive truncation is arbitrary. Making it deterministic means choosing
  *which* clusters to keep, which is a product decision about the map, not a repository fix.
- **`searchFullText()` — out of scope, and the most serious finding here.** It paginates with
  **OFFSET** over a non-unique `score`, which is precisely the GAP-12 failure mode on a
  user-facing endpoint. Recorded as **F-32** and selected as PLACE-015.

## 2. Authorization and Dependency Verification
| item | value |
|---|---|
| `state.yaml` `current.task` | **PLACE-014**, `status: ready` — execution authorized |
| Task type | `analysis`, with remediation permitted only when "trivially safe AND clearly warranted" |
| depends_on | PLACE-013 — `status: completed`, AC1–AC6 PASS, `resolves: F-12 (verified pre-existing), F-23` |
| Dependency evidence | `evidence/PLACE-013-build-hygiene-evidence-index.md` VO-1..VO-6: jest migrations 11/11 pre- and post-removal, jest places 92/92, eslint + tsc exit 0 |

## 3. Factual Starting Baseline (AC1)
Recorded before any edit:

| method | line | ORDER BY | OFFSET? | LIMIT source | consumer |
|---|---|---|---|---|---|
| `nearby` | `:268` | `distance_m ASC` | **no** | client, via `clampLimit(dto.limit)` | `GeoService.nearby` → `GeoController` |
| `bbox` | `:287` | **none** | **no** | client `limit` param | **none** |
| `bboxClusters` | `:315` | **none** (has `GROUP BY`) | **no** | fixed `BBOX_MAX = 500` | `GeoService.bbox` → `GeoController` |
| `searchFullText` | `:343` | `score DESC` | **YES** — `(page-1)*limit` | client | `SearchService.search`, `.suggest` |

`list()` is excluded — PLACE-004 fixed it and it was out of scope here.

## 4. Two Distinct Failure Modes (AC2)
F-16 implicitly assumed one defect. There are two, and they do not co-occur:

**(a) Cross-page duplication/omission** — needs `OFFSET`. A row can appear on two pages or on
none while a caller walks the list. Applies **only** to `searchFullText()` among these four;
`list()` had it and was fixed by PLACE-004.

**(b) Unstable subset on repeated identical requests** — needs only `LIMIT` plus more matching
rows than the limit. Two identical calls can return different rows. Applies to `nearby()`,
`bbox()` and `bboxClusters()`.

Mode (b) is milder — no client is silently losing data mid-pagination — but it is still a real
inconsistency a user can observe.

## 5. openapi Check (AC3)
`docs/api/openapi.yaml:559-592`. **Neither `/geo/nearby` nor `/geo/bbox` declares any ordering
or stability guarantee**, and neither declares a `limit`/pagination parameter at all (`nearby`
takes `lat`, `lng`, `radius`, `category`; `bbox` takes the four bounds plus `zoom`).

Consequence, stated plainly: none of this is a **contract violation**. It is a quality issue.
That matters for classification — it means the fix is safe (no declared behaviour changes) and
also that no consumer can have been relying on a documented order.

## 6. Classification and Decision (AC4)
| method | classification | reasoning grounded in the code |
|---|---|---|
| `nearby()` | **FIX_WARRANTED** | `ST_Distance` returns a float, so ties need coordinate equality — but that is exactly what two businesses at one address produce, and the seed data pattern makes co-located Places plausible. With `clampLimit` capping results, a tie at the cut boundary decides which Place a user sees. Appending a unique key changes nothing else, matching PLACE-004's proven-safe pattern. |
| `bbox()` | **NO_ACTION** (ordering) | Fixing the ordering of a method nothing calls would be work with no observable effect. The real issue is that it exists at all → **F-33**. Removal is out of this task's scope (`in_scope` covers only the `ORDER BY` of these methods), so it is recorded, not acted on — the same discipline PLACE-007 applied to `getCardBySlug`. |
| `bboxClusters()` | **NEEDS_PRODUCT_DECISION** | It aggregates into grid cells and truncates at 500. Adding an `ORDER BY` does not merely stabilise it — it **decides which clusters survive**: `cnt DESC` prioritises dense areas, grid-coordinate order prioritises a corner of the viewport. Both are product choices about what the map should show when it cannot show everything. The task's first stop condition covers exactly this, so I stopped. |
| `searchFullText()` | **out of scope → F-32** | `in_scope` excludes the search module ("inspect for comparison only, change nothing"). Recorded and escalated rather than fixed. |

## 7. Files Inspected
`tasks/PLACE-014.yaml`; `state.yaml`; `tasks/PLACE-013.yaml`;
`places.repository.ts` (`nearby`, `bbox`, `bboxClusters`, `searchFullText`, `searchCount`);
`places.repository.spec.ts`; `geo/geo.service.ts`; `geo/geo.controller.ts`; `geo/dto/geo.dto.ts`;
`search/search.service.ts`; `search/search.service.spec.ts`; `docs/api/openapi.yaml:559-592`;
`reports/PLACE-004-ordering-report.md` §27; `evidence/PLACE-013-build-hygiene-evidence-index.md`.

## 8. Files Created
| path | class | reason |
|---|---|---|
| `docs/delivery/reports/PLACE-014-geo-ordering-analysis.md` | documentation | this report |
| `docs/delivery/evidence/PLACE-014-geo-ordering-evidence-index.md` | documentation | evidence index |
| `docs/delivery/tasks/PLACE-015.yaml` | task documentation | derived from F-32 |

## 9. Files Modified
| path | class | reason | validation | rollback |
|---|---|---|---|---|
| `apps/api/src/modules/places/repositories/places.repository.ts` | task_required | `nearby()` ORDER BY gains `, p.id ASC` + doc comment | jest 94/94, eslint, tsc | remove `, p.id ASC` and the comment |
| `apps/api/src/modules/places/repositories/places.repository.spec.ts` | task_required | 2 determinism specs for `nearby` | jest 94/94 | remove the two specs |
| `docs/delivery/state.yaml`, `workstreams/place.yaml`, `tasks/PLACE-014.yaml` | documentation | transition + findings register | js-yaml parse | revert |

## 10. Files Deleted
None.

## 11. Production-Code Changes
One SQL clause: `ORDER BY distance_m ASC` → `ORDER BY distance_m ASC, p.id ASC`, plus a comment.
No other production change. `bbox()`, `bboxClusters()` and `searchFullText()` are **byte-unchanged**.

## 12. Test Changes
Two specs **added**, none modified, none removed, none weakened:
1. `nearby`'s emitted ORDER BY starts with `distance_m ASC` and **ends** with `id ASC` — parsed
   from the real SQL via the `orderKeysFrom` helper PLACE-004 introduced.
2. Four Places at identical coordinates with `LIMIT 2`: the input array is rotated between two
   otherwise-identical calls to model the planner's freedom, and both must yield the same slice.
   This tests failure mode (b) specifically, not GAP-12's mode (a) — which does not apply here.

## 13. Commands Executed
| # | command | cwd | exit | result |
|---|---|---|---|---|
| 1 | `npx jest places.repository` | `apps/api` | **0** | 13/13 — new specs pass |
| 2 | **mutation**: same, with `, p.id ASC` removed | `apps/api` | **1** | **2 failed, 11 passed** — exactly the two new specs |
| 3 | `npx jest places` (after restore) | `apps/api` | **0** | **94/94, 7 suites** |
| 4 | `npx jest migrations` | `apps/api` | **0** | **11/11, 3 suites** |
| 5 | `npx eslint "src/modules/places/**/*.ts" "src/modules/geo/**/*.ts" --max-warnings=0` | `apps/api` | **0** | clean |
| 6 | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean |

All three declared `validation_commands` executed (3, 5, 6), plus focused and migration runs.

## 14. Focused Validation
`npx jest places.repository` → 13/13, covering both new `nearby` specs alongside PLACE-004's
`list` determinism specs and the GAP-02/04 regression specs.

## 15. Full Regression
`npx jest places` → **94/94 across 7 suites** (92 before + 2 new). `npx jest migrations` →
11/11. No pre-existing spec was disturbed.

## 16. Typecheck / Build
`tsc -p tsconfig.json --noEmit` → exit 0. **`apps/web` typecheck was not run**: no shared
contract changed — the modification is an SQL `ORDER BY` inside the API repository, invisible to
`@phuquochub/shared-types`. `nest build` was not run.

## 17. Mutation Check
Performed as required, and left clean:
1. New specs pass with the tie-breaker present (cmd 1, 13/13).
2. `, p.id ASC` removed → **2 failed, 11 passed** (cmd 2), and the two failures are precisely the
   two new specs — no collateral.
3. Clause restored.
4. Full re-validation green (cmds 3–6).

No mutation remains in the working tree — the restored clause is verified by cmd 3.

## 18. Acceptance-Criteria Matrix
| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | ORDER BY / OFFSET / LIMIT / caller documented per method | yes | **PASS** | §3 |
| AC2 | The two failure modes distinguished and applied per method | yes | **PASS** | §4 |
| AC3 | openapi checked for ordering/stability guarantee, result stated | yes | **PASS** | §5 — none declared |
| AC4 | Each method classified with code-grounded reasoning | yes | **PASS** | §6 |
| AC5 | Code change confined to classified methods, with determinism spec | yes | **PASS** | §11, §12 — one clause, two specs |
| AC6 | jest / eslint / tsc exit 0 | yes | **PASS** | §13 cmds 3–6 |
| AC7 | Deferred remediation specified precisely enough to execute | **no** | **PASS** | F-32 → `PLACE-015.yaml`; F-33 and the `bboxClusters` decision specified in §6 and §19 |

All six mandatory criteria **PASS**.

## 19. Finding Disposition — F-16 and new findings
**F-16: RECLASSIFIED and PARTIALLY RESOLVED.** As originally written ("`nearby`, `bbox` and
`bboxClusters` also `LIMIT` without a unique final key") it was accurate but conflated three
different situations. Disposition per method:
- `nearby()` → **RESOLVED** here.
- `bbox()` → **CLOSED as not-applicable**; superseded by F-33 (dead code).
- `bboxClusters()` → **OPEN, reclassified** as a product decision, not a repository defect.

| id | new finding | evidence | disposition |
|---|---|---|---|
| **F-32** | `searchFullText()` paginates with **OFFSET** over a non-unique `score DESC` — the GAP-12 defect on a live user-facing endpoint. `SearchService` calls it with `(page-1)*limit`, so a user paging through search results can see a Place twice or miss it entirely. `ts_rank` produces ties readily across similarly-matching documents. | `places.repository.ts:343`; `search.service.ts:16` | **PLACE-015** — highest-value remaining executable work |
| **F-33** | `PlacesRepository.bbox()` has **no consumer**: `GeoService.bbox()` calls `bboxClusters()`. Same class as GAP-13. Unlike `getCardBySlug` it carries no security trap (it filters `status = 'published'`), so it is dead weight rather than a hazard. | §3 consumer sweep | backlog — removal task, mirroring PLACE-007 |
| **F-34** | `bboxClusters()` truncates at a fixed 500 with no ordering, so which clusters a map shows when the viewport exceeds 500 cells is arbitrary and can change between identical requests. Deterministic truncation requires a policy (`cnt DESC`? spatial order?). | §6 | backlog — **needs a product decision**, explicitly not an engineering fix |

## 20. Known Unresolved Release Blockers
Unchanged by this task, all five still open and all outside repository control:
**F-1** PROVISIONAL Phú Quốc bbox (actively enforced), **F-2** no Docker, **F-3** no version
control, **F-6** GAP-05/10 list-param divergence, **F-17** openapi `PlaceCard` omits
`status`/`score`. This task resolved a NON_BLOCKING quality issue and did not touch any of them.

## 21. Evidence Artifacts
- `docs/delivery/reports/PLACE-014-geo-ordering-analysis.md` (this report)
- `docs/delivery/evidence/PLACE-014-geo-ordering-evidence-index.md`
- `docs/delivery/tasks/PLACE-015.yaml` (derived)

## 22. Rollback Instructions
Remove `, p.id ASC` from `nearby()`'s ORDER BY and delete its doc comment; remove the two
`nearby` specs from `places.repository.spec.ts`; delete the three artifacts in §21 and revert the
`state.yaml` / `place.yaml` edits. No schema, data, migration or contract is involved, so
rollback is complete and non-destructive.

## 23. Place Workstream Classification
**INCOMPLETE** — unchanged. One NON_BLOCKING finding resolved and three recorded; no gate moved.
The workstream is **not parked**: this analysis produced a genuinely justified next task (F-32),
so PLACE-015 is derived from evidence rather than manufactured to continue the sequence.

## 24. Explicit Non-Claims
This report does **not** claim any unverified: **production deployment, production migration
application, production backfill completion, complete external consumer migration, complete
cache propagation, complete search reindexing, complete event propagation, canary success,
hypercare completion, production stabilization, compatibility retirement readiness, or legacy
schema cleanup readiness.**

Specifically not claimed: determinism is proven **structurally and by simulation**, not by
observing PostgreSQL — no database was available, so the claim that the planner may reorder tied
rows rests on documented SQL semantics, not on a measured reordering. The F-16 tie scenario
(co-located Places) is argued as plausible from the data model, **not** demonstrated against real
data. `apps/web` typecheck and `nest build` were not run. No e2e, no telemetry, no git
branch/commit/diff.
