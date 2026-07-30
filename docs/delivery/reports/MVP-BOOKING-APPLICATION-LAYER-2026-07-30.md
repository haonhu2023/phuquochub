# PhuQuocHub — Booking Application Layer (Phase 2) Report (2026-07-30)

Continuing from the Booking Request Foundation (`MVP-BOOKING-FOUNDATION-2026-07-29.md`, HEAD
`f00bb74` at task start — "test(bookings): verify migrations and e2e flow", clean tree). Owner
instruction: Booking Foundation is complete and live-verified; do not extend the Foundation; begin
Phase 2 (Booking Application Layer) instead. Requirement: read the entire existing implementation
first, do not change the existing public API, do not break released migrations, do not touch
committed data.

## 1. Read-First (Phase 2 precondition)

Read in full before writing any code: `bookings.entity.ts`/`booking-item.entity.ts`,
`booking.enums.ts`, `bookings.controller.ts`, `bookings.service.ts`, `bookings.repository.ts`,
`bookings.dto.ts`, `bookings.mapper.ts`, `bookings.module.ts`, `InitBooking`/
`SeedBookingPermissions` migrations + their specs, `docs/data/modules/booking.md`,
`MVP-BOOKING-FOUNDATION-2026-07-29.md`, and the `PlacesService`/`PlacesController`/
`AuditService` precedents this Phase 2 work mirrors (`Place.Approve`/`archive` state-transition +
audit pattern, `PlacesRepository.list()`'s filter/pagination pattern,
`SourceAttributionsRepository`'s `QueryBuilder` precedent, `SeedRbac`'s role-DAG inheritance).

**Key finding from the read-first pass that shaped the design:** `InitBooking1720002400000`
already created `idx_bookings_service_start` with the comment "truy vấn quản trị... theo mốc dịch
vụ sắp tới ('booking trong 7 ngày tới')" — direct evidence that the "date range" filter this
Phase 2 required was designed, from the very first migration, to apply to `service_start_at` (the
service/stay date), not `created_at` (when the booking record was made). This resolved what would
otherwise have been a guess.

## 2. What Was NOT Changed (explicit constraints honored)

- **No existing public API changed**: `POST /bookings` and `GET /bookings/:bookingCode` keep their
  exact existing request/response shape, permissions, and throttle limits. `BookingResponse`
  (`toBooking`) is untouched — still never exposes `id`/`internal_note`/`customer_user_id`.
- **No released migration modified**: `InitBooking1720002400000` and
  `SeedBookingPermissions1720002500000` are byte-for-byte unchanged. Exactly one NEW migration was
  added (`AddBookingManagePermissions1720002600000`) — additive only (`INSERT`/`ON CONFLICT DO
  NOTHING`; its `down()` only deletes the 4 rows it inserted).
- **No committed data touched**: no data migration, no backfill, no manual `UPDATE` against any
  environment.

## 3. API Added

| Method | Route | Permission | Behavior |
|---|---|---|---|
| GET | `/bookings` | `Booking.List` (new) | Admin/staff query across ALL bookings — pagination (`page`/`limit`, same `paginate()` convention as `/places`), sort (`sort_by` ∈ `created_at`/`service_start_at`/`grand_total`, `sort_dir`), filter (`booking_status`, `payment_status`, `fulfillment_status`, `module_code`/`entity_type` — aliases for the same `entity_type` column, rejected as 400 if both given and conflicting — `date_from`/`date_to` on `service_start_at`). |
| POST | `/bookings/:id/confirm` | `Booking.Confirm` (new) | `pending` → `confirmed`. |
| POST | `/bookings/:id/cancel` | `Booking.Cancel` (new) | `pending`\|`confirmed` → `cancelled`. |
| POST | `/bookings/:id/expire` | `Booking.MarkExpired` (new) | `pending` → `expired` only (a `confirmed` booking must be cancelled, not expired). |

All three transition endpoints use the internal `id` (uuid), not the public `bookingCode` — this
is a deliberately privileged channel, mirroring `PlacesController`'s `:id/approve` pattern, not
the customer-facing `:bookingCode` lookup.

**No arbitrary full-entity update exists** — only these 3 named transitions, per the requirement's
explicit "Không cho phép update tùy ý toàn bộ entity."

### 3.1 Validation (separated from the controller)

`booking-status.transition.ts` — a pure function (`assertValidTransition`), zero NestJS/DB
dependency, unit-testable in isolation. Encodes the full FSM:

```
pending    -> confirmed  (confirm)
pending    -> cancelled  (cancel)
pending    -> expired    (markExpired)
confirmed  -> cancelled  (cancel)
confirmed  -> *          invalid otherwise (already confirmed; "expired" only applies to
                         requests never confirmed)
cancelled / expired -> * invalid (terminal states)
```

### 3.2 Domain events — abstraction only

