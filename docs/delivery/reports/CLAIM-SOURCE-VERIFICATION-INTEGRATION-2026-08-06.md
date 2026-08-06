# ADR-008 — CLAIM → SOURCE → VERIFICATION INTEGRATION

## Status

Standalone milestone, run immediately after VERIFICATION SCHEDULER — Operational Enablement.
**Objective (Owner, verbatim intent):** remove the remaining transitional exception — every trusted
verification state must now originate from the Verification system; `BusinessClaimsService` must no
longer be the long-term source of truth for `places.verification_status`/`verified_at`. Explicitly
out of scope and not started: dashboard, metrics, reconciliation tooling, notifications, review
replies, analytics, transfer improvements, queue filters, auto-reject, dispute heuristics, verification
scheduler changes, business ownership changes, ADR-019 changes.

## Phase 1 — writer inventory

Grepped the whole `apps/api/src` tree for every direct writer of `verification_status`/`verified_at`
outside `VerificationsService`. Found exactly **one**: `BusinessClaimsService.decide()`'s approve
branch — the C1 guard block added by ADR-008 CORRECTION. `SourcesService.verifyAttribution()` writes
`SourceAttribution.verifiedAt`, a confirmed-unrelated concept (`source_attributions` table, not the
exclusive-arc `verifications` system) — left untouched. No unexpected writer found; proceeded per the
Owner's phase spec ("stop and report if an unexpected writer exists" did not trigger).

## Phase 2 — design

Claim approval must produce `Source` + `Verification` + `VerificationEvent` + cache update through
**one** verification workflow, without `BusinessClaimsService` duplicating any transition logic.
Chosen approach: extend `VerificationsService` with an internal composition entry point
(`ensureOfficialFromClaim`) built entirely from extracted pieces of the *existing* `submit()`/
`official()` code paths — not a second implementation of the FSM. It must accept an externally-supplied
`EntityManager` (no own transaction, no own audit) so `BusinessClaimsService.decide()` keeps its
single-transaction guarantee for the whole decision.

## Phase 3 — implementation

**`SourcesRepository`** (`apps/api/src/modules/sources/repositories/sources.repository.ts`): `save()`
extended with an optional `manager` parameter, matching the existing convention already on
`findById()`. `create()` needs no change (it doesn't touch the DB).

**`VerificationsService`** (`apps/api/src/modules/verifications/verifications.service.ts`) refactored
by extraction, preserving every existing public method's external behavior exactly:

- `transition()` split into a thin transaction-opening wrapper and a new `transitionCore(manager,
  current, actorId, build)` — the CAS-update + `verification_events.append` + `syncTargetCache` core,
  with no transaction and no audit of its own.
- `official()`'s inline build callback extracted into `buildOfficialTransition(current, dto, actorId,
  method, manager)`, parameterized by `VerificationMethod` — the moderator HTTP path
  (`method=moderator`) and the claim path (`method=owner_claim`) now share the exact same source
  validation / expiry computation / patch construction, differing only in that one parameter.
- `submit()`'s "no existing row" / "existing expired-or-rejected row" branches extracted into
  `createPendingVerification(target, method, actorId, note, manager)` and
  `resubmitVerification(existing, method, actorId, note, manager)`.
- New public method `ensureOfficialFromClaim(placeId, {sourceId, actorId, note}, manager)` composes
  the above with a four-way branch on the place's current `verifications` row:
  - no row → `createPendingVerification` then `transitionCore` to `official`;
  - `expired`/`rejected` → `resubmitVerification` then `transitionCore` to `official`;
  - `pending`/`verified`/`community_verified` → `transitionCore` straight to `official` (the
    existing row is **reused**, not duplicated);
  - already `official` → no-op, returns the row as-is (idempotent; a re-approved claim on an
    already-official place does not re-verify or re-append events).

**`BusinessClaimsService`** (`apps/api/src/modules/business/business-claims.service.ts`): constructor
swapped `VerificationsRepository` for `VerificationsService` + added `SourcesRepository`. The approve
branch of `decide()` now, inside its existing single transaction: creates one `sources` row
(`type=business_owner`, `kind=platform_user`, `authorUserId=claim.requesterId`,
`reliability=SOURCE_TYPE_DEFAULT_RELIABILITY[BUSINESS_OWNER]` (85), `retrievedAt=decidedAt`,
`metadata={business_claim_id, evidence}`), then calls `ensureOfficialFromClaim(claim.placeId,
{sourceId, actorId, note: decision_note}, manager)`. The old direct write
(`placesRepo.updateScalars(..., {verificationStatus: OFFICIAL, verifiedAt: decidedAt}, manager)`) is
gone. The class doc comment and the guard's inline comments were updated to describe the current
state, not rewritten as if the old state never existed (see the "surviving guard" note below).
`BusinessModule` gained a `SourcesModule` import.

**Surviving guard, re-scoped.** `VerificationsService.submit()`'s C1 guard (reject with 409 when a
target's cache is trusted but has no owning `verifications` row) is **kept**, but its comment was
updated: as of this milestone every new claim approval creates the owning `verifications` row, so
this branch can no longer be reached through any currently-valid write path — it now protects only
data written before this milestone shipped. Removing it would have been unnecessary scope; keeping it
costs nothing and is strictly safer for whatever legacy rows exist.

## Phase 4 — migration impact assessment

**Conclusion: no migration required.** Proven live against Postgres *before* writing any
implementation code:

```sql
SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'verification_method';
-- moderator, owner_claim, source_match, community_vote, system_auto   (owner_claim already present)

