# ADR-015 — BUSINESS CLAIM FOUNDATION (Claim Decision Workflow)

## Status

First real ADR-015 implementation in this repository. No M1/M2 ever existed — `business_claims`/
`business_members` were never migrated before this session (confirmed across `docs/delivery/
state.yaml` history from 2026-07-29 through 2026-08-04: "no dependency on unmigrated
business_claims/members"). ADR-019's blocking prerequisite (M0.1–M0.3, scoped `business_owner`
grants actually enforced end-to-end) was already satisfied before this work started.

Scope delivered: business claim schema, claim FSM, claim submission, moderator claim queue/detail,
claim approve/reject/dispute/withdraw decisions, owner-membership creation on approval, scoped
`business_owner` role assignment on approval, `places` verification cache update on approval,
audit, unit/e2e/live validation, documentation.

Explicitly **not** started: manager assignment/revoke, ownership transfer, business dashboard,
review replies, notifications, sanctions, analytics, multi-branch chains, ADR-008's full
Verification entity.

## Environment

- Docker Desktop started this session; Postgres/Redis/MinIO containers healthy
  (`phuquoc-postgres`/`phuquoc-redis`/`phuquoc-minio`, all `Up ... (healthy)`).
- `migration:show` confirmed 38 prior migrations applied before this work began.
- Node v24.18.0, npm 11.16.0.

## Owner decisions applied

1. **Verification = cache columns only.** `places.verificationStatus`/`verifiedAt` (the existing
   ADR-008 §Decision-3 cache) are the sole mechanism used on claim approval. `verifications`/
   `verification_events`/`verification_votes` were **not** created — ADR-008 remains deferred.
2. **`Business.Verify` is a new, distinct permission** — seeded via migration, granted to
   `moderator` only; `administrator`/`super_administrator` inherit through the existing
   `role_parents` DAG (no explicit seed). `Verification.Verify` was not touched or reused.
3. **Milestone interpretation:** no ADR-015 M1/M2 assumed to exist. This work built every
   prerequisite from scratch (enums, entities, repositories, migrations, permission seed, module
   wiring) in addition to the claim submission/decision workflow itself.
4. **Docker-first:** Docker Desktop, Postgres, Redis, MinIO all verified healthy before any
   migration, e2e, or live validation work.

## Files added

- `apps/api/src/modules/business/business.enums.ts` — `ClaimStatus`, `ClaimReasonCode`,
  `MemberRole`, `BusinessClaimDecision`.
- `apps/api/src/modules/business/business-claim-evidence.ts` — `BusinessClaimEvidenceType`,
  `BusinessClaimEvidenceItem`.
- `apps/api/src/modules/business/entities/business-claim.entity.ts`,
  `entities/business-member.entity.ts`.
- `apps/api/src/modules/business/business-claim.transition.ts` +
  `business-claim.transition.spec.ts` (pure FSM, 32 tests).
- `apps/api/src/modules/business/repositories/business-claims.repository.ts`,
  `repositories/business-members.repository.ts`.
- `apps/api/src/modules/business/dto/business.dto.ts`.
- `apps/api/src/modules/business/business.mapper.ts`.
- `apps/api/src/modules/business/business-claims.service.ts` +
  `business-claims.service.spec.ts` (23 tests).
- `apps/api/src/modules/business/business-claims.controller.ts`.
- `apps/api/src/modules/business/business.module.ts`.
- `apps/api/src/core/database/migrations/1720003600000-InitBusinessClaims.ts` +
  `__tests__/1720003600000-InitBusinessClaims.spec.ts` (13 tests).
- `apps/api/src/core/database/migrations/1720003700000-SeedBusinessPermissions.ts` +
  `__tests__/1720003700000-SeedBusinessPermissions.spec.ts` (3 tests).
- `apps/api/test/business-claims.e2e-spec.ts` (8 tests, live Postgres).

## Files modified

- `apps/api/src/app.module.ts` — registered `BusinessModule`.
- `apps/api/src/modules/places/repositories/places.repository.ts` — `updateScalars()` gained an
  optional `manager?: EntityManager` parameter (same convention as the existing
  `recalculateRating()`), needed so the verification-cache update runs inside the same transaction
  as the claim decision. Behavior for existing callers (no `manager` passed) is unchanged.
