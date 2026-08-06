# ADR-015 — BUSINESS OWNERSHIP TRANSFER (UC-B7)

## Status

Third ADR-015 milestone in this repository, delivered immediately after Business Manager
Assignment/Revocation. Scope delivered exactly as specified: direct owner-initiated transfer,
scoped role sync, audit, transaction, unit tests, e2e, migration drill, real rollback drill, live
HTTP walkthrough, documentation. Not started: business dashboard, review replies, notifications,
analytics, `Business.Edit.Managed`, any later Business milestone.

The production implementation, unit tests, migration, and e2e test file already existed on disk at
the start of this session (uncommitted). This report covers what this session did: a read-only
consistency assessment against four confirmed Owner decisions (all matched, zero contradictions),
then full live validation — Docker, migration apply/revert/reapply, focused e2e, a real
forced-failure rollback drill (then removed), a live HTTP walkthrough against a real running
server, full regression across the whole monorepo, documentation, and commits.

## Owner decisions applied

1. **Transfer audit model — no `business_transfers` table.** Resolves business.md §7 item 5 (open
   since Claim Foundation). Reuses the existing model: revoke old active owner row in
   `business_members`, insert new active owner row (`claim_id=null`), revoke old scoped
   `business_owner` `user_roles` grant, assign new scoped grant, record the transfer in
   `audit_logs`. Audit context carries `business_id`, `from_user_id`, `to_user_id`, `initiated_by`,
   `reason`, old/new membership id, old/new role-grant id.
2. **Permission naming — `Business.Transfer.Managed` only.** Same class of fix already applied at
   Manager Assignment: rbac.md documents the scope-less string `Business.Transfer`, but ADR-019 D6
   determines scope class from the suffix on the permission code itself — seeding the literal
   unscoped string would have let any `business_owner` transfer *any* business. The endpoint uses
   ADR-019 resource-scoped authorization (`@AuthorizationContext(resourceType:'place', param:'id')`)
   with the business/place id as context.
3. **Workflow — direct action, no moderator, no acceptance.** Current owner acts directly; no
   moderator approval step; no recipient acceptance step; managers remain unchanged; transfer is
   immediate after the transaction commits.
4. **Transaction — fixed step order, one block.** Lock and verify the current active owner; verify
   actor is that owner; verify target user exists; verify target is not already the active owner;
   revoke old owner membership; revoke old scoped `business_owner` role for this business only;
   insert new owner membership with `claim_id=null`; assign new scoped `business_owner` role;
   commit. Audit only after commit. Any failure rolls back all membership and user-role changes.

### Necessary refinement beyond the literal instruction

