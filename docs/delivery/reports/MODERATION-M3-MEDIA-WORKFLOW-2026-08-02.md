# MODERATION FOUNDATION M3 — MEDIA DECISION WORKFLOW + AUTO-PUBLISH ON REVIEW ATTACH — FINAL STATUS

**Date:** 2026-08-02
**Milestone:** M3 of the Moderation Foundation roadmap ([ADR-018](../../99-decisions/ADR-018-moderation-foundation.md), Accepted; [moderation-design.md](../../data/modules/moderation-design.md) §7/§9.1/§18). Media moderation decisions, auto-publish-on-review-attach, transactional review creation, legacy pending-review-media backfill, audit, domain events. **No review moderation, no report create/resolve, no moderator frontend, no notifications, no AI decisions, no sanctions, no scheduler, no new Owner policy** — all explicitly out of scope per the Owner's instruction and confirmed absent from the diff.

## 1. Status

Complete. `POST /moderation/cases/{id}/decide` (media only), the T1 auto-publish transaction, the T2 decision transaction, and the `BackfillModerationCases` migration are all implemented exactly to the documented contract, live-verified end-to-end against the real dev stack, zero regression across 95 backend unit suites and 16 e2e suites. **A critical bug was found and fixed during live validation** (§8) that unit tests alone would not have caught. ADR-018 was **not** modified — implementation revealed no contradiction with it.

## 2. Environment

Docker Desktop already running from the M1/M2 sessions (`phuquoc-postgres`/`-redis`/`-minio`, all healthy) — no relaunch needed this turn.

## 3. Files added

- `apps/api/src/core/database/migrations/1720003400000-BackfillModerationCases.ts` + `__tests__/1720003400000-BackfillModerationCases.spec.ts`
- `apps/api/src/modules/moderation/events/moderation-events.ts` (5 domain event classes + `MODERATION_EVENT_PUBLISHER` DI token/interface)
- `apps/api/src/modules/moderation/events/logging-moderation-event-publisher.ts` + `.spec.ts`
- `apps/api/src/modules/moderation/moderation.controller.spec.ts`
- `apps/api/src/modules/reviews/repositories/reviews.repository.spec.ts`
- `apps/api/test/moderation-media-decision.e2e-spec.ts` (13 tests)
- `apps/api/test/review-media-auto-publish.e2e-spec.ts` (5 tests)
- This report.

## 4. Files modified

- `apps/api/src/modules/media/repositories/media.repository.ts` — `attachToReview()` removed, replaced by `attachAndPublish()` (manager-aware, single UPDATE enforcing all 6 D3 conditions in SQL), `findByIdForUpdate()`, `updateStatus()`.
- `apps/api/src/modules/places/repositories/places.repository.ts` — `recalculateRating()` gained a manager-aware overload so it can run inside T1.
- `apps/api/src/modules/reviews/repositories/reviews.repository.ts` — rewritten: `createWithMedia()` (T1, replaces the old non-transactional `create()`/`save()`).
- `apps/api/src/modules/reviews/reviews.service.ts` + `.spec.ts` — `create()` rewritten around the transaction, plus post-commit audit/event emission.
- `apps/api/src/modules/reviews/reviews.module.ts` — imports `ModerationModule` (for the event publisher token).
- `apps/api/src/modules/moderation/repositories/moderation-cases.repository.ts` + `.spec.ts` — `+findByIdForUpdate()` (pessimistic lock), `+resolve()`.
- `apps/api/src/modules/moderation/repositories/reports.repository.ts` + `.spec.ts` — `+resolveByCaseId()`.
- `apps/api/src/modules/moderation/dto/moderation.dto.ts` + `.spec.ts` — `+DecideModerationCaseDto`.
- `apps/api/src/modules/moderation/moderation.service.ts` + `.spec.ts` — `+decide()` (T2).
- `apps/api/src/modules/moderation/moderation.controller.ts` — `+POST /moderation/cases/{id}/decide`.
- `apps/api/src/modules/moderation/moderation.module.ts` — registers `MODERATION_EVENT_PUBLISHER` (logging implementation, mirrors `BOOKING_EVENT_PUBLISHER`).
- `apps/api/src/modules/moderation/review-moderation.transition.ts` — comment updated to reference the renamed `ReviewsRepository.createWithMedia()`.
- `apps/api/src/modules/media/repositories/media.repository.spec.ts` — updated for the new methods (and for the tuple-shape bug fix, §8).
- `docs/api/openapi.yaml`, `docs/data/modules/moderation-design.md`, `docs/delivery/state.yaml` — see §14.

