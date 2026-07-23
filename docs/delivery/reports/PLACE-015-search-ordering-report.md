# PLACE-015 — Execution Report (F-32 search pagination determinism)

> Workstream: place · Task: PLACE-015 · Type: implementation · Date: 2026-07-23
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-015.yaml`
> Result: **COMPLETED.** AC1–AC7 (mandatory) PASS, AC8 (optional) PASS.

## 1. Executive summary

`PlacesRepository.searchFullText` ordered by `ts_rank(...) DESC` alone while `SearchService`
paginated it with `OFFSET`. That is the GAP-12 defect on a live, public, user-facing endpoint:
paging through search results could show a Place twice or never show it at all. One SQL clause
now fixes it — `ORDER BY score DESC` became `ORDER BY score DESC, p.id ASC` — with three new
specs and a mutation check that reproduced the defect exactly.

The mutation check is the substantive evidence here. With the tie-breaker removed, two pages over
six equally-ranked rows yielded **4 distinct Places instead of 6** — duplication and omission
together, which is precisely what F-32 predicted.

## 2. Authorization and dependency verification

| item | value |
|---|---|
| `state.yaml` `current.task` | **PLACE-015**, `status: ready` — execution authorized |
| Task file | `docs/delivery/tasks/PLACE-015.yaml` exists, `status: ready` |
| `depends_on` | **PLACE-014** — `status: completed`, AC1–AC6 PASS |
| Dependency evidence | `evidence/PLACE-014-geo-ordering-evidence-index.md` VO-1..VO-6; independently re-verified on 2026-07-23 (`npx jest places.repository` → 13/13, exit 0) before this task began |

No other task was activated, prepared, or partially implemented. PLACE-016, PLACE-017 and
PLACE-018 were untouched.

## 3. Factual baseline (captured before any edit)

| method | line | ORDER BY | OFFSET? | caller |
|---|---|---|---|---|
| `searchFullText` | `:362` (pre-edit) | `score DESC` — **non-unique** | **YES** | `SearchService.search` (`:16`), `.suggest` (`:31`) |
| `searchCount` | `:340` | **none** | no | `SearchService.search` (`:16`) |

`SearchService.search` calls `searchFullText(dto.q, limit, (page - 1) * limit)` —
**confirmed at `search.service.ts:16`**. `suggest()` calls `searchFullText(dto.q, 8, 0)` —
**offset 0, confirmed at `search.service.ts:31`** — so suggest was never exposed to the defect.

### Exact nondeterminism mechanism

`ts_rank` returns a float that is **not unique**: documents matching a query equally well score
identically, which short Vietnamese queries over `name + description` make common rather than
exotic. SQL guarantees no order among rows tied on every `ORDER BY` key, so PostgreSQL is free to
sequence them differently between the page-1 query and the page-2 query. Because pagination is
`OFFSET`-based, a row that moves across the offset boundary between those two independent queries
is either returned twice or skipped entirely.

This is failure mode (a) from PLACE-014's taxonomy — cross-page duplication/omission, which
requires `OFFSET` — and `searchFullText` is the **only** remaining query in the repository that
had both an `OFFSET` and a non-unique final sort key.

## 4. Implementation

**One SQL clause, plus a doc comment.**

```
- ORDER BY score DESC
+ ORDER BY score DESC, p.id ASC
```

`p.id` is the primary key: unique and `NOT NULL`, so appending it makes the sort a **total
order** — a sufficient condition for stable pagination. It is the **last** key, so it arbitrates
only rows already tied on `score`; relevance ordering for non-tied rows is mathematically
untouched. `score DESC` remains the leading key with its direction unchanged, and the `ts_rank`
expression, the `tsvector`, `plainto_tsquery` and `immutable_unaccent` handling were not touched.

This is the identical pattern PLACE-004 proved safe on `list()` and PLACE-014 applied to
`nearby()`.

**`searchCount()` needs no change and was not changed.** It has no `ORDER BY` at all — it is a
bare `count(*)` over the same `WHERE` clause. Ordering cannot affect a cardinality, so the count
and the page query continue to describe exactly the same result set. A spec now pins this.

## 5. Files inspected

`docs/delivery/state.yaml`; `tasks/PLACE-015.yaml`; `tasks/PLACE-014.yaml`;
`places.repository.ts` (`searchFullText`, `searchCount`, `CARD_COLS`, and the `list`/`nearby`
patterns); `places.repository.spec.ts` (PLACE-004/014 helpers);
`search/search.service.ts`; `search/search.service.spec.ts`; `docs/api/openapi.yaml:1359-1380`;
`reports/PLACE-004-ordering-report.md`; `reports/PLACE-014-geo-ordering-analysis.md`;
`evidence/PLACE-014-geo-ordering-evidence-index.md`.

## 6. Files modified

| path | class | reason | rollback |
|---|---|---|---|
| `apps/api/src/modules/places/repositories/places.repository.ts` | task_required | `searchFullText` ORDER BY gains `, p.id ASC`; F-32 doc comment added | remove `, p.id ASC` and the comment |
| `apps/api/src/modules/places/repositories/places.repository.spec.ts` | task_required | 3 determinism specs added | remove the three specs |

Governance artifacts updated separately: `state.yaml`, `workstreams/place.yaml`,
`tasks/PLACE-015.yaml`, `tasks/PLACE-016.yaml`.

**No other production file changed.** `list()`, `nearby()`, `bbox()`, `bboxClusters()` and
`searchCount()` are byte-unchanged, as are `search.service.ts`, the search DTO, controller and
response shape. `search.service.spec.ts` was **not edited** (file mtime 2026-07-17, unchanged
today).

## 7. Files created

`docs/delivery/reports/PLACE-015-search-ordering-report.md` (this report);
`docs/delivery/evidence/PLACE-015-search-ordering-evidence-index.md`.

## 8. Validation commands (copied literally from PLACE-015.yaml)

```
cd apps/api && npx jest places
cd apps/api && npx jest search
cd apps/api && npx eslint "src/modules/places/**/*.ts" "src/modules/search/**/*.ts" --max-warnings=0
cd apps/api && npx tsc -p tsconfig.json --noEmit
```

## 9. Validation results

| # | command | exit | result |
|---|---|---|---|
| 1 | `npx jest places.repository` (focused) | **0** | **16/16** — 13 prior + 3 new |
| 2 | **mutation**: same, `, p.id ASC` removed | **1** | **2 failed, 14 passed** |
| 3 | `npx jest places` (after restore) | **0** | **97/97, 7 suites** (94 before + 3 new) |
| 4 | `npx jest search` | **0** | **3/3, 1 suite** — passing UNMODIFIED |
| 5 | `npx eslint places + search --max-warnings=0` | **0** | clean |
| 6 | `npx tsc -p tsconfig.json --noEmit` | **0** | clean |

All four declared validation commands executed (3, 4, 5, 6), plus a focused run and the mutation
check.

## 10. Regression and mutation evidence

**Regression scenario.** Six Places tie on `score` (`0.0607927`). Two successive pages are taken
at `offset 0` and `offset 3` with `limit 3`. Between the two pages the input array is **rotated**,
modelling PostgreSQL's freedom to sequence equal rows differently across two independent queries.
The assertion is that the union of the two pages contains **6 distinct ids and all six ids** —
disjoint and complete.

**Failing result after temporary mutation.** With `, p.id ASC` removed:

```
expect(received).toBe(expected) // Object.is equality
Expected: 6
Received: 4
> 290 |     expect(new Set([...first, ...second]).size).toBe(6);
Tests: 2 failed, 14 passed, 16 total
MUTATION-exit=1
```

Exactly **2** specs failed — the two new determinism specs — with **no collateral damage** to the
13 pre-existing ones. The third new spec (`searchCount` has no `ORDER BY`) correctly kept passing,
since the mutation cannot affect it. The received value of **4 distinct rows out of 6** is the
F-32 defect reproduced: two Places were duplicated across the page boundary and two were lost.

**Passing result after restoration.** Clause restored, then commands 3–6 all green (97/97, 3/3,
lint 0, tsc 0). **No mutation remains in the working tree** — verified both by re-reading the
source (`ORDER BY score DESC, p.id ASC` at `places.repository.ts:372`) and by the full suite
passing afterwards.

## 11. Acceptance-criteria matrix

| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | ORDER BY ends with a unique non-null column; `score DESC` remains leading with direction unchanged | yes | **PASS** | §4; spec asserts `keys[0]` = score DESC and `keys[last]` = id ASC |
| AC2 | A spec asserts the ORDER BY shape by parsing real SQL, not a hard-coded string | yes | **PASS** | reuses `orderKeysFrom`, which regex-extracts the clause from the emitted query |
| AC3 | A spec shows two successive pages over score-tied rows are disjoint and complete, using the rotated-input technique | yes | **PASS** | §10; 6 ids across two pages, rotation between them |
| AC4 | Mutation check performed and recorded; no mutation remains | yes | **PASS** | §10 — 2 failed / 14 passed, restored, re-verified |
| AC5 | `searchCount()` unchanged, with the report stating why | yes | **PASS** | §4 — no ORDER BY, ordering cannot affect a count; now pinned by a spec |
| AC6 | No relevance tuning, no service/DTO/controller/contract change, no new index, no other repository method changed | yes | **PASS** | §6 — diff is two files; all other ORDER BY clauses verified byte-unchanged |
| AC7 | jest places, jest search, eslint, tsc all exit 0; search.service specs pass UNMODIFIED | yes | **PASS** | §9 cmds 3–6; search.service.spec.ts not edited |
| AC8 | openapi `/search` ordering-guarantee check recorded, classifying this as contract or quality fix | **no** | **PASS** | §12 |

All seven mandatory criteria **PASS**.

## 12. openapi `/search` ordering check (AC8)

`docs/api/openapi.yaml:1359-1380`. The `/search` operation declares parameters `q`, `type`,
`lat`, `lng`, `PageParam`, `CursorParam`, and a `SearchResult` array response. It declares **no
ordering or stability guarantee** of any kind.

Consequence, stated plainly: this is a **quality fix, not a contract fix**. No consumer could have
relied on a documented order, and no declared behaviour changes. (The same operation's
`CursorParam`-vs-implementation divergence and its bare-`number` `score` belong to F-6 and the
F-17 scope-boundary observation respectively; both were left untouched.)

## 13. Governance updates and why each was authorized

| artifact | change | authorization |
|---|---|---|
| `tasks/PLACE-015.yaml` | `status: ready → completed`, `run_status` recorded | task's own `completion_transition.on_success.task_status` |
| `state.yaml` `current.task` | `PLACE-015 → PLACE-016`, status `ready` | **explicitly** by `PLACE-015.yaml` `completion_transition.on_success.set_state` |
| `tasks/PLACE-016.yaml` | `status: proposed → ready` | consequence of the above: the state transition names PLACE-016 as the active task, and PLACE-016 already carries approved owner decision OD-F-1 |
| `state.yaml` `completed_tasks` | PLACE-015 entry added | established convention for every prior task |
| `workstreams/place.yaml` | `place_015_status`, `next_task`, F-32 recorded resolved | established convention |

The activation of PLACE-016 was **not** an independent judgement of mine. Three prior prompts
asked for PLACE-016/017/018 to be executed and each was refused precisely because `state.yaml` did
not authorize it. What authorizes it now is PLACE-015's own `completion_transition`, which named
`current.task: PLACE-016` before this execution began — combined with every PLACE-015 acceptance
criterion genuinely passing.

## 14. Remaining release blockers

Unchanged by this task; **none downgraded**. All five remain open and outside repository control:
**F-1** PROVISIONAL Phú Quốc bbox (decision approved, implementation pending — now PLACE-016);
**F-2** Docker not installed; **F-3** no version control; **F-6** openapi list-param divergence
(decision approved, remediation pending); **F-17** PlaceCard status/score (decision approved,
remediation pending). Also live: `apps/api/dist/` removed by PLACE-013 so a build is required
before runtime; `nest build` never run; `@phuquochub/*` are FAT32 copies, not workspace links.

This task resolved a NON_BLOCKING correctness defect and touched none of them.

## 15. Rollback instructions

Remove `, p.id ASC` from `searchFullText`'s ORDER BY and delete its doc comment; remove the three
search specs from `places.repository.spec.ts`; delete the two artifacts in §7 and revert the
governance edits in §13. No schema, data, migration or contract is involved.

## 16. Explicit non-claims

This report does **not** claim any unverified: production deployment, production migration
application, backfill completion, external consumer migration, cache propagation, search
reindexing, event propagation, canary success, hypercare completion, production stabilization, or
release readiness.

Specifically not claimed: determinism is proven **structurally and by simulation**, not by
observing PostgreSQL. No database was available (Docker absent), so the claim that the planner may
reorder tied rows rests on documented SQL semantics, not a measured reordering. That `ts_rank`
produces ties on real Vietnamese corpus data is argued from how the function works, **not**
demonstrated against real data. No index was created for the new sort key — that is F-15 territory
and would need `EXPLAIN`. `apps/web` typecheck was not run: no shared contract changed, an SQL
`ORDER BY` being invisible to `@phuquochub/shared-types`. `nest build`, e2e, telemetry and any
git diff were not available.
