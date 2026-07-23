# OD-F-1 — Phú Quốc provisional bounding box: hard rejection not approved

- **Decision ID:** OD-F-1
- **Related finding:** F-1 (PROVISIONAL Phú Quốc bounding box, actively enforced)
- **Decision status:** **APPROVED**
- **Chosen option:** **F1-C** — disable hard rejection based solely on the provisional bounding box
- **Owner:** Project Owner
- **Approval evidence:** owner instruction supplied in the "PLACE Owner Decision Approval — F-1, F-6, and F-17" session input, 2026-07-23. No individual approver name, job title, ticket, or meeting exists in repository context and none is asserted.
- **Decision date:** 2026-07-23
- **Review date:** on approval of an authoritative or explicitly product-approved operational boundary (no fixed calendar date recorded — none was supplied)

## Decision statement

The current Phú Quốc bounding box remains **PROVISIONAL** and **must not be treated as an
authoritative legal or administrative boundary**.

Until an authoritative boundary is approved:

1. the system **may continue to compute** whether a coordinate falls inside the provisional box;
2. being outside the provisional box **must not, by itself, cause otherwise valid Place data to
   be rejected**;
3. out-of-box coordinates **must** produce an auditable signal — a visible validation warning,
   structured log, metric, review flag, or equivalent;
4. **globally invalid latitude/longitude values and clearly impossible coordinates remain
   rejected**;
5. the provisional coordinates and their provisional source status **remain documented**;
6. F-1 is **not resolved** by this decision — it remains open until the approved behaviour is
   implemented and validated;
7. replacement with an authoritative or explicitly product-approved operational boundary
   **remains required future work**.

**No replacement coordinates are recorded by this decision.** Inventing them would recreate the
exact defect F-1 describes.

## Scope

Applies to the coordinate-boundary enforcement described below and to nothing else. It does not
change any other validation, any schema, any stored data, or any other finding.

## Rationale

The four constants in `apps/api/src/common/geo-bounds.ts:23-28`
(`minLat 9.7`, `maxLat 10.6`, `minLng 103.7`, `maxLng 104.2`) are derived, by the file's own
header, from observed seed-data coordinates plus a hand-chosen ~0.15–0.3° pad. The SSOT documents
they cite — `docs/api/api.md` §11 and `docs/product/modules/place.md:102` — require coordinates
to be "trong bao Phú Quốc" but **declare no constants**. The values are therefore classified
`Temporary provisional boundary`: no traceable legal, administrative, or operational source.

Hard-failing writes on an admittedly inferred number can refuse legitimate data. A concrete
plausible case — not verified against an authoritative source, and precisely the sort of question
this decision defers — is the Thọ Chu / Thổ Chu archipelago, which is understood to fall under
Phú Quốc city administratively and lies well outside both ranges.

## Alternatives considered

- **F1-A approve current coordinates as the operational boundary** — rejected: freezes an
  inferred number into product policy.
- **F1-B replace with an authoritative boundary** — not rejected; it remains the long-term
  requirement, but it cannot be executed now because no authoritative source is available.
- **F1-D keep blocked** — rejected: an owner decision is now available.

## Evidence

- `apps/api/src/common/geo-bounds.ts:23-28` — the four constants and the PROVISIONAL header.
- Enforcement points, DTO layer only (6 fields):
  `apps/api/src/modules/places/dto/places.dto.ts:22,25` (GeoPointDto → Create/Update);
  `apps/api/src/modules/geo/dto/geo.dto.ts:10,13` (NearbyQueryDto);
  `apps/api/src/modules/geo/dto/geo.dto.ts:28,31,34,37` (BboxQueryDto).
- **No other enforcement exists** — verified: no `CHECK` constraint on `places.location` in
  `1720000400000-InitPlaces.ts` (only `chk_media_one_owner`, `chk_price_amount_nonneg`); no
  service-layer check; no seed/import validation; no geospatial query filter; no configuration
  override.
- Global `@Min/@Max` lat/lng guards are applied alongside, as defense-in-depth, and are the
  guards that must survive this change.
- 21 existing DTO specs (12 `places.dto`, 9 `geo.dto`), including a Paris-coordinate rejection.
- `docs/delivery/reports/PLACE-002-implementation-report.md` — origin of the finding.
- `docs/delivery/reports/PLACE-010-release-readiness-assessment.md` — F-1 as BLOCKS_RELEASE.

## Compatibility impact

**Backward-compatible / additive at the API surface.** Requests previously answered `422` for
being out-of-box will begin to succeed. No request that previously succeeded will start failing.
Globally invalid coordinates continue to fail exactly as today.

## Security impact

Low but non-zero. The provisional box currently catches transposed or typo'd coordinates as a
side effect. That protection weakens; the compensating auditable signal (obligation 3) is what
replaces it, and the global lat/lng guards remain.

## Data impact

**No migration and no backfill.** Validation is write-path only and no seeded row is out of
bounds, so no stored data is invalidated or revalidated by this decision.

## Operational impact

A new out-of-bounds signal must be emitted and must be visible somewhere an operator will see it.
The exact mechanism is left to the implementation task; the decision requires only that the signal
be auditable.

## Implementation obligations

1. Remove out-of-box **rejection** from the six DTO fields while keeping the global lat/lng guards.
2. Emit an auditable out-of-box signal.
3. Keep `PHU_QUOC_BOUNDS` and its PROVISIONAL documentation intact and unrelabelled.
4. Do not introduce replacement coordinates.

Recorded as **PLACE-016** (proposed, not activated).

## Validation obligations

Focused specs for in-box, out-of-box, and globally invalid coordinates; a mutation check proving
the regression spec detects restoration of hard rejection; `tsc --noEmit`; affected regression
suites. Database-backed validation is **not** obtainable (Docker absent) and must not be claimed.

## Rollback / reversal conditions

Reversal is a code change, reversible in the same two files. This decision is superseded
automatically once an authoritative boundary is approved and recorded, at which point enforcement
policy must be re-decided.

## Finding state after this decision

`decision_status: APPROVED` · `implementation_status: PENDING` ·
`validation_status: PENDING` · `release_blocker_status: OPEN`

F-1 is **APPROVED FOR REMEDIATION**, not resolved.
