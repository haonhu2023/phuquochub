# PLACE-002 — Implementation Report

> Workstream: place · Task: PLACE-002 (implementation) · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-002.yaml`
> Result: **IN PROGRESS — implementation complete; mandatory validation BLOCKED (no Node runtime).**
> (Canonical §20 report; supersedes the earlier `PLACE-002-execution-report.md`.)

## 1. Executive Summary
Implemented GAP-07: Place coordinate inputs (`GeoPointDto`) and geo inputs
(`NearbyQueryDto`, `BboxQueryDto`) now enforce a Phú Quốc boundary ("validation biên",
per SSOT), and `NearbyQueryDto.radius` gained an explicit DTO-level `@Max` matching the
service cap. Change surface: two DTO files, one new shared constants/validator file, and
two spec files — no persistence, service, controller, mapper, or response-contract change.
The task's mandatory validation (jest specs, lint, type-check) **could not run** here
(no Node runtime; FAT-family volume). No success is fabricated. Because two mandatory
acceptance criteria depend on running the specs, PLACE-002 is **not** completed; it is
IN PROGRESS with a documented safe restart point.

## 2. Task Authority
`PLACE-002 — Place coordinate & geo-input validation (GAP-07)`, type `implementation`,
`docs/delivery/tasks/PLACE-002.yaml`. Dependency PLACE-001 = `completed` with report +
evidence index (verified by evidence, not label alone).

## 3. Initial Repository State
Not a git repository → branch/commit `unknown`. No Node runtime; `node_modules/@phuquochub/*`
unlinked (FAT32). No VCS-detectable pre-existing user changes; the changes below are solely
this task's (re-verified present this run via grep).

## 4. Problem Addressed
`GeoPointDto`/`NearbyQueryDto`/`BboxQueryDto` validated only global lat/lng ranges, not the
SSOT-required Phú Quốc boundary (`api.md:184`; `place.md:102` "nằm trong bao Phú Quốc (validation
biên)"); `NearbyQueryDto.radius` had `@Min(1)` but no `@Max` (cap existed only as a service comment,
`geo.service.ts:8` `MAX_RADIUS_M=50000`).

## 5. Approved Scope
In scope: `places/dto/places.dto.ts`, `geo/dto/geo.dto.ts`, `places/dto/places.dto.spec.ts`,
new `geo/dto/geo.dto.spec.ts`, one shared bbox-constant file (authorized). Out of scope
(respected): entities, migrations, services, controllers, repositories, mappers, OpenAPI/
response shape, GAP-05/10 list params.

## 6. Implementation Approach
New `common/geo-bounds.ts` exports a **PROVISIONAL** `PHU_QUOC_BOUNDS` plus reusable
class-validator decorators `@IsLatInPhuQuoc()`/`@IsLngInPhuQuoc()` (via `registerDecorator`;
class-validator already a dependency — no new deps). Applied **alongside** the existing global
`@Min/@Max` guards (defense-in-depth) on the lat/lng of all three DTOs. Added `@Max(50000)`
to `NearbyQueryDto.radius`, mirroring the service cap.

## 7. Files Changed
Created: `apps/api/src/common/geo-bounds.ts`; `apps/api/src/modules/geo/dto/geo.dto.spec.ts`.
Modified: `apps/api/src/modules/places/dto/places.dto.ts`; `apps/api/src/modules/geo/dto/geo.dto.ts`;
`apps/api/src/modules/places/dto/places.dto.spec.ts`. Total 5 files, all within `in_scope_files`.

## 8. Persistence Changes
Not applicable to the approved PLACE-002 task. No entity, migration, or seed touched.

## 9. API and Contract Changes
Request-validation tightening only: out-of-region coordinates and over-cap radius now yield
HTTP 400 via the global `ValidationPipe`. Response contract, field names, and OpenAPI shape
unchanged. This tightens accepted input (potentially breaking only for clients submitting
out-of-region coordinates, which violate the SSOT rule; no repository consumer does — §10).

## 10. Consumer Compatibility
| Consumer | Path | R/W | Impact | Status |
|---|---|---|---|---|
| Web create/edit Place | `apps/web/src/modules/places` | W | in-Phú-Quốc coords unaffected | not_verified (no Node) |
| Geo nearby/bbox | `apps/api/src/modules/geo` | R | intended tightening (400 on out-of-region) | not_verified |
| Seed data | `1720000900000`/`1720001600000` | — | all coords within bbox | compatible_without_change |
No external/production consumer verified (no telemetry); not claimed migrated.

## 11. Tests Added or Updated
`places.dto.spec.ts`: +6 GeoPointDto cases (valid in-bounds; out-of-bounds lat; out-of-bounds lng;
globally-valid-but-outside = Paris; inclusive upper boundary; just past boundary).
`geo.dto.spec.ts` (new): NearbyQueryDto (valid; radius omitted; radius in cap; radius over cap;
out-of-bounds lat; out-of-bounds lng) + BboxQueryDto (valid; edge out-of-bounds; inclusive boundary).

## 12. Validation Commands and Results
| Command | Result | Cause |
|---|---|---|
| `command -v node npx` | **NOT FOUND** (re-checked this run) | no Node.js runtime |
| `cd apps/api && npx jest places.dto` | **NOT EXECUTED** | `npx: command not found` |
| `cd apps/api && npx jest geo.dto` | **NOT EXECUTED** | no Node |
| `cd apps/api && npx eslint "src/modules/{places,geo}/**/*.ts" --max-warnings=0` | **NOT EXECUTED** | no Node |
| `cd apps/api && npx tsc -p tsconfig.json --noEmit` | **NOT EXECUTED** | no Node; FAT32 unlinks `@phuquochub/*` |
No pass claimed. CI reference: `.github/workflows/ci.yml`.

