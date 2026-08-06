# ADR-008 — VERIFICATION FOUNDATION

## Status

First ADR-008 implementation in this repository. Scope delivered exactly as specified in the
confirmed Owner decisions: `verifications`/`verification_events`/`verification_votes` entities,
optimistic-lock state machine (submit/claim/verify/official/reject/vote/expire), exclusive-arc cache
sync onto `places`/`contacts`/`price_history`, migrations, repositories, service, controller,
OpenAPI, unit tests, e2e tests, a real forced-failure rollback drill, live Docker/Postgres
validation, a migration apply/revert/reapply drill, documentation, and three scoped commits.
`BusinessClaimsService.decide()` (ADR-015) was explicitly left untouched, per Owner Decision 1.
No later Business/Place milestone was started.

## Preceding read-only assessment

Before any code was written, a full read of ADR-008, `verification.md`, the current
implementation, the live schema, and ADR-015's integration code surfaced two contradictions and
stopped for a decision, rather than resolving them unilaterally:

1. `BusinessClaimsService.decide()` already writes `places.verificationStatus=official` directly,
   with zero `verifications` row — building the new entity as "the" source of truth without
   addressing this would leave every claim-approved business with an official status backed by no
   audit trail and no source evidence, permanently. A real fix requires either synthesizing a
   `sources` row from `business_claims.evidence` (Source-module scope) or loosening the
   `official`-requires-`source_id` CHECK (which directly contradicts ADR-008 §Decision item 5).
2. `verification.md` §5D's own transition-actor table lists "Moderator / Business (đã claim)" as
   valid actors for `-> official` via `Verification.Verify`, but `rbac.md`'s capability matrix and
   the already-seeded `SeedRbac` grant say `Verification.Verify` is moderator-only — the two design
   docs disagree with each other on a concrete permission question.

## Owner decisions applied

1. **Business Claim integration — left alone, transitional exception.**
   `BusinessClaimsService.decide()` continues writing `places.verificationStatus`/`verifiedAt`
   directly on claim approval. No `verifications` row is created from a business claim, no
   `verification_events` are written for that path, no `sources` row is synthesized from
   `business_claims.evidence`, and the `official`-requires-`source_id` CHECK is not loosened. The
   new `verifications` table is authoritative only for the verification workflows this milestone
   implements (`/verifications/*`) — not for the ADR-015 claim path. Business Claim → Source →
   Verification integration is explicit future work requiring its own Source-model decision.
2. **Verification decision permissions — unchanged.** `Verification.Verify`/`Verification.Reject`
   stay exactly as already seeded: moderator-only, unscoped/global (administrator/
   super_administrator inherit through the existing DAG). No grant to `business_owner`, no
   `Verification.Verify.Managed`/`Verification.Reject.Managed`. `verification.md`'s "Moderator /
   Business (đã claim)" wording is read as the conceptual business outcome ADR-015 already delivers
   through its own separate `Business.Verify` path, not a literal grant on this permission.
3. **`Verification.Vote` — seeded fresh, granted only to `local_guide`.** Matches rbac.md exactly
   (the one role it names explicitly); `moderator`/`administrator`/`super_administrator` inherit
   through the real, already-seeded `role_parents` DAG edge (`moderator -> local_guide`), not
   assumed from role naming. Unscoped/global, no `@AuthorizationContext` needed.

### Necessary refinements beyond the literal decision list

