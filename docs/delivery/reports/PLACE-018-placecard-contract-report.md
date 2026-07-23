# PLACE-018 — Execution Report (F-17 PlaceCard public contract alignment)

> Workstream: place · Task: PLACE-018 · Type: implementation · Date: 2026-07-23
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-018.yaml`, decision **OD-F-17** (F17-D)
> Result: **COMPLETED** with one recorded scope correction. AC1–AC11 (mandatory) PASS, AC12 (optional) PASS.

## 1. Executive summary

The public `PlaceCard` contract now describes exactly what the API returns: `status` is documented
(it was always emitted), and `score` is gone from the public contract (no endpoint ever emitted it
through `PlaceCard`). Emitted JSON is **byte-identical** in both directions.

**One recorded correction.** The task's execution step 1 required re-verifying the premise rather
than assuming it — and that check found the prior analysis was wrong in one detail. See §3.

## 2. Authorization and dependency verification

| item | value |
|---|---|
| `state.yaml` `current.task` | **PLACE-018**, `status: ready` |
| Decision authority | `OWNER-DECISION-F-17.md` — OD-F-17, option **F17-D**, APPROVED 2026-07-23 |
| `depends_on` | **PLACE-017** — `status: completed` 2026-07-23, AC1–AC10 PASS |

## 3. Scope correction found by the mandatory re-verification

OD-F-17 and `PLACE-018.yaml` both instructed removing `score` from **three** places: the shared
type, `PlaceCardRow`, and the mapper branch — on the basis that all three were unreachable.

Re-verification disproved that for one of them. **`search.service.ts:24` reads `r.score`:**

```ts
score: r.score !== undefined ? Number(r.score) : 0,
```

`searchFullText` returns `PlaceCardRow[]`, and `SearchService` consumes `score` off that row to
build its own `SearchResult`. So `PlaceCardRow.score` is **live, not dead**. Removing it would have
broken the search module — which this task's `out_of_scope` explicitly protects, and which OD-F-17
explicitly preserves ("retain it internally only where it has a defined ranking purpose").

**Resolution applied:** the two genuinely-dead declarations were removed; `PlaceCardRow.score` was
**kept**, with a comment recording why and naming its consumer. This satisfies the decision's
*intent* — no undefined number on the public contract — while the literal three-way removal would
have contradicted the decision's own retention clause and broken a module out of scope.

The prior claim "declared in three places and reachable by nothing" was accurate for the public
contract and wrong about the row type. The finding's core claim is unaffected: **no endpoint ever
emitted `score` through `PlaceCard`.**

## 4. `status` audit (final)

| Location | Definition | Serialized | Public | Enum | Nullable | Optional | Consumer |
|---|---|---|---|---|---|---|---|
| `shared-types/place.ts` | `PlaceStatusValue` | — | yes | yes | no | no | api + web |
| `PlaceCardRow` | `PlaceStatus` | — | — | yes | no | no | mapper |
| `CARD_COLS` | `p.status` | always | — | — | no | no | all card queries |
| `places.mapper.ts:22` | unconditional | **always** | yes | — | no | no | every card response |
| `openapi.yaml PlaceCard` | **`$ref PlaceStatus` (added)** | — | yes | yes | no | no | — |

Semantics recorded: **publication/visibility state only**, explicitly *not* business operating
state — that is `opening_hours`. Vocabulary is the pre-existing authoritative enum
`draft | pending | published | archived`; **no member was invented**. Public channels can only ever
observe `published`, because public reads filter to it. Net-new disclosure is **zero**: the same
enum was already published via the public `Place` detail schema (`openapi.yaml:1778`).

## 5. `score` audit (final)

| Location | Definition | Serialized | Computed | Persisted | Public | Consumer | Action |
|---|---|---|---|---|---|---|---|
| `shared-types/place.ts` `PlaceCard` | `score?: number` | **never** | — | no | was public-typed | **none** | **REMOVED** |
| `places.mapper.ts:28-30` | conditional branch | **never ran** | — | no | would have been | **none** | **REMOVED** |
| `PlaceCardRow:28` | `score?: number` | — | `ts_rank` | no | internal | **`search.service.ts:24`** | **KEPT** (§3) |
| `searchFullText` | `AS score` | — | `ts_rank` | no | internal | SearchService | untouched |
| `openapi SearchResult` | `type: number` | yes | `ts_rank` | no | **public** | — | **out of scope** |

## 6. Files inspected

`state.yaml`; `tasks/PLACE-018.yaml`; `tasks/PLACE-017.yaml`; `findings/F-17.yaml`;
`decisions/OWNER-DECISION-F-17.md`; `shared-types/src/place.ts`; `places.repository.ts`;
`places.mapper.ts` (+spec); `places.service.ts`; `geo.service.ts`; `search/search.service.ts`
(+spec); `place.enums.ts`; `openapi.yaml`; `apps/web/src/modules/places/{types.ts,PlaceCard.tsx}`.

## 7. Files modified

| path | reason |
|---|---|
| `docs/api/openapi.yaml` | `PlaceCard` gains `status: $ref PlaceStatus` + rationale comment |
| `packages/shared-types/src/place.ts` | `score` removed from `PlaceCard`; doc block rewritten |
| `apps/api/src/modules/places/places.mapper.ts` | conditional `score` branch removed |
| `apps/api/src/modules/places/repositories/places.repository.ts` | `PlaceCardRow.score` **kept**, comment added naming its consumer |
| `apps/api/src/modules/places/places.mapper.spec.ts` | score assertion split out; 2 specs added |
| `packages/shared-types/dist/**` + `node_modules/@phuquochub/shared-types/dist/**` | rebuilt and re-copied (FAT32 copies, not symlinks) |

`search.service.ts`, `search.service.spec.ts`, `SearchResult`, `searchFullText`, `searchCount` —
**all untouched**.

## 8. Files created

`docs/delivery/reports/PLACE-018-placecard-contract-report.md`;
`docs/delivery/evidence/PLACE-018-placecard-contract-evidence-index.md`.

## 9. Serialization assessment — byte-identical, both directions

- **`status`:** runtime already set it unconditionally; only the *schema* changed. Zero payload delta.
- **`score`:** the removed branch never executed, because no `toPlaceCard` caller supplies a
  score-bearing row (four call sites swept: `geo.service.ts:32`, `places.service.ts:62/161/204`).
  Removing an unreachable branch cannot change output. Zero payload delta.

No other field was touched. The emitted-difference set is exactly `{}` — narrower than the
permitted `{status, score}`.

## 10. Validation commands (copied literally from PLACE-018.yaml)

```
cd apps/api && npx jest places
cd apps/api && npx jest search
cd apps/api && npx eslint "src/modules/places/**/*.ts" --max-warnings=0
cd apps/api && npx tsc -p tsconfig.json --noEmit
cd apps/web && npx tsc --noEmit
node -e "require('js-yaml').load(require('fs').readFileSync('docs/api/openapi.yaml','utf8'))"
```

## 11. Validation results

| # | command | exit | result |
|---|---|---|---|
| 1 | shared-types rebuild (`tsc -p tsconfig.json`) | **0** | `dist/place.{js,d.ts,js.map}` regenerated |
| 2 | re-copy into `node_modules/@phuquochub/shared-types/dist` | **0** | verified: `score` absent from the copied `.d.ts` |
| 3 | `npx jest places` | **0** | **107/107, 7 suites** (105 + 2 new) |
| 4 | `npx jest search` | **0** | **3/3** — specs UNMODIFIED |
| 5 | `npx eslint places --max-warnings=0` | **0** | clean |
| 6 | `npx tsc -p tsconfig.json --noEmit` (api) | **0** | clean |
| 7 | `npx tsc --noEmit` (**web**) | **0** | clean — the removal broke no consumer |
| 8 | openapi.yaml parse | **0** | parses |

Step 2 matters on this repository: `@phuquochub/*` in `node_modules` are FAT32 **copies**, not
workspace links, so skipping the re-copy would have type-checked both apps against a stale
declaration and produced a false green.

## 12. Acceptance-criteria matrix

| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | `score` absent from the public PlaceCard contract | yes | **PASS** | removed from shared type, mapper, and absent from openapi PlaceCard |
| AC2 | Report states which of documentation/runtime removal applied, on evidence | yes | **PASS** | §3, §5 — runtime + shared-type removal of dead surface; openapi never documented it; **not** live leakage |
| AC3 | `status` documented using the EXISTING enum, none invented | yes | **PASS** | §4 — `$ref PlaceStatus` |
| AC4 | Publication state, not business operating state | yes | **PASS** | §4; stated in the openapi comment and the shared-type doc block |
| AC5 | No internal moderation field added beyond the published enum | yes | **PASS** | only `status`; the enum was already public via `Place` |
| AC6 | api + web both type-check after rebuild and re-copy | yes | **PASS** | §11 cmds 6, 7 |
| AC7 | Mapper specs verify exact field behaviour | yes | **PASS** | `status` always present; `score` never present even when the row carries one; `distance_m` still conditional |
| AC8 | JSON compatibility impact recorded | yes | **PASS** | §9 — byte-identical, both halves, with reasons |
| AC9 | External-consumer uncertainty acknowledged | yes | **PASS** | §13 |
| AC10 | Existing list and detail behaviour still valid | yes | **PASS** | 107/107 with GAP-02/04 and PLACE-004/014/015 specs unmodified |
| AC11 | `npx jest search` exit 0 — search score undisturbed | yes | **PASS** | §11 cmd 4 |
| AC12 | SearchResult.score observation re-stated as still open | **no** | **PASS** | §14 |

## 13. Compatibility assessment

| change | class |
|---|---|
| document `status` on openapi PlaceCard | **No consumer impact** — payload unchanged; additive documentation |
| remove `score` from shared `PlaceCard` | **No consumer impact internally** — web tsc exit 0; nothing read it |
| remove mapper `score` branch | **No consumer impact** — branch was unreachable |
| keep `PlaceCardRow.score` | **No change** — avoided a would-be breaking change to SearchService |

**External API consumers: UNKNOWN and impossible to verify.** No version control, deployment,
telemetry, or client registry exists. Zero repository hits is not proof of absence. That said, the
external risk here is unusually low in a way that is provable: **no payload changed**, so no
external client can observe any difference. The only externally visible change is that the
published schema now describes a field clients were already receiving.

## 14. Scope-boundary item still open

`openapi.yaml:1913-1921` publishes `SearchResult.score` as a bare `type: number` on the public
`/search` operation (`security: []`) — an undefined numeric score that **is** already public. It
lies outside F-17 (different schema) and outside OD-F-17, and it was deliberately left untouched.
It stands in tension with the owner's "do not publish an undefined numeric score" principle and
needs **its own owner decision**. No finding identifier was minted for it.

## 15. Release-blocker reassessment for F-17

`findings/F-17.yaml` pre-committed four clearing conditions: openapi documents `status`; `score`
removed from the public contract; jest places + search green with both typechecks at exit 0; JSON
proven byte-identical. **All four are met**, so `release_blocker_status` moves `OPEN → CLEARED` on
pre-committed evidence.

Not resolved and explicitly carried forward: **F-24** — whether privileged and public cards should
share one schema — remains open, and this task did not settle it.

## 16. Explicit non-claims

Not claimed: production readiness; that the contract has been verified against a running server (no
deployment, no HTTP-level test, Docker absent); that external consumers have been identified or
ruled out; that F-24 or the `SearchResult.score` question is resolved. Byte-identity is argued from
the code paths — an unreachable branch and an already-emitted field — and from mapper specs, **not**
from a captured before/after HTTP response.