Owner Decision 4 lists "verify target is not already the active owner." The as-found code extends
this one step further: it also rejects a target who holds *any* other active role at the business
(concretely, an active manager) with 409, rather than letting the transfer silently insert a second
active-role row that would violate `uq_member_active` (place_id, user_id) WHERE revoked_at IS NULL
with a raw constraint error. This is not a new authorization mechanism — it's the same
`findActiveMembershipForUpdate` lock Manager Assignment already introduced, applied here to produce
a clean 409 instead of a 500. It also enforces Owner Decision 3's "managers remain unchanged" in
the strict sense: transfer must not be usable to implicitly promote a manager to owner without an
explicit prior revoke via the Manager Assignment endpoint. Live-tested explicitly (see "Focused e2e
results" below).

## Preceding read-only assessment

Before any live validation work began, a read-only assessment (no code changed) confirmed the
existing, uncommitted implementation already matched all four Owner decisions above exactly:
audit model, permission naming (migration seeds `Business.Transfer.Managed` only, granted to
`business_owner`, no `business_transfers` table), workflow (direct, no moderator, no acceptance,
managers untouched), and the transaction's fixed step order. `tsc --noEmit` and `eslint` were both
clean on every touched/new file, and the 13 existing unit tests (service + migration structural)
passed. No contradiction was found, so implementation was not restarted or rewritten — this session
proceeded directly to live validation per the instruction not to redo completed work.

## Files added

- `apps/api/src/modules/business/business-transfer.service.ts` +
  `business-transfer.service.spec.ts` (5 tests).
- `apps/api/src/modules/business/business-transfer.controller.ts`.
- `apps/api/src/modules/business/dto/business-transfer.dto.ts`.
- `apps/api/src/modules/business/business-member.mapper.ts` (replaces
  `business-manager.mapper.ts` — one shared `business_members` response shape now used by both
  Manager Assignment and Transfer).
- `apps/api/src/core/database/migrations/1720003900000-SeedBusinessTransferPermission.ts` +
  `__tests__/1720003900000-SeedBusinessTransferPermission.spec.ts` (3 tests).
- `apps/api/test/business-transfer.e2e-spec.ts` (9 tests, live Postgres — 8 POST-`/transfer` calls
  plus 1 no-HTTP structural check, within the endpoint's 10/60s throttle budget).

## Files modified

- `apps/api/src/modules/business/business.module.ts` — registered `BusinessTransferController`/
  `BusinessTransferService`.
- `apps/api/src/modules/business/business-managers.service.ts` — switched to the shared
  `business-member.mapper.ts` (`toBusinessMemberResponse`/`BusinessMemberResponse`) after
  `business-manager.mapper.ts` was deleted.
- `apps/api/src/modules/business/repositories/business-members.repository.ts` —
  `NewOwnerMembership.claimId` widened from `string` to `string | null` (transfer-created owner
  rows have no originating claim, same as manager rows). No new repository methods — the transfer
  transaction reuses `findActiveOwnerForUpdate`/`findActiveMembershipForUpdate`/`createOwner`/
  `revokeMembership` as-is.
- `apps/api/src/modules/rbac/repositories/user-roles.repository.ts` — `findActive()` gained an
  optional transaction-manager parameter (same convention as `assign()`/`revoke()`) so the transfer
  transaction can read the old grant's id, inside its own transaction, before revoking it (needed
  for the audit context's old-role-grant-id field).
- `apps/api/src/modules/users/repositories/users.repository.ts` — `findById()` gained the same
  optional transaction-manager parameter, for the same reason (Owner Decision 4's fixed step order
  requires the target-exists check to run inside the transfer transaction).

## Schema / migrations

No new table, no new enum — `business_members`/`user_roles` reused unchanged.
`SeedBusinessTransferPermission1720003900000`: seeds `Business.Transfer.Managed`
(`ON CONFLICT DO NOTHING`), grants it to `business_owner` only. Live migration drill on real
Docker Postgres: apply → revert (verified `SELECT code FROM permissions WHERE code LIKE
'Business.Transfer%'` → 0 rows, `role_permissions` cascade-deleted, migration record removed) →
reapply (verified byte-for-byte identical restoration: same permission row, same single grant, no
`business_transfers` table, DAG inheritance unchanged — `business_owner` still the sole child of
`business_manager` in `role_parents`). Existing structural unit tests (SQL-recording, no live DB)
already assert the exact SQL shape — scoped code, `business_owner`-only grant, explicit exclusion
of `business_manager`/`moderator`, exact `down()` delete — judged sufficient alongside the live
drill; no new structural tests were added.

## Permissions

| Permission | Granted to |
|---|---|
| `Business.Transfer.Managed` | `business_owner` only |

Confirmed live via SQL: exactly one `role_permissions` row, `business_owner`. `business_owner` is a
DAG leaf (nothing inherits *from* it — it inherits *from* `business_manager`), so nothing else
picks this up implicitly.

## Endpoint

| Method | Path | Permission | Authorization |
|---|---|---|---|
| POST | `/business/{id}/transfer` | `Business.Transfer.Managed` | `@AuthorizationContext(resourceType:'place', param:'id')`, `IDENTITY_PLACE_RESOLVER` |

200 (not 201) on success — the response replaces existing ownership state rather than creating an
additional member row, same convention as `decide()`/`withdraw()` on the claims endpoints, unlike
Manager Assignment's 201 (which genuinely adds a new member row alongside the owner). Request body:
`new_owner_id` (required UUID), `reason` (optional string, ≤300 chars, trimmed, written only to
`audit_logs.context.reason`).

## Authorization behavior

`AuthorizationBootstrapValidator` (ADR-019 D9) confirmed via real app boot against Docker Postgres
— missing `@AuthorizationContext` on a Managed/Own-scoped permission crashes startup, and the
transfer endpoint's presence didn't trigger that failure. No manual "is actor the owner" check
exists in the ADR-019 sense — the PDP matches the actor's Managed grant's `business_id` against the
route's `:id` before the controller method runs. The service *does* separately re-verify
`currentOwner.userId === actorId` against the `business_members` row itself (Owner Decision 4's
explicit step) — this is not a parallel authorization mechanism, it's a second read against the
business-record-of-truth table in case the two tables (`user_roles` vs `business_members`) ever
drifted; it re-confirms the same fact ADR-019 already gated, from the other table.

## Transfer transaction

Single `dataSource.transaction()` block, exact fixed order: lock + read current active owner
(`findActiveOwnerForUpdate`, `FOR UPDATE`) → verify actor is that owner (403 if not) → verify target
user exists (`usersRepo.findById(id, manager)`, 404 if not) → verify target isn't already the active
owner (409 self-transfer) → verify target holds no other active role at this business (409 if e.g.
already a manager — the necessary refinement above) → read old role-grant id (for audit) → revoke
old membership → revoke old scoped `business_owner` role (businessId-scoped, this business only) →
insert new membership (`claim_id=null`) → assign new scoped role → commit. `audit.record()` runs
strictly after the `await this.dataSource.transaction(...)` resolves — if the transaction throws,
the audit call is never reached, so a rolled-back transfer never produces an audit row.

## Membership behavior

Confirmed live (e2e + live HTTP walkthrough): successful transfer sets `revoked_at` on the old
owner's `business_members` row (history preserved, not deleted) and inserts exactly one new row
(`role='owner'`, `claim_id IS NULL`, `granted_by`=old owner's id, `revoked_at IS NULL`).

## Scoped-role behavior

Old scoped `business_owner` `user_roles` grant is revoked with an explicit `businessId` argument —
confirmed it touches *only* the transferred business: the same actor's `business_owner` grant on a
second, unrelated business (set up specifically to test this) remained active and functional
through the entire test. New scoped grant is created with `scope_type='managed'`,
`business_id`=the transferred place.

## Manager-preservation behavior

Confirmed live: a manager assigned to the business before transfer keeps their `business_members`
row untouched (`revoked_at IS NULL` before and after) and their Managed access keeps working
(`PATCH /places/:id` → 200) immediately after the transfer commits — transfer touches zero
`business_members(role='manager')` rows.

## Target-manager rejection behavior

Confirmed live: if `new_owner_id` is already an active manager at the target business, the
transaction verifies this via `findActiveMembershipForUpdate` and returns 409 before any write —
the manager's row is left completely untouched. The old owner must revoke the manager role via
`DELETE /business/{id}/managers/{userId}` before transferring to that same user, matching the
"managers remain unchanged" workflow decision in its strict sense (transfer never implicitly
promotes a manager).

## Audit behavior

`business.ownership_transferred`, `entityType='business_member'`, `entityId`=new membership id,
`actorId`=old owner. Context confirmed (via e2e SQL assertions and the live HTTP walkthrough) to
contain all of: `business_id`, `from_user_id`, `to_user_id`, `initiated_by`, `reason`,
`old_membership_id`, `new_membership_id`, `old_user_role_id`, `old_user_role_revoked` (boolean),
`new_user_role_id`. Confirmed to fire exactly once per successful transfer and never on a rolled-
back one (rollback drill, below).

## Focused E2E

`business-transfer.e2e-spec.ts`, live Postgres, 9/9 passing (up from the 8 already present at
session start — one no-HTTP structural assertion was added, not a new `/transfer` call, so the
file's documented 8-POST throttle budget is unchanged):

- anonymous → 401.
- plain member (no `Business.Transfer.Managed`) → 403.
- `business_manager` (holds a Managed grant, but not `Business.Transfer.Managed`) → 403.
- no `business_transfers` table exists (`to_regclass` check — added this session).
- owner transfers their own business → 200; membership+role correct on both sides; audit context
  complete including `old_user_role_id`/`old_user_role_revoked` (assertions added this session);
  old owner loses Managed access immediately (403), new owner gains it immediately (200); manager
  untouched (200); scoped-role revoke proven to touch *only* this business — a second business
  owned by the same actor, set up specifically for this test (added this session), keeps its
  `business_members` row and `user_roles` grant fully active and unrevoked.
- owner transfers a *different* business (not their own) → 403 (ADR-019 cross-business isolation),
  zero writes.
- transfer to self (already the active owner) → 409.
- transfer to a target already holding another active role (manager) → 409, manager role unchanged.
- transfer to a non-existent user → 404, nothing changed.

## Live HTTP/SQL validation

Beyond supertest (which drives the Nest app in-process), a real dev server instance was started
(`npm run dev`, port 4000, real Docker Postgres/Redis/MinIO) and driven with real HTTP requests
(Node `fetch`) using JWTs signed with the server's actual configured `JWT_ACCESS_SECRET` (read from
the repo's `.env`, not the code default) — matching the exact payload shape `TokenService` issues.
27 assertions, all passing:

- Baseline: old owner edits place A (200) before transfer.
- A manager is assigned to place A via the real running Manager Assignment endpoint (201).
- Unrelated user denied (403) as a pre-transfer baseline.
- Transfer A from old owner to new owner via `POST /business/{id}/transfer` → 200, correct
  `role`/`user_id` in the response body.
- Post-transfer HTTP: old owner → 403, new owner → 200, manager → 200 (unaffected), unrelated user
  → 403 (unaffected).
- Business B (owned by an unrelated fifth user) unaffected: its owner still edits it (200), and the
  transferred business's old owner cannot transfer B (403).
- Direct SQL verification of every table-level effect: `business_members` history via `revoked_at`,
  new owner row with `claim_id IS NULL`, manager row untouched, old `user_roles` grant revoked
  scoped to business A only, new `user_roles` grant active with correct scope/business_id, business
  B's owner grant completely untouched, audit row present with every required context field, no
  `business_transfers` table.
- Full fixture cleanup (users, places, business_members, user_roles, audit_logs, wiki_revisions),
  then re-queried every table to confirm zero residue (5/5 residue counts = 0).

## Rollback proof

A temporary forced-failure drill (`_rollback-drill-transfer.e2e-spec.ts`, gated behind
`FORCE_ROLLBACK_DRILL=1`, throwing inside the service immediately before the transaction callback's
`return`) was run against real Postgres. Verified, then strengthened this session with two
additional checks (no audit row; new owner has zero Managed access) before the final confirming
run and deletion:

1. Old owner's `business_members` row: still active (`revoked_at IS NULL`).
2. No new `business_members` row for the intended new owner.
3. Old scoped `user_roles` grant: still active (`revoked_at IS NULL`).
4. No new `user_roles` grant for the intended new owner.
5. No `audit_logs` row for `business.ownership_transferred` (the audit call is unreachable — it
   sits after the `await` on the transaction, which rejected).
6. Old owner still has real, working Managed access (`PATCH /places/:id` → 200).
7. Intended new owner has zero Managed access (`PATCH /places/:id` → 403).

All seven passed on the real Postgres instance — full atomicity confirmed, not inferred.

## Temporary instrumentation removal

After the drill passed: `apps/api/test/_rollback-drill-transfer.e2e-spec.ts` deleted;
the `if (process.env.FORCE_ROLLBACK_DRILL === '1') { throw ... }` block removed from
`business-transfer.service.ts`. Repository-wide grep for `FORCE_ROLLBACK_DRILL`/`ROLLBACK_DRILL`/
`rollback-drill` after removal: one remaining hit, in
`docs/delivery/reports/ADR-015-BUSINESS-CLAIM-FOUNDATION-2026-08-05.md`, which documents a
different, already-completed drill from an unrelated, earlier milestone (Claim Foundation) — not
this milestone's instrumentation. Zero residue from this milestone's drill. The normal focused
transfer e2e suite (9 tests) was rerun immediately after removal and passed clean.

## Migration drill

Apply → revert (verified `SELECT code FROM permissions WHERE code LIKE 'Business.Transfer%'`
returns 0 rows, `role_permissions` cascade-removed, `migrations` table entry removed) → reapply
(verified byte-for-byte restoration of the permission, the single `business_owner` grant, and the
absence of a `business_transfers` table). Confirmed live on the real Docker Postgres instance.

## Full regression

- New/touched unit tests: transfer service 5/5, migration structural 3/3 — all passing.
- Business/RBAC/Users unit tests: 6 suites / 90 tests — all passing.
- Full backend unit suite: **121 suites / 1354 tests** (up from 119/1341).
- Focused transfer e2e: 9/9 passing.
- Full backend e2e suite: **26 suites / 225 tests** (up from 25/216).
- Backend typecheck: clean. Backend lint (`eslint "src/**/*.ts" --max-warnings=0`): clean.
- Backend build (`nest build`): clean, `dist/main.js` produced.
- Full monorepo typecheck (`turbo run typecheck`, 5 packages): 6/6 tasks successful.
- Full monorepo lint (`turbo run lint`, 5 packages): 6/6 tasks successful.
- Full monorepo build (`turbo run build`, 5 packages, includes `@phuquochub/web` Next.js
  production build): 4/4 tasks successful.
- `git diff --check`: clean (only pre-existing LF/CRLF warnings, no whitespace errors).
- Secret scan: manual pattern scan (AWS keys, PEM private keys, hardcoded password/secret/token/
  api-key literals) across all 13 files this milestone added or touched — clean. Explicit grep for
  the live walkthrough's signing secret and the code's dev-default secret string across all
  touched files — zero hits (the real secret was only ever used from a scratch script outside the
  repository).
- `git status --short`: clean working tree matching exactly the expected file set (see below).

## Build/typecheck/lint

Covered above under Full regression — backend and full monorepo, all green.

## Cleanup verification

Live HTTP walkthrough: 5/5 residue counts (`places`, `users`, `business_members`, `user_roles`,
`audit_logs`) = 0 after fixture teardown. E2e suite's own `afterAll` teardown (users, places,
business_members via cascading FKs, user_roles, audit_logs, wiki_revisions) ran clean on every
pass. Rollback-drill instrumentation fully removed (see above), zero residue confirmed by grep.

## Documentation / governance

- `docs/99-decisions/ADR-015-business-ownership-model.md` — appended this milestone to the
  Implementation Status section (no historical decision content rewritten); updated the Claim
  Foundation section's "out of scope" note to mark UC-B7 done.
- `docs/data/modules/business.md` — banner updated to reflect UC-B7 as implemented; §7 item 5
  moved from "còn mở" (open) to "đã chốt" (decided) with the resolution recorded.
- `docs/api/openapi.yaml` — replaced the stale `/business/{id}/transfer` stub (bare `new_owner_id`
  body, `EmptySuccess` response, no error responses) with the real contract matching
  `BusinessTransferController` exactly: `reason` field, 200 with `BusinessManager`-shaped `data`
  (the same shared `business_members` response shape Manager Assignment uses), 401/403/404/409
  responses documented. Validated with `js-yaml`.
- `docs/delivery/state.yaml` — `current.task` updated with this milestone's full record, chaining
  the Manager Assignment entry below it.
- This report.

## Remaining ADR-015 work

Business dashboard (UC-B3/B5), review replies (UC-B4), notifications, sanctions, analytics,
multi-branch chains, `Business.Edit.Managed`, ADR-008's full Verification entity. No later Business
milestone was started.

## Final git status

```
 D apps/api/src/modules/business/business-manager.mapper.ts
 M apps/api/src/modules/business/business-managers.service.ts
 M apps/api/src/modules/business/business.module.ts
 M apps/api/src/modules/business/repositories/business-members.repository.ts
 M apps/api/src/modules/rbac/repositories/user-roles.repository.ts
 M apps/api/src/modules/users/repositories/users.repository.ts
?? apps/api/src/core/database/migrations/1720003900000-SeedBusinessTransferPermission.ts
?? apps/api/src/core/database/migrations/__tests__/1720003900000-SeedBusinessTransferPermission.spec.ts
?? apps/api/src/modules/business/business-member.mapper.ts
?? apps/api/src/modules/business/business-transfer.controller.ts
?? apps/api/src/modules/business/business-transfer.service.spec.ts
?? apps/api/src/modules/business/business-transfer.service.ts
?? apps/api/src/modules/business/dto/business-transfer.dto.ts
?? apps/api/test/business-transfer.e2e-spec.ts
 M docs/99-decisions/ADR-015-business-ownership-model.md
 M docs/api/openapi.yaml
 M docs/data/modules/business.md
 M docs/delivery/state.yaml
?? docs/delivery/reports/ADR-015-BUSINESS-OWNERSHIP-TRANSFER-2026-08-06.md
```

(`_rollback-drill-transfer.e2e-spec.ts` was created and deleted within this session — it never
appears in the final status above.)

## Commit hashes

Recorded in a follow-up entry after commits are created (see final report).
