# ADR-008 — CORRECTION MILESTONE

## Status

Narrow correction milestone, run immediately after the ADR-008 post-implementation review (PIR).
Fixes exactly the four PIR items the Owner authorized (C1, F1, T1, X1) plus the documentation
statements the PIR identified as wrong or misleading. **No schema change, no migration.** Explicitly
out of scope and not started: Claim→Source integration, scheduler, reconciliation job, queue
reassignment, metrics, auto-reject, demotion, dashboards, new APIs.

## Issues fixed

### C1 (Critical) — conflicting `verification_status` writes

**Problem.** Two independent writers owned `places.verification_status`, which is returned on
`@Public` place endpoints via `toPlaceCard` — i.e. the public trust badge. Two paths were reachable
with ordinary supported operations:

- **(a) Silent downgrade** — claim-approved place (cache `official`, no `verifications` row) → any
  moderator calls `POST /verifications` → new `pending` row → `syncTargetCache` overwrites
  `official` → `pending`. The business loses its badge from an unrelated action.
- **(b) Permanent divergence** — place with an existing `verifications` row (e.g. `verified`) →
  claim approved → cache forced to `official` while the entity stays `verified`. `uq_verif_place`
  keeps the row forever and the expiry job reasons off the entity, so the cache's `official` never
  expires.

**Fix — minimal defensive guard, both directions. No integration.**

- `BusinessClaimsService.decide(approve)` writes the cache **only** when the place has no
  `verifications` row. If one exists, that row owns the cache and the claim does not overwrite it.
  The claim still approves normally — ownership, `business_members` and `user_roles` are untouched.
  The outcome is recorded in the audit context as `verification_cache_written` (`true` = written,
  `false` = guard blocked it, `null` = reject/dispute branch, which never reaches the cache step),
  so the decision is visible rather than silent.
- `VerificationsService.submit()` returns **409** when the target already carries a *trusted* status
  set outside the verification system and no `verifications` row exists. It deliberately does **not**
  adopt the cache as an initial row state: `official` requires `source_id`
  (`ck_verif_official_source`) and a claim produces no `sources` row, so adoption would violate
  ADR-008 itself.

**Files:** `business-claims.service.ts`, `business.module.ts` (imports `VerificationsModule` —
one-directional, `VerificationsModule` does not import Business, no cycle),
`verifications.service.ts`.

**Resulting limitation, stated plainly:** a claim-approved business **cannot enter the verification
queue** until the Business Claim → Source → Verification integration milestone lands. This is a real
functional limitation accepted deliberately in exchange for not corrupting the public badge. It is
not the intended end state.

### F1 (Major) — stale terminal-state fields surviving transitions

**Problem.** `expiresAt`, `reasonCode` and `rejectedReason` survived into states they don't belong
to. The concrete failure: `official(expires_at=T)` → `expired` → resubmit → `verify` produced a
`verified` row **still carrying the past `expires_at=T`**, which `expireOverdue()` then demoted on
its very next run — a moderator's verification silently evaporating. Separately,
`reason_code='fabricated'` could appear on a row that was never rejected, and is returned by the API.

**Fix.** Fields are cleared wherever they don't belong:

| Transition | Cleared |
|---|---|
| resubmit → `pending` | `reasonCode`, `rejectedReason`, `expiresAt` |
| → `verified` | `reasonCode`, `rejectedReason` |
| → `official` | `reasonCode`, `rejectedReason` |
| → `rejected` | `expiresAt` |

**Second-order bug found by the new e2e while fixing this:** `submit()`'s resubmit branch built its
response from the **pre-update** entity (`{ ...existing, status, lockVersion }`), dropping the rest
of the patch — so the API returned the old `expires_at`/`reason_code` even though the database row
was already correct. The unit test passed (it asserts what `casUpdate` receives); only the live e2e
caught it. Fixed by returning `{ ...existing, ...resubmitPatch, lockVersion+1 }`, matching the
`transition()`/`vote()` convention that was already correct.

### T1 (Major) — duplicate submit surfaced as HTTP 500

**Problem.** Two concurrent `submit()` calls for the same target both read `findActiveByTarget` as
null and both insert. The partial-unique index correctly prevented a duplicate row (integrity was
never at risk), but the raw `23505` was unmapped and surfaced as a 500.

**Fix.** The unique-violation helper that already existed for `uq_member_owner` was extracted from
`BusinessClaimsService` into `src/common/db/unique-violation.ts` and is now used by both call sites.
`submit()` catches violations of `uq_verif_place`/`uq_verif_contact`/`uq_verif_price` and returns
**409**. It matches on the specific constraint names, so any other database error still propagates
unchanged rather than being swallowed into a 409 — covered by a dedicated test.

### X1 (Major) — broken e2e cleanup for `sources`