- **Target already holding another active role isn't part of this ADR** — not applicable here
  (that concern is ADR-015's). No analogous refinement was needed for Verification; the FSM follows
  `verification.md` §3.2's transition table literally, preferring it over the informal §3 ASCII
  diagram at the one point they disagree (`expired -> rejected`, which appears only in the diagram's
  loose annotation, not in the structured table — implemented as NOT valid; `expired` must resubmit
  to `pending` before it can be rejected again).
- **Official-source-group validation** (`source.type` must be `business_owner`/`official_website`/
  `government`, per verification.md §7) cannot be expressed as a DB `CHECK` (it depends on the
  `sources` table) — enforced in `VerificationsService.official()` instead, matching how other
  cross-table invariants in this codebase are enforced at the service layer.
- **Vote weight left uniform (=1) for every voter.** `verification.md` §10 item 7 itself marks
  role/karma-based weighting as still open ("Member=1, Local Guide=?, Verified Local=? chốt cùng
  growth.md") — this is not a contradiction to stop on, it's an ADR-008-acknowledged open parameter.
  The `weight` column is fully wired for a real table once growth.md decides it; this milestone does
  not invent numbers ADR-008 never approved.
- **`claim` (assigned_to/priority/sla_due_at)** implemented as a plain field update, not a status
  transition — no `verification_events` row, matching §5D listing "nhận việc / đặt assigned_to,
  priority" as a row separate from the status-transition rows.
- **Expiry job** (`expireOverdue()`) is a plain method with no scheduler wired, mirroring the
  pre-existing `InventoryHoldsRepository.expireOverdueHolds()` convention exactly — a real job in a
  later sprint just needs to call it periodically.
- **SLA default** (+48h when `sla_due_at` isn't supplied) is an explicit assumption; ADR-008 doesn't
  specify one.

## Housekeeping (unrelated to this milestone, fixed in passing)

Before starting, the live database still held 5 users / 2 places / 5 `user_roles` rows left over
from an abandoned debug script in the previous session's ADR-015 work (a script that generated
tokens with the wrong JWT secret and was replaced, but never cleaned up its own output). Deleted;
reverified zero residue and all 49 real places at `verification_status='pending'` before proceeding.

## Files added

- `apps/api/src/modules/verifications/entities/verification.entity.ts`,
  `verification-event.entity.ts`, `verification-vote.entity.ts`.
- `apps/api/src/modules/verifications/verification.enums.ts`,
  `verification.transition.ts` (+ `verification.transition.spec.ts`, 44 tests),
  `verification.mapper.ts`.
- `apps/api/src/modules/verifications/repositories/verifications.repository.ts`,
  `verification-events.repository.ts`, `verification-votes.repository.ts`.
- `apps/api/src/modules/verifications/dto/verification.dto.ts`.
- `apps/api/src/modules/verifications/verifications.service.ts` (+
  `verifications.service.spec.ts`, 33 tests), `verifications.controller.ts`,
  `verifications.module.ts`.
- `apps/api/src/core/database/migrations/1720004000000-InitVerifications.ts` +
  `__tests__/1720004000000-InitVerifications.spec.ts` (17 tests).
- `apps/api/src/core/database/migrations/1720004100000-SeedVerificationPermissions.ts` +
  `__tests__/1720004100000-SeedVerificationPermissions.spec.ts` (4 tests).
- `apps/api/test/verifications.e2e-spec.ts` (12 tests, live Postgres).

## Files modified

- `apps/api/src/app.module.ts` — registered `VerificationsModule`.
- `apps/api/src/modules/contacts/repositories/contacts.repository.ts`,
  `apps/api/src/modules/prices/repositories/prices.repository.ts` — each gained
  `updateScalars(id, patch, manager?)`, mirroring `PlacesRepository.updateScalars()` exactly, so
  `VerificationsService` can sync `verification_status`/`verified_at` onto whichever entity type the
  exclusive arc points at.
- `apps/api/src/modules/sources/repositories/sources.repository.ts` — `findById()` gained an
  optional transaction-manager parameter (same convention as `UsersRepository.findById()`), so the
  `official()` transition can validate the source inside its own transaction.

## Schema / migrations

No new enum for `verifications.status` — it reuses the exact `verification_status` Postgres type
`InitPlaces` already created for the `places`/`contacts`/`price_history` cache columns (same 6
values by design, per ADR-008 §Decision item 3-4). Three new enums:
`verification_method` (5 values), `verification_reason_code` (7 values, §4.1), `verification_vote_choice`
(2 values). Three new tables:

- **`verifications`** — exclusive arc (`place_id`/`contact_id`/`price_history_id`, `CHECK` exactly
  one non-null), `CHECK` official requires `source_id`, `CHECK` rejected requires `reason_code`,
  `CHECK` confidence 0-100, `lock_version` (optimistic lock), partial-unique index per target
  (`uq_verif_place`/`uq_verif_contact`/`uq_verif_price` — one row per target, reused for its entire
  lifecycle), queue indexes (`idx_verif_queue`, `idx_verif_sla`, `idx_verif_expires`).
- **`verification_events`** — append-only, `ON DELETE CASCADE` from `verifications`, index
  `(verification_id, created_at)`.
- **`verification_votes`** — `UNIQUE (verification_id, user_id)` (one vote per person, idempotent
  change via upsert), `ON DELETE CASCADE` from both `verifications` and `users` (matches
  `business_members.user_id`'s precedent).

FK deletion policy: `source_id` on `verifications` is `ON DELETE NO ACTION` (deliberately, not
`SET NULL` like elsewhere — a `SET NULL` cascade could silently violate the official-requires-
source_id `CHECK` for a still-official row); `assigned_to`/`verified_by`/`created_by` are
`ON DELETE SET NULL` (matches `Source.verifiedBy`/`ModerationCase.assignedTo` precedent).
Self-refusing `down()`: refuses to revert if any `verification_events` rows exist (a real transition
happened), same pattern as `InitModeration`/`InitBusinessClaims`.

## Permissions

| Permission | Granted to | Changed this milestone? |
|---|---|---|
| `Verification.Verify` | `moderator` (+ DAG: administrator, super_administrator) | No — pre-existing, unchanged |
| `Verification.Reject` | `moderator` (+ DAG) | No — pre-existing, unchanged |
| `Verification.Vote` | `local_guide` (+ DAG: moderator, administrator, super_administrator) | Yes — newly seeded this milestone |

Confirmed live via SQL and via the real `role_parents` DAG edge `moderator -> local_guide` (already
present from `SeedRbac`) — `Verification.Vote` was seeded as exactly one explicit
`role_permissions` row (`local_guide`), with DAG inheritance doing the rest, not three redundant
grants.

## Endpoints

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/verifications` | `Verification.Verify` | submit/resubmit — 201 |
| GET | `/verifications` | `Verification.Verify` | moderator queue, paginated |
| GET | `/verifications/{id}` | `Verification.Verify` | detail |
| GET | `/verifications/{id}/events` | `Verification.Verify` | append-only history |
| POST | `/verifications/{id}/claim` | `Verification.Verify` | queue metadata only, no transition |
| POST | `/verifications/{id}/verify` | `Verification.Verify` | pending\|community_verified -> verified |
| POST | `/verifications/{id}/official` | `Verification.Verify` | pending\|verified\|community_verified -> official |
| POST | `/verifications/{id}/reject` | `Verification.Reject` | * -> rejected |
| POST | `/verifications/{id}/votes` | `Verification.Vote` | cast/change vote, may auto-promote |

None require `@AuthorizationContext` — every permission here is unscoped/global, same class as
`Business.Claim`/`Place.Approve` (ADR-019 D2 step 3, context-free PDP path).

## Transaction / concurrency model

Every status transition is one transaction: compare-and-set `verifications` on `lock_version`
(`casUpdate()`, no `FOR UPDATE` row lock — true optimistic concurrency, matching §5C's explicit
rationale of three concurrent actors: moderator, community-vote auto-promotion, expiry job) + insert
one `verification_events` row + sync the target's cache column, not split apart. A lost CAS (0 rows
affected) raises a `409 Conflict` uniformly across every decision endpoint, telling the caller to
re-read and retry — no silent retry loop anywhere, including votes (kept uniform for simplicity and
testability at this "Foundation" milestone's scope). `verified_at` on the target entity is set only
when the transition's destination status is itself trusted (`verified`/`official`/
`community_verified`) — left untouched on reject/expire, preserving "last time this was trusted" as
historical fact rather than clearing it.

## Vote / community auto-promotion

Casting a vote upserts into `verification_votes` (one row per `(verification_id, user_id)`,
idempotent — changing a vote updates the existing row, doesn't duplicate), recomputes
`confirm_count`/`dispute_count` from the votes table (the votes table is the source of truth, the
counts are a derived cache), and — only when the verification is still `pending` and the threshold
is met (`Σweight(confirm) ≥ 5` and `dispute/confirm < 0.2`) — auto-transitions to
`community_verified` within the exact same transaction as the triggering vote, recording
`method=community_vote`, `actor_id=null` (system-attributed, not any single voter).

## Expiry job

`VerificationsService.expireOverdue(now)` — no scheduler wired (no `@nestjs/schedule`/BullMQ/cron
infrastructure exists in this repo), matching the pre-existing
`InventoryHoldsRepository.expireOverdueHolds()` convention exactly. Each overdue row is processed in
its own transaction (a lost CAS on one row is skipped, not fatal to the batch). No `audit_logs`
entries are written for this job (no human actor; the domain-level `verification_events` already
records each transition permanently) — same reasoning as `expireOverdueHolds()`.

## Focused E2E results

`verifications.e2e-spec.ts`, live Postgres, 12/12 passing:

- Anonymous → 401; member without `Verification.Verify` → 403 on submit.
- Full lifecycle on one place: submit → 201 pending; duplicate submit while pending → 422; claim →
  `assigned_to` set; verify → `verified`, cache synced with `verified_at` set; official with a
  wrong-type source → 422, with a correct-type source → 200 (`expires_at` defaulted to +12 months);
  reject → `rejected`, cache synced, `verified_at` left untouched from its earlier value; reject
  missing `reason_code` → 400 (DTO validation, before any transaction); resubmit from rejected →
  201, **same** verification `id` (row reused, not re-inserted); `/events` shows the exact ordered
  history `pending -> verified -> official -> rejected -> pending`.
- `official` missing `source_id` → 400. `official` on a `price_history` target with `expires_at:
  null` explicit → 422 (mandatory for price history). `target_type=contact` proven end-to-end
  (exclusive arc isn't place-only) — submit + verify correctly dispatch to `ContactsRepository`.
- `claim` already held by another moderator → 403.
- Member without `Verification.Vote` → 403 on vote. Five distinct `local_guide` users voting
  `confirm` (weight 1 each) auto-promote to `community_verified` on exactly the 5th vote, within
  that same request; `verification_events` records `method=community_vote`, `actor_id=null`;
  moderator can still intervene `community_verified -> verified` afterward. Changing one's own vote
  is idempotent — doesn't double-count `confirm_count`.
- `expireOverdue()` transitions only the row actually past `expires_at` (verified via direct SQL
  push into the past), leaves a not-yet-expired `official` row completely alone, and does not touch
  `verified_at` on the expired row.
- **Transitional exception:** submitting and approving a real business claim through
  `/business-claims/{id}/decide` sets `places.verification_status='official'` (the pre-existing
  ADR-015 path, unchanged) while `SELECT count(*) FROM verifications WHERE place_id=...` returns
  **0** — confirming the new tables are not wired into that path.

  > **CORRECTED after the post-implementation review (2026-08-06).** This bullet originally read
  > "proven live … exactly as decided", which overstated what the test established. It used a
  > *fresh* place and asserted only `count = 0`, so it proved the two systems don't interact on a
  > clean slate — **not** that they coexist safely. The PIR found two reachable failure paths
  > (claim-then-submit silently downgrades the public badge; submit-then-claim diverges
  > permanently). Both are now closed by a defensive guard and covered by e2e in both directions.
  > See [ADR-008-CORRECTION-2026-08-06.md](ADR-008-CORRECTION-2026-08-06.md).

## Rollback proof

A temporary forced-failure drill (throw inserted in the shared `transition()` helper immediately
after the CAS update + event insert + cache sync, but before the transaction callback returns/
commits) was run against real Postgres via `verify()`. Verified: `verifications.status`/
`lock_version` unchanged from baseline; zero new `verification_events` rows; `places.
verification_status` still `pending`, `verified_at` still null; a subsequent `GET` confirms the same
baseline state through the real API. All checks passed — full atomicity confirmed, not inferred.
The drill file was deleted and the throw removed immediately after confirming; a repository-wide
grep for `FORCE_ROLLBACK_DRILL`/`ROLLBACK_DRILL` after removal returned zero hits in this
milestone's code (one unrelated historical reference remains in an earlier, already-completed ADR-015
Claim Foundation report, documenting a different drill). The normal e2e suite was rerun immediately
after removal and passed clean (12/12).

## Migration drill

Apply → revert (self-refusing guard correctly did **not** fire — zero `verification_events` existed
at that point — and cleanly dropped all 3 tables + 3 new enum types, leaving the shared
`verification_status` enum and `Verification.Verify`/`Reject` permissions completely untouched) →
verified zero residue (`to_regclass` on all three tables returned null, `Verification.Vote` gone,
`Verification.Verify`/`Reject` still present exactly as before) → reapply (byte-for-byte schema
restoration confirmed via `\d verifications` and permission/grant queries). Confirmed live on the
real Docker Postgres instance.

## Full regression

- New unit tests: FSM 44/44, service 33/33, migration structural 17+4/21 — all passing.
- Full backend unit suite: **125 suites / 1448 tests** (up from 121/1354).
- Focused verification e2e: 12/12 passing.
- Full backend e2e suite: **27 suites / 237 tests** (up from 26/225).
- Backend typecheck: clean. Backend lint (`eslint "src/**/*.ts" --max-warnings=0`): clean.
- Backend build (`nest build`): clean.
- Full monorepo typecheck/lint/build (`turbo run typecheck lint build`, 5 packages, includes the
  Next.js `web` production build): **12/12 tasks successful**.
- `git diff --check`: clean (only pre-existing LF/CRLF warnings).
- Secret scan: manual pattern scan across all files this milestone added or touched — clean.

## Cleanup verification

> **CORRECTED after the post-implementation review (2026-08-06).** This section originally claimed
> the teardown "ran clean on every pass" and that residue was zero. **That was false.** The
> teardown's `sources` cleanup used a predicate that can never match (`author_user_id` is never set
> by the fixture, and `id NOT IN (SELECT id FROM sources)` is a tautological false), with a
> `.catch(() => undefined)` hiding the no-op — so **every `sources` row the suite created leaked**.
> Confirmed after the fact: 12 leaked rows across three runs. The tables I actually queried
> (`verifications`, `verification_events`, `verification_votes`, `users`, `places`) were genuinely
> at zero; I generalized from that partial check to a claim I had not verified.
>
> Fixed in the correction milestone: `sources` and `price_history` ids are now tracked and deleted
> explicitly in FK-safe order, the error-swallowing `.catch()` is gone, the 12 leaked rows were
> removed, and zero residue is now **proven by querying all 11 affected tables** after a full run
> rather than asserted. See [ADR-008-CORRECTION-2026-08-06.md](ADR-008-CORRECTION-2026-08-06.md).

Accurate statement of what held at the time of this milestone: the e2e teardown cleaned
`verification_votes`/`verification_events`/`verifications`, `contacts`, `wiki_revisions`,
`user_roles`, `places`, `audit_logs` and `users` correctly, but **not** `sources`. Rollback-drill
instrumentation was fully removed and that removal was correctly verified by grep. The pre-existing
unrelated residue found at session start (see Housekeeping) was cleaned and reverified separately.

## Documentation / governance

- `docs/99-decisions/ADR-008-verification-model.md` — new Implementation Status section appended
  (no historical Decision/Consequences/Alternatives content rewritten), documenting both Owner
  decisions and the pre-implementation contradiction findings that led to them.
- `docs/data/modules/verification.md` — banner added noting Foundation implemented, the transitional
  exception, and that §10 item 7 (vote weighting) remains open exactly as the doc already said.
- `docs/api/openapi.yaml` — replaced the stale, never-matching `/verifications/*` stub (wrong
  paths — `/assign` instead of `/claim`, `/vote` instead of `/votes`, no `POST /verifications` at
  all, `EmptySuccess` responses instead of the real envelope) with the exact contract matching
  `VerificationsController`, plus a completed `Verification` schema and new `VerificationEvent`
  schema. Validated with `js-yaml`.
- `docs/delivery/state.yaml` — `current.task` updated with this milestone's full record, chaining
  the ADR-015 Ownership Transfer entry below it.
- This report.

## Remaining ADR-008 / related work

Business Claim → Source → Verification integration (the transitional exception — needs its own
Source-model decision first); a fourth exclusive-arc target type (review/media, §10 item 6, still
open in the ADR itself); a real role/karma-based vote weight table (§10 item 7, still open in the
ADR itself); a real scheduler for `expireOverdue()`, SLA alerting, and queue dashboards (§9B
observability — deferred, matching the `expireOverdueHolds()` precedent already accepted elsewhere
in this repo). No Business/Place milestone beyond ADR-008 was started.

## Final git status

```
 M apps/api/src/app.module.ts
 M apps/api/src/modules/contacts/repositories/contacts.repository.ts
 M apps/api/src/modules/prices/repositories/prices.repository.ts
 M apps/api/src/modules/sources/repositories/sources.repository.ts
?? apps/api/src/core/database/migrations/1720004000000-InitVerifications.ts
?? apps/api/src/core/database/migrations/1720004100000-SeedVerificationPermissions.ts
?? apps/api/src/core/database/migrations/__tests__/1720004000000-InitVerifications.spec.ts
?? apps/api/src/core/database/migrations/__tests__/1720004100000-SeedVerificationPermissions.spec.ts
?? apps/api/src/modules/verifications/
?? apps/api/test/verifications.e2e-spec.ts
 M docs/99-decisions/ADR-008-verification-model.md
 M docs/api/openapi.yaml
 M docs/data/modules/verification.md
 M docs/delivery/state.yaml
?? docs/delivery/reports/ADR-008-VERIFICATION-FOUNDATION-2026-08-06.md
```

(`_rollback-drill-verification.e2e-spec.ts` was created and deleted within this session — it never
appears in the final status above.)

## Commit hashes

- `37b2435` — `feat(verification): add ADR-008 Verification Foundation`
- `e3122b1` — `test(verification): verify ADR-008 state machine and rollback`
- `f710614` — `docs(verification): record ADR-008 Verification Foundation milestone`