`events/booking-events.ts`: `BookingCreatedEvent`/`BookingConfirmedEvent`/`BookingCancelledEvent`
+ `BookingEventPublisher` interface + a DI token (`BOOKING_EVENT_PUBLISHER`).
`events/logging-booking-event-publisher.ts`: the only implementation — logs via NestJS `Logger`,
**nothing else**. Published at `create()` (Created), `confirm()` (Confirmed), `cancel()`
(Cancelled); **not** published at `markExpired()` (no `BookingExpired` event was in scope). No
Notification, Kafka, or RabbitMQ integration exists anywhere in this change — a real adapter would
only need to implement `BookingEventPublisher` and be swapped into `BookingsModule`'s provider,
with zero change to `BookingsService`.

### 3.3 Audit

Uses the **existing** `AuditService` (ADR-016, `core/audit/`) — no new persistence was created.
Every one of the 3 transitions records `event: 'booking.status_changed'`,
`entityType: 'booking'`, `context: {from, to}`, mirroring `PlacesService.archive`/`approve`'s
exact pattern. `list`/`create`/`getByCodeForUser` do not audit (read actions, or already
constitute their own record).

### 3.4 Permissions (new migration, additive only)

`AddBookingManagePermissions1720002600000` adds `Booking.List`/`Confirm`/`Cancel`/`MarkExpired`,
granted to `moderator` only — `administrator`/`super_administrator` inherit automatically via the
existing role DAG (`SeedRbac`'s `link()` calls). **Deliberately not granted to
`business_manager`/`business_owner`**: `business_claims`/`business_members` have never been
migrated (0 live tables, `booking.md` §2.3), so there is no mechanism to scope "only this
business's own bookings" — granting those roles blanket access to every booking platform-wide
would be a real authorization gap, not a convenience. This is recorded as a named, deliberate
limitation (§6), not a silent omission.

## 4. Files Changed

**New:**
- `apps/api/src/modules/bookings/booking-status.transition.ts` (+ `.spec.ts`)
- `apps/api/src/modules/bookings/events/booking-events.ts`
- `apps/api/src/modules/bookings/events/logging-booking-event-publisher.ts` (+ `.spec.ts`)
- `apps/api/src/core/database/migrations/1720002600000-AddBookingManagePermissions.ts` (+ spec)
- `docs/delivery/reports/MVP-BOOKING-APPLICATION-LAYER-2026-07-30.md` (this file)

**Modified:**
- `apps/api/src/modules/bookings/dto/bookings.dto.ts` — added `ListBookingsQueryDto` (+
  `BOOKING_SORT_FIELDS`); `CreateBookingRequestDto` untouched.
- `apps/api/src/modules/bookings/bookings.mapper.ts` — added `toBookingAdminCard`/
  `BookingAdminCardResponse`; `toBooking`/`toBookingItem`/`BookingResponse` untouched.
- `apps/api/src/modules/bookings/repositories/bookings.repository.ts` — added `list`/`findById`/
  `updateStatus`; existing methods untouched.
- `apps/api/src/modules/bookings/bookings.service.ts` — added `list`/`confirm`/`cancel`/
  `markExpired`/private `transition()`; constructor gained `AuditService` +
  `BookingEventPublisher` (both injected, existing `create`/`getByCodeForUser` behavior
  unchanged aside from `create()` now also publishing `BookingCreatedEvent` after a successful save).
- `apps/api/src/modules/bookings/bookings.controller.ts` — added `list`/`confirm`/`cancel`/
  `markExpired` handlers; existing `create`/`getByCode` handlers unchanged.
- `apps/api/src/modules/bookings/bookings.module.ts` — registered the `BOOKING_EVENT_PUBLISHER`
  provider.
- `apps/api/src/modules/bookings/bookings.service.spec.ts`,
  `bookings.controller.spec.ts`, `bookings.mapper.spec.ts`,
  `repositories/bookings.repository.spec.ts`, `dto/bookings.dto.spec.ts` — extended for the new
  code; every pre-existing test case kept, none deleted or weakened. The service spec's
  `new BookingsService(...)` call sites were updated for the two new constructor parameters
  (required — otherwise the file would not compile).
- `docs/data/modules/booking.md` — new §8 (Phase 2), updated §6 (API table) and §7 (removed the
  now-implemented "admin/staff view" item, added the new deliberate limitations).
- `docs/api/openapi.yaml` — `GET /bookings`, `POST /bookings/{id}/{confirm,cancel,expire}`, new
  `BookingAdminCard` schema.

No file outside `apps/api/src/modules/bookings/`, its one new migration, and documentation was
touched. No frontend file changed.

## 5. Tests

| Suite | Result |
|---|---|
| `booking-status.transition.spec.ts` (new) | 13/13 |
| `events/logging-booking-event-publisher.spec.ts` (new) | 2/2 |
| `1720002600000-AddBookingManagePermissions.spec.ts` (new) | 3/3 |
| `bookings.service.spec.ts` (extended) | all pre-existing cases pass unmodified + new `list`/`confirm`/`cancel`/`markExpired` cases |
| `bookings.controller.spec.ts` (extended) | all pre-existing metadata assertions pass unmodified + new permission-metadata assertions for the 4 new handlers |
| `bookings.repository.spec.ts` (extended) | all pre-existing `create`/`findByCode`/etc. cases pass unmodified + new `list`/`findById`/`updateStatus` cases |
| `bookings.mapper.spec.ts` (extended) | all pre-existing `toBooking`/`toBookingItem` cases pass unmodified + new `toBookingAdminCard` cases confirming `internal_note` is still never exposed |
| `dto/bookings.dto.spec.ts` (extended) | all pre-existing `CreateBookingRequestDto` cases pass unmodified + new `ListBookingsQueryDto` cases |
| **Booking-scoped total** | **8 suites / 106 tests passed** |
| Full `apps/api` unit suite (`npx jest --silent`) | see §7 (validation) |

**Not run this session:** the pre-existing `apps/api/test/bookings.e2e-spec.ts` (or any e2e) —
this session's Docker engine is unreachable (`docker ps` → npipe connection failure, same
recurring environment constraint as several prior sessions). Unit tests instantiate
`BookingsService` directly (`new BookingsService(...)`), which does **not** exercise NestJS's own
dependency-injection resolution of the new `@Inject(BOOKING_EVENT_PUBLISHER)` token — that wiring
was verified by code review only (the token is a single exported `Symbol`, imported identically by
both `bookings.module.ts`'s provider registration and `bookings.service.ts`'s `@Inject()` call —
not redefined in two places), not by an actual NestJS bootstrap. Re-running the existing
`bookings.e2e-spec.ts` (or extending it for the 4 new endpoints) the next time Docker is available
is recommended before treating this as fully live-verified, matching this repository's own
established discipline for exactly this kind of claim.

