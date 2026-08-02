# MEDIA ORPHAN CLEANUP REPORT

**Date:** 2026-08-02
**Milestone:** Media Orphan Cleanup, per the Owner-approved execution plan (retention threshold
24h, exact eligibility predicate, required deletion order, dry-run mode, batch/time safety caps).
Backend-only job — no frontend, no moderation, no scheduler, no queue, no change to existing
upload API behavior.

## 1. Dry-run verification

Ran `npm run media:cleanup -- --dry-run` against the live dev database and MinIO, before and
after seeding a real backdated orphan:

| Step | Result |
|---|---|
| Dry-run against empty candidate set | `scanned:0, eligible:0, sampleCandidates:[]`, exit 0 |
| Seeded 1 real orphan (real presign→PUT→register round trip, then `created_at` backdated 25h via direct SQL) | media row `7aba50f8-…` created, object confirmed present in MinIO |
| Dry-run with that row eligible | `scanned:1, eligible:1, deleted:0`, correct `oldestCandidate`/`newestCandidate`, row listed in `sampleCandidates` |
| DB check after dry-run | `deleted_at` still `NULL` |
| `audit_logs` check after dry-run | 0 rows for that `entity_id` |
| MinIO check after dry-run | object still present (`mc stat` succeeded) |

Dry-run made **zero** DB, storage, or audit changes — confirmed by direct inspection, not just by
reading the summary output.

## 2. Cleanup verification (storage → soft-delete → audit, in order)

Ran `npm run media:cleanup` (real run) against the same seeded row, then a second independently
seeded row:

| Step | Result |
|---|---|
| `deleted_at` before run | `NULL` |
| Real run summary | `scanned:1, eligible:1, deleted:1, notFound:0, errors:0` |
| MinIO object after run | `mc stat` → `Unable to stat ... Object does not exist` (confirmed gone) |
| DB row after run | `status='pending'` (unchanged), `deleted_at='2026-08-02 02:31:03.155055+00'` (set) |
| `audit_logs` row | exactly 1 row: `event='media.orphan_cleaned'`, `entity_type='media'`, `is_service_account=t`, `result='success'`, `context={"bucket":"phuquochub","objectKey":"media/…jpg","uploadedBy":"…","storageOutcome":"deleted","createdAt":"2026-08-01T01:32:38.689Z"}` |

Storage deletion happened before the DB write and before the audit write — enforced structurally
(the code cannot reach the DB update without a resolved storage outcome, and cannot reach the
audit write without the DB update actually changing a row), and confirmed live, not just asserted
in unit tests with mocked ordering.

## 3. Idempotency verification

| Step | Result |
|---|---|
| Cleanup run #1 on a seeded, eligible row | 1 deleted, 1 audit row written |
| Cleanup run #2, immediately after, same DB | `scanned:0` (row no longer matches the eligibility predicate — `deleted_at` is no longer `NULL`) |
| `audit_logs` count for that row after run #2 | still exactly **1** (no duplicate) |
| Errors on run #2 | 0 |

Also verified at the e2e level (`media-orphan-cleanup.e2e-spec.ts`, "idempotency" suite) and at the
unit level (`softDeleteOrphanCandidate` returning `false` on a 0-row conditional `UPDATE` → no
audit write, no error).

## 4. MinIO verification

