# PLACE-017 — Evidence Index (F-6 OpenAPI ↔ runtime alignment, 2026-07-23)

Backs `docs/delivery/reports/PLACE-017-openapi-alignment-report.md`.

## Authority
| id | source | result | proves |
|---|---|---|---|
| S-1 | `state.yaml` `current` | `task: PLACE-017`, `status: ready` | execution authorized |
| S-2 | `tasks/PLACE-017.yaml` | 11 ACs, 3 validation commands, 4 stop conditions | scope/criteria authority |
| S-3 | `decisions/OWNER-DECISION-F-6.md` | OD-F-6, F6-A, **APPROVED** 2026-07-23 | documentation-follows-runtime is owner-approved |
| DEP-1 | `tasks/PLACE-016.yaml` | `status: completed`, AC1–AC9 PASS | dependency satisfied |

## Preflight — re-derived, not copied
| id | source | result | proves |
|---|---|---|---|
| B-1 | `places.dto.ts:98-113` | accepted = category, ward, price_range, page, limit | the runtime side of the matrix, read from source |
| B-2 | `main.ts:20` | `whitelist` + `forbidNonWhitelisted` | unknown params ⇒ **HTTP 400**, not ignored |
| B-3 | repo-wide grep `@nestjs/swagger\|ApiProperty\|ApiQuery\|SwaggerModule` | **zero hits** | no decorator layer to reconcile — obligation discharged by absence |
| B-4 | `find -name "openapi*"` | single `docs/api/openapi.yaml` | hand-maintained, checked in, only contract artifact |
| B-5 | `common/pagination.ts` + `api-response.ts:32-37` | emits page/pageSize/total/totalPages(+timestamp) | the declared `Meta` was wrong |
| B-6 | `places.service.ts:49-50` | `status` deliberately not forwarded | why F6-B was rejected — GAP-02/04 security fix |
| B-7 | `places.api.ts` | sends 5 active params, ignores `meta` | the only in-repo consumer is unaffected |

## Implementation
| id | source | result | proves |
|---|---|---|---|
| IMP-1 | `openapi.yaml` listPlaces | operation `description` documents published-only, fixed ordering, offset-only pagination, 400-on-unknown, no geo filters | AC5, AC6 |
| IMP-2 | `openapi.yaml` listPlaces | `page`/`limit` **inlined** instead of `$ref` | clamp documented WITHOUT mutating shared components other operations use |
| IMP-3 | `openapi.yaml` listPlaces | `status`/`sort`/`cursor` kept with `deprecated: true` + HTTP 400 note | AC7 — OD-F-6 obligation 7 |
| IMP-4 | `openapi.yaml` `Meta` | corrected; `next_cursor`/`quota_remaining` deprecated as "not emitted"; phantom `limit` removed | AC6, AC11 |
| IMP-5 | `api.md` §6 | ✅/❌ implementation markers + status banner | prose no longer contradicts the contract |
| IMP-6 | `api.md` §11 | list request line = true accepted set, with the `status` reason | AC1 |

## Validation output — executed 2026-07-23
| id | command | exit | result |
|---|---|---|---|
| VO-1 | js-yaml parse of `openapi.yaml` | **0** | parses after editing |
| VO-2 | contract check (8 assertions) | **0** | **CONTRACT CHECK PASSED** |
| VO-3 | `npx jest places` | **0** | **105/105, 7 suites — identical to pre-task** |
| VO-4 | `npx tsc -p tsconfig.json --noEmit` | **0** | clean |

VO-2 detail:

```
documented ACTIVE : category, limit, page, price_range, ward
runtime ACCEPTED  : category, limit, page, price_range, ward
[2] exact match (5 params)                       OK
[3] status/sort/cursor deprecated + HTTP 400     OK
[4] page default 1 / limit default 20 / max 100 / clamp documented   OK
[5] PriceRange enum matches place.enums.ts       OK
[6] Meta = timestamp/page/pageSize/total/totalPages (+2 deprecated)  OK
[7] no geo filters on /places                    OK
[8] no Swagger decorators to reconcile           OK
```

The check parses `ListPlacesQueryDto`'s property names out of the TypeScript source, so it compares
documentation against the compiler's truth rather than against a hand-written expectation.

VO-3 is the AC9 evidence: the spec count is unchanged because **no runtime file and no spec was
edited**; a documentation-only change cannot move it.

## Not executed / not claimed
| id | item | result | limitation |
|---|---|---|---|
| NX-1 | verification against a running server | NOT RUN | no deployment; Docker absent; alignment proven statically |
| NX-2 | external consumer identification | **IMPOSSIBLE** | no VCS, deployment, telemetry or client registry — hence deprecate, not delete |
| NX-3 | mutation check | **N/A** | documentation-only; there is no behaviour to mutate. `mutation_check_required: false` in the task file |
| NX-4 | GAP-05/10 resolution (should cursor/sort exist?) | NOT ATTEMPTED | parked product question; needs ADR-010 accepted (still `Proposed`) |
| NX-5 | `apps/web` tsc, `nest build`, e2e | NOT RUN | no shared contract changed |
| NX-6 | `git diff` | UNAVAILABLE | F-3 |

## Findings
| id | result | disposition |
|---|---|---|
| **F-6** | openapi + api.md + Meta reconciled with runtime; 3 unimplemented params deprecated with HTTP 400 notes | `implementation_status: DONE`, `validation_status: PASSED`, **`release_blocker_status: OPEN → CLEARED`** on conditions pre-committed in `findings/F-6.yaml` |
| F-6 residual | whether cursor/sort SHOULD exist (GAP-05/10) | unchanged — parked, needs ADR-010 accepted; NON-BLOCKING |

No other finding or release blocker was modified or downgraded.
