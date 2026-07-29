# PhuQuocHub — Booking Request Foundation (2026-07-29)

**Authority:** Session opened as "audit-trước-implement" for the Booking domain — read-only
assessment first, implement only if no Owner decision blocks a minimal slice. No conflicting
architecture decision was found (see report §1–§3 below); proceeding follows the same convention
as `MVP-REVIEWS-FEATURE-2026-07-26.md` and `MVP-GAP-ANALYSIS-AND-ROADMAP-2026-07-25.md` — a
standalone report, not a new `PLACE-0xx.yaml` (Owner instruction on record, 2026-07-26: "priority
is PRODUCT COMPLETION", do not create new governance tasks unless implementation requires them).

## 1. Repository truth (verified fresh this session)

Branch `master`, HEAD `d9ac9d9` at start, clean tree. Docker daemon unreachable this session
(`npipe:////./pipe/dockerDesktopLinuxEngine` — same constraint as the last two sessions' reports).
No Postgres/Redis available; migrations were written and structurally tested but **not run
against a live database** (see §6).

Confirmed **zero** pre-existing Booking/reservation/payment/refund/invoice/voucher/inventory-hold/
commission/settlement implementation anywhere in `apps/api`, `apps/web`, or `docs/data|product/
modules` — genuinely greenfield. Also confirmed: no payment provider or notification provider
config anywhere (`.env.example` clean; `modules/notifications` is still `.gitkeep`-only).

## 2. Design decisions made, and the precedent each one follows

No new architecture was invented — every non-trivial choice below directly copies an existing,
Accepted pattern already in this repository:

- **`bookings.entity_type` / `entity_id` is polymorphic, app-enforced, no hard FK** — this is
  [ADR-003](../../99-decisions/ADR-003-no-polymorphic.md)'s explicitly named exception class
  (multi-owner, cross-module, reference-like), and copies `price_history.entity_type/entity_id`
  column-for-column (`apps/api/src/modules/prices/entities/price-history.entity.ts:25-29`).
- **`bookings.place_id` is a real FK → `places(id)`, `ON DELETE NO ACTION`** — Place is the core
  entity ([ADR-001](../../99-decisions/ADR-001-place-is-core.md)); `NO ACTION` (not `CASCADE`) was
  chosen because a booking is a financial/audit record that must not silently disappear if a place
  row is ever hard-deleted (places are normally soft-deleted via `deleted_at`).
  `BookingsService.create` cross-checks `entity_type` against the place's real category
  (`PlacesRepository.existsByIdAndCategorySlug`, new) so a client can't claim `entity_type='hotel'`
  for a `place_id` that is actually a restaurant.
- **No dependency on Business ownership (`business_claims`/`business_members`)** — those tables are
  Accepted-on-paper but **not migrated** (0 rows in any live DB), exactly the situation
  [ADR-017](../../99-decisions/ADR-017-transport-domain-foundation.md) already handled for
  Transport ("tự động claim được khi ADR-015 migrate, không cần việc gì thêm"). `place_id` alone
  anchors the booking; no `business_id` column exists in this foundation slice.
- **Booking audit trail reuses the existing generic `AuditService`**
  (`apps/api/src/core/audit/audit.service.ts`) rather than a new `booking_audit_log` table — it
  already redacts sensitive keys and is exactly the ADR-016 append-only polymorphic pattern the
  target model calls for. Not wired into a call site yet (no status-transition endpoint exists
  yet to audit — see §5).
- **Three separate status columns** (`booking_status`/`payment_status`/`fulfillment_status`), each
  its own Postgres enum type — matches the mission requirement directly and mirrors how this
  repository already keeps `places.status` and `verification_status` as distinct concepts.
- **`GET /bookings/:code` requires authentication + an ownership check** (booking must belong to
  the requesting user), not a fully public lookup by code. This is the one judgment call without a
  direct precedent to copy: a public "find by unguessable code" pattern doesn't exist elsewhere in
  this repo, and a booking carries financial data, so authenticated-owner-only was chosen as the
  safer default. Revisit if a true guest (no-account) confirmation-link flow is wanted later — that
  needs `booking_guests`, explicitly out of scope here.
- **`BookingItem` = a line item within one booking** (e.g. "2× Adult ticket"), not a multi-vendor
  basket — because `entity_type/entity_id/place_id` (which satellite is being booked) already lives
  on `Booking` itself; a basket-of-different-places model was not requested and would be
  speculative. `booking_discounts`/`booking_commissions`/etc. (domain groups C–E) are entirely
  absent, as instructed — `discount`/`fees` columns exist (per the target field list) but are
  hardcoded to `0` by the service; no voucher/discount engine was built.

## 3. What was implemented

### Backend (`apps/api`)
- `1720002400000-InitBooking.ts` — `bookings` + `booking_items` tables, 3 new enum types
  (`booking_status`, `booking_payment_status`, `booking_fulfillment_status`), indexes on
  `(entity_type, entity_id)`, `(customer_user_id, created_at)`, `(place_id)`,
  `(booking_id)`. Fully additive; `down()` drops both tables + all 3 enums.
- `1720002500000-SeedBookingPermissions.ts` — `Booking.Create`/`Booking.View`, both granted to the
  `member` role (every registered user), same template as `SeedReviewPermissions`.
- `modules/bookings/` — `Booking`/`BookingItem` entities, `booking.enums.ts`, `booking-code.ts`
  (Crockford-reduced-alphabet random code generator, excludes `0/O/1/I/L`), DTO
  (`CreateBookingDto`/`CreateBookingItemDto`, full `class-validator` coverage), repository
  (transactional create — booking + all items in one DB transaction, so a booking can never persist
  with zero items), service (place/category cross-check, unique-code retry loop, ownership-checked
  read), controller (`POST /bookings` behind `Booking.Create` + a 10-req/min throttle;
  `GET /bookings/:code` behind `Booking.View` + ownership), mapper (snake_case response,
  **`internal_note` and `customer_user_id` are never serialized to the API response** — verified by
  a mapper unit test asserting their absence).
- `PlacesRepository.existsByIdAndCategorySlug` — new, minimal addition (same pattern as
  `existsById`, added for `ReviewsService.create` previously).
- Registered `BookingsModule` in `app.module.ts`.

### Not implemented (explicitly out of scope, per the mission's own exclusion list)
Real payment integration, inventory holds/realtime availability, `booking_customers`/
`booking_guests` (customer reference is a single minimized `customer_user_id` column),
`booking_discounts`/`booking_commissions`/`booking_settlements`, `booking_refunds`/
`booking_invoices`, `booking_cancellations`/`booking_changes`/`booking_fulfillment` (as a separate
table)/`booking_vouchers`/`booking_communications`/`booking_documents`, a separate
`booking_audit_log` table (reuses `audit_logs`, not yet wired to a call site), any admin/staff view
of bookings belonging to other users, e2e tests (needs a live DB — see §6).

## 4. Privacy / security rules applied

- No PAN/CVV/password/API key/token stored anywhere — there is no payment integration to store one
  for.
- Customer reference minimized to a single `customer_user_id` FK — no name/address/phone
  duplicated onto the booking row.
- `internal_note` never leaves the mapper (staff-only field, no endpoint exposes it yet).
- `booking_code` is a random 8-character code from a 31-symbol alphabet (~39 bits entropy) with
  ambiguous characters removed for manual transcription; existence-checked before use with a
  bounded retry (5 attempts) rather than trusted as collision-free.
- `GET /bookings/:bookingCode` returns `404 NotFound` for both "doesn't exist" and "exists but
  isn't yours" — does not leak which case it is.
- Booking status, payment status, and fulfillment status are three separate columns (never
  conflated), so a payment-state bug can't silently flip fulfillment or vice versa.
- `POST /bookings` is throttled (10/min) as a basic anti-abuse measure, mirroring the existing
  `auth` endpoints' pattern.

## 5a. Same-session refinement (post-review pass against the exact spec)

A follow-up instruction restated the slice with precise naming and one explicit rule ("don't
expose the database id when a public id exists"). Applied directly, no redo of already-correct
work:

- `CreateBookingDto` renamed to `CreateBookingRequestDto` (exact requested name) across the DTO,
  service, controller, and DTO spec.
- Route param renamed `:code` → `:bookingCode` in `BookingsController` (matches
  `GET /bookings/:bookingCode` literally).
- `BookingResponse.id` (the internal UUID) removed from the mapper output — `booking_code` is now
  the *only* identifier `toBooking()` returns. `BookingItemResponse.id` was kept (items have no
  public-code alternative and never leave an already owner-scoped response). Mapper test updated
  to assert `id` is absent, matching the existing `internal_note`/`customer_user_id` exclusion
  pattern. Note this makes Booking's response *stricter* than the existing Review/Place responses
  (which do expose their own `id` alongside `slug` — no public-id-hiding convention existed
  anywhere else in this repo before this feature; this is a new, deliberately narrower choice for
  Booking specifically, not a correction of a prior inconsistency).
- Re-ran full validation after the rename/removal (§5) — all green, no regression.

## 5. Validation

| Check | Result |
|---|---|
| `apps/api`: `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `apps/api`: `npx eslint "src/**/*.ts" --max-warnings=0` | exit 0 |
| `apps/api`: `npx jest --silent` | **62 suites / 558 tests passed** (all pre-existing suites
  unaffected; new: booking-code, InitBooking migration structure, bookings dto/mapper/service/
  repository, `PlacesRepository.existsByIdAndCategorySlug`) |
| root: `npm run typecheck` (turbo, all 5 packages) | 6/6 tasks passed |
| root: `npm run lint` (turbo, all 5 packages) | 6/6 tasks passed |
| root: `npm run build` (turbo, all 4 buildable packages) | 4/4 tasks succeeded — `apps/web` still
  builds clean (17/17 routes), zero backend-only change leaked into frontend |

## 6. Known limitation — disclosed, not worked around

**The new migrations were never run against a live database** — Docker unreachable this session
(no daemon, same as the environment constraint recorded in `MVP-REVIEWS-FEATURE-2026-07-26.md` and
several `PLACE-03x` reports). The migration SQL was structurally tested (mocked `QueryRunner`,
asserting exact `CREATE TABLE`/FK/constraint text — the same technique already used for
`InitTransport`/`InitAuditLogs`), but **has not been executed**. Whoever next has a local Postgres
(or restores Docker) should run `npm run migration:run --workspace=apps/api` and watch specifically
for constraint-name collisions — the one class of bug static review and mocked-runner tests cannot
catch.

**No e2e test was added** — the existing e2e suite requires a live Postgres/Redis, which this
session does not have. This is a real gap, not a decision to skip testing; a `bookings.e2e-spec.ts`
covering create→read-by-code should be added once the migration has actually been run once.

**No live HTTP exercise of the new endpoints** — same root cause (no runnable API+DB). `nest build`
and the full turbo build prove the code compiles and doesn't break anything else; they do not prove
`POST /bookings` actually persists correctly end-to-end against Postgres.

## 7. Not claimed

- Does not claim the Booking domain is feature-complete — this is explicitly the smallest
  executable slice (create + read-by-code only). Payment, inventory/availability, cancellation,
  refund, invoice, commission, settlement, guest checkout, and any staff/admin booking view are all
  future work, each requiring its own design pass (most need Hotel/Tour/Event sub-item tables —
  e.g. room types, ticket types — that don't exist yet either).
- Does not claim the migration has been run against a real database (§6).
- Does not claim e2e coverage exists for this feature (§6).
- Does not create a new `PLACE-0xx` task file, per the recorded Owner instruction to prioritize
  product completion over new governance overhead.
