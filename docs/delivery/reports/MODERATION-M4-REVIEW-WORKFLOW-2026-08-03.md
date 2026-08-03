# MODERATION FOUNDATION M4 — REVIEW DECISION WORKFLOW + TRANSACTIONAL RATING RECALCULATION — FINAL STATUS

**Date:** 2026-08-03
**Milestone:** M4 of the Moderation Foundation roadmap ([ADR-018](../../99-decisions/ADR-018-moderation-foundation.md), Accepted; [moderation-design.md](../../data/modules/moderation-design.md) §7/§9.1/§18). Review moderation decisions, transactional review visibility changes, transactional place-rating recalculation, moderation case resolution, audit, domain events. **No report create/resolve, no auto-hide by report count, no moderator frontend, no notifications, no AI moderation, no user sanctions, no scheduler, no new Owner policy, no new review_status enum value** — all explicitly out of scope per the Owner's instruction and confirmed absent from the diff.

## 1. Status

Complete. `POST /moderation/cases/{id}/decide` now supports `target_type=review` (hide/restore/approve) alongside the existing media path, with transactional rating recalculation and runtime-selected permission enforcement, live-verified end-to-end against the real dev stack including a genuine forced-rollback proof. Zero regression across 95 backend unit suites and 17 e2e suites. ADR-018 was **not** modified — implementation revealed no contradiction with it.

## 2. Environment

Docker Desktop had to be relaunched at the start of this session (found not running — likely a host restart between sessions); `phuquoc-postgres`/`-redis`/`-minio` came back up healthy within ~20 seconds of starting the engine. Node v24.18.0, npm 11.16.0.

## 3. Files added

- `apps/api/test/moderation-review-decision.e2e-spec.ts` (17 tests)
- This report.

## 4. Files modified

- `apps/api/src/modules/moderation/repositories/moderation-cases.repository.ts` (+`ReviewForDecision` interface, +`findReviewForUpdate()`, +`updateReviewStatus()`) and its `.spec.ts`.
- `apps/api/src/modules/moderation/moderation.service.ts` — `decide()` restructured into shared case-load/permission-routing logic plus two private branches (`decideMedia()` unchanged behavior, new `decideReview()`); `DecisionOutcome` generalized to a discriminated union; `emitPostCommit()` branches on `targetType` for entity type and event target. Constructor gained `PlacesRepository` and `AuthorizationService`.
- `apps/api/src/modules/moderation/moderation.service.spec.ts` — 25 new tests for the review branch, permission-routing branch, and updated constructor wiring.
- `apps/api/src/modules/moderation/moderation.controller.ts` — `@RequirePermissions('Media.Moderate')` **removed** from `decide()` (see §7).
- `apps/api/src/modules/moderation/moderation.controller.spec.ts` — updated the one test that asserted the now-removed static metadata.
- `apps/api/src/modules/moderation/moderation.module.ts` — imports `PlacesModule` and `RbacModule` (see §8 for the circular-dependency analysis).

