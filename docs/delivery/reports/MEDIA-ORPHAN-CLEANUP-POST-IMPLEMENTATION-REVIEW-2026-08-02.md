# MEDIA ORPHAN CLEANUP — POST-IMPLEMENTATION REVIEW

**Date:** 2026-08-02
**Scope:** Focused review of all files changed by the Media Orphan Cleanup milestone
(`docs/delivery/reports/MEDIA-ORPHAN-CLEANUP-2026-08-02.md`, commits `40aa4db`/`f593bb1`/`f985592`).
No new feature. Read-first review; one genuine defect was found and fixed (below), with a
regression test and full re-validation.

## 1. Overall assessment

The original implementation was structurally correct on every safety/ordering/audit requirement
(all confirmed below), but had one real defect in its batch-pagination logic that only manifests
under specific real-world conditions (see §7). It was invisible to the original unit tests because
they never modeled real Postgres round-trip precision, and invisible to the original e2e tests
because they never exercised more than one batch with more than one page's worth of candidates.
Fixed at the root, re-verified live against real Postgres/MinIO, and covered by new tests at both
the unit and e2e level. **No other defect was found.**

## 2. Safety review

- **Storage deletion always precedes the DB soft-delete.** Confirmed by code structure, not just
  test mocking: `processCandidate()` can only reach `mediaRepo.softDeleteOrphanCandidate()` after
  the `try` block around `storage.deleteObjectForCleanup()` completes without throwing (or the
  defensive `object_key IS NULL` branch, which has nothing to delete). There is no code path that
  reaches the DB write before the storage outcome is resolved.
- **Non-not-found storage errors leave the DB row untouched.** The `catch` block increments
  `summary.errors`, logs a warning, and `return`s — it never calls `softDeleteOrphanCandidate()`.
  Re-confirmed with a new unit test asserting `softDeleteOrphanCandidate` is called exactly zero
  times for the failing row while a healthy row in the same batch still gets processed.
- **Dry-run cannot call storage deletion, DB update, or audit write.** Structural, not
  best-effort: `if (!dryRun) { await this.processCandidate(...) }` — the entire function
  containing all three side effects is skipped, not merely its individual calls.
- **Audit context contains no signed URL, credentials, or sensitive metadata.** The context object
  is exactly `{ objectKey, bucket, uploadedBy, createdAt, storageOutcome }` — an object storage
  key/bucket name/uploader UUID/timestamp/enum, none of which are secrets, tokens, or signed URLs.
  `StorageService.createPresignedPutUrl`'s `uploadUrl` is never passed anywhere near the audit path.

## 3. Concurrency/idempotency review

- The conditional `UPDATE ... WHERE id = $1 AND <full eligibility predicate> ... RETURNING id`
  remains the sole concurrency mechanism (no locking) — unaffected by this review's fix, which was
  purely a pagination issue.
- **Re-verified live** that a second consecutive `cleanup.run({})` call is a clean no-op (0
  scanned, audit count unchanged, 0 errors) — both via a fresh e2e assertion and a live
  `npm run media:cleanup` double-invocation.
- **New finding, now fixed:** a *different* progress-guarantee issue existed in how batches were
  paginated — see §7. This was a correctness/liveness defect, not a double-write or race-condition
  risk; the conditional-UPDATE idempotency guarantee itself was never violated by it.

## 4. Dry-run review

- Reuses the identical `run()` loop as the real path — confirmed structurally (one shared method,
  one shared candidate-fetch call per batch) and behaviorally (a new e2e test exercises dry-run
  across multiple batches and diffs its `sampleCandidates` against reality).
- **Now correctly enumerates the full eligible set** across multiple batches (previously did not —
  see §7). Verified live: two synthetic candidates seeded, `batchSize: 1` forces two batches, both
  IDs now appear in `sampleCandidates`.

## 5. Audit review

