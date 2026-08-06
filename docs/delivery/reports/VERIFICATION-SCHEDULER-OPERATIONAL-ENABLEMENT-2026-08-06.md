# VERIFICATION SCHEDULER — OPERATIONAL ENABLEMENT

## Status

Standalone milestone, run after ADR-008 CORRECTION. Sole goal: make the existing
`VerificationsService.expireOverdue()` workflow operational in production safely, by scheduling it.
No new business logic, no second expiry state machine, no schema change, no migration.
Claim→Source integration, queue reassignment/filters, reconciliation, metrics/dashboards,
auto-reject/demotion, notifications, and distributed locking across replicas were explicitly not
started, per the confirmed scope.

## Environment

- Node v24.18.0, npm 11.16.0.
- Docker Desktop + `docker-compose.yml` (postgres/redis/minio) — all three healthy throughout.
- Branch `master`, working tree clean at start.

## Preflight

No scheduler library existed in the repository (`grep -inE "schedule|cron|bull|agenda" package.json`
returned nothing). Stated before writing any code: `@nestjs/schedule` (dynamic `CronJob` API via
`SchedulerRegistry`, not the static `@Cron()` decorator — the cron expression comes from
`ConfigService`, which isn't available at class-decoration time) plus the underlying `cron` package
it depends on. Read in full before implementing: ADR-008, `verification.md`, the ADR-008 PIR, the
ADR-008 Correction report, `VerificationsService.expireOverdue()` (the old unbounded version),
`VerificationsRepository`, `MediaCleanupService` + `clean-orphan-media.ts` (the closest existing
precedent for exactly this shape of work — a batched, time-budgeted background job with a manual
CLI runner), `package.json`, `AppModule`'s bootstrap conventions, and `configuration.ts`/
`env.validation.ts`'s env-var conventions.

## Scheduler dependency / wiring

`@nestjs/schedule` (`^6.1.3`) + `cron` (`^4.4.0`, its own transitive dependency, used directly for
`CronJob.from()`). `ScheduleModule.forRoot()` registered exactly once, in `AppModule` — the "single
scheduler mechanism for the API application" requirement. `VerificationExpiryScheduler`
(`apps/api/src/modules/verifications/verification-expiry.scheduler.ts`) is a singleton provider
registered in `VerificationsModule`; it implements `OnModuleInit`/`OnModuleDestroy` and calls
`SchedulerRegistry.addCronJob()`/`.deleteCronJob()` directly, because the cron expression is
config-driven and therefore only known after DI has resolved `ConfigService` — the static `@Cron()`
decorator cannot express that.

## Cadence / configuration

Five new environment variables, all with safe defaults, none required in any environment (added to
`configuration.ts`, `env.validation.ts` as a Joi schema, and `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `VERIFICATION_EXPIRY_SCHEDULE_ENABLED` | `false` | Master switch. **Disabled in every environment, including production** — enabling the schedule is always an explicit operational decision, never inferred from `NODE_ENV`. |
| `VERIFICATION_EXPIRY_CRON` | `0 */15 * * * *` (UTC) | Cadence. 15 minutes is conservative and appropriate for expiry work — not second-sensitive; a stale trust badge surviving a few extra minutes is harmless, while running too tight burns resources for no benefit. |
| `VERIFICATION_EXPIRY_BATCH_SIZE` | `100` | Rows per batch. |
| `VERIFICATION_EXPIRY_MAX_BATCHES` | `50` | Batches per invocation (bounds one run to ≤5,000 rows). |
| `VERIFICATION_EXPIRY_MAX_EXECUTION_MS` | `300000` (5 min) | Wall-clock budget per invocation. |

Batch/execution defaults intentionally match `MediaCleanupService`'s existing constants rather than
inventing new numbers — same job shape, same reasoning.

## Batching / cursor behavior

`VerificationsRepository.findOverdueTrustedBatch(now, limit, after?, manager?)` replaces
`listOverdueTrusted()` (which loaded the entire matching result set into memory — the PIR's exact
"the expiry path is unbounded" finding). Keyset pagination on `(expires_at, id)`, same convention as
`MediaRepository.findOrphanCleanupCandidates()` — stable under concurrent writes, doesn't drift the
way `OFFSET` does. The cursor carries Postgres's own `::text` rendering of `expires_at`
(`expiresAtCursor`), not a JS `Date` — the same precision-loss lesson already learned and documented
for `OrphanCleanupCandidate.cursorCreatedAt` (a JS `Date` truncates sub-millisecond precision, which
can make a row satisfy its own `>` cursor condition again and get re-fetched forever). The cursor
advances once per batch (to the last candidate), not per row — identical to
`MediaCleanupService.run()` — so pagination progress never depends on whether an individual row was
actually mutated. The cursor lives only for the duration of one `expireOverdue()` call; nothing is
persisted between runs, so a row skipped by a time-budget stop is simply picked up again — from
scratch — on the next invocation.

## Time-budget behavior

Checked only *between* rows, never mid-row: once a row's transaction begins, it always runs to
completion (CAS update → event append → cache sync, or a clean rollback on error) before the budget
is re-checked. Verified live with `maxExecutionMs: 1` against six rows using `batchSize: 1` (forcing
a check before every row) — the run stopped early, `timeBudgetExceeded` was `true`, and every row
was left in exactly one of two states: still `official` (never touched) or fully `expired` (fully
processed, exactly one event) — never half-done.

## Overlap prevention

In-process only, via an `isRunning` boolean on the `VerificationExpiryScheduler` singleton instance
— satisfies "at minimum, prevent concurrent runs within the same API process." No existing
distributed-lock pattern was found in this repository, so none was invented; Redis locking was
deliberately **not** added silently. An overlapping tick is skipped and logged at `WARN` (not
treated as an error); the flag is released in a `finally` block regardless of success or failure, so
a thrown `expireOverdue()` error can never leave the job permanently locked. **Multi-replica
deployment is an explicit, documented open concern** (`docs/architecture/deployment.md` §12.4b): if
more than one API replica has the schedule enabled, each will run the job independently. This is not
a data-integrity risk (every transition still goes through the same CAS `lock_version`; a replica
that loses the race just counts a `conflict`), but it is wasted work. Resolving it (a distributed
lock, or restricting the schedule to one designated replica) is out of scope for this milestone and
called out as a pre-scale-out decision.

## Manual runner

`apps/api/src/scripts/expire-overdue-verifications.ts`, wired as `npm run verification:expire`,
mirrors `clean-orphan-media.ts`'s `NestFactory.createApplicationContext()` pattern (no HTTP server,
no schedule registered — calls `VerificationsService.expireOverdue()` directly, bypassing the
scheduler entirely). Flags: `--dry-run`, `--batch-size=N`, `--max-batches=N`,
`--max-execution-ms=N`. `--dry-run` was included because it doesn't require a second transition
implementation — it reuses the exact same batch query and eligibility check, and simply skips the
write step (`if (!dryRun) { await this.processExpiryCandidate(...) }`), identical in shape to how
`MediaCleanupService.run()` already does this. Exit code is non-zero **only** when `errors > 0`
(genuine systemic failures); `conflicts` are a normal, expected race outcome and do not fail the
run — this decision (`hasSystemicFailure()`) is extracted as a pure, independently unit-tested
function specifically so the exit-code contract doesn't depend on booting Nest.

## Unit tests

125 new/updated tests across four files, all passing:

- `verifications.service.spec.ts` (+18, 51 total in the `expireOverdue`/batching area): empty batch
  → no transaction opened; correct batching/cursor arguments passed to
  `findOverdueTrustedBatch`; `maxBatches` respected exactly; time-budget stop between rows verified
  with a mocked `Date.now()`; CAS loss and "no longer valid for expire" both counted as `conflicts`,
  not fatal; one row's unexpected error counted separately and does not block the next row in the
  same batch; `dryRun` opens zero transactions and writes nothing while still reporting accurate
  `scanned`/`eligible`; oldest/newest processed timestamps tracked correctly.
- `verification-expiry.scheduler.spec.ts` (new, 10 tests): schedule enabled/disabled gates
  `addCronJob`; the registered job carries the configured name and cron expression and is actually
  started (`job.isActive`); `onModuleDestroy` deletes the job only if one was ever registered;
  `runTick()` calls `expireOverdue()` with the configured options; an overlapping call is skipped
  and returns `null` without a second `expireOverdue()` call; the lock is released after both
  success and a thrown error, proven by a subsequent call succeeding; both the error and the
  overlap-skip paths are logged.
- `expire-overdue-verifications.spec.ts` (new, 6 tests): `hasSystemicFailure()` and `parseIntArg()`
  as pure functions — exit-code decision and CLI flag parsing tested without booting
  `NestFactory.createApplicationContext()`.
- `business-claims.service.spec.ts`/`verifications.service.spec.ts` from the CORRECTION milestone
  remain green, unmodified by this milestone's changes beyond the mock-shape update needed for
  `findOverdueTrustedBatch` replacing `listOverdueTrusted`.

No unbounded query remains: `findOverdueTrustedBatch` always takes a `limit` and always applies the
keyset filter; there is no code path left in `VerificationsService` that calls the repository
without a bound. Cursor/batch filters are fully parameterized (`$1`/`$2`/`$3`/`$4` in the raw SQL,
no string interpolation). No row is processed twice within one run — proven both by the exact
`verification_events` count-per-row assertions in the live e2e batching test and by the cursor
design itself (a processed row's `expires_at`/`id` is always strictly behind the next batch's
`WHERE` filter).

## Live Docker validation

Against real Postgres, all in `test/verification-scheduler.e2e-spec.ts` (new, 8/8 passing) plus
updates to the two `expireOverdue()` call sites already in `verifications.e2e-spec.ts` (16/16
passing, adjusted for the new `{ now }`-options signature and `VerificationExpirySummary` return
shape):

- **Batching:** 5 eligible rows, `batchSize: 2` → exactly 3 batches, all 5 rows `expired`, exactly
  one `verification_event` per row.
- **`maxBatches`:** 4 eligible rows, `batchSize: 1, maxBatches: 2` → exactly 2 batches run, exactly
  2 rows expired, the other 2 left completely untouched (still `official`, not lost).
- **Time budget:** 6 rows, `batchSize: 1, maxExecutionMs: 1` → stops early, `timeBudgetExceeded`
  true, every row in a clean terminal state (never half-processed).
- **Idempotent re-run:** running `expireOverdue()` again against an already-fully-expired set
  produces zero new `verification_events` and zero errors.
- **A genuine CAS race** (not mocked): a real `POST /verifications/{id}/reject` over HTTP and a real
  `expireOverdue()` call fired concurrently via `Promise.all` on the same row. Exactly one side
  wins; the loser observes a real, correct consequence (either a counted `conflict`, or — if expiry
  won first — `reject()` correctly returning 409/422 since `expired` isn't a valid source state for
  reject); exactly one `verification_event` total; zero errors.
- **Scheduler overlap, live:** two concurrent `scheduler.runTick()` calls via `Promise.all` — exactly
  one actually runs, the other returns `null`.
- **The manual runner run as a real child process** — `node -r ts-node/register
  src/scripts/expire-overdue-verifications.ts`, not an in-process function call. `--dry-run` left
  the target row untouched (`official`); the following real run expired it, both verified via direct
  SQL against the specific row (not the CLI's own aggregate stdout counts — see the note below on
  why).
- **Zero residue**, proven with a direct multi-table query after the suite (`sources`,
  `verifications`, `verification_events`, `verification_votes`, this suite's `e2e_vsched_*` users
  and places all 0).

## Idempotency / conflict proof

Covered twice: once at the unit level (mocked CAS-loss and mocked "no longer valid for expire",
both asserted to land in `conflicts` not `errors`) and once against real Postgres with a genuine
concurrent race (above) — the loser's outcome is a real database-level compare-and-set failure, not
a simulated one. Both layers agree: conflicts never abort a run, never duplicate a transition, and
never lose one.

## Full regression

| Check | Result |
|---|---|
| Migration state | No new migration this milestone; `migration:show` still ends at `SeedVerificationPermissions1720004100000`, confirmed unchanged. |
| Scheduler unit tests | 10/10 |
| Verification-module unit tests (all files) | 111/111 |
| Full backend unit suite | 127 suites / 1485 tests |
| Focused verification e2e (`verifications.e2e-spec.ts`) | 16/16 |
| New scheduler e2e (`verification-scheduler.e2e-spec.ts`) | 8/8 |
| Full backend e2e suite (`--runInBand`) | 28 suites / 249 tests |
| Backend typecheck / lint / build | clean / clean / clean |
| Full monorepo typecheck + lint + build (`turbo run`) | 12/12 tasks |
| `git diff --check` | clean (pre-existing LF/CRLF warnings only) |
| Secret scan | clean |
| Zero residue | proven directly against Postgres |

### An honest note on e2e parallelism

Jest runs e2e spec **files** in parallel by default. `expireOverdue()` scans the `verifications`
table globally, by design — it is a real background job, not scoped to any one test file's
fixtures. The manual-runner test has an unusually wide wall-clock window (~24s, dominated by
subprocess/ts-node startup cost), which made it — not the faster batching/time-budget tests in the
same file — the one to actually collide with a genuine `expireOverdue()` call running concurrently
in the sibling `verifications.e2e-spec.ts` file during one parallel full-suite run. This surfaced as
a flaky assertion on the CLI's own aggregate `eligible`/`expired` counts (which reflect the *entire*
database at that instant, not just this test's row). Fixed by asserting against this test's own row
directly via SQL instead of trusting the CLI's global stdout numbers. The full suite is clean and
reproducible under `--runInBand` (28/28, 249/249, confirmed twice); **recommended for CI** now that
a globally-scanning scheduled job has real e2e coverage. This is a characteristic of sharing one live
Postgres instance across parallel test files, not a defect in the scheduler or service — the same
milestone's CAS-race and scheduler-overlap tests independently prove the product code handles real
concurrency correctly.

## Build / typecheck / lint

Backend (`apps/api`): `tsc --noEmit`, `eslint --max-warnings=0`, `nest build` all clean. Monorepo
(`turbo run typecheck lint build`, 5 packages including the Next.js `web` production build): 12/12
tasks successful.

## Documentation / governance

- `docs/99-decisions/ADR-008-verification-model.md` — new Implementation Status entry appended
  above the CORRECTION entry (historical Decision/Consequences/Alternatives content untouched); the
  Foundation entry's "out of scope" line updated to note the expiry job now has scheduling
  infrastructure.
- `docs/data/modules/verification.md` — banner updated with cadence, enable switch, single-process
  limitation, and manual-runner usage.
- `docs/architecture/deployment.md` — §8 (Cấu hình & Secrets) lists the five new env vars; new §12.4b
  documents cadence, enable/disable, the single-process overlap-prevention limitation (and what
  scaling to multiple replicas requires), and recovery behavior — explicitly *not* a
  metrics/dashboard section, since that infrastructure wasn't built and this milestone doesn't claim
  it was.
- `.env.example` — the five new variables added with defaults and a one-line rationale each, in the
  canonical location this repo already uses for env-var documentation.
- `docs/delivery/state.yaml` — `current.task` updated with this milestone's full record, chained
  above the ADR-008 CORRECTION entry.
- This report.

## Known limitations

- **Multi-replica overlap is unsolved.** In-process overlap prevention only; running multiple API
  replicas with the schedule enabled will run the job redundantly on each (wasteful, not unsafe —
  CAS still protects data integrity).
- **Recovery is automatic but not observable.** A row that errors is retried on the next scheduled
  run (or manual invocation) with no operator action required — but there's no alerting or dashboard
  surfacing that this happened, since metrics/dashboards were explicitly out of scope.
- **No reconciliation job.** If `places`/`contacts`/`price_history` cache columns ever diverge from
  `verifications` (the C1 class of issue from the PIR, now guarded against at the write path but not
  actively monitored), there is no automated repair — explicitly deferred, per the confirmed scope.
- **Auto-reject/demotion on high dispute** (`verification.md` §3.1 describes it, it was never built)
  remains unimplemented, disclosed again here for completeness.

## Remaining Claim→Source integration work

Unchanged from the ADR-008 Correction report: Business Claim → Source → Verification integration is
still a separate future milestone requiring its own Source-model decision. This milestone did not
touch that boundary in any way — `BusinessClaimsService.decide()` was not modified, and the C1 guard
from the Correction milestone remains the only protection at that seam.

## Final git status

```
 M .env.example
 M apps/api/package.json
 M apps/api/src/app.module.ts
 M apps/api/src/core/config/configuration.ts
 M apps/api/src/core/config/env.validation.ts
 M apps/api/src/modules/verifications/repositories/verifications.repository.ts
 M apps/api/src/modules/verifications/verifications.module.ts
 M apps/api/src/modules/verifications/verifications.service.spec.ts
 M apps/api/src/modules/verifications/verifications.service.ts
 M apps/api/test/verifications.e2e-spec.ts
 M docs/99-decisions/ADR-008-verification-model.md
 M docs/architecture/deployment.md
 M docs/data/modules/verification.md
 M docs/delivery/state.yaml
 M package-lock.json
?? apps/api/src/modules/verifications/verification-expiry.scheduler.spec.ts
?? apps/api/src/modules/verifications/verification-expiry.scheduler.ts
?? apps/api/src/scripts/expire-overdue-verifications.spec.ts
?? apps/api/src/scripts/expire-overdue-verifications.ts
?? apps/api/test/verification-scheduler.e2e-spec.ts
?? docs/delivery/reports/VERIFICATION-SCHEDULER-OPERATIONAL-ENABLEMENT-2026-08-06.md
```

## Commit hashes

Recorded in a follow-up entry after commits are created (see final status).
