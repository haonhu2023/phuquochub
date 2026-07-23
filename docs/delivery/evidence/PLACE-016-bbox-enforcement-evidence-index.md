# PLACE-016 — Evidence Index (F-1 warning-based bbox enforcement, 2026-07-23)

Backs `docs/delivery/reports/PLACE-016-bbox-enforcement-report.md`.

## Authority
| id | source | result | proves |
|---|---|---|---|
| S-1 | `state.yaml` `current` | `task: PLACE-016`, `status: ready` | execution authorized before any edit |
| S-2 | `tasks/PLACE-016.yaml` | 10 ACs, 4 validation commands, mutation REQUIRED | scope/criteria authority |
| S-3 | `decisions/OWNER-DECISION-F-1.md` | OD-F-1, F1-C, **APPROVED** 2026-07-23 | the behaviour change is owner-approved, not self-authorized |
| DEP-1 | `tasks/PLACE-015.yaml` | `status: completed`, AC1–AC7 PASS, 97/97 | dependency satisfied |

## Baseline (re-verified before editing)
| id | source | result | proves |
|---|---|---|---|
| B-1 | `places.dto.ts:22,25` | `@Min/@Max` + Phú Quốc decorators | 2 of 6 enforcement points |
| B-2 | `geo.dto.ts:10,13,28,31,34,37` | idem | remaining 4 + 2 |
| B-3 | `1720000400000-InitPlaces.ts` | only `chk_media_one_owner`, `chk_price_amount_nonneg` | **no DB-side coordinate constraint** |
| B-4 | repo-wide grep | no service check, no seed validation, no query filter, no config override | DTO was the ONLY gate |

## Implementation
| id | source | result | proves |
|---|---|---|---|
| IMP-1 | `geo-bounds.ts` | `PHU_QUOC_BOUNDS` byte-unchanged; "PROVISIONAL" appears **5×** | AC5 |
| IMP-2 | `geo-bounds.ts` | `IsLatInPhuQuoc`/`IsLngInPhuQuoc` removed; grep → **0 references repo-wide** | gate removed, no dead exports left |
| IMP-3 | `geo-bounds.ts` | `outOfProvisionalBounds()` added — returns `[]` inside, never throws | observation replaces rejection |
| IMP-4 | `places.service.ts` | `signalOutOfProvisionalBounds()` on `create` + `update` | AC3 — signal on the WRITE path |
| IMP-5 | `geo.dto.ts` header | read paths deliberately do NOT signal, with reason | task step 5 decision recorded either way |

## Validation output — executed 2026-07-23
| id | command | cwd | exit | result |
|---|---|---|---|---|
| VO-1 | `npx jest places geo` (pre-mutation) | `apps/api` | **0** | 118/118, 8 suites |
| VO-2 | **mutation**: `@Min(9.7) @Max(10.6)` on `GeoPointDto.lat` | `apps/api` | **1** | **3 failed, 30 passed** — the three lat-dependent "now accepted" specs |
| VO-3 | `npx jest places` (post-restore) | `apps/api` | **0** | **105/105, 7 suites** |
| VO-4 | `npx jest geo` | `apps/api` | **0** | **13/13** |
| VO-5 | `npx eslint places + geo + common --max-warnings=0` | `apps/api` | **0** | clean |
| VO-6 | `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean |

VO-2 detail — the required mutation evidence:

```
constraints: {"max": "lat must not be greater than 10.6"}, value: 10.61
Tests: 3 failed, 30 passed, 33 total
```

Only `lat`-dependent specs failed; `lng`-only specs and the service-signal specs kept passing.
That asymmetry proves the specs pin the specific field rather than asserting a blanket condition.
VO-3/VO-4 confirm no mutation remained.

## Coverage of the three required cases
| case | example | expected | spec location |
|---|---|---|---|
| in-box | 10.2145 / 103.9603 | accepted, **no signal** | `places.dto.spec`, `places.service.spec` |
| out-of-box | 9.3 / 103.47 (~Thổ Chu), Paris, maxLat+0.01 | **accepted + signal** | both DTO specs + 5 service specs |
| globally invalid | lat 91, lng 181, NaN, "mười" | **rejected** | 7 new specs across both DTO suites |

## Not executed / not claimed
| id | item | result | limitation |
|---|---|---|---|
| NX-1 | authoritative Phú Quốc boundary | **NOT OBTAINED** | OD-F-1 obligation 7 remains future work; no coordinates invented |
| NX-2 | Thổ Chu administrative status | **NOT VERIFIED** | stated as the motivating question, not as fact |
| NX-3 | signal reaching a log aggregator / review queue | NOT RUN | no deployment, no observability stack; only emission is proven |
| NX-4 | DB-backed revalidation of stored coordinates | NOT RUN | Docker absent; validation is write-path only |
| NX-5 | `apps/web` tsc, `nest build`, e2e | NOT RUN | no shared contract changed; Docker absent |
| NX-6 | `git diff` | UNAVAILABLE | F-3 |

## Findings
| id | result | disposition |
|---|---|---|
| **F-1** | hard rejection on a PROVISIONAL boundary **REMOVED**; auditable signal added; globally invalid still rejected | `implementation_status: DONE`, `validation_status: PASSED`, **`release_blocker_status: OPEN → CLEARED`** on the conditions pre-committed in `findings/F-1.yaml` |
| F-1 residual | boundary still has **no authoritative source** | carried forward as NON-BLOCKING future work (OD-F-1 obligation 7) |

No other finding or release blocker was modified, downgraded, or re-classified.