All of the above ran against the real `phuquoc-minio` container (bucket `phuquochub`, the
project's dev `.env` override — not the `phuquochub-test`/`phuquochub-dev` defaults), using the
real presign→PUT flow (not a mock) to create the seeded objects, and `mc stat` against the real
container to confirm object presence/absence before and after cleanup. The e2e suite additionally
exercises this through `StorageService` directly against `phuquochub-test` (Jest's own
`NODE_ENV=test` bucket isolation).

## 5. Database verification

Confirmed via direct `psql` queries against `phuquoc-postgres` (not just the ORM's own read-back):
`media.deleted_at` transitions from `NULL` to a real timestamp only for eligible rows; `media.status`
never changes (`orphan cleanup only sets deleted_at, per the soft-delete convention — status stays
'pending'`); rows with an owner (tested via a real `POST /places/{id}/reviews` attach with
`media_ids`) or under 24h old are left completely untouched, confirmed at the row level.

## 6. Audit verification

`audit_logs` rows inspected directly via SQL for both seeded rows — correct `event`,
`entity_type`/`entity_id`, `is_service_account=true`, `result='success'`, and a `context` object
containing `objectKey`/`bucket`/`uploadedBy`/`createdAt`/`storageOutcome`. One real defect was
caught here: the first live run's `context.createdAt` was `{}` instead of a timestamp — see §9.

## 7. Performance

- `batchSize` 100, `maxBatches` 50 (≤5,000 rows/invocation), `maxExecutionMs` 300,000 (5 minutes) —
  all three implemented as independently overridable `MediaCleanupService.run()` options.
- Unit-tested: the time budget is only ever checked *between* rows/batches — a row already being
  processed always runs to full completion (storage delete → conditional soft-delete → audit, or a
  controlled early-return on a storage error) before the budget is re-consulted, so **no row can
  ever be left partially processed**, verified with a fake-timer test that forces the budget to be
  exceeded mid-batch and asserts exactly one row completed cleanly before the stop.
- `maxBatches` verified with a test that never lets the candidate query return an empty page,
  confirming the loop still terminates at exactly `maxBatches` iterations rather than running
  unbounded.
- Live runs completed in single-digit milliseconds against the current (near-empty) `media` table;
  the optional `idx_media_orphan_cleanup` partial index (applied live, `migration:run` confirmed)
  keeps the batch-scan query index-backed as real upload volume grows.

## 8. Tests

| Suite | Count | Result |
|---|---|---|
| `storage.service.spec.ts` (new `deleteObjectForCleanup` cases) | 7 | pass |
| `media.repository.spec.ts` (new `findOrphanCleanupCandidates`/`softDeleteOrphanCandidate` cases) | 6 | pass |
| `media-cleanup.service.spec.ts` (new file) | 12 | pass — ordering, not_found, other-storage-error, 0-row-UPDATE no-op, null-object_key, batch termination, `maxBatches`, time-budget mid-batch safety, dry-run (including "reuses same query"), Date-serialization regression |
| `1720003100000-AddMediaOrphanCleanupIndex.spec.ts` (new migration) | 2 | pass |
| `media-orphan-cleanup.e2e-spec.ts` (new, live Postgres+MinIO) | 7 | pass — dry-run, real cleanup, not-eligible-yet, owned-media protected, pre-gone-from-storage, idempotency, dry-run-after-cleanup |
| Full backend unit suite | 82 suites / 850 tests | pass (up from 80/824 — zero regression) |
| Full backend e2e suite | 13 suites / 102 tests | pass (up from 12/95 — zero regression) |
| `apps/api` typecheck / lint / build | — | clean |
| Full monorepo (`turbo`) typecheck / lint / build | 6/6 tasks | all green |
| `git diff --check` | — | clean (only benign LF→CRLF autocrlf notices) |
| Secret scan (new/changed files) | — | no matches beyond the pre-existing convention of a throwaway test password (`password123`, same as every other e2e file in this repo) |

## 9. Real defects found and fixed during live verification (not assumed correct from the plan)

1. **`DeleteObjectCommand` never errors on a missing key.** The approved plan assumed a delete
   call could throw a distinguishable "not found" error (mirroring `HeadObject`/`GetObject`'s real
   behavior) — live testing against real MinIO showed `DeleteObject` is itself idempotent and
   always succeeds, by S3 API design. A "not_found" outcome is therefore only observable via a
   `HeadObject` existence check *before* deleting. Fixed: `deleteObjectForCleanup()` now does
   HEAD-then-DELETE, re-verified live (both the "already gone" and "really deletes" paths).
2. **`AuditService.redact()` silently destroyed a raw `Date`.** `redact()` walks `Object.entries()`
   on any object-typed value; a `Date` instance has no *own enumerable* properties (its value is
   internal), so passing `candidate.createdAt` straight into `context` persisted as `"{}"` in the
   real `audit_logs` row — caught by inspecting the actual row after the first live run, not by
   trusting the unit tests (which used mocked `AuditService` and never exercised the real
   `redact()`). Fixed with an explicit `.toISOString()` call; added a unit test asserting the audit
   call receives a string, and re-ran the live scenario to confirm the fix (`createdAt` now a real
   ISO string in the persisted row, §6).
3. **Pre-existing, unrelated defect: the entire e2e suite failed to compile.** `apps/api`'s
   currently-resolved `@types/node` no longer accepts a raw `Buffer` as `fetch`'s `BodyInit` — this
   affected the pre-existing `media.e2e-spec.ts` too (confirmed it failed identically, unmodified,
   before any of this milestone's changes), most likely a side effect of a dependency
   resolution/dedupe shift from an earlier, unrelated `npm install` (Frontend Component Test
   Coverage Foundation touched the root lockfile). Fixed with a type-only `as BodyInit` cast in
   both files (Buffer is a `Uint8Array` and works identically at runtime — zero behavior change).
   Disclosed here per this repository's convention rather than silently worked around.

## 10. Scope discipline confirmed

No frontend file touched. No moderation logic added. No gallery/display feature added. No change
to `POST /media/presign` or `POST /media` behavior — confirmed via the unchanged, still-passing
`media.e2e-spec.ts`/`media.service.spec.ts`/`media.controller.spec.ts` suites. No scheduler, cron,
or queue package added (`@nestjs/schedule` still absent from `package.json`). No hard delete — the
existing `@DeleteDateColumn` soft-delete convention was followed exactly.

## 11. Final git status

Clean after commits (verified via `git status --short` immediately before and after each commit).

## 12. Commit hashes

| Commit | Scope |
|---|---|
| `40aa4db` | `feat(media)`: orphan cleanup job (dry-run + manual runner) — service, repository queries, storage method, migration, standalone runner, all tests |
| _pending_ | `docs(media)`: media.md §12 + state.yaml governance entry + this report |