## 6. Remaining Scope (explicitly not built, per the Owner's own exclusion list)

Not implemented, as instructed: payment, pricing engine, inventory, availability, notification
(real), invoice, refund, settlement, commission, frontend. Additionally, not built in this
specific Phase 2 pass (see `booking.md` §7 for the full deferred list, most unchanged from
Foundation):
- Business-ownership-scoped booking management (`business_manager`/`business_owner` access to
  only their own place's bookings) — blocked on `business_claims`/`business_members` not existing
  yet, not attempted here.
- A `BookingExpired` domain event — not requested, not added.
- `created_at`-based date-range filtering — only `service_start_at` is filterable; can be added
  later if a real need arises.
- e2e coverage of the 4 new endpoints (§5).

## 7. Build & Validation

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` (apps/api) | exit 0 |
| `npx eslint src/**/*.ts --max-warnings=0` (apps/api, official lint script) | *(recorded at commit time below)* |
| `npx jest --testPathPattern=bookings --silent` | 8 suites / 106 tests passed |
| `npx jest --silent` (full apps/api unit suite) | *(recorded at commit time below)* |
| `npm run build` (root, turbo, all workspaces) | *(recorded at commit time below)* |
| Migration structural test (`AddBookingManagePermissions.spec.ts`) | 3/3 passed |

*(Final counts and any follow-up fixes are recorded in the commit history for this change; see
git log for the exact commit hash.)*

## 8. Risks

- **DI wiring for the new event publisher is unverified by an actual NestJS bootstrap this
  session** (Docker unreachable) — see §5. Low risk (single-symbol token, reviewed by hand), but
  not the same as a proven live boot.
- **`module_code`/`entity_type` alias design**: the Owner's requirement listed both as separate
  filter fields, but the schema has only one underlying column (`entity_type`). Treating them as
  synonyms (with a 400 on conflicting values) was a judgment call, documented in code/docs/report,
  not a silent assumption — worth Owner confirmation if a genuinely different "module" concept
  was intended.
- **`date_from`/`date_to` semantics** (service date vs. creation date) was resolved from migration
  evidence (`idx_bookings_service_start`'s own comment), not a specification — documented clearly
  so it can be revisited if wrong.
- **No place-ownership scoping for booking management** (§6) — a real, named gap for any future
  business-facing (not just platform-moderator-facing) booking management feature.

## 9. Not Claimed

- Does not claim the 4 new endpoints have been exercised live over HTTP this session (e2e not run).
- Does not claim business-ownership-scoped booking management exists.
- Does not claim any notification, payment, pricing, inventory, or availability feature exists.
- Does not claim the Booking domain is feature-complete — Phase 2 is explicitly an application
  layer on top of the existing Foundation schema, nothing more.