**Problem.** The teardown's `sources` cleanup could never match anything:
`WHERE author_user_id = ANY($1) OR id NOT IN (SELECT id FROM sources)` — `author_user_id` is never
set by the fixture, and the second predicate is a tautological false — and a
`.catch(() => undefined)` hid the no-op. Every `sources` row the suite created leaked. **12 leaked
rows** were confirmed in the dev database across three runs. The original delivery report's
"zero residue" claim was therefore false; see the correction note in that report.

**Fix.** `sources` and `price_history` ids are tracked in arrays and deleted explicitly by id, in
FK-safe order (verifications and their children first — `source_id` is `ON DELETE NO ACTION`, so
deleting a referenced source would otherwise be blocked), with the error-swallowing `.catch()`
removed. The `price_history` fixture that previously cleaned up inline now uses the tracked helper.
The 12 pre-existing leaked rows were deleted.

**Proof, not assertion.** After a full suite run, all 11 affected tables were queried directly:

```
sources 0 · verifications 0 · verification_events 0 · verification_votes 0 · price_history 0
contacts 0 · business_claims 0 · business_members 0 · e2e users 0 · e2e places 0
places with verification_status <> 'pending' 0
```

## Tests added

- **Unit, `verifications.service.spec.ts`** (44 total, up from 33): C1 guard blocks all three trusted
  cache statuses and allows all three non-trusted ones; T1 maps the three target constraints to 409
  and lets a non-23505 error propagate; F1 clears the right fields on resubmit, verify and reject.
- **Unit, `business-claims.service.spec.ts`** (26 total, up from 23): C1 guard skips the cache write
  when a `verifications` row exists while still granting ownership; writes it when none exists; and
  records `verification_cache_written` as `true`/`false`/`null` on the three branches.
- **E2E, `verifications.e2e-spec.ts`** (16 total, up from 12): C1 direction (a) — claim-approved
  place, submit returns 409 and the cache stays `official` with still zero `verifications` rows;
  C1 direction (b) — claim approved on a place that already has a `verified` row keeps the claim
  approved and ownership granted while the cache stays `verified`, entity and cache agree, and the
  audit records `verification_cache_written: false`; F1 — the full
  `official → expired → resubmit → verify → job` chain no longer self-expires; F1 — reject clears
  `expires_at` and resubmit clears `reason_code`/`rejected_reason`; X1 — every created
  `sources`/`price_history` row is tracked for teardown.

## Validation

| Check | Result |
|---|---|
| Migration safety | **N/A — no migration in this correction.** Schema unchanged; verified `migration:show` still ends at `SeedVerificationPermissions1720004100000` and the live `verifications` table definition is byte-identical. |
| Rollback proof | **N/A — no new transaction boundary.** The C1 guard and F1 field-clearing sit inside the existing `decide()` / `submit()` / `transition()` transactions already proven atomic by the Foundation milestone's forced-failure drill. No new drill was staged rather than theatrically re-running the same one. |
| Unit — verifications service | 44/44 |
| Unit — business claims service | 26/26 |
| Full backend unit suite | 125 suites / 1454 tests |
| Focused verification e2e | 16/16 |
| Full backend e2e suite | 27 suites / 241 tests |
| Backend typecheck / lint / build | clean / clean / clean |
| Monorepo typecheck + lint + build | 12/12 tasks |
| Zero residue | proven across 11 tables (above) |
| Secret scan | clean |
| `git diff --check` | clean |

## Remaining intentional limitations

Unchanged by this milestone, and deliberately so — each belongs to a later milestone:

1. **Claim-approved businesses cannot enter the verification queue** (the direct cost of the C1
   guard) until Business Claim → Source → Verification integration lands.
2. **Auto-reject on high dispute, and demotion after `community_verified`** — described in
   `verification.md` §3.1, never implemented. Now disclosed in both the ADR and `verification.md`.
3. **No scheduler** — `expireOverdue()` exists but nothing calls it periodically, so in production
   nothing actually expires yet.
4. **No reconciliation/repair tooling** for cache ↔ `verifications` divergence, and no recompute of
   `confirm_count`/`dispute_count` when a user (and their votes) is deleted.
5. **No unassign/reassign**, no "unassigned" or SLA-breach queue filters — a claimed item stays
   locked to one moderator.
6. **`expireOverdue()` is unbounded** — no batching, time budget or cursor.
7. **No §9B observability/metrics.**

## Files changed

Added: `apps/api/src/common/db/unique-violation.ts`, this report.
Modified: `verifications.service.ts`, `verifications.service.spec.ts`,
`business-claims.service.ts`, `business-claims.service.spec.ts`, `business.module.ts`,
`test/verifications.e2e-spec.ts`, `docs/99-decisions/ADR-008-verification-model.md`,
`docs/data/modules/verification.md`,
`docs/delivery/reports/ADR-008-VERIFICATION-FOUNDATION-2026-08-06.md`, `docs/delivery/state.yaml`.

## Commit hashes

Recorded in a follow-up entry after commits are created (see final status).
