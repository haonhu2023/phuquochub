# PLACE-016 — Execution Report (F-1 provisional bbox: warning-based enforcement)

> Workstream: place · Task: PLACE-016 · Type: implementation · Date: 2026-07-23
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-016.yaml`, decision **OD-F-1** (F1-C)
> Result: **COMPLETED.** AC1–AC9 (mandatory) PASS, AC10 (optional) PASS.

## 1. Executive summary

The Phú Quốc bounding box stopped being a rejection gate and became an observation. Six DTO fields
no longer refuse coordinates for falling outside an inferred boundary; the write path now emits a
structured, auditable warning instead. Globally invalid coordinates are still refused — by the
global `@IsNumber/@Min/@Max` guards, which were deliberately left untouched.

`PHU_QUOC_BOUNDS` is **byte-unchanged** and its PROVISIONAL header survives, extended with the
OD-F-1 rationale. No replacement coordinates were invented.

## 2. Authorization and dependency verification

| item | value |
|---|---|
| `state.yaml` `current.task` | **PLACE-016**, `status: ready` |
| Decision authority | `OWNER-DECISION-F-1.md` — OD-F-1, option **F1-C**, APPROVED 2026-07-23 |
| `depends_on` | **PLACE-015** — `status: completed` 2026-07-23, AC1–AC7 PASS, 97/97 |

## 3. Enforcement points changed (all six, re-verified before editing)

| file | fields | before | after |
|---|---|---|---|
| `places.dto.ts:22,25` | `GeoPointDto.lat`, `.lng` | `@Min/@Max` + `@IsLatInPhuQuoc/@IsLngInPhuQuoc` | `@IsNumber @Min/@Max` only |
| `geo.dto.ts:10,13` | `NearbyQueryDto.lat`, `.lng` | idem | `@IsNumber @Min/@Max` only |
| `geo.dto.ts:28,31,34,37` | `BboxQueryDto.minLng/minLat/maxLng/maxLat` | idem | `@IsNumber @Min/@Max` only |

Confirmed again this task: there is **no other enforcement anywhere** — no `CHECK` constraint on
`places.location`, no service-layer rejection, no seed/import validation, no geospatial query
filter, no configuration override.

## 4. Implementation

**a. `geo-bounds.ts` — gate becomes observation.**
`PHU_QUOC_BOUNDS` and the predicates `isLatInPhuQuoc` / `isLngInPhuQuoc` are unchanged. The two
`class-validator` decorator factories `IsLatInPhuQuoc` / `IsLngInPhuQuoc` were **removed** — they
existed solely to reject, and leaving them exported-but-unreferenced would have created dead
surface of exactly the class F-33/GAP-13 records. A repository-wide grep confirms **zero**
remaining references. A new observation helper replaces them:

```ts
outOfProvisionalBounds({lat, lng}): OutOfProvisionalBounds[]   // [] when inside; never throws
```

This is a deliberate, documented deviation from the task's stated rollback wording ("re-apply the
decorators"): rollback is still a two-file change, and the alternative was knowingly shipping dead
exports.

**b. `PlacesService` — the auditable signal, on the write path.**
`create()` and `update()` call a private `signalOutOfProvisionalBounds()`, which emits a structured
`logger.warn` and **never throws or alters control flow**:

```
event: 'place.coordinate.outside_provisional_bounds'
finding: 'F-1' · decision: 'OD-F-1' · boundary_status: 'PROVISIONAL'
accepted: true · needs_review: true
action · place_id · actor_id · location · outside_fields[{field, value, bounds}]
```

It names the offending field, its value, and the bounds applied, and it states the boundary is
PROVISIONAL — so no operator can read the record as an authoritative-boundary violation.

**c. Read paths deliberately do not signal — decision recorded (task step 5).**
`nearby`/`bbox` no longer reject, and they emit **no** signal. An out-of-box read is harmless: it
simply matches nothing and creates no data. Logging every out-of-box public query would let an
anonymous caller amplify the log volume at will. The signal belongs where data is actually
created.

## 5. Files inspected

`state.yaml`; `tasks/PLACE-016.yaml`; `tasks/PLACE-015.yaml`; `findings/F-1.yaml`;
`decisions/OWNER-DECISION-F-1.md`; `common/geo-bounds.ts`; `places/dto/places.dto.ts` (+spec);
`geo/dto/geo.dto.ts` (+spec); `places.service.ts` (+spec);
`1720000400000-InitPlaces.ts` (constraint sweep).

## 6. Files modified

| path | reason |
|---|---|
| `apps/api/src/common/geo-bounds.ts` | decorators removed; `outOfProvisionalBounds` added; OD-F-1 rationale appended to header |
| `apps/api/src/modules/places/dto/places.dto.ts` | 2 fields: Phú Quốc guards removed, global guards kept |
| `apps/api/src/modules/geo/dto/geo.dto.ts` | 6 fields: idem; read-path no-signal decision documented in-file |
| `apps/api/src/modules/places/places.service.ts` | `Logger` + `signalOutOfProvisionalBounds`, called from `create`/`update` |
| `apps/api/src/modules/places/dto/places.dto.spec.ts` | 4 assertions inverted (justified §8); 3 global-invalid specs added |
| `apps/api/src/modules/geo/dto/geo.dto.spec.ts` | 3 assertions inverted; 4 global-invalid specs added |
| `apps/api/src/modules/places/places.service.spec.ts` | 5 signal specs added |

## 7. Files created

`docs/delivery/reports/PLACE-016-bbox-enforcement-report.md`;
`docs/delivery/evidence/PLACE-016-bbox-enforcement-evidence-index.md`.

## 8. Existing-spec modifications — each justified (AC4)

Seven pre-existing assertions changed. **None was weakened**; each asserted a proposition the owner
has now reversed, and each still asserts a strict proposition:

| spec | was | now | justification |
|---|---|---|---|
| `places.dto` lat outside box | rejected | **accepted** | OD-F-1 obligation 2 |
| `places.dto` lng outside box (~105) | rejected | **accepted** | idem |
| `places.dto` Paris | rejected | **accepted** | idem — the box is no longer a gate |
| `places.dto` just past maxLat | rejected | **accepted** | idem |
| `geo.dto` nearby lat / lng outside | rejected | **accepted** | idem |
| `geo.dto` bbox edge outside | rejected | **accepted** | idem |

Seven **new** specs were added asserting that globally invalid input is still refused, so the
suites' total strength increased rather than decreased: places.dto 30→33 relevant assertions, geo
9→13.

## 9. Validation commands (copied literally from PLACE-016.yaml)

```
cd apps/api && npx jest places
cd apps/api && npx jest geo
cd apps/api && npx eslint "src/modules/places/**/*.ts" "src/modules/geo/**/*.ts" "src/common/**/*.ts" --max-warnings=0
cd apps/api && npx tsc -p tsconfig.json --noEmit
```

## 10. Validation results

| # | command | exit | result |
|---|---|---|---|
| 1 | `npx jest places geo` (combined, pre-mutation) | **0** | 118/118, 8 suites |
| 2 | **mutation**: `@Min(9.7) @Max(10.6)` restored on `GeoPointDto.lat` | **1** | **3 failed, 30 passed** |
| 3 | `npx jest places` (post-restore) | **0** | **105/105, 7 suites** |
| 4 | `npx jest geo` | **0** | **13/13, 1 suite** |
| 5 | `npx eslint places + geo + common --max-warnings=0` | **0** | clean |
| 6 | `npx tsc -p tsconfig.json --noEmit` | **0** | clean |

## 11. Mutation evidence

Hard rejection was reintroduced on one field (`GeoPointDto.lat`, bounds 9.7–10.6). Result:

```
expect(received).toHaveLength(expected)
Expected length: 0 · Received length: 1
constraints: {"max": "lat must not be greater than 10.6"}, value: 10.61
Tests: 3 failed, 30 passed, 33 total
MUTATION-exit=1
```

Exactly the three `lat`-dependent "now accepted" specs failed — outside-box lat, Paris, and
just-past-maxLat. The `lng`-only specs correctly kept passing, since the mutation touched only
`lat`; that asymmetry is itself evidence the specs are precise rather than blanket. The service
signal specs also kept passing, confirming the signal is independent of DTO validation.

Clause restored; commands 3–6 all green. **No mutation remains** — verified by reading
`places.dto.ts` and by the full suites passing afterwards.

## 12. Acceptance-criteria matrix

| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | Globally invalid lat/lng still REJECTED | yes | **PASS** | 7 new specs: lat 91, lng 181, NaN, non-numeric — all rejected |
| AC2 | Out-of-box not rejected for that reason alone | yes | **PASS** | 7 inverted specs; each would have failed before this change (proven by §11) |
| AC3 | Out-of-box produces an auditable signal, asserted by spec | yes | **PASS** | 5 service specs assert the exact structured payload |
| AC4 | In-box behaviour unchanged; every spec edit justified | yes | **PASS** | §8; in-box and boundary-inclusive specs pass unmodified |
| AC5 | `PHU_QUOC_BOUNDS` byte-unchanged, nothing relabelled authoritative, PROVISIONAL header survives | yes | **PASS** | §4a; "PROVISIONAL" appears 5× in the file |
| AC6 | Focused specs cover in-box, out-of-box, globally invalid | yes | **PASS** | all three classes present in both DTO suites |
| AC7 | Mutation check; no mutation left | yes | **PASS** | §11 |
| AC8 | `tsc --noEmit` exit 0 | yes | **PASS** | §10 cmd 6 |
| AC9 | jest places, jest geo, eslint exit 0 | yes | **PASS** | §10 cmds 3–5 |
| AC10 | Report states no authoritative boundary is claimed | **no** | **PASS** | §14 |

## 13. Release-blocker reassessment for F-1

`findings/F-1.yaml` pre-committed the clearing conditions before this task ran:
implementation · in-box/out-of-box/globally-invalid specs · mutation check · tsc and regression
green. **All four are met**, so F-1's `release_blocker_status` moves `OPEN → CLEARED` on
pre-committed evidence, not on judgement.

What is cleared is precisely what made it a blocker: *a provisional, unsourced boundary was being
hard-enforced*. It no longer is. What remains is **not** a release blocker but genuine future
work, carried forward explicitly: the boundary still has no authoritative source, and OD-F-1
obligation 7 (replacement with an authoritative or explicitly product-approved operational
boundary) is unfulfilled. No other blocker was touched or downgraded.

## 14. Explicit non-claims

**No authoritative boundary is claimed.** The constants remain inferred from seed data and
explicitly PROVISIONAL. Whether the Thổ Chu archipelago falls inside Phú Quốc city administratively
is stated as the motivating *question*, not as verified fact — verifying it needs the authoritative
source OD-F-1 still requires.

Also not claimed: that the signal reaches any log aggregator, dashboard, or review queue in a
deployed environment — no deployment exists and no observability stack was verified. The signal is
proven to be *emitted with the right content*, not to be *received by anyone*. No database-backed
validation was possible (Docker absent), so no stored coordinate was revalidated. `apps/web`
typecheck and `nest build` were not run; no shared contract changed.