## 13. Security Review
Positive: bounded radius prevents an anonymous caller forcing a 50km+ `ST_DWithin` scan;
region bound reduces junk-coordinate injection. No authz change; validators are pure numeric
checks (no raw SQL); no sensitive-field exposure.

## 14. Performance Review
Negligible per-request cost (O(1) numeric comparisons). Positive: `radius @Max` caps spatial
scan input at the DTO boundary instead of a silent service clamp. No index/query change.

## 15. Migration and Rollback Review
No migration (out of scope). Rollback: revert the 3 modified files and delete the 2 new files;
no database/data/contract state involved — complete and non-destructive.

## 16. Deviations From Task Plan
None. The single new shared file is the task-authorized "single shared bbox constant" (extended
to hold the two small reusable validators to avoid duplicating the bound check).

## 17. Remaining Gaps
Phú Quốc bbox is **PROVISIONAL** (derived from seed coords + buffer; no authoritative numeric
bound documented). Owner confirmation required (PLACE-002 `open_question`/`stop_condition #1`).

## 18. Risks
- Validation unverified here (no Node): specs/lint/type-check must run on NTFS + Node ≥20 before
  trust/completion. Highest risk.
- PROVISIONAL bbox may reject/admit edge points until owner-confirmed.

> **ADDENDUM — 2026-07-22, after validation execution.** Sections 19–21 below were written
> while no Node runtime existed. All four validation commands have since been **executed and
> are green**: `jest places.dto` 12/12, `jest geo.dto` 9/9, `eslint` (places+geo) exit 0,
> `tsc --noEmit` exit 0. **AC1 and AC3 are now PASS**, so AC1..AC5 all PASS and PLACE-002 is
> **COMPLETED**. The §20 instruction not to create `PLACE-003.yaml` is therefore discharged —
> `docs/delivery/tasks/PLACE-003.yaml` now exists (GAP-06 partial index, type `migration`).
> The bbox remains PROVISIONAL; AC5 permits this, so it is carried as an open finding rather
> than an unmet criterion. Full command evidence: `evidence/PLACE-002-evidence-index.md`
> VO-5..VO-12. The original §19–21 text is retained unedited as a record of the blocked state.
>
> One nuance worth keeping: the first `tsc` run failed with 6 × `TS2307` on `@phuquochub/*`.
> That was **environmental** (FAT32 cannot create npm workspace symlinks), not a defect in
> this task — none of the 6 errors was in a PLACE-002 file, and all cleared once the packages
> were materialized in `node_modules/@phuquochub/`.

## 19. Acceptance-Criteria Evaluation
| # | Criterion (mandatory) | Result | Evidence |
|---|---|---|---|
| AC1 | Out-of-PQ coords rejected by Create/Update (GeoPointDto), Nearby, Bbox | **PARTIAL** | implemented (`places.dto.ts`,`geo.dto.ts`,`geo-bounds.ts`); runtime NOT VERIFIED |
| AC2 | `NearbyQueryDto.radius` explicit upper bound | **PASS** | `geo.dto.ts` `@Max(50000)` (structural) |
| AC3 | Specs cover cases and fail-before-change | **NOT VERIFIED** | specs written; jest NOT EXECUTED |
| AC4 | No entity/migration/service/controller/mapper/contract change | **PASS** | change register §7 (DTOs + specs + 1 const file) |
| AC5 | bbox sourced from SSOT or PROVISIONAL | **PASS** | `geo-bounds.ts` PROVISIONAL block + owner flag |
Mandatory AC1 (PARTIAL) and AC3 (NOT VERIFIED) not PASS → PLACE-002 cannot be completed.

## 20. Delivery-State Recommendation
Keep `PLACE-002` active, status **in_progress** (validation-blocked). Do **not** advance
`current.task` to PLACE-003, do **not** set `gates.implementation`, do **not** create
PLACE-003.yaml (§25 — mandatory criteria unmet). Safe restart: on NTFS + Node ≥20 with linked
workspace, run the four validation commands; if green → AC1/AC3 PASS → apply completion transition
(advance to PLACE-003, derive PLACE-003.yaml). If a spec fails, fix within the 5 in-scope files.
Also required before final completion: owner confirmation of the Phú Quốc bbox.

## 21. Explicit Non-Claims
Does not claim any unverified: test pass, lint pass, type-check pass, build, migration application,
backfill completion, consumer migration completion, deployment, canary success, hypercare completion,
production stabilization, or legacy cleanup readiness. All validation is NOT EXECUTED with cause;
the code is implemented but **not** runtime-verified.