- `apps/api/src/modules/rbac/repositories/user-roles.repository.ts` — `assign()` gained the same
  optional `manager?: EntityManager` parameter, needed so the `business_owner` grant runs inside the
  same transaction. Existing callers unaffected.

## Schema / migrations

`InitBusinessClaims1720003600000`: `business_claims` (place_id → places CASCADE, requester_id/
reviewer_id → users NO ACTION, evidence jsonb, status enum default pending, reason_code, decision_
note, decided_at, timestamps) + `business_members` (place_id → places CASCADE, user_id → users
CASCADE, role enum, claim_id → business_claims NO ACTION, granted_by → users NO ACTION, granted_at,
revoked_at). Indexes: `uq_claim_pending` (place_id, requester_id) WHERE status='pending';
`idx_claim_queue` (place_id, status); `uq_member_owner` (place_id) WHERE role='owner' AND
revoked_at IS NULL (BR-B2); `uq_member_active` (place_id, user_id) WHERE revoked_at IS NULL;
`idx_member_user`. `CHECK` enforces `reason_code` on `rejected`. Self-refusing `down()` — refuses to
drop if any claim has `decided_at IS NOT NULL` (same pattern as `InitModeration.down()`).

`SeedBusinessPermissions1720003700000`: seeds `Business.Verify` (`ON CONFLICT DO NOTHING`), grants
to `moderator` only.

Live migration drill (2026-08-05): apply → revert → revert (both new migrations) → verified zero
residue (no `business_*` tables/types, `Business.Verify` permission gone) via direct SQL → reapply
clean.

## Permissions

- `Business.Claim` — already seeded (`SeedRbac`), unchanged. Granted to `member`.
- `Business.Verify` — new, granted to `moderator` only; inherited by `administrator`/
  `super_administrator` via DAG. Confirmed live: `SELECT ... role_permissions ...` shows exactly one
  grant row (`moderator` → `Business.Verify`).

Neither permission carries a scope suffix (`.Managed`/`.Own`) — both go through the PDP's
context-free path (ADR-019 D2 step 3), same as `Place.Create`. No `@AuthorizationContext` /
resolver registration needed; `AuthorizationBootstrapValidator` (D9) passed with the new routes
live (confirmed via a real `node dist/main.js` boot against Docker Postgres).

## Endpoints

| Method | Path | Permission | Actor check |
|---|---|---|---|
| POST | `/business-claims` | `Business.Claim` | — |
| POST | `/business-claims/{id}/withdraw` | `Business.Claim` | actor === claim.requesterId |
| GET | `/business-claims` | `Business.Verify` | — |
| GET | `/business-claims/{id}` | `Business.Verify` | — |
| POST | `/business-claims/{id}/decide` | `Business.Verify` | actor !== claim.requesterId (no self-verification) |

## Claim FSM

Pure module (`business-claim.transition.ts`), no DB dependency. States: `pending`, `approved`,
`rejected`, `disputed`, `withdrawn`. Actions: `submit`, `approve`, `reject`, `dispute`, `withdraw`.
7 valid transitions out of the full 6×5=30 state×action matrix; the remaining 23 all throw
`UnprocessableEntityException`, verified by an exhaustive unit test. `dispute` is reachable only
from `pending` and is never a direct API input — the service triggers it automatically. `disputed`
resolves only via `approve`/`reject` (dispute-resolution). `approved`/`rejected`/`withdrawn` are
terminal.

## Submission behavior

`requester_id` is always taken from the JWT (`user.sub`), never from the request body (the DTO has
no such field, and the global `ValidationPipe` runs with `forbidNonWhitelisted: true`). Place must
exist and be `published` (checked via `PlacesRepository.getCardByIdIncludingInactive`, a privileged
read already gated on this route not being `@Public`) — otherwise 404. Duplicate pending claim
(same place + requester) → 409, enforced structurally: `createPending()` uses `INSERT ... ON
CONFLICT (place_id, requester_id) WHERE status='pending' DO NOTHING`, same technique as
`ModerationCasesRepository.createOpenCase()`. Throttled 10/60s (matches `Booking.Create`'s
precedent for a consequential write). Response never includes `evidence`. Audit
(`business.claim_requested`) recorded after the insert.