No frontend file touched. No new database table (only the one migration, which populates the *existing* `moderation_cases` table from *existing* `media` rows — no schema change).

## 5. Endpoints

| Method | Path | Permission | Target |
|---|---|---|---|
| `POST` | `/moderation/cases/{id}/decide` | `Media.Moderate` | `media` only — `review` returns `422 UnprocessableEntity` (M4) |

No `claim`/`release`/`reopen` action was built — `decide()` accepts a case in either `open` or `claimed` status directly, so a separate claim step isn't required for M3's contract. No `POST /media/{id}/moderate` (the pre-existing reserved stub in `openapi.yaml`) was wired up; M3 routes exclusively through `/moderation/cases/{id}/decide`, consistent with how M2 already named the resource.

## 6. Transaction boundaries (ADR-018 §7)

**T1 — `ReviewsRepository.createWithMedia()`** (one `dataSource.transaction`):
1. Insert the review (`status=published` immediately — O1, unchanged from pre-M3 behavior).
2. If `media_ids` provided, `MediaRepository.attachAndPublish()` — one `UPDATE media SET review_id=$1, status='published' WHERE id = ANY($2) AND uploaded_by=$3 AND object_key IS NOT NULL AND status='pending' AND deleted_at IS NULL AND review_id IS NULL AND place_id IS NULL AND post_id IS NULL AND business_id IS NULL AND event_id IS NULL RETURNING id` — **all 6 D3 eligibility conditions enforced in the SQL `WHERE` clause itself**, not just in TypeScript.
3. If the returned id count ≠ requested `media_ids.length`, throw `UnprocessableEntityException` — the whole transaction (review insert included) rolls back. **All-or-nothing, no partial publish** (INV-14).
4. `PlacesRepository.recalculateRating()` (manager-aware overload) inside the same transaction.
5. Commit. Audit (`review.created`, `media.auto_published` per media id) and domain events (`ReviewCreatedEvent`, `MediaAutoPublishedEvent`) are emitted **after** commit, in a separate try/catch that logs on failure but never reverts the already-committed review (ADR-018 INV-9, confirmed by a dedicated unit test that asserts audit/event failure does not throw from `create()`).

`POST /media` behavior is unchanged — an orphan upload still returns `status=pending` and stays that way until a review attaches it.

**T2 — `ModerationService.decide()`** (one `dataSource.transaction`):
1. `findByIdForUpdate` — pessimistic-write lock + read the case.
2. Validate status is `open` or `claimed` (else `409 Conflict` — already decided by someone else).
3. Validate `target_type === media` (else `422` — review decisions are M4).
4. Lock + read the media row; if gone, `422`.
5. `INV-12`: if `media.uploadedBy === actorId`, `403 Forbidden`.
6. `dismiss` short-circuits here: resolves the case as `dismissed`, resolves linked reports as `dismissed`, **does not touch `media.status`**, commits.
7. Otherwise: `reason` required for `reject`/`hide` (INV-11, checked before the FSM call so the error message is decision-specific); `assertValidMediaTransition(previousStatus, decision, target_status)` — the **existing pure FSM**, not reimplemented — throws `422` on an invalid transition (INV-13) or a missing `target_status` for `restore` (INV-10, no default).
8. Update `media.status`, resolve the case (`resolved`, decision, reason, resolver, timestamp), resolve linked reports (`upheld` for reject/hide, `dismissed` otherwise).
9. Commit. Audit (`moderation.decided`) and the appropriate domain event (`ContentApprovedEvent`/`ContentHiddenEvent` + `CaseResolvedEvent`) are emitted **after** commit, same failure-doesn't-revert pattern as T1.

**T4 — `BackfillModerationCases` migration**, see §7.

## 7. Backfill (T4 / D14 / O7)

