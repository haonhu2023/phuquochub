# ADR-015 — BUSINESS MANAGER ASSIGNMENT / REVOCATION (UC-B6)

## Status

Second ADR-015 milestone in this repository, delivered immediately after Business Claim
Foundation. Scope delivered exactly as specified: assign manager, revoke manager, scoped role
grant, scoped role revoke, audit, transaction, unit tests, e2e, live validation, documentation.
Not started: ownership transfer, dashboard, review replies, notifications, analytics,
`Business.Edit.Managed`, any later Business milestone.

## Preceding read-only assessment

Before any code was written, a read-only implementation assessment (no code/migrations/docs
changed) identified this as the next executable milestone and flagged one concrete architectural
risk: rbac.md documents `Business.Manager.Assign`/`Revoke` with no scope suffix, but ADR-019 D6
determines scope class from the suffix on the permission code itself — seeding literally as
written would have made the permission context-free (like `Business.Claim`/`Business.Verify`),
letting any `business_owner` assign managers to *any* business, not just their own. The Owner
decisions below resolve this before implementation began.

## Owner decisions applied

1. **Permission names carry `.Managed`.** Seeded `Business.Manager.Assign.Managed` and
   `Business.Manager.Revoke.Managed` — not the unscoped strings rbac.md documents — so they
   participate in ADR-019's existing Managed authorization flow.
2. **`Business.Edit.Managed` not implemented or seeded.** No endpoint in this milestone requires
   it; left reserved for a future Business Profile surface.