- Every `audit.record()` call site inspected: `event`, `entityType`/`entityId`,
  `isServiceAccount: true`, `result: SUCCESS`, `before`/`after` (both plain string/primitive
  fields), `context` (see §2), `correlationId` (one UUID per `run()` invocation, shared by every
  row in that run — usable to group a run's audit trail).
- **Date fields serialize correctly.** `after.deletedAt` was always `.toISOString()`'d. The
  original implementation's `context.createdAt` was NOT — the original report's §9 already
  documented this as a defect found and fixed during that milestone's own live verification
  (`AuditService.redact()` silently collapsing a raw `Date` into `"{}"`). Re-confirmed still fixed:
  `createdAt: candidate.createdAt.toISOString()`, and a dedicated regression test (already present
  from the original milestone) still passes.

## 6. Migration review

- **Partial-index predicate matches the candidate query exactly.** Both use the identical 7-clause
  predicate (`status='pending' AND place_id/review_id/post_id/business_id/event_id IS NULL AND
  deleted_at IS NULL`) — confirmed by direct comparison of `1720003100000-AddMediaOrphanCleanupIndex.ts`
  against `ORPHAN_ELIGIBILITY_WHERE` in `media.repository.ts`.
- **Migration ordering is correct.** Timestamp `1720003100000` sorts after `SeedMediaPermissions1720003000000`
  (the prior head) and is the sole pending migration — confirmed via `migration:show`/`migration:run`
  output at original implementation time; unchanged by this review (no new migration needed for the
  pagination fix — the cursor uses only existing columns).
- **`up()`/`down()` are reversible.** `up()` adds one `CREATE INDEX`; `down()` issues the matching
  `DROP INDEX` and nothing else. No data mutation either direction.
- **No schema change beyond the index exists.** Confirmed via `git show --stat` on the migration
  commit — exactly one new index, zero `ALTER TABLE`/column/constraint changes.

## 7. Defects found and fixed

### Defect: batch pagination could stall or double-count, starving candidates behind it

**Root cause.** `findOrphanCleanupCandidates(limit)` always queried `ORDER BY created_at ASC LIMIT
$1` from the start, with no cursor — pagination progress depended entirely on candidate rows being
*mutated* between batches (soft-deleted, so they drop out of the `WHERE` clause). This breaks in
two real scenarios:
1. **Dry-run** never mutates anything, so every batch re-fetched the *exact same* oldest page,
   inflating `scanned`/`eligible` and never reaching rows beyond the first `batchSize`.
2. **A real run where one row hits a non-fatal storage error** (by design, correctly left
   untouched — see §2) remains in the eligible pool. If it's among the oldest rows, it gets
   re-fetched on the very next batch of the *same invocation*, potentially consuming the entire
   `maxBatches`/`maxExecutionMs` budget retrying that one row while thousands of other genuinely
   eligible rows are never reached — directly contradicting the design's own stated retry policy
   ("no in-process retry — the next invocation retries naturally").

**Fix.** Added keyset pagination: `findOrphanCleanupCandidates(limit, after?)` accepts an optional
`{createdAt, id}` cursor, adds `AND (created_at, id) > (…)`, orders by `created_at ASC, id ASC`.
`MediaCleanupService.run()` advances the cursor after *every* batch, regardless of whether any row
in it was actually mutated — decoupling pagination progress from mutation side effects entirely.

**A second, deeper bug surfaced while building the fix and confirmed via a live database test, not
assumed:** the natural implementation — carrying the cursor as `candidate.createdAt` (a parsed JS
`Date`) — is itself broken. JS `Date` has millisecond resolution; Postgres `timestamptz` has
microsecond resolution. Round-tripping a `Date` back into the next query's parameter silently
truncates it, and a row can then satisfy `created_at > cursor` against its *own* real (untruncated)
stored value — getting re-fetched instead of skipped. Reproduced directly: two rows inserted 100
microseconds apart, and the naive `Date`-based cursor caused the second row to be fetched only as a
duplicate of the first, never surfacing the second one. **Fixed** by capturing Postgres's own exact
text rendering of `created_at` (`created_at::text`) for the cursor — never parsed into a `Date` —
and binding it back as `$N::timestamptz`, so Postgres re-parses its own original value with zero
precision loss. `createdAt: Date` is retained unchanged for all display/summary/audit purposes;
only the internal pagination cursor changed representation.

**Verification of the fix, not just the fix's existence:**
- New unit tests: the second batch receives exactly the previous batch's last candidate as its
  cursor; dry-run across two single-row batches enumerates two distinct rows, not one duplicated;
  a real run with a persistently-erroring first row still processes a second, healthy row in the
  same invocation.
- New live e2e tests (real Postgres, `batchSize: 1`, more candidates than one page): a real
  cleanup run with 3 synthetic candidates and a dry-run with 2 both correctly enumerate every row
  exactly once, confirmed directly reproducing the original failure before the fix and passing
  after it.

### Incidental: a pre-existing e2e test-hygiene leak, found while investigating the above

The original `media-orphan-cleanup.e2e-spec.ts`'s dry-run test called
`storage.deleteObjectForCleanup()` directly (to prove the object was still real before that point)
without ever cleaning up the DB row it seeded — leaking one real orphan row into the shared dev
database on every e2e run. Not a production defect (the job itself was never affected), but real
accumulated debris was found in the live dev database while debugging §7 (several leftover
eligible rows from earlier sessions' live-verification testing, harmless but real). Fixed: the test
now soft-deletes its own row directly after its assertions. The pre-existing leaked rows were
cleared by a real `npm run media:cleanup` invocation (confirmed 0 eligible rows remain).

### No other defects found

Everything else reviewed in §2–§6 was already correct in the original implementation.

## 8. Validation results

| Check | Result |
|---|---|
| `media-cleanup.service.spec.ts` | 15 tests (12 original + 3 new pagination regression tests), pass |
| `media.repository.spec.ts` | pass, including 2 new cursor-specific tests |
| `storage.service.spec.ts` | pass, unchanged (this review touched no storage code) |
| `media-orphan-cleanup.e2e-spec.ts` (live Postgres + MinIO) | **9 tests** (7 original + 2 new pagination regression tests), pass — the 2 new tests reproducibly failed before the fix and pass after it |
| Full backend unit suite | **82 suites / 855 tests** (up from 850 — zero regression elsewhere) |
| Full backend e2e suite | **13 suites / 104 tests** (up from 102 — zero regression elsewhere) |
| `apps/api` typecheck / lint | clean |
| Full monorepo (`turbo`) build / typecheck / lint | 4/4, 6/6, 6/6 — all green |
| Fresh dry-run against the live local stack (`npm run media:cleanup -- --dry-run`) | `scanned:0, eligible:0`, exits 0 — confirms the dev database is genuinely clean after this review's cleanup |
| `git status` | clean after this review's fix commit |

### BodyInit type-cast review (requirement 3)

The two `as BodyInit` casts (`media.e2e-spec.ts`, `media-orphan-cleanup.e2e-spec.ts`) were
re-inspected: both are single-expression type assertions on the `body` field of an existing
`fetch()` call, with no change to any runtime value, control flow, or dependency. `git diff` on
`package.json`/`package-lock.json` across every commit in this milestone (original + this review)
confirms zero dependency version changes anywhere — the casts are the complete fix, not a
placeholder for a deferred upgrade. No broader typing regression was introduced or hidden; the
`@types/node`/`fetch` typing gap itself remains open (pre-existing, unrelated to this milestone,
not expanded into a dependency-upgrade task per instruction).

## 9. READY FOR OPERATIONAL USE

**Yes.** All required safety, concurrency, dry-run, audit, and migration properties are confirmed
correct by direct code inspection and live verification (not assumption). The one genuine defect
found is fixed, regression-tested, and re-verified live. Full regression is green across unit, e2e,
typecheck, lint, and monorepo build. The manual runner (`npm run media:cleanup [-- --dry-run]`) is
safe to invoke against production once deployed, subject to the same standing limitations already
disclosed in the original report: no scheduler exists (manual invocation only, by design), and
storage deletion is not reversible (no bucket versioning configured).

## 10. Final git status

Clean after this review's commit (verified via `git status --short` immediately before and after).

## 11. Follow-up commit hash

| Commit | Scope |
|---|---|
| `b060b42` | `fix(media)`: keyset-pagination defect in orphan cleanup (dry-run/error-stuck-row starvation) + timestamp-precision cursor bug, both found via post-implementation review |
| `<filled in below>` | `docs(media)`: media.md keyset-cursor addendum + governance entry + this report |