## Queue/detail behavior

`GET /business-claims` defaults to `status=pending` when unspecified (the "queue" definition),
accepts `status`/`place_id` filters, deterministic ordering (`created_at ASC, id ASC`), no
`evidence` in the list shape. `GET /business-claims/{id}` returns the full record including
`evidence` — reachable only through `Business.Verify`. Both are pure reads (no repository write
calls). Unknown id → 404. A plain `member` gets 403 on both.

## Decision transaction

Single `DataSource.transaction()` in `BusinessClaimsService.decide()`:

1. Row-lock the claim (`SELECT ... FOR UPDATE`).
2. Reject self-verification (`actorId === requesterId`) — 403.
3. `reject`: FSM validates the transition, `updateDecision()` writes `rejected` + `reason_code` +
   `decision_note`.
4. `approve`: FSM validates the transition is legal from the current state, then row-locks any
   active owner for the place (`BusinessMembersRepository.findActiveOwnerForUpdate`). If one
   exists, the claim is redirected to `disputed` instead of approved (no owner/role/verification
   writes happen). If none exists, `createOwner()` inserts the `business_members(owner)` row —
   wrapped so a `23505` unique-violation on `uq_member_owner` (the rare true race between two
   simultaneous first-approvals for the same place) is caught and also redirected to `disputed`
   rather than surfacing a raw 500.
5. Commit.
6. Audit recorded **after** commit only (`business.claim_${finalStatus}`), same INV-9-style
   discipline as `ModerationService.decide()`.

## Ownership membership / grant behavior

On approval: `business_members` row inserted with `role='owner'`, `claim_id` set,
`granted_by=actorId`. `UserRolesRepository.assign()` called in the same transaction with
`scopeType: managed`, `businessId: placeId`, `roleId` resolved from `roles.code='business_owner'`,
`grantedBy=actorId`. Verified live: the inserted `user_roles` row has `scope_type='managed'` and
`business_id` equal to the claimed place's id.

## Verification-column behavior

On approval only: `places.verificationStatus = 'official'`, `places.verifiedAt = <decision
timestamp>`, written via `PlacesRepository.updateScalars(placeId, {...}, manager)` inside the same
transaction. No `verifications`/`verification_events`/`verification_votes` rows are created —
those tables do not exist in this repository.

## ADR-019 integration proof

`business-claims.e2e-spec.ts`'s approve test, after confirming the `business_members`/`user_roles`/
verification-column writes directly via SQL, immediately exercises the **pre-existing, unmodified**
ADR-019 path: the newly-approved owner calls `PATCH /places/{placeA}` (`Place.Edit.Managed`,
`IDENTITY_PLACE_RESOLVER`, live since M0.2) and receives `200`; the same owner calls
`PATCH /places/{placeB}` and receives `403`. Zero new authorization code was written for this —
it is proof that a real `business_owner` grant produced by this milestone flows correctly through
the resource-scoped machinery ADR-019 already shipped.

## Focused e2e results

`business-claims.e2e-spec.ts`, live Postgres, 8/8 passing:

- anonymous → 401 on submit.
- member submits claim → 201 (no `evidence` in response); duplicate resubmit → 409.
- moderator queue → 200 (defaults to pending); member queue → 403; moderator detail → 200 with
  `evidence`; member detail → 403; unknown id → 404.
- self-verification → 403, claim status unchanged.
- reject without `reason_code` → 422 (claim stays pending); reject with `reason_code` → 200
  rejected + audit row confirmed via SQL.
- withdraw by requester → 200 withdrawn; approve-after-withdraw → 422; stranger withdraw on an
  already-withdrawn claim → 403 (ownership check runs before the FSM check, so this holds
  regardless of claim state).