\d sources
-- author_user_id uuid, metadata jsonb, reliability smallint not null, ... — every column already there

SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'source_kind';
-- url, dataset, platform_user, ai_model, offline   (platform_user already present)
```

`VerificationMethod.OWNER_CLAIM` was seeded at ADR-008 Verification Foundation (2026-08-06) and left
unused until this milestone — reserved for exactly this scenario by original design.
`SourceType.BUSINESS_OWNER` (default reliability 85) and `SourceKind.PLATFORM_USER` are pre-existing
enum values from the Source module. `git status` after implementation confirms zero new files under
`apps/api/src/core/database/migrations/`.

## Phase 5 — unit tests

- `business-claims.service.spec.ts` — constructor updated to mock `VerificationsService` +
  `SourcesRepository` instead of `VerificationsRepository`. The old three C1-guard tests (which
  asserted the direct-cache-write behavior) were replaced with tests asserting: a `sources` row is
  created with the correct shape and `ensureOfficialFromClaim` is called with the right arguments; the
  reject branch touches neither; the redirect-to-disputed branch touches neither. 24/24 passing.
- `verifications.service.spec.ts` — new `describe('ensureOfficialFromClaim', ...)` block, 7 new
  tests: no existing row (create + transition, 2 events, exactly 1 `casUpdate`); already-official
  short-circuit (zero writes, source lookup never called); `expired`/`rejected` existing row
  (`it.each`, resubmit + transition, 2 `casUpdate` calls); `pending`/`verified`/`community_verified`
  existing row (`it.each`, direct transition, exactly 1 `casUpdate`, no create); invalid `source_id`
  still throws `NotFoundException` before any write. All existing `official()`/`submit()` tests
  continued to pass unmodified, confirming the extraction preserved external behavior exactly. 59/59
  passing for the file.

## Phase 6 — live Docker validation

Extended the existing `business-claims.e2e-spec.ts` "approve" test and rewrote two now-obsolete tests
in `verifications.e2e-spec.ts` (see Phase 6 note below) rather than adding new files — same file/test
count as the Scheduler milestone.

**Fresh claim, no prior verifications row (`business-claims.e2e-spec.ts` + a dedicated
`verifications.e2e-spec.ts` test):** approving via real HTTP creates exactly one `sources` row
(`type=business_owner`, `kind=platform_user`, `author_user_id`=requester,
`metadata.evidence`=claim's evidence) and exactly one `verifications` row
(`method=owner_claim`, `status=official`, `source_id` pointing at that source), with exactly two
`verification_events` (`null→pending`, `pending→official`, both `method=owner_claim`).
`places.verification_status`/`verified_at` match. The `business.claim_approved` audit row's
`context.verification` carries `{sourceId, verificationId, verificationStatus}`. A subsequent
`POST /verifications` on that (now-official) place returns **422** (FSM: `official` is not a valid
`submit` source state) — a deliberate behavior change from the old 409 (there is no longer a
cache-without-a-row state reachable through the live approval path).

**Existing `verified` row reused, not duplicated (`verifications.e2e-spec.ts`):** submit → verify via
HTTP first, then approve a claim on the same place. The pre-existing row transitions straight to
`official` (`method` flips to `owner_claim`), a third `verification_event` is appended
(`verified→official`), and exactly one `verifications` row exists for the place afterward — confirmed
by row-id equality between before and after, not just a count.

**Zero residue** confirmed by direct SQL after the full suite ran:
`sources` joined to `e2e_%`-email users → 0 rows; `verifications` with `method='owner_claim'` → 0
rows. (987 pre-existing `e2e_%` users remain from unrelated prior test suites — a known,
previously-flagged, out-of-scope finding, not touched.)

**Bug caught and fixed during this phase:** the first draft of both rewritten `verifications.e2e-spec.ts`
tests queried and asserted against the newly-created `sources` row but never pushed its id into the
file's `sourceIds` tracking array — the exact X1 leak pattern ADR-008 CORRECTION fixed, reintroduced by
omission. Caught by re-running the file's own `X1: mọi source/... đều được theo dõi để dọn` test and
manually cross-checking with `docker exec ... psql` against `sources`/`author_user_id`/`e2e_%`, not by
the in-suite test alone (that test only validates tracked-IDs-exist, not "no untracked rows exist").
Fixed by tracking both source ids; reran clean.

## Phase 7 — rollback drill

Temporary `FORCE_ROLLBACK_DRILL=1`-gated `throw` inserted in `decide()`'s approve branch, placed
**after** `business_members` insert + `user_roles.assign()` + `sources.save()` +
`ensureOfficialFromClaim()` had all executed inside the transaction, but **before** the claim-status
`updateDecision()` call. A temporary e2e test (`test/_rollback-drill.e2e-spec.ts`) submitted a claim,
called `decide(approve)`, got a real `500`, then queried all five affected areas directly via SQL:

- `business_claims.status` — still `pending`, `reviewer_id`/`decided_at` still `NULL`.
- `business_members` — zero rows for the place.
- `user_roles` — zero `business_owner` rows for the requester.
- `sources` — zero rows matching the claim's id in `metadata`.
- `verifications` — zero rows for the place.
- `places.verification_status`/`verified_at` — still `pending`/`NULL`.

All reverted to baseline together, confirming the whole decision — now five writes instead of the
original three — is still one atomic unit. The throw and the temporary test file were removed
immediately after confirmation; `business-claims.e2e-spec.ts` was rerun afterward to confirm normal
behavior was restored (8/8 passing).

## Phase 8 — full regression

- BE unit: **127 suites / 1491 tests**, all passing.
- BE e2e (`--runInBand`, live Postgres): **28 suites / 249 tests**, all passing — same file and test
  count as the Scheduler milestone (no new e2e files; two existing files extended).
- `eslint "src/**/*.ts" --max-warnings=0`: clean. The two modified e2e files individually linted
  clean as well (a pre-existing unrelated warning in `authz-own-scope-hardening.e2e-spec.ts`, outside
  the normal `src/**` lint gate and untouched by this milestone, was noted and left alone).
- `tsc --noEmit`: clean.
- `nest build`: clean.
- Monorepo (`turbo run typecheck lint build`): **12/12 tasks successful**.

## Phase 9 — documentation

- `docs/99-decisions/ADR-008-verification-model.md` — new Implementation Status entry appended
  (history preserved, not rewritten).
- `docs/99-decisions/ADR-015-business-ownership-model.md` — a closing note appended after the
  Ownership Transfer entry, pointing back at Owner Decision 1 of Claim Foundation (which is left
  verbatim, since it was accurate when written) and stating what changed.
- `docs/data/modules/verification.md` — the "Ngoại lệ chuyển tiếp" banner replaced with a "ĐÃ ĐÓNG"
  banner describing the new integrated flow and the surviving guard's re-scoped purpose.
- `docs/delivery/state.yaml` — new milestone summary pushed to the top of the `current.task` comment
  chain; the Scheduler milestone's summary demoted to a `---- prior state (...)` block beneath it,
  verbatim.
- This report.

## Phase 10 — commits

Three scoped commits: `feat(verification)` for the service/repository/module changes,
`test(verification)` for the unit and e2e test changes, `docs(verification)` for the four documentation
files above.

## Out of scope (explicit, not started)

Dashboard, metrics, cache/vote-count reconciliation tooling, notifications, review replies, analytics,
transfer improvements, queue filters, auto-reject, dispute heuristics, verification scheduler changes,
business ownership model changes, ADR-019 changes, distributed locking for multi-replica deployments,
vote weight table by role/karma, Sec9B dashboards, any later Business/Place milestone.