3. **`UserRolesRepository.revoke()` extended with the same optional transaction-manager parameter
   `assign()` already has.** (A `businessId` parameter was also added — see "Necessary
   refinement" below.)
4. **No new tables or enums.** `business_members` reused as-is; `MemberRole.MANAGER` already
   existed in the enum, simply unused until now.
5. **Authorization goes entirely through the existing ADR-019 Managed path** — no parallel
   ownership-check mechanism.
6. **Scope held to:** assign manager, revoke manager, scoped grant/revoke, audit, transaction,
   unit tests, e2e, live validation, documentation. Nothing else started.

### Necessary refinement beyond the literal instruction

Owner Decision 3 asked for the transaction-manager parameter on `revoke()`. A `businessId`
parameter was also added, because without it a single user managing two businesses would have
their revocation at business A silently cascade to business B (the pre-existing `revoke(userId,
roleId)` signature revokes *every* active row for that role regardless of scope). This is not a
parallel authorization mechanism — it's a correctness requirement for the exact method Decision 3
named. The existing admin call site (`UsersService.revokeRole()`) is unaffected: it doesn't pass
`businessId`, so it keeps its original "revoke this role everywhere" behavior. Live-tested
explicitly (see "Focused e2e results" below).

## Files added

- `apps/api/src/modules/business/business-managers.service.ts` +
  `business-managers.service.spec.ts` (8 tests).
- `apps/api/src/modules/business/business-managers.controller.ts`.
- `apps/api/src/modules/business/dto/business-manager.dto.ts`.
- `apps/api/src/modules/business/business-manager.mapper.ts`.
- `apps/api/src/core/database/migrations/1720003800000-SeedBusinessManagerPermissions.ts` +
  `__tests__/1720003800000-SeedBusinessManagerPermissions.spec.ts` (3 tests).
- `apps/api/test/business-managers.e2e-spec.ts` (10 tests, live Postgres).

## Files modified

- `apps/api/src/modules/business/business.module.ts` — registered `BusinessManagersController`/
  `BusinessManagersService`; imported `UsersModule` (for `UsersRepository`, to validate the target
  user exists).
- `apps/api/src/modules/business/repositories/business-members.repository.ts` —
  `findActiveMembershipForUpdate()` (locks any active role — owner or manager — for a (place,user)
  pair; used both to reject duplicate assignment and to confirm the exact row a revoke targets),
  `createManager()`, `revokeMembership()`.
- `apps/api/src/modules/rbac/repositories/user-roles.repository.ts` — `revoke()` gained optional
  `businessId` and `manager` parameters (see "Necessary refinement" above). Existing 2-argument
  callers unaffected.

## Schema / migrations

No new table, no new enum — `business_members` and `MemberRole` reused unchanged.
`SeedBusinessManagerPermissions1720003800000`: seeds `Business.Manager.Assign.Managed` and
`Business.Manager.Revoke.Managed` (`ON CONFLICT DO NOTHING`), grants both to `business_owner`
only. Live migration drill: apply → revert → verified zero residue (`SELECT code FROM permissions
WHERE code LIKE 'Business.Manager%'` → 0 rows) → reapply clean.

## Permissions

| Permission | Granted to |
|---|---|
| `Business.Manager.Assign.Managed` | `business_owner` only |
| `Business.Manager.Revoke.Managed` | `business_owner` only |

Confirmed live via SQL: exactly two `role_permissions` rows, both `business_owner`. `business_owner`
is a DAG leaf (nothing inherits *from* it), so nothing else picks these up implicitly.

## Endpoints

| Method | Path | Permission | Authorization |
|---|---|---|---|
| POST | `/business/{id}/managers` | `Business.Manager.Assign.Managed` | `@AuthorizationContext(resourceType:'place', param:'id')`, `IDENTITY_PLACE_RESOLVER` |
| DELETE | `/business/{id}/managers/{userId}` | `Business.Manager.Revoke.Managed` | same |

Both required `@AuthorizationContext` — `AuthorizationBootstrapValidator` (D9) confirmed via a
real app boot against Docker Postgres; missing it would have crashed startup.

## Transaction boundaries

`assign()`: single transaction — lock any active membership for (place, targetUser) via
`findActiveMembershipForUpdate`; if found, 409 (covers both "already owner" and "already manager");
otherwise insert `business_members(role='manager')` and `UserRolesRepository.assign(scope=managed,
businessId=placeId)`, both against the same `manager`. Audit after commit.

`revoke()`: single transaction — lock the active membership; if none or if it's the `owner` row
(not `manager`), 404 (BR-B6: this endpoint can't be used to remove an owner). Otherwise
`revokeMembership()` + `UserRolesRepository.revoke(userId, roleId, placeId, manager)` — the
`placeId` argument is what keeps a multi-business manager's other grants untouched. Audit after
commit.

## Ownership membership / grant behavior

Confirmed live: successful assign produces exactly one new `business_members` row
(`role='manager'`, `revoked_at IS NULL`) and one new `user_roles` row (`scope_type='managed'`,
`business_id` = the target place). Successful revoke sets `revoked_at` on both and the manager's
Managed access stops working on the very next request (verified via `PATCH /places/:id` returning
403 immediately after revoke, having returned 200 immediately before it).

## ADR-019 integration proof

No new authorization code was exercised to prove this — that's the point. `business-managers.e2e-
spec.ts` shows: an owner assigning a manager to a *different* business (not their own) gets 403
with zero database writes; a manager who was just assigned immediately attempts to assign another
manager themselves and gets 403 (they hold no Managed grant with `Business.Manager.Assign.Managed`
— only `business_owner` does); and the businessId-scoped revoke test proves a manager's grant at
business B survives a revoke at business A untouched, then that manager still successfully edits
business B via the pre-existing `PATCH /places/:id`.

## Focused e2e results

`business-managers.e2e-spec.ts`, live Postgres, 10/10 passing. Every test that needed "an owner"
created its own fresh place (a real constraint discovered mid-work: `uq_member_owner` allows only
one active owner per place, so places cannot be shared across independent owner-seeding tests — the
first draft of this file collided on that and was rewritten before any assertions were trusted).

- anonymous → 401.
- plain member (no `Business.Manager.Assign.Managed`) → 403.
- owner assigns manager to their own business → 201, `business_members`/`user_roles` confirmed via
  SQL, audit confirmed, and the chained permission-escalation attempt (new manager tries to assign
  another manager) → 403.
- owner assigns manager to a *different* business → 403, zero rows written.
- assign a target who is already the owner → 409.
- assign a target who is already an active manager → 409.
- revoke → 200, both rows revoked, Managed access verified to work *before* revoke (200 on PATCH)
  and stop working *immediately after* (403 on the same PATCH), audit confirmed.
- revoke a target with no active membership → 404.
- revoke targeting the owner (not a manager) → 404 (BR-B6).
- a user managing two businesses: revoke at business A leaves business B's grant fully intact and
  functional.

## Live rollback evidence

Not run as a separate forced-failure drill for this milestone. `assign()`/`revoke()` use the exact
same `dataSource.transaction()` mechanism already live-proven atomic in the Claim Foundation
milestone's forced-failure drill (all four decision effects there rolled back together on a real
Postgres 500). Code review of both new methods confirms every write inside each transaction
(`createManager`/`userRolesRepo.assign` in `assign()`; `revokeMembership`/`userRolesRepo.revoke`
in `revoke()`) correctly receives the shared `manager` parameter — there is no write path in either
method that could commit independently of the others. If a dedicated live drill is wanted for this
specific milestone, it was not requested and can be added on request.

## Full regression

- New unit tests: service 8/8, migration structural tests 3/3 — all passing.
- Full backend unit suite: **119 suites / 1341 tests** (up from 117/1330).
- Focused manager e2e: 10/10 passing.
- Full backend e2e suite: **25 suites / 216 tests** (up from 24/206).
- Backend typecheck: clean. Backend lint (touched files + the real `api:lint` CI script): clean.
- Backend build: clean.
- Full monorepo build/typecheck/lint: **12/12 tasks successful** (`turbo run build typecheck lint`).
- `git diff --check`: clean (only pre-existing LF/CRLF warnings).
- Secret scan: clean across all 11 files this milestone added or touched.

## Migration drill

Apply → revert (verified `SELECT code FROM permissions WHERE code LIKE 'Business.Manager%'`
returns 0 rows) → reapply clean. Confirmed live on the real Docker Postgres instance.

## Cleanup verification

Zero residue confirmed via direct SQL after the final e2e run: 0 users matching
`e2e_bizmgr_%`, 0 places matching `E2E BizMgr%`, `business_members` and `business_claims` tables
both empty.

## Documentation / governance

- `docs/99-decisions/ADR-015-business-ownership-model.md` — appended this milestone to the
  Implementation Status section (no historical decision content rewritten).
- `docs/data/modules/business.md` — banner updated to reflect UC-B6 as implemented.
- `docs/api/openapi.yaml` — replaced the stale `/business/{id}/managers[/…]` stub (request/response
  shapes never matched real code) with the real contract matching `BusinessManagersController`
  exactly, plus a new `BusinessManager` schema. Validated with `js-yaml`.
- `docs/delivery/state.yaml` — `current.task` updated with this milestone's full record, chaining
  the Claim Foundation entry below it.
- This report.

## Remaining ADR-015 work

Ownership transfer (UC-B7 — still has business.md §7's open design question about a dedicated
`business_transfers` history table), business dashboard (UC-B3/B5), review replies (UC-B4),
notifications, analytics, multi-branch chains, `Business.Edit.Managed`, ADR-008's full Verification
entity.

## Final git status

```
 M apps/api/src/modules/business/business.module.ts
 M apps/api/src/modules/business/repositories/business-members.repository.ts
 M apps/api/src/modules/rbac/repositories/user-roles.repository.ts
?? apps/api/src/core/database/migrations/1720003800000-SeedBusinessManagerPermissions.ts
?? apps/api/src/core/database/migrations/__tests__/1720003800000-SeedBusinessManagerPermissions.spec.ts
?? apps/api/src/modules/business/business-manager.mapper.ts
?? apps/api/src/modules/business/business-managers.controller.ts
?? apps/api/src/modules/business/business-managers.service.spec.ts
?? apps/api/src/modules/business/business-managers.service.ts
?? apps/api/src/modules/business/dto/business-manager.dto.ts
?? apps/api/test/business-managers.e2e-spec.ts
 M docs/99-decisions/ADR-015-business-ownership-model.md
 M docs/api/openapi.yaml
 M docs/data/modules/business.md
 M docs/delivery/state.yaml
?? docs/delivery/reports/ADR-015-BUSINESS-MANAGER-ASSIGNMENT-2026-08-05.md
```

## Commit hashes

Recorded after commits are created (see final report message for this session).
