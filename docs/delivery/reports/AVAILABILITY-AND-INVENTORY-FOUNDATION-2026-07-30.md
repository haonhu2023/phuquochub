# AVAILABILITY & INVENTORY FOUNDATION REPORT

**Date:** 2026-07-30
**Milestone:** Booking Availability & Inventory Foundation
**Constraint honored:** Existing Booking Foundation and Booking Application Layer APIs were not
modified in any breaking way — all Booking changes are additive/optional and backward compatible
(see "Backward compatibility" below).

## 1. Repository changes

### New module: `apps/api/src/modules/availability/`

Generic, polymorphic availability/inventory abstraction — **no business-specific logic** for
hotel/restaurant/tour/event/transport. Files:

- `availability.enums.ts` — `InventoryHoldStatus` (`active|expired|released|confirmed`)
- `entities/availability-slot.entity.ts`, `entities/inventory-hold.entity.ts`
- `dto/availability.dto.ts` (+ `.spec.ts`) — `CreateAvailabilitySlotDto`, `ListAvailabilityQueryDto`
- `repositories/availability-slots.repository.ts` (+ `.spec.ts`) — slot CRUD-read + aggregate held-quantity query
- `repositories/inventory-holds.repository.ts` (+ `.spec.ts`) — transactional `placeHold` with
  pessimistic row locking, `markConfirmed`/`markReleased`/`markExpired`, `expireOverdueHolds`
- `availability.service.ts` (+ `.spec.ts`) — orchestration, lazy expiration on confirm
- `availability.controller.ts` (+ `.spec.ts`) — `GET`/`POST /availability-slots`
- `availability.module.ts` — exports `AvailabilitySlotsRepository`/`InventoryHoldsRepository`/`AvailabilityService`

### Modified: Booking integration (additive/backward-compatible only)

- `dto/bookings.dto.ts` — 2 new **optional** fields on `CreateBookingRequestDto`:
  `availability_slot_id` (uuid, optional), `hold_ttl_minutes` (int 1–1440, optional, default 30).
  Existing clients that omit both fields see **zero behavior change**.
- `repositories/bookings.repository.ts` — `NewBooking.hold?` optional; if present, calls
  `InventoryHoldsRepository.placeHold(manager, ...)` **inside the same transaction** already
  wrapping booking+items insert. Return type gained an optional `hold?` field; existing callers
  that don't pass `hold` are unaffected.
- `bookings.service.ts` — validates `availability_slot_id` (slot exists, matches
  entity_type/entity_id/place_id) before delegating to the repository; `transition()` gained
  hold-lifecycle calls: `confirm` calls `confirmHoldForBooking` (gates the whole confirm — throws
  if hold is non-active or expired), `cancel` calls `releaseHoldForBooking` (best-effort, after
  status update, never blocks cancellation). Bookings without `availability_slot_id` behave
  exactly as before this milestone.
- `bookings.module.ts`, `app.module.ts` — import/register `AvailabilityModule`.

## 2. Schema changes

Migration `1720002700000-InitAvailability`:
- `CREATE TYPE inventory_hold_status AS ENUM ('active','expired','released','confirmed')`
- `CREATE TABLE availability_slots` — `entity_type`/`entity_id` polymorphic (no hard FK, ADR-003
  pattern), `place_id` FK → `places(id)` ON DELETE NO ACTION, `UNIQUE(entity_type,entity_id,slot_start)`,
  `CHECK(total_capacity > 0)`, indexes on `(entity_type,entity_id)`, `(place_id)`, `(slot_start)`.
- `CREATE TABLE inventory_holds` — FK → `availability_slots(id)` ON DELETE CASCADE, FK →
  `bookings(id)` ON DELETE CASCADE, `UNIQUE(booking_id)`, `CHECK(quantity > 0)`, indexes on
  `(availability_slot_id)`, `(status)`.

Migration `1720002800000-SeedAvailabilityPermissions`: adds `Availability.View`/`Availability.Manage`
permissions (`ON CONFLICT DO NOTHING`), grants to `moderator` only (inherits up the role DAG to
`administrator`/`super_administrator`).

**No changes to any previously-released table or migration** (`bookings`, `booking_items`,
`InitBooking`, `SeedBookingPermissions` all untouched).

