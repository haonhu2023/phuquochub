# PLACE-018 — Evidence Index (F-17 PlaceCard contract alignment, 2026-07-23)

Backs `docs/delivery/reports/PLACE-018-placecard-contract-report.md`.

## Authority
| id | source | result | proves |
|---|---|---|---|
| S-1 | `state.yaml` `current` | `task: PLACE-018`, `status: ready` | execution authorized |
| S-2 | `tasks/PLACE-018.yaml` | 12 ACs, 6 validation commands, 5 stop conditions | scope/criteria authority |
| S-3 | `decisions/OWNER-DECISION-F-17.md` | OD-F-17, F17-D, **APPROVED** 2026-07-23 | both dispositions are owner-approved |
| DEP-1 | `tasks/PLACE-017.yaml` | `status: completed`, AC1–AC10 PASS | dependency satisfied |

## Mandatory premise re-verification (execution step 1)
| id | source | result | consequence |
|---|---|---|---|
| PV-1 | 4 `toPlaceCard` call sites: `geo.service.ts:32`, `places.service.ts:62/161/204` | **none** supplies a score-bearing row | public `score` is unreachable — premise HOLDS |
| PV-2 | `openapi.yaml` `PlaceCard` (pre-edit) | `score` **not** documented | ⇒ runtime/shared-type removal, NOT documentation removal |
| PV-3 | `openapi.yaml:1680` + `:1778` | `PlaceStatus` declared AND already applied to public `Place` | ⇒ documenting `status` on `PlaceCard` discloses nothing new |
| **PV-4** | **`search.service.ts:24`** | **`score: r.score !== undefined ? Number(r.score) : 0`** | **`PlaceCardRow.score` is LIVE, not dead — premise FAILS for this one location** |

PV-4 is the correction this task exists to catch. `searchFullText` returns `PlaceCardRow[]` and
`SearchService` reads `score` off it to build `SearchResult`. The prior analysis ("declared in three
places, reachable by nothing") was right about the public contract and **wrong** about the row type.
Removing `PlaceCardRow.score` would have broken a module the task's `out_of_scope` protects and
contradicted OD-F-17's own retention clause. Resolution: remove the two dead declarations, **keep**
the row field with a comment naming its consumer.

## Implementation
| id | source | result | proves |
|---|---|---|---|
| IMP-1 | `openapi.yaml` `PlaceCard` | `status: $ref PlaceStatus` added, no member invented | AC3, AC4, AC5 |
| IMP-2 | `shared-types/src/place.ts` | `score?: number` removed from `PlaceCard`; doc block rewritten | AC1 |
| IMP-3 | `places.mapper.ts:28-30` | conditional `score` branch removed (it never executed) | AC1, AC2 |
| IMP-4 | `places.repository.ts` `PlaceCardRow` | `score` **KEPT** + comment naming `search.service.ts:24` | PV-4 |
| IMP-5 | `search/**` | byte-unchanged | AC11, out_of_scope respected |
| IMP-6 | `places.mapper.spec.ts` | 2 specs added: score never emitted even when the row carries one; status always present | AC7 |

## Build / link handling (FAT32)
| id | step | exit | result |
|---|---|---|---|
| BL-1 | `npx tsc -p tsconfig.json` in `packages/shared-types` | **0** | `dist/place.{js,d.ts,js.map}` regenerated |
| BL-2 | copy `dist/*` → `node_modules/@phuquochub/shared-types/dist/` | **0** | verified: `score` absent, new doc block present in the COPIED `.d.ts` |

Required because `@phuquochub/*` are FAT32 **copies**, not workspace symlinks. Skipping BL-2 would
have type-checked both apps against a stale declaration and produced a **false green**.

## Validation output — executed 2026-07-23
| id | command | exit | result |
|---|---|---|---|
| VO-1 | `npx jest places` | **0** | **107/107, 7 suites** (105 + 2 new) |
| VO-2 | `npx jest search` | **0** | **3/3** — specs UNMODIFIED |
| VO-3 | `npx eslint places --max-warnings=0` | **0** | clean |
| VO-4 | `npx tsc -p tsconfig.json --noEmit` (api) | **0** | clean |
| VO-5 | `npx tsc --noEmit` (**web**) | **0** | clean — removal broke no consumer |
| VO-6 | openapi.yaml parse | **0** | parses |

VO-5 is the load-bearing evidence for AC6: `apps/web` re-exports the shared `PlaceCard`, so a
consumer of the removed field would have failed here.

## Serialization / JSON compatibility (AC8)
| change | payload delta | why |
|---|---|---|
| document `status` on openapi PlaceCard | **none** | runtime already emitted it unconditionally; only the schema changed |
| remove `score` from shared type + mapper | **none** | the branch never executed — no caller supplies a score-bearing row (PV-1) |

Emitted-difference set = **{}**, narrower than the permitted `{status, score}`.

## Not executed / not claimed
| id | item | result | limitation |
|---|---|---|---|
| NX-1 | before/after HTTP response capture | NOT RUN | no deployment, Docker absent; byte-identity argued from code paths + mapper specs |
| NX-2 | external consumer identification | **IMPOSSIBLE** | no VCS, deployment, telemetry, client registry |
| NX-3 | mutation check | **N/A** | `mutation_check_required: false`; the equivalent proof is PV-1 + tsc exit 0 in BOTH apps |
| NX-4 | F-24 (privileged vs public card schema) | NOT ATTEMPTED | explicitly out of scope; still OPEN |
| NX-5 | `SearchResult.score` (public undefined number) | NOT TOUCHED | different schema, outside F-17; needs its own owner decision |
| NX-6 | `nest build`, e2e, `git diff` | NOT RUN / UNAVAILABLE | Docker absent; F-3 |

## Findings
| id | result | disposition |
|---|---|---|
| **F-17** | `status` documented with the existing enum; `score` removed from the public contract; payload byte-identical | `implementation_status: DONE`, `validation_status: PASSED`, **`release_blocker_status: OPEN → CLEARED`** on conditions pre-committed in `findings/F-17.yaml` |
| F-17 correction | `PlaceCardRow.score` is live (`search.service.ts:24`), not dead — retained | recorded; OD-F-17's literal three-way removal amended by evidence |
| F-24 | privileged vs public card schema | unchanged — OPEN, NON-BLOCKING |
| SearchResult.score | undefined numeric score already public on `/search` | carried forward; needs its own owner decision; **no finding id minted** |
