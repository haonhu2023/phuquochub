# PLACE-024 — Remove SearchResult.score from the public search payload (B4 / F-35)

- **Task:** PLACE-024 (`docs/delivery/tasks/PLACE-024.yaml`)
- **Type:** contract_cleanup
- **Date:** 2026-07-24
- **Outcome:** **COMPLETED — F-35 RESOLVED**
- **Authority:** OD-B4 (B4-A) + explicit owner authorization to activate & execute PLACE-024, 2026-07-24
- **Evidence index:** `docs/delivery/evidence/PLACE-024-search-score-removal-evidence-index.md`

## 1. What & why

`SearchResult.score` exposed the raw Postgres `ts_rank` value in the public `/search` payload,
coupling the public contract to an engine-specific ranking number that no client used (confirmed by
a full grep of the web app) and that would have forced a breaking change on any future search-engine
migration. OD-B4/B4-A: **remove the public field, keep `ts_rank` internal for ordering only.**

## 2. Complete data-flow map

| Stage | Before (evidence) | After |
|---|---|---|
| 1. SQL ranks | `places.repository.ts` `searchFullText()` — `ts_rank(...) AS score`, `ORDER BY score DESC, p.id ASC` | **UNCHANGED** — byte-identical |
| 2. Repository row | `PlaceCardRow.score?: number` — already documented internal-only (F-17/OD-F-17) | **UNCHANGED** — retained as the sole internal representation |
| 3. Service mapping | `search.service.ts` — `score: r.score !== undefined ? Number(r.score) : 0` copied into the public object | **REMOVED** — the field is no longer mapped |
| 4. Controller | `search.controller.ts` `@Public` — passes service result straight through | unaffected |
| 5. Public types | `openapi.yaml` `SearchResult.score: {type: number}`; web `SearchResult.score: number` | **REMOVED from both** |
| 6. Frontend | `SearchMapExplorer.tsx` imports the type, **never reads `.score`** (confirmed: 0 hits beyond the declaration in a full `grep -rn "\.score\b"` over `apps/web/src`) | unaffected — no component change needed |

**Stop-condition check:** no legitimate client depends on the numeric score (full grep confirms zero `.score` reads anywhere in the frontend) — Phase 2 stop-condition **not triggered**.

## 3. Internal representation retained / public field removed

- **Retained internally:** `PlaceCardRow.score` (the `ts_rank` value) — used exclusively by `places.repository.ts`'s `ORDER BY score DESC, p.id ASC`. Never serialized.
- **Removed from the public contract:** `SearchResult.score` — from the service mapping, the OpenAPI schema, and the web TypeScript interface. **Not** renamed or replaced by an equivalent field (verified by a recursive key scan for `score`/`rank`/`ts_rank`/`searchRank` at every nesting depth).

## 4. SQL ranking behaviour before/after

**Before and after are byte-identical:**
```sql
ts_rank(
  to_tsvector('simple', immutable_unaccent(coalesce(p.name,'') || ' ' || coalesce(p.description,''))),
  plainto_tsquery('simple', immutable_unaccent($1))
) AS score
...
ORDER BY score DESC, p.id ASC
```
No change to the ranking expression, weights, `ORDER BY` direction, tie-break, query parsing, or FTS
configuration. Confirmed by the unaffected `places.repository.spec.ts` suite (21/21, unchanged).

## 5. Result-order comparison

A baseline was captured against the **pre-change** production build (three fixed queries: `q=bien`,
`q=phu quoc`, and `q=bien&page=2&limit=3`). After implementing the change, a dedicated contract e2e
spec asserts the exact same id sequences, and this was independently reproduced live via `curl`
against the newly booted post-change production build:

- `q=bien&limit=20`: **20/20 ids in identical order** (pre vs. post, `diff` = no output).
- `q=phu quoc&limit=20`: **20/20 ids in identical order** (contract spec assertion, pass).
- `q=bien&page=2&limit=3`: **identical 3 ids + identical pagination meta** (`page:2, pageSize:3, total:20, totalPages:7`).

Ordering is **provably unchanged**.

## 6. Files changed

