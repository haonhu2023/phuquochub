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
| `4bab7fb` | `docs(media)`: media.md keyset-cursor addendum + governance entry + this report |

## 12. Addendum (2026-08-02) — `RETURNING` result-shape defect found during Moderation M3

A second, unrelated defect in this same milestone's code was found and fixed after this review was
originally written — flagged for follow-up while implementing [Moderation Foundation M3](MODERATION-M3-MEDIA-WORKFLOW-2026-08-02.md), fixed here as its own scoped corrective task.

### Defect confirmation evidence

M3's live validation found and fixed the same defect class in `MediaRepository.attachAndPublish()`
(TypeORM's Postgres driver returns `UPDATE ... RETURNING` results as a `[rows, rowCount]` **tuple**
from `manager.query()`/`repo.query()`, not a plain rows array — confirmed by reading
`node_modules/typeorm/driver/postgres/PostgresQueryRunner.js`). That fix noted `softDeleteOrphanCandidate()`
in this same file used the identical unsafe pattern and was suspected of the same bug, but fixing it
was explicitly out of M3's scope and was flagged as a separate follow-up rather than assumed.

This task re-opened that question with a read-first confirmation, per instruction, before touching
any code. `Repository.query()` was traced through TypeORM's own source
(`Repository.query()` → `EntityManager.query()` → `DataSource.query()` → `QueryRunner.query()`) and
confirmed to hit the exact same `PostgresQueryRunner.query()` code path as `attachAndPublish()` — so
the suspicion was structural, not yet proven.

**Live reproduction against real Postgres** (not a mock) confirmed the defect directly: a temporary
script called the real `softDeleteOrphanCandidate()` method against two real rows —

- **Case A** (genuinely eligible — fresh row, no `deleted_at`): method returned `true`. Correct.
- **Case B** (row with `deleted_at` already set — i.e. *not* eligible; the `UPDATE`'s `WHERE` clause
  matches **zero** rows): method still returned `true`. **Wrong** — this is the false positive.

### Root cause

`softDeleteOrphanCandidate()` read the raw result as `const rows: Array<{id}> = await this.repo.query(...)`
without destructuring. Since `repo.query()` for an `UPDATE ... RETURNING` actually resolves to the
tuple `[actualRows, rowCount]`, `rows` was really that 2-element tuple — so `rows.length` was **always
`2`**, and `rows.length > 0` was therefore **always `true`**, regardless of whether the conditional
`UPDATE` matched any row at all. The method could never correctly report "this row was already
cleaned up by a concurrent run, or just became ineligible" — its one designed no-op signal was dead
code in practice.

