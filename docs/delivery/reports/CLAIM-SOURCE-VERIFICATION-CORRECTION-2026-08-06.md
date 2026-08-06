# ADR-008 — CLAIM → SOURCE → VERIFICATION CORRECTION

## Status

Narrow correction milestone, authorized by the Owner after a **read-only post-implementation review**
of [CLAIM → SOURCE → VERIFICATION INTEGRATION](./CLAIM-SOURCE-VERIFICATION-INTEGRATION-2026-08-06.md).
The review found one **Critical** and four **Major** issues in a milestone that had already been
committed and reported as complete. This milestone fixes exactly the issues the Owner authorized —
no scope beyond them.

**No new schema, no new endpoint, no new migration.** `git status` confirms zero files added under
`apps/api/src/core/database/migrations/`.

Explicitly **not** implemented (Owner's DO-NOT list, none started): renewal/re-confirmation UX,
notifications, Source-to-place binding validation, `assigned_to`/`sla_due_at` clearing, a
`verification.set_official` audit event, owner dashboard, metrics, reconciliation tooling.

## Issues fixed

| # | Sev | Issue (from the review) | Fix |
|---|---|---|---|
| C-1 | **Critical** | Claim `evidence` copied into `sources.metadata`, and `GET /sources/:id` is `@Public()` returning the raw entity — private business documents readable unauthenticated | `metadata` is now `{business_claim_id}` only |
| M-1 | Major | `Source` created *before* the already-`official` check → orphan `sources` rows on every re-approval, and audit reported a `source_id` the verification never used | Lazy `createSource` callback; already-`official` checked first; returns the verification's real `sourceId` |
| M-4 | Major | Claim-driven `official` silently inherited `official()`'s 12-month expiry with no owner-accessible renewal path | `expires_at = null`, documented as deliberate interim policy |
| M-3 | Major | `docs/api/openapi.yaml` still asserted the old direct-cache model in two places; `409` undocumented on two endpoints | Both passages rewritten; `409` added to `decide` and `POST /verifications` |
| — | Minor | Stale comments in `places.repository.ts` and two migration headers | Refreshed with dated SUPERSEDED notes |
| — | Minor | Integration report accounting slips ("five" vs six bullets, "five writes instead of three", "127/1491") | Corrected in place with `**CORRECTED:**` notes |
| **X1′** | **Major (found during this milestone)** | 9 orphan `sources` rows in the dev DB, 6 still carrying `evidence` — the previous milestone's "zero residue" claim was scoped so it could not see them | Untracked-Source leak in the dispute e2e test fixed; orphans deleted; residue re-proven with an unscoped query |

### X1′ — the leak the previous milestone's zero-residue claim missed

Worth recording in full, because the previous report asserted zero residue and was wrong.

The claim was verified with two queries: `sources` joined to `e2e_%`-email users, and `verifications`
with `method='owner_claim'`. Neither could ever have caught the leak. `sources.author_user_id` is
`ON DELETE SET NULL`, so once the e2e users were deleted the join matched nothing; and `owner_claim`
verification rows genuinely do cascade away with their places. An **unscoped** query
(`SELECT count(*) FROM sources WHERE metadata ? 'business_claim_id'`) found **9** orphans, all with
null author, no referencing `verifications`/`verification_events`/`source_attributions`, and claims
already deleted — 6 of them still holding claim `evidence`.

Root cause isolated by running the file alone and counting before/after (8 → 9, exactly one per run):
the **first, successful** approve inside `business-claims.e2e-spec.ts`'s dispute test
(`claim thứ hai cho place ĐÃ có owner hiệu lực …`) creates a Source via `ensureOfficialFromClaim`
just like the main approve test, but its id was never pushed into `sourceIds`. The test only asserted
on the *second* (disputed) decision, so the Source it created was invisible to the file's cleanup.

Fixed by tracking that Source by real id. Re-ran the file: residue stayed flat at 9 (zero added). The
9 historical orphans were then deleted from the dev database after confirming all four reference
counts were 0.

## Privacy behavior

`sources.metadata` for a claim-created Source is now exactly `{business_claim_id: <uuid>}`.

Claim evidence remains reachable **only** through `GET /business-claims/{id}` behind
`Business.Verify` — unchanged. `business_claim_id` is a non-sensitive pointer a moderator resolves
from there.

Per Owner Decision 1, the public Sources API was **not** redesigned: `GET /sources/:id` stays
`@Public()` and still returns the raw entity. That was conditional on evidence no longer being
exposed after the change, which is now proven both ways:

- **Unit** — asserts the created Source's `metadata` with `toEqual({business_claim_id})` **and**
  `Object.keys(...)` **and** `not.toHaveProperty('evidence')`. Deliberately not `objectContaining`,
  which would have passed even with `evidence` still present (exactly how the original defect slipped
  through its own test).
- **Live e2e** — calls `GET /api/sources/:id` with **no** Authorization header, asserts `200`, asserts
  `metadata` equals `{business_claim_id}`, and asserts the serialized response body contains neither
  the evidence `reference` (`media-e2e-1`) nor its `type` (`business_license`) anywhere.

Residual (pre-existing, unchanged, out of scope): `GET /sources/:id` also publicly exposes
`author_user_id`, which for claim Sources is the requester's user UUID. Flagged, not fixed — the
Owner scoped this milestone to evidence, and changing the public Sources API was explicitly excluded.

## Already-official idempotency

`ensureOfficialFromClaim(placeId, {actorId, note, createSource}, manager)` now:

1. reads the place's `verifications` row;
2. **if it is already `official`, returns immediately** — `{verification: existing, sourceId:
   existing.sourceId, sourceCreated: false}`;
3. only otherwise calls `await input.createSource(manager)`, then branches
   (create-pending / resubmit / direct) and transitions.

The branch is a genuine no-op: **no** Source created, **no** `VerificationEvent`, **no** cache write,
**no** CAS. The audit context references the source actually attached to the verification, plus
`sourceCreated: false` so the no-op is explicit rather than silent.

`decide()` no longer creates the Source inline; it passes `createSource: (mgr) =>
this.createClaimSource(claim, decidedAt, mgr)`. Keeping the callback in `BusinessClaimsService` keeps
"what a claim's Source looks like" in the claim domain rather than pushing business-claim concepts
into `VerificationsService`.

Proven live (`verifications.e2e-spec.ts`): a moderator sets a place `official` via
`POST /verifications/{id}/official` with an `official_website` Source, then a claim on that same place
is approved. Asserted afterwards — 0 `sources` rows for that requester (before **and** after), 0 rows
matching the claim id, `verification_events` count unchanged, `lock_version` **and** `updated_at`
byte-identical, `source_id` still the original `official_website` Source, ownership still granted, and
the audit context carrying `{sourceId: <original>, sourceCreated: false}`.

The zero-Source assertion is scoped by `author_user_id = <this test's own requester>` rather than a
global `count(*)`: it still catches an orphan regardless of what `metadata` holds, but cannot be
disturbed by another e2e file running concurrently — the `--runInBand` lesson from the Scheduler
milestone, applied deliberately rather than rediscovered.

## Expiry policy

**Claim-driven `official` uses `expires_at = null`** (Owner Decision 3). `POST
/verifications/{id}/official` over HTTP keeps its 12-month default — unchanged.

Rationale, recorded because it is a deliberate divergence and not an oversight: verification.md §7
says an `official` expiry exists to *force the business owner to re-confirm*, but no path for the
owner to do so exists yet. `Verification.Verify` is moderator-only by Owner Decision 2 (ADR-008
Foundation), and re-claiming is redirected to `disputed` by BR-B2 because an active owner already
exists. A 12-month clock would therefore drop a legitimately-owned business's public badge to
`expired` with no owner-accessible recovery — only a moderator could restore it. `null` until renewal
UX exists; verification.md §7/§10-3 permit `expires_at` to be optional for `place` targets (mandatory
only for `price_history`).

Asserted at both levels: unit (the `casUpdate` patch's `expiresAt` is `null` and the returned entity's
is `null`) and live e2e (`SELECT expires_at FROM verifications` is `NULL` after a real claim approval,
in both integration tests).

## OpenAPI corrections

`docs/api/openapi.yaml` — not touched by the previous milestone, so it had been asserting the old
model since the integration shipped:

1. **§Verification header comment** — removed "Business Claim (ADR-015) … vẫn ghi thẳng cache
   `places.verification_status`" and its pointer to the now-closed "Ngoại lệ chuyển tiếp". Replaced
   with a description of the real flow: claim approval goes through `ensureOfficialFromClaim()` →
   `sources` → `verifications` (`method=owner_claim`) → `verification_events` → cache sync, one
   transaction, `verifications` as sole source of truth.
2. **`POST /business-claims/{id}/decide` description** — removed "đặt
   `places.verification_status=official`/`verified_at`". Now documents the full
   Source → Verification → VerificationEvent → cache chain, the `metadata`-contains-only-
   `business_claim_id` privacy rule (with the reason), `expires_at = null`, and the already-`official`
   no-op including `verification.sourceCreated=false` in the audit context.
3. **`409` added to `POST /business-claims/{id}/decide`** — a genuinely new client-visible failure
   mode introduced by the integration and previously undocumented: a concurrent transition on the
   place's `verifications` row (CAS loss) or a concurrent `POST /verifications` for the same place
   (`uq_verif_place`). Documents that the whole decision rolls back.
4. **`409` added to `POST /verifications`** — pre-existing omission covering both the T1 unique-violation
   race and the surviving legacy-data guard.
5. `404` on `decide` widened from the generic ref to also cover "source not found when setting
   official".

## Unit tests

`apps/api` unit: **127 suites, 1496 tests**, all passing (**+5** vs the integration milestone's 1491).

`verifications.service.spec.ts` — `ensureOfficialFromClaim` block reworked for the new signature and
return shape, plus four new tests:

- `expires_at` is `null` on the claim path (asserted on the real `casUpdate` patch, not just the
  return value);
- **CAS loss → `ConflictException`** (409), with `eventsRepo.append` and `updateScalars` both asserted
  not-called so no half-write is possible;
- **`uq_verif_place` unique violation → `ConflictException`** (409), same negative assertions;
- a non-unique-violation DB error is **rethrown unchanged**, proving 409 mapping doesn't swallow real
  failures.

The already-`official` test now asserts against a `createSource` **spy**: `expect(createSource).not
.toHaveBeenCalled()`. That is the assertion the original test structurally could not make, because the
Source was created outside the method.

`business-claims.service.spec.ts` — the `ensureOfficialFromClaim` mock now **invokes**
`input.createSource(mgr)` like the real implementation, so the Source assertions exercise a real code
path instead of passing vacuously. Added a no-op test whose mock does *not* invoke the callback,
asserting `sourcesRepo.create` **and** `save` both never called, ownership still granted, and audit
context `{sourceId: 'source-already-attached', sourceCreated: false}`.

## E2E / live validation

Live Postgres via Docker Compose (`postgres`/`redis`/`minio` all healthy). No new e2e files — three
existing tests extended and one added, in the two files the integration milestone already touched.

- `business-claims.e2e-spec.ts` — approve test now asserts `metadata` equals `{business_claim_id}`,
  `expires_at IS NULL`, `sourceCreated: true` in the audit context, and performs the unauthenticated
  `GET /api/sources/:id` privacy check. Dispute test now tracks the Source its first approve creates
  (X1′).
- `verifications.e2e-spec.ts` — new no-op test (described above); both existing integration tests now
  assert `expires_at IS NULL` and `Object.keys(metadata) === ['business_claim_id']`.

Focused: `business-claims` **8/8**, `verifications.e2e` **17/17** (was 16 — one added).

**Zero residue**, by direct SQL after the full e2e suite, using the unscoped query the previous
milestone should have used:

```
claim_sources (metadata ? 'business_claim_id'): 0
evidence_in_sources (metadata ? 'evidence'):    0
owner_claim_verifications:                      0
business_claims:                                0
business_members:                               0
```

**No rollback drill was re-run.** The integration milestone's drill already proved the seven writes
revert atomically, and this correction does not add, remove, or reorder any write inside the
transaction — it only makes one of them conditional and narrows a jsonb payload. Stated explicitly
rather than implied: atomicity still has **no standing regression test** (drills are temporary by
convention), which the review flagged as m-6 and which remains open.

## Full regression

| Gate | Result |
|---|---|
| BE unit | 127 suites, **1496** tests — all passing |
| BE e2e (`--runInBand`, live Postgres) | 28 suites, **250** tests — all passing |
| `tsc --noEmit` | clean |
| `eslint "src/**/*.ts" --max-warnings=0` | clean |
| Both modified e2e files linted individually | clean |
| `nest build` | clean |
| Monorepo `turbo run typecheck lint build` | **12/12 successful** |
| Zero residue | proven by unscoped SQL (above) |
| Secret scan over the diff | no findings |
| `git diff --check` | clean (only pre-existing CRLF advisories) |
| New migrations | **none** |

## Documentation / governance

- `docs/api/openapi.yaml` — the five corrections above.
- `docs/99-decisions/ADR-008-verification-model.md` — new Implementation Status entry for this
  correction; prior entries left verbatim.
- `docs/data/modules/verification.md` — banner updated with the three policy points (privacy, genuine
  no-op, `expires_at = null` as interim policy).
- `docs/delivery/state.yaml` — correction summary pushed to the top of the `current.task` comment
  chain; the integration milestone's summary demoted verbatim beneath it.
- `CLAIM-SOURCE-VERIFICATION-INTEGRATION-2026-08-06.md` — superseded-in-part banner plus five
  in-place `**CORRECTED:**` notes (three behavior statements, two accounting slips, and the
  zero-residue claim). History preserved, not rewritten.
- Code comments refreshed: `places.repository.ts` `updateScalars` (no longer cites
  `BusinessClaimsService` as a verification-cache writer, and names the sole real writer), and the
  `InitVerifications` / `InitBusinessClaims` migration headers (now dated `SCHEMA NOTE` +
  `SUPERSEDED` blocks stating the DDL never changed while the surrounding behavior did).
- This report.

## Remaining intentional limitations

Carried forward deliberately; none is a regression from this milestone.

1. **No owner renewal/re-confirmation workflow.** The direct reason `expires_at = null` is the interim
   policy. When renewal UX lands, revisit the expiry decision together with it.
2. **`GET /sources/:id` still publicly exposes `author_user_id`** (requester's user UUID for claim
   Sources). Out of scope per Owner Decision 1.
3. **No Source-to-target binding.** `buildOfficialTransition` validates only `source.type`, so a
   `business_owner` Source minted for place A can be used to make place B `official`. Requires
   `Verification.Verify` (moderator), so it grants no privilege a moderator lacks. Deferred.
4. **Stale `assigned_to`/`assigned_at`/`sla_due_at`** survive a claim-driven transition — a moderator's
   claimed queue item can be resolved out from under them. Pre-existing in `official()` too. Deferred.
5. **No `verification.set_official` row in `audit_logs`** for claim-driven official. `verification_events`
   holds the domain record and the claim audit carries the ids, so nothing is lost, but a query of the
   platform-wide audit stream filtered to `verification.*` will not see claim-driven transitions. Deferred.
6. **Atomicity has no standing regression test** (m-6). Rollback drills are temporary by convention.
7. **No concurrency regression tests on the claim path.** The 409 contract is now pinned at unit level
   (CAS loss, unique violation) but no test drives a genuine concurrent interleaving through
   `decide()`, as the Scheduler milestone did for the expiry job.
8. **~987 pre-existing `e2e_%` users** remain in the dev database from unrelated earlier suites — known,
   previously flagged, still out of scope.
9. Everything on the standing out-of-scope list: dashboard, metrics, reconciliation tooling,
   notifications, review replies, analytics, transfer improvements, queue filters, auto-reject/demotion,
   dispute heuristics, vote-weight table, multi-replica distributed locking, §9B dashboards.