- approve → `business_members(owner)` row confirmed (role/revoked_at/claim_id/granted_by all
  checked via SQL), `user_roles` grant confirmed (`scope_type=managed`, `business_id=placeA`),
  `places.verification_status='official'`/`verified_at` populated confirmed, audit row confirmed —
  plus the ADR-019 proof above in the same test.
- second claim on a place with an active owner → decide(approve) returns `disputed` (not
  `approved`); second claimant received **zero** `business_owner` grant and **zero**
  `business_members` row (verified via SQL, correctly excluding their pre-existing `member` role
  row from the check); disputed claim then resolved via `decide(reject)` → `rejected`.

Two real bugs were found and fixed during this work, both in the **test file**, not the
implementation: (1) an assertion checked "zero `user_roles` rows" for the losing claimant instead
of "zero `business_owner` rows" — every test fixture user legitimately has a `member` row; (2) the
cleanup order deleted `places` before `user_roles`, violating `fk_user_roles_business`
(`user_roles.business_id → places`, `ON DELETE NO ACTION` — pre-existing constraint from
`AddUserRoleBusinessFk`, not something this work added). Both fixed; rerun clean.

## Live rollback evidence

A temporary, explicitly-scoped drill: a `throw` was inserted in `decide()`'s approve branch
**after** `business_members` insert + `user_roles.assign()` + `places.updateScalars()` had all
already executed inside the transaction, but **before** the claim-status `updateDecision()` call.
A dedicated temporary e2e test (`test/_rollback-drill.e2e-spec.ts`, gated behind
`FORCE_ROLLBACK_DRILL=1`) submitted a claim, called `decide(approve)`, got a real `500` from
Postgres/Nest, then queried all four areas directly via SQL:

- `business_claims.status` — still `pending`, `reviewer_id`/`decided_at` still `NULL`.
- `business_members` — zero rows for the place.
- `user_roles` — zero `business_owner` rows for the requester.
- `places.verification_status`/`verified_at` — still `pending`/`NULL`.

All four reverted to baseline together, confirming the whole decision is one atomic unit. The
throw and the temporary test file were removed immediately after confirmation; the real e2e suite
was rerun afterward to confirm normal behavior was restored (still 8/8 passing). Zero residue from
the drill confirmed via SQL.

## Full regression

