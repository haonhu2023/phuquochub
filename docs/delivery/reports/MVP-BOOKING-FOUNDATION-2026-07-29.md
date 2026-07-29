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

## 5b. Second refinement pass — full domain-review checklist

A subsequent instruction ran a detailed point-by-point domain review (identity, items, initial
state, time, currency/trust-boundary, privacy, public lookup, migration structure, required test
list, Node version). Gaps found and fixed, each verified against the running code (not assumed):

- **Migration:** added two missing indexes to `InitBooking` (never executed against a live DB, so
  amending in place rather than adding a third migration — see the disclosed limitation in §6):
  `idx_bookings_status` (`booking_status`) and a partial `idx_bookings_service_start`
  (`service_start_at WHERE ... IS NOT NULL`). Migration structure test updated to assert both.
- **Cross-field date validation (real gap, now fixed):** `service_end_at` had no check against
  `service_start_at` — added a small custom `class-validator` decorator (`IsAfter`, first of its
  kind in this repo; no prior date-range validator existed to copy) requiring `service_end_at`
  strictly after `service_start_at` when both are present; no-op when either is missing (handled by
  `@IsOptional`/`@IsISO8601` already). 4 new DTO tests (after/before/equal/one-missing).
  Rejected-equal case is deliberate: "after" means strictly after, an instant booking can't span
  zero duration.
- **`bookingCode` format validation (real gap, now fixed):** `GET /bookings/:bookingCode` accepted
  any string and queried the DB directly. Added `isValidBookingCodeFormat` (exported from
  `booking-code.ts`, checks length + alphabet) and a `BadRequestException` in
  `BookingsService.getByCodeForUser` before any DB call. 5 new rejection cases tested (empty, wrong
  length, wrong alphabet including old-style `CODE0001`, a SQL-metacharacter string — the last one
  to document that this is a format gate, not the injection defense; TypeORM's parameterized query
  already prevented injection regardless).
- **Rate limiting on the read endpoint (real gap, now fixed):** only `POST /bookings` was
  throttled. Since `GET /bookings/:bookingCode` relies on a ~40-bit code plus ownership rather than
  a full separate secret, added `@Throttle` (30/min) so a valid-but-malicious account can't
  brute-force codes belonging to other users unboundedly. Verified via a new
  `bookings.controller.spec.ts` (metadata-based, same convention as `PlacesController`'s spec) that
  asserts both routes require permissions (`Booking.Create`/`Booking.View`), neither is `@Public()`,
  and both carry the expected throttle metadata.
- **Input trimming (real gap, now fixed):** `guest_note` and item `label` are free-text
  customer-facing fields; neither was trimmed. Added a shared `@Transform` trim helper (no prior
  trim convention existed anywhere in this repo to copy — first instance). Tested directly against
  the transformed instance, not just validation pass/fail.
- **Client-supplied status rejected (verified, not a gap):** confirmed (with an explicit new test,
  not just an assumption) that `booking_status`/`payment_status`/`fulfillment_status` sent in a
  create request are rejected by the existing global `forbidNonWhitelisted:true` pipe — these
  fields simply don't exist on `CreateBookingRequestDto`.
- **Pricing trust boundary (real gap in *documentation*, now fixed — no pricing engine built):**
  `unit_price` is client-submitted with no provider-side confirmation in this slice. Added explicit
  "TRUST BOUNDARY" comments at the DTO field, the `Booking` entity's money columns, the mapper's
  response interface, and the new `docs/data/modules/booking.md` — stating plainly that
  `subtotal`/`grand_total` are a requested/quoted amount, not a provider-confirmed final price, and
  that `booking_status='pending'` on every new booking already reflects that nothing has been
  confirmed. No new column/enum invented for this (would be premature without a real pricing
  engine) — documentation was judged sufficient per the review instruction's own fallback
  ("nếu convention cho phép" — no existing convention to extend, so this is the appropriate
  minimum).
- **Repository/transaction tests strengthened:** added a test asserting every `BookingItem` gets
  the correct `booking.id` (not just "the right count"), and a test that an item-save failure
  inside the transaction propagates as a rejection rather than being silently swallowed (mirrors
  real `DataSource.transaction()` rollback-and-rethrow semantics; a live-DB rollback proof still
  requires Postgres — see §6).
- **API documentation:** added the `Bookings` tag, `POST /bookings`/`GET /bookings/{bookingCode}`
  paths, and `Booking`/`BookingItem` schemas to `docs/api/openapi.yaml` (previously undocumented —
  same convention `MVP-REVIEWS-FEATURE-2026-07-26.md` used for `Review`). YAML re-validated with
  `js-yaml` after editing.
- **Domain documentation:** new `docs/data/modules/booking.md` (ERD, full column tables for both
  tables, API summary, and an explicit "not yet built" list — availability confirmation, pricing
  engine, payment processing, refunds/invoices/commissions/settlements, notifications, extended
  customer accounts, frontend checkout, admin/staff cross-user view).
- **Node version certification:** this environment's default `node` was v24.18.0, but `.nvmrc`
  pins `20`. A matching portable Node v20.20.2 install already existed on this machine
  (`%LOCALAPPDATA%\node-portable\node-v20.20.2-win-x64`, the same one prior sessions' `state.yaml`
  history recorded using for certification) — switched to it and **re-ran the full validation suite
  a second time** under the repo-pinned version (see §5), not just the default runtime.

## 5. Validation

First pass, Node v24.18.0 (this environment's default `node` on PATH):

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

Second pass (§5b domain-review fixes), re-certified under **Node v20.20.2 / npm 10.8.2** — the
exact version pinned by `.nvmrc` (a matching portable install already existed on this machine,
switched to it via `PATH`, confirmed with `node --version`/`npm --version`/`which node`/`which npm`
before running anything):

| Check | Result |
|---|---|
| `apps/api`: `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `apps/api`: `npx eslint "src/**/*.ts" --max-warnings=0` | exit 0 |
| `apps/api`: `npx jest --silent` | **63 suites / 581 tests passed** (+1 suite —
  `bookings.controller.spec.ts`; +23 tests from §5b's new cases) |
| root: `npm run build` (turbo, all 4 buildable packages) | 4/4 tasks succeeded |

`git diff --check` run before commit: only line-ending (LF→CRLF) advisories, no real whitespace
error or conflict marker. `git status`/`git diff --stat` reviewed: only the expected 11 modified
Booking-domain files + 1 new (`bookings.controller.spec.ts`) + the doc/openapi additions — no
lockfile change, no unrelated file touched.

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