- `apps/api/src/modules/search/search.service.ts` — removed `score` from the public mapping (kept the `Promise.all` fetch and all other fields).
- `docs/api/openapi.yaml` — removed `score` from the `SearchResult` schema.
- `docs/api/api.md` §22 — reworded the response line (was implying an emitted relevance-score field).
- `apps/web/src/modules/search/api/search.api.ts` — removed `score: number` from the `SearchResult` interface.
- `apps/api/src/modules/search/search.service.spec.ts` — added an explicit "no score" assertion.
- `apps/api/test/search-contract.e2e-spec.ts` (**new**) — 6 public-contract tests.
- Governance: PLACE-024 task, this report, the evidence index, `findings/F-35.yaml`, `workstreams/place.yaml`, `state.yaml`.

## 7. Frontend impact

**None functionally.** `apps/web/src/modules/search/api/search.api.ts`'s `SearchResult` TypeScript
interface no longer declares `score`. No component (`SearchMapExplorer.tsx`, the search page) reads
`.score` — verified by a full source grep before the change. `apps/web` typechecks clean
(`tsc --noEmit` exit 0) after the removal, confirming no consumer relied on the field's presence.

## 8. Tests added or modified

- **+1 unit** (`search.service.spec.ts`): asserts `score` is absent from the public result even when the repository row has `score` set.
- **+6 e2e** (`search-contract.e2e-spec.ts`, new): recursive no-rank-key-anywhere scan; baseline id-order match for two queries; explicit-pagination order+meta match; empty-result shape; repeated-query determinism; `/search/suggest` also clean.
- `places.repository.spec.ts` (SQL-level `score DESC` ordering tests) — **left unmodified**, confirming the ranking/ordering SQL is untouched (21/21 still green).

No assertion was weakened; the new tests are strictly additive and stronger (recursive deep-scan, not just top-level).

## 9. OpenAPI and contract-validation results

- `openapi.yaml` parses (`js-yaml`) ✅; `SearchResult.score` **confirmed absent** from the schema.
- `docs/api/api.md` §22 no longer implies a relevance-score field is emitted.
- All 27 governance YAML files parse.

## 10. Verification (Node v20.20.2 / npm 10.8.2)

| Check | Result |
|---|---|
| Scope | only `apps/api/src/modules/search/**`, `apps/api/test/search-contract.e2e-spec.ts`, `docs/api/**`, `apps/web/…/search.api.ts`, `docs/delivery/**` — no schema/migration/index |
| Governance YAML parse | ✅ |
| OpenAPI parse | ✅ |
| Lint (affected + full) | ✅ |
| Typecheck (api + web) | ✅ |
| Affected repository spec (SQL ranking) | ✅ **21/21** unchanged |
| Affected service spec | ✅ **4/4** (3 + 1 new) |
| Public contract e2e | ✅ **6/6** |
| Full unit | ✅ **221/221** (220 + 1), 30 suites |
| Full API e2e | ✅ **44/44** (38 + 6), 8 suites |
| Clean build (`turbo --force`, tsbuildinfo purged) | ✅ 4/4; artifacts `main.js`/`app.module.js`/`core/`; **153==153**; no spec in dist; web `.next` |
| Boot + `/api/health` | ✅ 200, db up, redis up |
| Web `/` | ✅ 200 |
| `/api/search` normal query | ✅ 0 score occurrences; id order identical to baseline |
| `/api/search` no-result | ✅ shape unchanged |
| `/api/search` explicit pagination | ✅ meta + order unchanged, no score |
| `/api/search` repeated identical query (×3) | ✅ single identical hash |
| Processes / ports | ✅ terminated; 4000 & 3000 FREE |

## 11. F-35 (finding) resolution

`decision_status: APPROVED` (OD-B4) · `implementation_status: DONE` (PLACE-024) ·
`validation_status: PASSED` · `release_blocker_status: NOT_A_BLOCKER` → **F-35 RESOLVED**. The public
contract no longer exposes the Postgres-specific `ts_rank` value; server-side relevance ordering is
unchanged and empirically proven identical.

## 12. Non-claims

No ts_rank expression, ranking weight, ORDER BY direction, query-parsing, Postgres FTS configuration,
pagination, validation, error-response, or status/visibility-filtering change. No search redesign. No
B5–B7 work performed or implied.