Per ADR-018's O7, this is a **migration-time** backfill (`1720003400000-BackfillModerationCases.ts`), not a second, separate runner mechanism — matching M1/M2's existing migration-based delivery precedent, no CLI script invented.

Sequence inside `up()`: (1) `SELECT count(*)` of eligible rows (`status='pending' AND review_id IS NOT NULL AND deleted_at IS NULL`) and log it *before* writing anything (D14's count-then-report requirement); (2) `INSERT ... SELECT ... ON CONFLICT DO NOTHING RETURNING id` — idempotent against the M1 partial unique index on `(target_type, target_id) WHERE status IN ('open','claimed')`; (3) one summary `audit_logs` row (`moderation.backfilled`, `context: {candidate_count, created_count}`). **`media.status` is never touched by this migration** (O7 — no bulk publish; a human still decides each one via `decide()`).

`down()` refuses to revert (throws, deletes nothing) if any backfilled case has since moved to `resolved`/`dismissed` — reverting would silently erase a real moderator decision (MR-5). Otherwise it deletes the still-`open`, `report_count=0`, `source=new_content` cases it would have created, plus the `moderation.backfilled` audit rows.

## 8. Critical bug found during live validation

**Symptom:** two of five new `review-media-auto-publish.e2e-spec.ts` tests failed with *exactly inverted* results — a single valid media attach returned `422` instead of `201`; a request with one invalid media id among several returned `201` instead of `422`.

**Root cause:** `MediaRepository.attachAndPublish()` ran `const rows: Array<{id}> = await manager.query(UPDATE ... RETURNING id, params)` and returned `rows.map(r => r.id)`. TypeORM's Postgres driver (`node_modules/typeorm/driver/postgres/PostgresQueryRunner.js`) returns the raw result of `UPDATE`/`DELETE` statements as a **`[rows, rowCount]` tuple**, unlike `INSERT`/`SELECT`, which return `rows` directly. Because the tuple was never destructured, `rows` was actually the 2-element tuple, so `rows.length` was always `2` and `rows.map(r => r.id)` mapped over `[actualRows, rowCount]` instead of the real result set — the published-media-count check was comparing against a meaningless number, inverting the all-or-nothing guard.

**Why unit tests didn't catch it:** the existing mocks for `manager.query()` assumed the (wrong) plain-array shape, so they passed regardless of the real driver behavior. This is exactly the class of defect the Owner's mandated Phase 8 live-validation step exists to catch — it was only found by running the real upload → review flow against real Postgres.

**Fix:** destructure the tuple — `const [rows]: [Array<{id: string}>, number] = await manager.query(...)`. Verified against the real driver (added temporary debug logging showing the literal `[[{"id":"..."}],1]` shape before fixing), then all 5 e2e tests re-run and passed (§10).

**Related, out-of-scope finding:** the same bug pattern exists in `MediaRepository.softDeleteOrphanCandidate()` (a different, already-shipped milestone — Media Orphan Cleanup), which also does `UPDATE ... RETURNING id` via `.query()` and checks `rows.length > 0` to detect whether the row was already cleaned up by a concurrent run. That check is currently always `true`, meaning it can never actually detect the "already cleaned by someone else" case. **Not fixed here** — it's unrelated to M3's media-decision/auto-publish/backfill scope — and has been flagged as a separate follow-up task rather than bundled into this change.

## 9. Unit test results

**New/updated tests across the touched modules:**

- `media.repository.spec.ts` — `attachAndPublish` (empty input, all-6-conditions UPDATE, partial match returns the shorter list for the caller to compare), `findByIdForUpdate`, `updateStatus`.
- `reviews.repository.spec.ts` (new) — 6 tests on `createWithMedia`'s transaction behavior (mocked `DataSource.transaction`).
- `reviews.service.spec.ts` (rewritten) — 10 tests: not-found place, duplicate review, zero-media path, multi-media path, partial-media-id rejection propagates from the repository, and audit/event failure after commit does **not** throw from `create()` or revert the review.
- `moderation.service.spec.ts` (rewritten) — 34 tests total (10 pre-existing M2 list/getById + 24 new `decide()` tests): case not found, already resolved/dismissed, wrong target_type, media not found, self-moderation, every valid transition (approve/reject/hide/restore/dismiss), missing-reason rejection, missing-`target_status` rejection, INV-9 audit-then-event-after-commit ordering (via call-order tracking), audit/event failure doesn't revert, and the correct domain event is published per outcome.
- `moderation.controller.spec.ts` (new) — 5 metadata-based tests confirming the route/permission/HTTP-code decorators on `decide()`.
- `moderation-cases.repository.spec.ts` / `reports.repository.spec.ts` — new tests for `findByIdForUpdate`, `resolve`, `resolveByCaseId`.
- `moderation.dto.spec.ts` — `DecideModerationCaseDto` validation cases.
- `1720003400000-BackfillModerationCases.spec.ts` (new) — 7 tests: candidate count query shape, INSERT source/severity/priority/report_count values, no `UPDATE media` anywhere in `up()` (O7), `ON CONFLICT DO NOTHING` present, audit row content, `down()` clean-delete path, `down()` refusal when any case is resolved/dismissed.
- `logging-moderation-event-publisher.spec.ts` (new).

The pure FSM modules (`media-moderation.transition.spec.ts`, `review-moderation.transition.spec.ts`) already had full transition coverage from M1 and were **not duplicated** here.

## 10. E2E results

**`moderation-media-decision.e2e-spec.ts`** (13 tests, real Postgres): no-token 401, member-without-permission 403, approve 200 (media published, case resolved, audit written), reject without reason 400/422, reject with reason 200, hide with reason 200 (published→hidden), restore without `target_status` 422 (INV-10), restore with `target_status=published` 200, invalid transition (published + reject) 422 (INV-13), unknown case 404, already-resolved case 409 on a second decision, self-moderation 403 (INV-12), dismiss 200 (case dismissed, media status unchanged).

**`review-media-auto-publish.e2e-spec.ts`** (5 tests, real Postgres + MinIO round trip via `presign`→`PUT`→`register`): single valid media → 201, media published + `review_id` set, audit rows for both `media.auto_published` and `review.created`; multiple valid media → all published under the same `review_id` (atomic); one invalid media id among several → 422, zero reviews created, the valid media stays `pending`/orphaned (no partial publish); no `media_ids` → 201, unchanged pre-M3 behavior; another user's media → 422, rejected, stays `pending`. This suite is where the tuple bug (§8) was caught and, after the fix, all 5 passed.

## 11. Live validation (Phase 8)

Run directly against the containers, not simulated:

1. **Real upload flow** — `moderation-media-decision`/`review-media-auto-publish` e2e suites both perform a real `presign` → `PUT` to the presigned URL → `register` round trip against the real MinIO container, then a real `POST /places/{id}/reviews`, with every assertion re-querying Postgres directly rather than trusting the HTTP response alone.
2. **Invalid-media rollback** — verified via direct DB query after the 422 response: zero new review rows, the (otherwise-valid) sibling media id still `pending`/orphaned — proving the transaction actually rolled back, not just that the HTTP layer reported failure.
3. **Decision paths with a real moderator token** — all 5 decisions (approve/reject/hide/restore/dismiss) plus the 3 rejection paths (missing reason, invalid transition, self-moderation) exercised end-to-end in `moderation-media-decision.e2e-spec.ts` against real permission grants.
4. **Backfill idempotency, run twice against real data** — the dev database already held 11 genuine pending-media-with-`review_id` rows from pre-M3 activity (a real instance of exactly the inconsistency this migration targets, not synthetic fixtures). `migration:run` created exactly 11 `open` moderation_cases (`candidate_count=11, created_count=11`, logged and confirmed via `psql`). A second invocation of the migration's `up()` directly against a `QueryRunner` from the same live `DataSource` (bypassing the tracked-migration guard, to simulate what happens if the backfill logic ever runs twice) reported `candidate_count=11, created_count=0` — the `ON CONFLICT DO NOTHING` against the M1 partial unique index blocked every duplicate insert at the database level, not just in a mock. Final state confirmed via `psql`: 11 `moderation_cases` rows (not 22), 2 `audit_logs` rows documenting both invocations truthfully.
5. **Cleanup** — the e2e suites clean up their own disposable fixtures in `afterAll` (confirmed via direct `psql` queries showing 0 residue). The 11 backfilled cases were **not** deleted afterward — they are a legitimate repair of real pre-existing data inconsistency in the dev database, not disposable test fixtures, and leaving them in place is the migration's intended effect (a moderator can now `decide()` on each of them). The one-off Node script used to double-invoke `up()` for the idempotency check was deleted after the drill.

## 12. Full validation suite results (Phase 9)

| Check | Result |
|---|---|
| Backend unit tests | **95 suites / 1018 tests** (up from 91/951 at end of M2), zero regression |
| Backend e2e tests | **16 suites / 142 tests** (up from 14/124), zero regression |
| Backend typecheck | Clean |
| Backend lint | Clean |
| Backend build | Clean |
| Monorepo build/typecheck/lint (turbo, 5 packages) | 12/12 tasks green |
| Migration apply → revert → reapply drill | All three steps succeeded against the real dev DB; `down()`'s resolved/dismissed guard did not trigger (no case had been decided yet) |
| `git diff --check` | Clean (benign LF→CRLF `autocrlf` notices only) |
| Secret scan (tracked diff + new untracked files) | No matches |
| `git status --short` | Matches exactly the file list in §3/§4 — no stray files |

## 13. Limitations, disclosed honestly

- **Review moderation is not implemented.** `decide()` on a `target_type=review` case returns `422 UnprocessableEntity` with an explicit message — this is M4, not silently unsupported.
- **`claim`/`release`/`reopen` were not built.** `decide()` accepts `open` or `claimed` directly; a moderator never needs to explicitly claim a case before deciding it in the current contract. If a future milestone needs exclusive claim semantics (to prevent two moderators racing on the same case in a UI), that's new scope, not an M3 gap.
- **`POST /media/{id}/moderate`** (the pre-existing reserved stub in `openapi.yaml`, tagged `Media`) remains unimplemented — M3 exclusively routes through `/moderation/cases/{id}/decide`.
- **The pre-existing tuple-return bug in `softDeleteOrphanCandidate()`** (§8) was found but deliberately not fixed here — flagged separately.
- **Sanctions, notifications, and AI decisions** are untouched, per explicit exclusion.

## 14. Documentation/governance updates

- `docs/api/openapi.yaml` — new `POST /moderation/cases/{id}/decide` path (parameters, request schema with `decision`/`target_status`/`reason`, `200`/`401`/`403`/`404`/`409`/`422` responses), validated by parsing with `js-yaml` before commit.
- `docs/data/modules/moderation-design.md` — M3 marked done in both the top status banner and the M1–M7 roadmap table; the banner and table entry explicitly note that `claim`/`release`/`reopen` and `POST /media/{id}/moderate` were **not** built, so the doc doesn't overclaim beyond what shipped. No other content changed.
- `docs/delivery/state.yaml` — governance entry for this session (prior M2 entry preserved below it, per the existing convention).
- This report.

**ADR-018 itself was not modified.** No implementation decision in M3 contradicted it; every transaction boundary, eligibility condition, and audit/event ordering choice traces to an explicit line in the ADR or moderation-design.md §7/§9.1, cited above.

## 15. Remaining work for M4

Per the roadmap (moderation-design.md §18): **Review Decision Workflow + rating recalculation in transaction**.

- Extend `decide()` (or a parallel path) to accept `target_type=review`, with the analogous FSM (`assertValidReviewTransition`, already written and unit-tested since M1, unused by any caller until M4).
- INV-4 (rating recalculation must happen inside the same decision transaction as the status change) and its regression test.
- Everything else in ADR-018 that's downstream of a working review-decision path.

M4 requires no new Owner decision (O1–O7 already cover everything it touches) and is not blocked by anything from M1–M3. **Not started**, per instruction.

## 16. Final git status

Working tree has the files listed in §3/§4, staged for review, not yet committed — Phase 11 commits follow immediately after this report.

## 17. Commit hashes

| Commit | Scope |
|---|---|
| _(pending)_ | `feat(reviews)`: make media attachment transactional |
| _(pending)_ | `feat(moderation)`: add media decision workflow |
| _(pending)_ | `test(moderation)`: verify M3 workflows |
| _(pending)_ | `docs(moderation)`: record M3 completion |