- New unit tests: FSM 32/32, service 23/23, migration structural tests 13+3/16 — all passing.
- Full backend unit suite: **117 suites / 1330 tests**, all passing (up from the pre-existing
  113/1262 baseline recorded in ADR-019's M0.3 report).
- Focused business e2e: 8/8 passing (see above).
- Full backend e2e suite: **24 suites / 206 tests**, all passing (up from 23/198).
- Backend typecheck: clean (`tsc --noEmit`, exit 0).
- Backend lint: clean on every file this work touched. Note: an ad-hoc broader lint pass
  (`eslint src/**/*.ts test/**/*.ts`) surfaced one pre-existing warning in
  `test/authz-own-scope-hardening.e2e-spec.ts` (unused `PRINCIPAL_RESOLVER` import) — confirmed via
  `git log`/`git diff` to predate this session entirely (last touched at commit `1264d2e`, before
  this work began) and out of this file's scope to fix. The **actual** CI-relevant lint script
  (`api:lint` → `eslint "src/**/*.ts" --max-warnings=0`, which does not include `test/`) passes
  clean.
- Backend build: clean (`nest build`).
- Full monorepo build: 4/4 tasks successful (`turbo run build`).
- Full monorepo typecheck: 6/6 tasks successful.
- Full monorepo lint: 6/6 tasks successful.
- `git diff --check`: clean (only pre-existing LF/CRLF warnings, no errors).
- Secret scan: clean across all 21 files this work added or touched.

## Migration drill

Apply (both new migrations) → revert `SeedBusinessPermissions` → revert `InitBusinessClaims`
(self-refusing guard correctly checked `decided_at`, found 0, allowed the drop) → verified zero
residue via direct SQL (`\dt business*`, `pg_type` query, `permissions` query) → reapply both
cleanly. Confirmed live on the real Docker Postgres instance.

## Cleanup verification

After the final clean e2e run, direct SQL confirmed zero residue scoped to this feature's own test
fixtures: `business_claims`/`business_members` tables empty (0 rows each — no real data exists
yet), 0 users matching `e2e_biz_%`/`e2e_rollback_%`, 0 places matching this feature's fixture
naming. (677 pre-existing `e2e_%`-prefixed users belong to other, unrelated e2e suites in this
repository and are out of this work's scope.)

Two earlier failed runs (before the cleanup-order and audit-log-FK fixes described above) left
residue behind; that residue was identified via FK relationships (not just name matching, since one
fixture place had been renamed mid-test by the ADR-019 proof step) and cleaned manually before the
final residue check.

## Documentation / governance

- `docs/99-decisions/ADR-015-business-ownership-model.md` — appended an "Implementation Status"
  section (§Decision/§Alternatives/§Consequences untouched) documenting this milestone, the Owner
  decisions as implemented, and the ADR-019 integration proof.
- `docs/data/modules/business.md` — added an implementation-status note at the top (same pattern as
  `moderation-design.md`'s milestone banners); removed the now-inaccurate "chỉ thiết kế (không
  code)" claim from the intro line.
- `docs/api/openapi.yaml` — replaced the old speculative `/business/claims*` stub (never
  implemented, different path shape) with the real `/business-claims*` contract matching
  `BusinessClaimsController` exactly, plus `BusinessClaimSummary`/`BusinessClaimDetail`/
  `BusinessClaimEvidenceItem` schemas. Left the `/business/{id}/dashboard`,
  `/business/{id}/managers[/…]`, `/business/{id}/transfer` stubs untouched — still unimplemented,
  still out of scope. Validated with `js-yaml` (parses clean, new paths/schemas present).
- `docs/delivery/state.yaml` — `current.task` entry updated with this milestone's full record,
  chaining the prior ADR-019 M0.3 entry below it as `---- prior state ----`, same convention used
  throughout this file's history. Validated with `js-yaml` (parses clean).
- `docs/data/database.md` — **not modified**. Its table catalog already lists `business_claims`/
  `business_members` (§3.19–3.20) marked ✅, which in this file's convention means "design
  Accepted," not "migrated" — that claim was already accurate before this work and remains
  accurate now. No table-catalog change was required.

No historical ADR decision content (§Decision, §Alternatives, §Consequences of ADR-015, or any
other ADR) was rewritten.

## Remaining ADR-015 work

Per business.md §3/§7 and the Owner's exclusion list, still open: Manager assignment/revocation
(UC-B6), ownership transfer (UC-B7), business dashboard (UC-B3/B5 — info edit, analytics), review
replies (UC-B4), notifications, multi-branch/chain brand-linking (Wave 5, if it ever becomes
needed), and ADR-008's full Verification entity (deferred by Owner Decision 1, not by lack of
need — the cache-column approach used here is not a substitute for the state machine/audit trail/
community-voting design ADR-008 actually specifies, should that ever be prioritized).

## Final git status

```
 M apps/api/src/app.module.ts
 M apps/api/src/modules/places/repositories/places.repository.ts
 M apps/api/src/modules/rbac/repositories/user-roles.repository.ts
?? apps/api/src/core/database/migrations/1720003600000-InitBusinessClaims.ts
?? apps/api/src/core/database/migrations/1720003700000-SeedBusinessPermissions.ts
?? apps/api/src/core/database/migrations/__tests__/1720003600000-InitBusinessClaims.spec.ts
?? apps/api/src/core/database/migrations/__tests__/1720003700000-SeedBusinessPermissions.spec.ts
?? apps/api/src/modules/business/
?? apps/api/test/business-claims.e2e-spec.ts
 M docs/99-decisions/ADR-015-business-ownership-model.md
 M docs/api/openapi.yaml
 M docs/data/modules/business.md
 M docs/delivery/state.yaml
?? docs/delivery/reports/ADR-015-BUSINESS-CLAIM-FOUNDATION-2026-08-05.md
```

## Commit hashes

Recorded after commits are created (see final report message for this session).