No new migration (M4 needs no schema change — `reviews`, `moderation_cases`, `places` are all pre-existing), no new permission (`Review.Moderate` was already seeded in M1's `SeedModerationPermissions`), no frontend file touched.

## 5. Endpoint changes

`POST /moderation/cases/{id}/decide` — same route as M3, now also accepting `target_type=review` cases. No duplicate route added (ADR-018 does not call for one; the M3 `decide` endpoint was already designed to be target-type-generic per moderation-design.md §9's own table, which has always listed `Media.Moderate` / `Review.Moderate` together against this one path for "M3/M4").

`target_type=place` cases still return `422` (no FSM registered, MR-4) — this is now reached through the same generic path-validity check rather than a hardcoded "media only" rejection.

## 6. Review state transitions

Exactly the pre-existing pure FSM (`review-moderation.transition.ts`, written and unit-tested since M1, previously unused by any caller):

| Action | From | To | `reason` | `target_status` |
|---|---|---|---|---|
| `hide` | `published` | `hidden` | **required** | — |
| `restore` | `hidden` | `published` | optional | optional — only `published` is a valid value; anything else is `422` (no guessing, since review has exactly one restore destination) |
| `approve` | `pending` | `published` | optional | — |

**No `rejected` value was added to `review_status`** — `decision=reject` against a review target is explicitly rejected with `422` in `ModerationService.decideReview()` *before* it ever reaches the FSM, rather than being force-cast into a type the FSM's switch statement doesn't handle (which would otherwise silently return `undefined`, a real bug class avoided by inspection, not discovered by a failing test).

`approve` (pending→published) has no path through the current API to *create* a pending review (`ReviewsRepository.createWithMedia()` always inserts `published`, per O1) — it exists for legacy/hand-inserted rows, exactly as `review-moderation.transition.ts`'s own comment already documented since M1. Live-verified anyway (§12) by hand-inserting a `pending` review, matching the milestone's explicit requirement.

Invalid transitions (e.g. `published` + `approve`, `hidden` + `approve`) return `422` with no status or rating mutation, unit- and e2e-verified.

## 7. Permission behavior

**This is the one place M4 required a real architectural decision beyond "copy the media pattern."** The correct permission depends on the case's `target_type` — a value only known *after* reading the case, i.e. at runtime, not at route-declaration time. A static `@RequirePermissions('Media.Moderate')` (M3's approach) cannot express "Media.Moderate for media cases, Review.Moderate for review cases" — arrays passed to `@RequirePermissions` are AND'd by `PermissionsGuard`, not OR'd, and there is no built-in per-branch permission mechanism in this codebase's guard.

**Resolution:** `@RequirePermissions` was **removed entirely** from `decide()`. `JwtAuthGuard` remains global, so an anonymous request still gets `401`. `PermissionsGuard` allows any authenticated request through when no permission metadata is declared (its existing, pre-M4 behavior for undeclared routes) — the actual authorization now happens **inside** `ModerationService.decide()`, immediately after the case is locked and read (so `targetType` is known), via `AuthorizationService.can(actorId, requiredPermission)` injected directly into the service. `Media.Moderate` is selected for `target_type=media`, `Review.Moderate` for `target_type=review`; neither is ever accepted for the other's decisions.

**Live-verified the non-interchangeability directly, not just unit-mocked:** a temporary role (`e2e_media_only_moderator`, created via direct `roles`/`role_permissions` SQL — no precedent in this repo for a custom test role before this, cleaned up in `afterAll`) granting **only** `Media.Moderate` was rejected with `403` when deciding a review case, while a full `moderator` role (both permissions) succeeded on both. The media-only role could still decide media cases normally, confirming M3 is unaffected.

## 8. Transaction behavior

T2 (moderation-design.md §7) extended, same one-transaction shape as M3:

1. Lock + read case (`findByIdForUpdate`) — `404` if missing.
2. Case must be `open`/`claimed` — `409` otherwise.
3. `target_type` must be `media` or `review` — `422` for `place`/anything else (no permission name exists for it).
4. **Select and check permission by target_type** (§7) — `403` if the caller lacks it.
5. Branch: media (unchanged from M3) or review (new):
   - Lock + read the review row.
   - `INV-12`: reject self-moderation (`403`) if the actor is the review's author.
   - `dismiss` short-circuits (case → dismissed, reports → dismissed, review untouched, no rating recalc — the published set didn't change).
   - `reject` on a review target → `422` (§6).
   - `hide` requires `reason` (`422` otherwise, INV-11).
   - FSM validates the transition; `ModerationCasesRepository.updateReviewStatus()` writes it.
   - `PlacesRepository.recalculateRating()` runs **in the same transaction** (§9).
   - Case resolved, linked reports resolved (`upheld` for `hide`, `dismissed` otherwise).
6. Commit.
7. **After commit only:** `audit.record()` (`moderation.decided`, `entityType: 'review'`) and the matching domain event (`ContentApproved`/`ContentHidden`, always `CaseResolved`) — never before, and a failure in either is logged but never reverts the already-committed decision (INV-9, unit-tested via call-order tracking and explicit audit/event-throws-doesn't-revert tests, same pattern as M3).

**Repository access without a circular module dependency.** `ReviewsRepository` (in `ReviewsModule`) was **not** injected into `ModerationService` — `ReviewsModule` already imports `ModerationModule` for the event-publisher token (a pre-existing M3 dependency), so importing `ReviewsModule` back would create a cycle. Instead, `ModerationCasesRepository` gained `findReviewForUpdate()`/`updateReviewStatus()` as raw parameterized SQL directly against the `reviews` table — the same precedent already established by `findTargetPreview()` in M2 for exactly this reason. `PlacesRepository.recalculateRating()`, already manager-aware since M3, **is** injected directly (`ModerationModule` now imports `PlacesModule`) — verified safe by tracing `PlacesModule`'s own imports (`CategoriesModule`, `ContactsModule`, `PricesModule`, `MediaModule`, `RevisionsModule`) and confirming none of them import `ModerationModule` or `ReviewsModule`.

## 9. Rating recalculation behavior

**INV-4** ("every `reviews.status` change that alters the published set must call `recalculateRating()` in the same transaction") is unconditional in `decideReview()`'s content-changed branch — there is no valid review transition that *doesn't* cross the published/not-published boundary (all three of `hide`/`restore`/`approve` do), so there was no branch where it could correctly be skipped.

`recalculateRating()` itself is unchanged from M3 — it always recomputes from scratch (`WHERE place_id = $1 AND status = 'published'`), never increments/decrements, so it's correct regardless of *why* the published set changed.

**Live-verified the exact arithmetic**, not just that a recalculation happened:

| Scenario | Before | Action | After |
|---|---|---|---|
| Hide one of two published reviews (ratings 5, 3) | `count=2, avg=4.0` | hide the rating-5 one | `count=1, avg=3.0` |
| Restore it | `count=1, avg=3.0` | restore | `count=2, avg=4.0` |
| Hide a place's only published review | `count=1, avg=5.0` | hide | `count=0, avg=NULL` (correct empty aggregate) |
| Legacy pending review (rating 2) alongside one published (rating 4) | `count=1, avg=4.0` | approve the pending one | `count=2, avg=3.0` |

**A real fixture bug was found and fixed while building these tests**: the first draft reused one shared disposable place across all rating tests with a hand-set `UPDATE places SET rating_avg=X, rating_count=Y` "baseline" before each `decide()` call. This diverges from reality once more than one test has run against that place, because `recalculateRating()` recomputes from *every* published review ever inserted for that place — including ones left `published` by an earlier test's `422` assertion. Three tests failed with wildly wrong counts (e.g. expected `1`, got `4`) until each rating-sensitive test was given its own disposable place, exactly like the pre-existing "hide the only review" test already did. This is exactly the kind of interference the milestone's "use disposable test data and fully clean it up" instruction is meant to prevent, caught by a genuinely failing assertion, not assumed correct.

## 10. Unit test results

**`moderation.service.spec.ts`**: 59 tests total (34 pre-existing M2/M3 + 25 new). New coverage: review not-found (`422`), INV-12 self-moderation for both content decisions and dismiss, `hide` without reason (`422`), `hide` with reason (hidden + rating recalculated, verified call order `updateReviewStatus` → `recalculateRating`), `restore` with/without `target_status`, `restore` with an invalid `target_status` (`422`), `approve` from `pending`, invalid transitions (`422`), `reject` on review (`422`), `dismiss` (no status/rating change), INV-9 audit-before-commit-never ordering, audit/event failure not reverting, correct event type per outcome (`ContentApproved`/`ContentHidden`/`CaseResolved`), audit `entityType='review'` with `placeId` in context, and 5 dedicated permission-routing tests (media case checks only `Media.Moderate`, review case checks only `Review.Moderate`, a caller with the *wrong* permission for the case's actual target type is rejected in both directions, no permission at all is rejected).

**`moderation-cases.repository.spec.ts`**: 5 new tests for `findReviewForUpdate()` (SQL shape, snake→camel mapping, not-found returns `null`, explicit note that `SELECT` results are plain arrays — not the `[rows, rowCount]` tuple that only applies to `UPDATE`/`DELETE`) and `updateReviewStatus()` (SQL/param shape, no FSM re-validation).

`review-moderation.transition.spec.ts` (M1) already had full transition coverage and was **not duplicated**.

## 11. E2E results

**`moderation-review-decision.e2e-spec.ts`** (17 tests, real Postgres): anonymous `401`; member (no permission) `403`; media-only-moderator `403` on a review case (§7); moderator with `Review.Moderate` `200`; hide one of two published reviews → hidden + case resolved + rating recalculated exactly + audit present; hide without reason `422` (status/rating unchanged); hide the only published review → empty aggregate; restore → rating restored exactly; restore with an invalid `target_status` `422`; legacy pending review approved → published + rating recalculated; invalid transition (`published`+`approve`) `422`; `reject` on review `422`; unknown case `404`; already-resolved case `409` on a second decision with **no further mutation**; INV-12 self-moderation `403`; `dismiss` (case dismissed, review and rating unchanged); and a regression check that a media-only moderator can still decide a real media case normally (M3 unaffected).

**Fixture correctness note:** `reviews` has a `uq_reviews_place_user` unique constraint (one review per user per place). The first draft reused one author across multiple reviews on the shared test place and hit `duplicate key value violates unique constraint` immediately — fixed by giving every fixture review its own disposable reviewer (a bare `users` row inserted directly, no registration round-trip needed since these accounts never log in), except where a specific test intentionally needs a shared author (the INV-12 self-moderation test).

## 12. Live validation

Run directly against the containers (after relaunching Docker Desktop, which was found not running at the start of this session):

1. Real Postgres exercised through the full `moderation-review-decision.e2e-spec.ts` suite (§11) — a real moderator JWT, real HTTP calls through `supertest`, every assertion re-querying Postgres directly.
2. Exact rating math verified for hide/restore/hide-to-empty/legacy-approve (§9 table).
3. Permission non-interchangeability verified with a real, purpose-built restricted role (§7).
4. Forced transaction-failure rollback proof (§13) — the one scenario not practically reachable through the live HTTP path (no natural post-write failure point exists in the current code), reproduced via a standalone script running the transaction's own two SQL statements, deliberately aborted.
5. Full backend e2e suite re-run twice to confirm the M4 addition caused no regression anywhere else, including the pre-existing media decision workflow.
6. Cleanup: `moderation-review-decision.e2e-spec.ts`'s `afterAll` deletes every case, audit row, review, disposable place, disposable reviewer user, granted `user_roles`, and the temporary role's `role_permissions`/`roles` rows — confirmed zero residue beyond the 4 principal registered test accounts (member/moderator/media-only/author), which is this repository's existing, unchanged convention: **no e2e file in this codebase deletes its registered `/api/auth/register` accounts** (verified by grep across every `.e2e-spec.ts` file), not a gap introduced here.

## 13. Rollback evidence

Phase 8 explicitly asks to "force a transaction failure after review status update but before commit" and verify both writes roll back. There is no natural failure point in `decideReview()` after the review-status write (the remaining calls are plain parameterized UPDATEs on data the code itself controls), so this was proven with a standalone script executing the transaction's own two statements directly against real Postgres:

```
BEFORE transaction:                          { review: 'published', place: { avg: 5.0, count: 1 } }
MID-TRANSACTION (same connection, pre-rollback): { review: 'hidden',    place: { avg: null, count: 0 } }
[forced failure thrown] → queryRunner.rollbackTransaction()
AFTER rollback (fresh read):                 { review: 'published', place: { avg: 5.0, count: 1 } }
```

Both `reviews.status` and `places.rating_avg`/`rating_count` reverted to their exact pre-transaction values after the deliberate failure — the standard Postgres/TypeORM transaction guarantee already relied upon throughout this feature (and proven the same way for M3's INV-14 all-or-nothing media attach), confirmed directly rather than assumed. The script and its fixtures were deleted immediately after; no residue.

## 14. Full regression results

| Suite | Result |
|---|---|
| M4 unit tests (`moderation.service.spec.ts` + `moderation-cases.repository.spec.ts`) | 84 tests, all passing |
| Full backend unit suite | **95 suites / 1049 tests** (up from 1019 at end of the orphan-cleanup fix), zero regression |
| M4 e2e (`moderation-review-decision.e2e-spec.ts`) | 17 tests, all passing |
| Full backend e2e suite | **17 suites / 160 tests** (up from 143), zero regression — one transient failure in `media-orphan-cleanup.e2e-spec.ts` during a parallel full-suite run was confirmed **not** a regression (passed cleanly in isolation and on a clean second full-suite re-run; consistent with cross-file interference on the shared dev DB from suites running in parallel, not anything M4 touched) |

## 15. Build/typecheck/lint results

| Check | Result |
|---|---|
| Backend typecheck | Clean |
| Backend lint | Clean |
| Backend build | Clean |
| Monorepo build/typecheck/lint (turbo, 5 packages) | 12/12 tasks green |
| `git diff --check` | Clean (benign LF→CRLF `autocrlf` notices only) |
| Secret scan (tracked diff + new untracked file) | No matches |
| `git status --short` | Matches exactly the file list in §3/§4 — no stray files |

## 16. Documentation/governance updates

- `docs/api/openapi.yaml` — `POST /moderation/cases/{id}/decide`'s description and request schema extended for the review target: permission-selection behavior, the narrower `reject`-is-media-only and `target_status`-is-media-two-values/review-one-value rules, rating-recalculation note.
- `docs/data/modules/moderation-design.md` — M4 marked done in both the top status banner and the M1–M7 roadmap table; the §9 API table already listed `Media.Moderate`/`Review.Moderate` and `M3/M4` against this path from the original design and needed no change. No other content changed.
- `docs/delivery/state.yaml` — governance entry for this session (prior entries preserved below it).
- This report.

**ADR-018 itself was not modified.** No implementation decision in M4 contradicted it; the permission-routing design (§7), the transaction extension (§8), and the rating-recalculation invariant (§9) all trace to explicit ADR-018/moderation-design.md text, cited above.

## 17. Remaining work for M5

Per the roadmap (moderation-design.md §18): **User Reporting**.

- `POST /reviews/{id}/report`, `POST /media/{id}/report` (both stubs already reserved in `openapi.yaml`).
- Transaction T3 (moderation-design.md §7): case creation/merge on `ON CONFLICT` against the same `uq_moderation_cases_open_target` partial unique index that already guarantees T4's idempotency, `report_count`/`severity`/`priority` escalation (≥3 reports ⇒ minimum `high` severity).
- Does **not** change content visibility (O3/INV-6) — reports only escalate queue priority, never auto-hide.

M5 requires no new Owner decision (O1–O7 already cover everything it touches) and is not blocked by anything from M1–M4. **Not started**, per instruction.

## 18. Final git status

Working tree has the files listed in §3/§4, staged for review, not yet committed — Phase 11 commits follow immediately after this report.

## 19. Commit hashes

| Commit | Scope |
|---|---|
| _(pending)_ | `feat(moderation)`: add review decision workflow |
| _(pending)_ | `test(moderation)`: verify review moderation and ratings |
| _(pending)_ | `docs(moderation)`: record M4 completion |
