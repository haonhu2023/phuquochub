# TRANSPORT BROWSE FILTERS REPORT

**Date:** 2026-08-01
**Milestone:** Transport Browse Filters (backend only), per the approved governance recommendation
following the Media Upload Foundation milestone. Extends the existing `GET /transports` list
endpoint exactly as already specified in `docs/data/modules/transport.md` §8 — no new endpoint, no
schema change, no migration.

## 1. Files added

None. This milestone was scoped entirely to extending existing files (per plan: "Do not introduce
any new endpoint," "Do not modify Transport schema," "Do not create any migration").

## 2. Files modified

Backend:
- `apps/api/src/modules/transports/dto/transports.dto.ts` — added `transport_type`, `ward`,
  `pricing_model` (+ new `PRICING_MODEL_VALUES`/`PricingModel` type), `booking_required`,
  `airport_transfer` to `ListTransportsQueryDto`. New `toStrictBoolean()` transform for the two
  boolean query params (query strings are always strings — `'true'`/`'false'` coerced correctly;
  any other value is left as-is so `@IsBoolean()` rejects it with 400, avoiding the classic
  `Boolean('false') === true` JS bug).
- `apps/api/src/modules/transports/repositories/transports.repository.ts` — new
  `TransportListFilters` interface; new private `filterConds()` helper (mirrors
  `PlacesRepository.list()`'s parameterized-WHERE pattern); `listTransports()`/`countTransports()`
  both gained an optional 4th/1st `filters` parameter (default `{}}`, fully backward compatible).
- `apps/api/src/modules/transports/transports.service.ts` — `list()` builds a `filters` object
  from the DTO and passes it to both repository calls (mirrors `SearchService.search()`'s exact
  pattern from the Search Filters milestone).
- `apps/api/src/modules/transports/dto/transports.dto.spec.ts` — the old test asserting these 5
  fields were rejected (400) was necessarily updated: it now asserts they're accepted, with new
  validation coverage per field (valid values, enum rejection, tri-state boolean coercion,
  malformed-boolean rejection). `category`/`district`/`capacity_min`/`capacity_max`/`provider`
  remain asserted as still-rejected (unchanged behavior, per transport.md's own exclusion list).
- `apps/api/src/modules/transports/repositories/transports.repository.spec.ts` — new `filters`
  describe block: no-filter backward-compat, all-5-filters-combined placeholder-index correctness,
  single-filter isolation, the `booking_required=false` tri-state case, and a SQL-injection-style
  parameterization check for `ward`. Existing tests updated to none — all passed unmodified.
- `apps/api/src/modules/transports/transports.service.spec.ts` — updated the two assertions that
  checked `listTransports`'s exact call arguments (now includes the 4th `filters` argument); added
  2 new tests for filter pass-through and the `booking_required=false` edge case.
- `apps/api/test/wave2.e2e-spec.ts` — the one existing e2e test asserting `transport_type` was
  rejected (400) was updated to assert it's now accepted (200); added 4 more e2e cases (combined
  filters, invalid enum, malformed boolean, still-rejected `category`).
- `docs/api/openapi.yaml` — `GET /transports` parameters and summary updated.
- `docs/delivery/state.yaml` — governance entry added (see §6 of the delivery narrative below).

## 3. API changes

`GET /transports` gained 5 optional query parameters: `transport_type` (string, matches
`transport_types.code`), `ward` (string, matches via `EXISTS` on `transport_service_areas`),
`pricing_model` (enum, `$ref: PricingModel`), `booking_required`/`airport_transfer` (boolean,
tri-state — `false` does not match `NULL`). All additive; existing `sort`/`page`/`limit` and the
response envelope are unchanged. `category`/`district`/`capacity_min`/`capacity_max`/`provider`
remain rejected `400`, unchanged.

## 4. Validation results

| Check | Result |
|---|---|
| DTO validation (`transports.dto.spec.ts`) | pass (28 tests, up from 8) |
| Repository tests (`transports.repository.spec.ts`) | pass (all filter + pre-existing tests) |
| Service tests (`transports.service.spec.ts`) | pass (updated + 2 new) |
| Controller tests | none exist for this module (no permission/throttle metadata to test — `@Public()` only, consistent with the repository's own convention of not writing metadata-only controller specs for unauthenticated routes) |
| Relevant e2e (`wave2.e2e-spec.ts`) | pass, 15/15, live against real Postgres/PostGIS/Redis |
| Full backend unit suite | **80 suites / 824 tests passed** (up from 80/800) |
| Full e2e suite | confirmed in §5 |
| Typecheck | clean |
| Lint | clean |

## 5. Build results

- Full monorepo build (`npm run build`, turbo): **4/4 tasks succeeded**, no cache-poisoning
  warning — the build-determinism fix from the Search Filters post-implementation review re-
  confirmed still holding. Compiled `dist/modules/transports/*.js` confirmed present.
- Full e2e suite: **12 suites / 95 tests passed** (up from 91) — zero regression.
- Full backend unit suite: **80 suites / 824 tests passed** (up from 800).

**Note on the "live MinIO verification" validation item:** this milestone never touches
`StorageService`/object storage — `GET /transports` reads only `places`/`place_transport_details`/
`transport_types`/`transport_service_areas`. There is nothing MinIO-specific to verify for this
feature itself. The full e2e suite run above does include `media.e2e-spec.ts` (which performs a
real MinIO round trip) as part of the standard zero-regression check, so MinIO connectivity was
exercised incidentally, but no MinIO-specific verification was performed *for* Transport Browse
Filters, since none applies. Flagging this explicitly rather than fabricating a MinIO-relevant
check that doesn't exist for this change.

## 6. Documentation updates

- `docs/api/openapi.yaml`: `GET /transports` parameters + summary updated to match the real,
  now-implemented filter set.
- `docs/data/modules/transport.md` §8 already described this exact filter set as "PROPOSED" per
  the earlier governance reconciliation — **not modified again here** since its own design
  content was already accurate (this milestone implemented it exactly as written); only the
  top-of-section status framing would need a follow-up flip from "PROPOSED" to "implemented,"
  which is a smaller documentation touch-up left as a minor remaining item (see §7) rather than
  bundled into this backend-scoped delivery.
- `docs/delivery/state.yaml`: governance entry recording this milestone, following the established
  ad-hoc convention.

## 7. Remaining transport roadmap

- `docs/data/modules/transport.md` §8's status banner still says "bộ lọc mở rộng vẫn PROPOSED" —
  now stale (this milestone implemented exactly that). A follow-up documentation touch-up (not a
  code change) should flip this banner; not done here to keep this delivery strictly scoped to
  the approved backend filter implementation.
- **No public Transport browse page exists on the frontend** (unlike Hotels/Restaurants/Tours/
  Attractions/Beaches) — explicitly out of scope for this milestone and not started, per
  instruction ("Do not begin a frontend Transport browse page").
- `capacity_min`/`capacity_max` filtering remains deferred (transport.md's own stated reason: no
  real `capacity_passengers` data exists yet to filter meaningfully) — unchanged.
- `district`/`provider` filters remain out of scope (no column / Business ownership unmigrated) —
  unchanged.

## 8. Final git status

Clean after commit (confirmed via `git status --short`).

## 9. Commit hash

Recorded after committing, in the same message as this report's final delivery.
