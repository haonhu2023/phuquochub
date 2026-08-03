# MODERATION FOUNDATION M5 — USER REPORTING (TRANSACTION T3) — FINAL STATUS

**Date:** 2026-08-03
**Milestone:** M5 of the Moderation Foundation roadmap ([ADR-018](../../99-decisions/ADR-018-moderation-foundation.md), Accepted; [moderation-design.md](../../data/modules/moderation-design.md) §7/§9.2/§18). User report creation, transaction T3, report aggregation, severity escalation, moderation case creation/reuse, audit, domain events. **No auto-hide, no automatic moderation, no moderator frontend, no AI decisions, no notifications, no appeals, no sanctions, no new moderation status values, no scheduler** — all explicitly out of scope per the Owner's instruction and confirmed absent from the diff.

## 1. Status

Complete. `POST /reviews/{id}/report` and `POST /media/{id}/report` (the two pre-existing openapi stubs) now implement the full T3 transaction — case reuse/creation, duplicate prevention, report_count/severity/priority recomputation — live-verified against real Postgres including severity escalation and duplicate rejection. A genuine architectural conflict (a circular module dependency M5 would otherwise introduce) was found and resolved cleanly. Zero regression across 98 backend unit suites and 18 e2e suites. ADR-018 was **not** modified — implementation revealed no contradiction with it.

## 2. Environment

Docker Desktop was already running from the M4/orphan-cleanup-fix sessions; `phuquoc-postgres`/`-redis`/`-minio` all healthy throughout.

## 3. Files added

- `apps/api/src/modules/moderation/moderation-core.module.ts` — the new leaf module (see §6).
- `apps/api/src/modules/moderation/moderation-reports.service.ts` + `.spec.ts` — T3 orchestration.
- `apps/api/src/modules/moderation/moderation-severity.ts` + `.spec.ts` — pure severity/priority functions.
- `apps/api/src/modules/reviews/reviews.controller.spec.ts` (new — this controller had no spec file before M5).
- `apps/api/test/moderation-reporting.e2e-spec.ts`.
- This report.

## 4. Files modified

- `apps/api/src/modules/moderation/events/moderation-events.ts` — `+ReportCreatedEvent`, `+CaseOpenedEvent`.
- `apps/api/src/modules/moderation/repositories/moderation-cases.repository.ts` + `.spec.ts` — `+findOpenCaseForTargetForUpdate()` (locked case lookup for T3), `+updateReportAggregation()`.
- `apps/api/src/modules/moderation/repositories/reports.repository.ts` + `.spec.ts` — `existsByReporterAndTarget()` gained an optional `manager` parameter.
- `apps/api/src/modules/moderation/dto/moderation.dto.ts` + `.spec.ts` — `+CreateReportDto`.
- `apps/api/src/modules/moderation/moderation.module.ts` — now imports `ModerationCoreModule` instead of directly providing the two repositories/event token.
- `apps/api/src/modules/media/repositories/media.repository.ts` + `.spec.ts` — `+existsPublished()`.
- `apps/api/src/modules/media/media.service.ts` + `.spec.ts` — `+report()`.
- `apps/api/src/modules/media/media.controller.ts` + `.spec.ts` — `+POST /media/{id}/report`.
- `apps/api/src/modules/media/media.module.ts` — now imports `ModerationCoreModule` (new dependency, see §6).
- `apps/api/src/modules/reviews/repositories/reviews.repository.ts` + `.spec.ts` — `+existsPublished()`.
- `apps/api/src/modules/reviews/reviews.service.ts` + `.spec.ts` — `+report()`.
- `apps/api/src/modules/reviews/reviews.controller.ts` — `+POST /reviews/{id}/report`.
- `apps/api/src/modules/reviews/reviews.module.ts` — now imports `ModerationCoreModule` instead of the full `ModerationModule`.
- `docs/api/openapi.yaml`, `docs/data/modules/moderation-design.md`, `docs/delivery/state.yaml` — see §15.

No new migration — `reports` and `moderation_cases` already existed from M1 with exactly the schema T3 needs. No new permission — `Report.Create` was already seeded and granted to `member` in M1's `SeedModerationPermissions`.

## 5. Endpoint behavior

`POST /reviews/{id}/report` and `POST /media/{id}/report` — identical contract, symmetric implementation:

- Target must exist **and** be `published`. Both "doesn't exist" and "exists but not published" return the **same `404`** — the endpoint never tells a reporter whether unpublished content exists, which would leak internal moderation state (`existsPublished()`, a new repository method on each domain, returns `false` for both cases).
- `reason` required (enum: `spam`/`misinformation`/`offensive`/`irrelevant`/`copyright`/`personal_info`/`other`), `description` optional (max 1000 chars, trimmed).
- Success returns `201` (matching the controller's `@HttpCode(HttpStatus.CREATED)` — the pre-existing openapi stub incorrectly said `200`, corrected in this milestone).
- A second report from the same reporter on the same target returns `409` with **zero** additional database mutation.
- Both routes are throttled to 5 requests/minute (moderation-design.md §8.2), same as the WF-12 sequence diagram specifies.
- `Report.Create` is required — already granted to `member` (every registered user) since M1, so no new permission grant was needed to exercise this live.

## 6. Transaction behavior (T3)

Implemented in a new `ModerationReportsService` (in `ModerationCoreModule`, not `ModerationModule` — see below), inside one `dataSource.transaction`:

1. **Case reuse/creation**: attempt `createOpenCase()` (source=`report`, severity=`normal`, priority=10 — the pre-recompute starting point) with `ON CONFLICT DO NOTHING` against the same `uq_moderation_cases_open_target` partial unique index that already guarantees INV-3. If it wins, this is a new case. If it conflicts (a case already exists for this target), fetch and **lock** that existing case (`findOpenCaseForTargetForUpdate`, `SELECT ... FOR UPDATE`) — this lock is the transaction's sole concurrency gate for the report_count increment that follows, exactly mirroring T2's case-lock pattern. In the vanishingly rare window where the case gets resolved/dismissed between the conflict and the locked SELECT, the code retries `createOpenCase()` once more (it will now succeed, since the old case no longer matches the partial index) rather than assuming that window can't happen.
2. **Duplicate check** (`existsByReporterAndTarget`, now manager-aware): runs *after* the case lock is held, so two duplicate attempts from the same reporter are serialized through it rather than racing on a stale read. Throws `ConflictException` if found — the transaction rolls back with zero mutation.
3. **Report insert** (`ReportsRepository.create()`, pre-existing since M1).
4. **Aggregation recompute**: `report_count` is incremented, then `severity`/`priority` are recomputed from the **post-increment** count via the new pure `computeSeverity()`/`computePriority()` functions (moderation-severity.ts, §8) and written via the new `updateReportAggregation()`.
5. Commit.
6. **After commit only**: `audit.record('report.created', ...)` and `events.publish(ReportCreatedEvent)`, plus `events.publish(CaseOpenedEvent)` **only** when the case was genuinely new (not reused) — failures in either are logged, never revert the already-committed report (INV-9, same pattern as every prior milestone).

**Content visibility is never touched.** Neither `reviews.status` nor `media.status` appears anywhere in this transaction — O3/INV-6 (report escalates queue priority only) is structural, not a runtime check.

## 7. Duplicate prevention

`uq_reports_one_per_reporter (target_type, target_id, reporter_id)` remains the ultimate database-level guarantee (unchanged since M1). The application-level pre-check (`existsByReporterAndTarget`) now runs *inside* the T3 transaction, after the case lock, closing the narrow race window a pre-M5, outside-transaction check would have left open. Live-verified: a reporter's second attempt on the same target after their first succeeded returns `409`, and the case's `report_count` is confirmed unchanged (still reflects only the genuine, distinct reports).

## 8. Case reuse / severity escalation

Live-verified the exact progression on one target across three distinct reporters:

| Report # | Case rows for target | `report_count` | `severity` | `priority` |
|---|---|---|---|---|
| 1st (new case) | 1 | 1 | `normal` | 10 |
| 2nd (different reporter, same target) | 1 (**not** 2 — INV-3 holds) | 2 | `normal` (below the ≥3 threshold) | 15 |
| 3rd (third distinct reporter) | 1 | 3 | `high` (§4.1 O3 threshold crossed) | 40 |

`priority = base(severity) + min(5 × max(report_count − 1, 0), 25)`, exactly moderation-design.md §4.1's formula — confirmed both by 16 unit tests on the pure function in isolation and by this live sequence (`base(high)=30 + min(5×2,25)=10 → 40`).

`computeSeverity()` is a **raise-to-at-least** function, never a plain assignment — a case's severity is `max(current, floor-for-source, ≥3-reports-floor)`. This is deliberate: it's what lets the D14/O7 backfill exception (a `new_content`-sourced case created at severity `normal`, above that source's normal `low` floor) survive a report automatically without `computeSeverity()` needing any special-case knowledge of backfill — `max(normal, low) = normal`, unchanged.

## 9. Unit test results

**`moderation-severity.spec.ts`** (new, 16 tests): per-source floors, raise-never-lowers behavior (explicitly including the backfill-exception scenario and an already-critical case), the ≥3 report_count→high threshold (including the exact boundary at 2 vs 3, and confirming it never lowers an existing `critical`), the priority formula at every severity base, the report_count=1/2/3 increments, and the +25 cap at high report counts.

**`moderation-reports.service.spec.ts`** (new, 16 tests): new-case creation (correct `createOpenCase` args, report insert args, aggregation values, `CaseOpenedEvent`+`ReportCreatedEvent`, audit with `actorId`/context), case reuse (no second `createOpenCase` call, report_count/severity computed from the *existing* case not the initial values, no `CaseOpenedEvent`), the rare resolved-case-during-race retry path, duplicate rejection (`ConflictException`, no report/aggregation writes, the check running through the manager), INV-9 ordering and audit/event-failure-doesn't-revert, and a media-target pass-through check.

**Repository tests**: `findOpenCaseForTargetForUpdate` (lock + target/status filter, not-found→null), `updateReportAggregation` (writes exactly the pre-computed values), `existsByReporterAndTarget`'s new manager-aware branch, `MediaRepository.existsPublished()`/`ReviewsRepository.existsPublished()` (both branches: found-and-published vs anything else, same 404-shape reasoning verified at the SQL/query level).

**Service tests**: `ReviewsService.report()`/`MediaService.report()` — not-published→404 without calling `ModerationReportsService`, published→correct pass-through of `targetType`/`targetId`/`reporterId`/`reason`/`description`, and empty `description`→`null` (not `undefined`).

**Controller tests**: `Report.Create` permission + 5/min throttle metadata on both new routes (new `reviews.controller.spec.ts` file, since this controller had none before).

**DTO tests**: `CreateReportDto` — all 7 reason values accepted, missing/invalid reason rejected, description length boundary (1000 exactly vs 1001), trimming, unknown-field rejection.

## 10. E2E results

**`moderation-reporting.e2e-spec.ts`** (2 tests, real Postgres, deliberately consolidated — see §13): one comprehensive review-target test proving the full T3 sequence (new case → reuse → escalation → duplicate rejection → invalid-target 404) in five real HTTP calls, and one media-target test proving the same underlying mechanism (401 unauthenticated, 201 happy path with case creation, 404 not-found, 404 not-published, 400 invalid reason).

## 11. Live validation

All of Phase 8's required scenarios were exercised through the e2e suite above against real Postgres, not simulated: report row + case row + `report_count` + `severity` + `audit` row all confirmed via direct SQL after the first report; a second report confirmed reusing the *same* case row with `report_count` increased; a duplicate report from the same reporter confirmed `409` with `report_count` unchanged and no second report row. Domain-event dispatch itself (`ReportCreatedEvent`/`CaseOpenedEvent`) is exhaustively unit-tested (§9) rather than re-observed live — `LoggingModerationEventPublisher` only writes to the application `Logger`, and this test environment's e2e runs do not surface `[Nest]` log lines in captured output (a pre-existing characteristic of this environment, not something changed here), so the event-dispatch *contract* (the right event, with the right `isNewCase` gating) is verified at the point closest to the actual code — the service call boundary — rather than by grepping logs.

## 12. Regression

| Suite | Result |
|---|---|
| M5 unit tests (severity + reports service + repository extensions + service/controller/DTO) | 5 test files, all passing |
| Full backend unit suite | **98 suites / 1115 tests** (up from 1049 at end of M4), zero regression |
| M5 e2e (`moderation-reporting.e2e-spec.ts`) | 2 tests, all passing |
| Full backend e2e suite | **18 suites / 162 tests** (up from 160), zero regression |

## 13. A genuine defect found and fixed during test authoring

The first draft of the e2e suite registered a **fresh** user account (via `POST /api/auth/register`) for every single report action across ~13 planned test cases. This immediately exceeded the global auth-registration throttle (10/min), causing `res.body.data` to be `undefined` for later registrations (a `429` response has no `data` field) — a cascade of `TypeError: Cannot read properties of undefined` failures. Fixed by switching to a small, fixed pool of reporter accounts registered **once** in `beforeAll` and reused across distinct targets (safe: duplicate-prevention keys on `(reporter, target)`, and different tests report different targets).

That fix then surfaced the **real** constraint: `POST /reviews/{id}/report` and `POST /media/{id}/report` are each independently throttled to 5 requests/minute (moderation-design.md §8.2, which this milestone implements as specified), and every supertest call in a Jest e2e run shares one IP, so all calls to one route across the *entire file* share one 5-request budget. The suite was consolidated into two tests that spend exactly 5 calls per route, following the exact convention `media.e2e-spec.ts` already documents for `presign()`'s 10/min limit: keep the suite's call count under the threshold, never bypass or weaken the throttle to make tests pass.

## 14. Architectural fix: `ModerationCoreModule`

M5 required media reports to call into moderation infrastructure (`ModerationCasesRepository`, `ReportsRepository`, the event-publisher token) — but `ModerationModule` already imports `MediaModule` (since M3, for `decide()`'s `MediaRepository` dependency). `MediaModule` importing `ModerationModule` back would have been a genuine two-hop circular module dependency — not the kind of thing the M2/M4 workaround (raw cross-table SQL instead of injecting `ReviewsRepository`) could solve, since unlike that case, *both* directions here are real: Moderation genuinely needs Media for `decide()`, and Media genuinely needs Moderation for `report()`.

Resolved by extracting `ModerationCasesRepository`, `ReportsRepository`, the event-publisher token, and the new `ModerationReportsService` into a brand-new leaf module, `ModerationCoreModule`, with zero imports of Media/Reviews/Places/Rbac. `ModerationModule`, `MediaModule`, and `ReviewsModule` (switched from importing the full `ModerationModule`, which it never needed beyond this token) all import `ModerationCoreModule` directly — never each other. No `forwardRef()` was used (not a pattern this codebase uses anywhere, verified by grep). The fix was verified to actually work at the DI-container level — not just that `tsc`/`nest build` succeeded, which only compiles TypeScript and never instantiates Nest's injector — by booting the full `AppModule` through a real e2e test (`health.e2e-spec.ts`) before writing any T3 business logic, confirming no circular-dependency exception was thrown at startup.

## 15. Documentation/governance updates

- `docs/api/openapi.yaml` — the pre-existing `POST /reviews/{id}/report` stub upgraded from a generic, under-specified placeholder (`200`, freeform `reason: string`, no error responses) to the real M5 contract (`201`/`401`/`403`/`404`/`409`, `reason` enum, `description` maxLength). New `POST /media/{id}/report` path added (no stub existed for it before).
- `docs/data/modules/moderation-design.md` — M5 marked done in the status banner and the M1–M7 roadmap table only; the §9 API table already listed both report paths, `Report.Create`, and `M5` from the original design and needed no change.
- `docs/delivery/state.yaml` — governance entry for this session.
- This report.

**ADR-018 itself was not modified.** No implementation decision in M5 contradicted it; the T3 transaction shape, the severity/priority formula, the duplicate-prevention mechanism, and the case-reuse logic all trace to explicit ADR-018/moderation-design.md text, cited above. The `ModerationCoreModule` extraction is a pure internal wiring change (same providers, same DI token, same behavior) driven by NestJS's module system, not a design decision the ADR speaks to.

## 16. Remaining work for M6

Per the roadmap (moderation-design.md §18): **Moderator UI**.

- Frontend moderation queue at `/dashboard/moderation` — list, detail, decide.
- Reuses existing card/filter/pagination patterns and the accessibility baseline (2026-08-02).
- Depends on M3 (already shipped); M5's reporting flow feeds the queue M6 will display, but M6 itself is purely frontend — no new backend endpoints anticipated.

M6 requires no new Owner decision (O1–O7 already cover everything it touches) and is not blocked by anything from M1–M5. **Not started**, per instruction.

## 17. Final git status

Working tree has the files listed in §3/§4, staged for review, not yet committed — Phase 11 commits follow immediately after this report.

## 18. Commit hashes

| Commit | Scope |
|---|---|
| _(pending)_ | `feat(moderation)`: implement reporting workflow |
| _(pending)_ | `test(moderation)`: verify reporting |
| _(pending)_ | `docs(moderation)`: record M5 completion |