Both migrations were run successfully against the live dev Postgres database
(`npm run migration:show --workspace=apps/api` confirms all rows now `[X]`, including the
carried-over `AddBookingManagePermissions1720002600000` from the prior milestone that had never
been applied due to Docker being unreachable in that session).

## 3. API changes

New endpoints (tag `Availability`):
- `GET /availability-slots` (`Availability.View`) — filter by entity_type/entity_id/place_id/date
  range, paginated, returns computed `held_quantity`/`remaining_capacity`.
- `POST /availability-slots` (`Availability.Manage`) — create a slot.

Modified endpoint (backward compatible):
- `POST /bookings` — request body gained 2 optional fields (`availability_slot_id`,
  `hold_ttl_minutes`). Response shape (`Booking`) is **unchanged**.

No changes to `GET /bookings`, `GET /bookings/:bookingCode`, or the confirm/cancel/expire endpoints'
request/response contracts — only their internal behavior gained hold-lifecycle side effects when
a booking has an associated hold.

## 4. Tests

- Unit: 73 suites / 712 tests passed (up from 66/642 pre-milestone baseline). Includes full
  coverage of `InventoryHoldsRepository.placeHold` (slot-not-found, sufficient/exact-boundary/
  over-capacity, empty-slot, explicit `setLock('pessimistic_write')` assertion),
  `AvailabilityService` (createSlot/list/confirm/release/expire including lazy-expiration branch),
  migration structural tests (`recordingRunner()` pattern matching existing conventions), and
  Booking-integration tests (hold present/absent, transaction-manager sharing, rollback-on-throw,
  confirm/cancel call-order assertions).
- e2e: `bookings.e2e-spec.ts` — 14/14 passed against the live dev database after applying the new
  migrations, confirming no regression in the existing booking flow.

## 5. Build status

- Lint: `npx eslint src/**/*.ts --max-warnings=0` — clean (0 errors, 0 warnings; 2 pre-existing
  unused-import warnings in `bookings.service.ts` were fixed as part of this milestone since they
  were newly surfaced by the refactor).
- Typecheck: `npx tsc -p tsconfig.json --noEmit` — clean.
- Full monorepo build (`npm run build`, turbo, both `@phuquochub/web` and `@phuquochub/api`) —
  succeeded.

## 6. Remaining work (deferred, not forgotten)

- No background sweep for hold expiration — lazy expiration at `confirm` time only (no scheduler
  infra exists in this repo; `expireOverdueHolds()` exists as a ready-to-call bulk method for when
  one is introduced).
- No standalone hold create/list endpoint — holds are only created via `POST /bookings`.
- No update/delete for availability slots — create + list only.
- No business-ownership-scoped management (`Availability.*` granted to `moderator`+ only, same
  constraint as Booking's own manage permissions — `business_claims`/`business_members` not yet
  migrated).
- No automatic hold release when a booking is marked expired (`markExpired` does not touch holds).
- No frontend UI for slot selection.
- Explicitly out of scope per milestone instructions and not implemented: payment, pricing engine,
  notifications, invoices, refunds, commissions, settlements, customer accounts, frontend.

## 7. Rollback considerations

- Both migrations have `down()` implementations: `InitAvailability.down()` drops `inventory_holds`
  before `availability_slots` (dependency-safe order) then the enum type;
  `SeedAvailabilityPermissions.down()` deletes exactly the 2 permission rows it inserted.
- Booking-side changes are additive (new optional DTO fields, new optional repository/service
  parameters) — reverting the Availability module and its 2 migrations does not require reverting
  any Booking Foundation/Application Layer code, since a booking created without
  `availability_slot_id` never touches the new tables. The Booking-side diffs would need to be
  reverted separately only if the optional fields themselves should be removed from the DTO.
- No data migration/backfill was needed (both new tables start empty).

## 8. Commit hash

Four scoped commits, on top of prior HEAD `a72d774` (Booking Application Layer docs):

| Commit | Scope |
|---|---|
| `3e45cf5` | `feat(availability)`: new Availability module (code + tests) |
| `aacf920` | `feat(db)`: `InitAvailability` + `SeedAvailabilityPermissions` migrations (+ structural tests) |
| `83e45db` | `feat(bookings)`: additive Booking integration (DTO/repository/service + tests) |
| `2e9edcf` | `docs(availability)`: `availability.md`, `booking.md` §9, `openapi.yaml`, this report |

`git status --short` is clean after these commits.