**Blast radius, scoped precisely:** the eligibility predicate itself (repeated in full inside the
`UPDATE`'s `WHERE` clause) was never bypassed — a row that was never eligible could never be
soft-deleted by this bug, and `deleted_at` was never set incorrectly. The defect was purely in the
**return value**, which feeds exactly two things in `MediaCleanupService.processCandidate()`: (1)
whether `summary.alreadyHandled` is incremented (cosmetic — a reporting-accuracy issue only), and
(2) whether an `audit.record()` call for `media.orphan_cleaned` is made. **(2) is the real-world
impact:** in the narrow race window where a row is fetched as eligible by
`findOrphanCleanupCandidates()` but becomes ineligible before the subsequent conditional `UPDATE`
runs (a concurrent cleanup process beats this one to it, or an owner gets attached in that instant),
the buggy code would still write a `media.orphan_cleaned` audit row claiming a state transition that
this particular call never actually performed — a phantom/duplicate audit entry. This is a narrow
window, not a routine occurrence, which is why it was never caught by the original test suite (whose
mocks assumed the wrong result shape and never modeled the real driver behavior, and whose e2e tests
never manufactured the race condition).

### Fix

Destructured the tuple, identical in shape to the `attachAndPublish()` fix:

```ts
async softDeleteOrphanCandidate(id: string): Promise<boolean> {
  const [rows]: [Array<{ id: string }>, number] = await this.repo.query(
    `UPDATE media SET deleted_at = now()
     WHERE id = $1 AND ${ORPHAN_ELIGIBILITY_WHERE}
     RETURNING id`,
    [id],
  );
  return rows.length > 0;
}
```

No other line changed. The eligibility predicate, the storage-before-database ordering in
`MediaCleanupService`, and dry-run behavior are all byte-for-byte unchanged — this was a strictly
scoped one-method fix, per instruction.

### Regression tests

- **Unit** (`media.repository.spec.ts`): the two pre-existing `softDeleteOrphanCandidate` tests used
  the wrong mock shape (`[{id}]` / `[]`, a plain array) and were corrected to the real tuple shape
  (`[[{id}], 1]` / `[[], 0]`). A new explicit test asserts no false positive from tuple length: a
  `[[], 0]` result (empty inner rows array, matching the real "0 rows updated" case) must resolve to
  `false`. **Verified meaningful**, not just passing: with the fix temporarily reverted (`git
  stash`), this test and the corrected 0-row test both failed with `Received: true` — exactly the
  bug's signature — then passed again once the fix was restored.
- **Live e2e** (`media-orphan-cleanup.e2e-spec.ts`, new `describe` block): seeds a real orphan media
  row, then directly sets `deleted_at` via SQL to simulate "a concurrent process already cleaned this
  row" — the exact race window the bug hid — then calls `mediaRepo.softDeleteOrphanCandidate()`
  **directly** (bypassing `findOrphanCleanupCandidates()`, which would otherwise correctly exclude
  the now-ineligible row from the candidate list before the race can be observed). Asserts the method
  returns `false` and that no new audit row is written. **Verified meaningful the same way**: run
  against the pre-fix code, this test failed live against real Postgres (`Received: true`); passed
  after restoring the fix.
- All pre-existing regression coverage from §7/§8 (pagination cursor, dry-run, storage-error
  handling, real cleanup, idempotency) re-run and confirmed still passing — this fix touched no
  shared logic.

### Live verification

Full `media-orphan-cleanup.e2e-spec.ts` suite re-run against real Postgres + MinIO: **10/10 passing**
(9 pre-existing + 1 new), including the pre-existing "real cleanup" test (object deleted from MinIO,
`deleted_at` set, exactly 1 audit row) and "idempotency" test (second consecutive run: 0 new audit
rows, 0 errors) — both already exercised the happy path correctly before this fix (the bug only
affected the *ineligible* branch), and both still pass unchanged.

### Final test counts

| Check | Result |
|---|---|
| `media.repository.spec.ts` | 19 tests (was 18 — 1 new tuple-shape test), pass |
| `media-cleanup.service.spec.ts` | unchanged, pass (this fix is invisible at the service level — the service already mocks the repository interface directly) |
| `media-orphan-cleanup.e2e-spec.ts` (live Postgres + MinIO) | **10 tests** (9 original + 1 new race-window regression test), pass |
| Full backend unit suite | **95 suites / 1019 tests** (up from 1018), zero regression |
| Full backend e2e suite | **16 suites / 143 tests** (up from 142), zero regression |
| `apps/api` typecheck / lint / build | clean |
| Full monorepo (`turbo`) build / typecheck / lint | 12/12 tasks green |
| `git diff --check` | clean (benign CRLF notices only) |
| Secret scan | no matches |
| `git status --short` | matches exactly the 3 files touched by this fix |

### Related, still-unfixed

None. This addendum closes the one follow-up item M3 flagged. No other instance of this result-shape
pattern was found during this task's read-first review of `MediaRepository` and
`MediaCleanupService`.

### Commit

| Commit | Scope |
|---|---|
| _(pending)_ | `fix(media)`: handle postgres returning tuple in orphan cleanup |
| _(pending)_ | `docs(media)`: record the RETURNING result-shape fix in this report |
