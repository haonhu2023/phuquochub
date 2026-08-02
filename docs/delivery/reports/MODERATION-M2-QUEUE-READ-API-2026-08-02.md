# MODERATION FOUNDATION M2 — QUEUE READ API — FINAL STATUS

**Date:** 2026-08-02
**Milestone:** M2 of the Moderation Foundation roadmap ([ADR-018](../../99-decisions/ADR-018-moderation-foundation.md), Accepted; [moderation-design.md](../../data/modules/moderation-design.md) §9/§18). Read-only queue access: `GET /moderation/cases`, `GET /moderation/cases/{id}`. **No decision, report, backfill, UI, AI, or notification code** — all explicitly out of scope per the Owner's instruction and confirmed absent from the diff.

## 1. Status

Complete. Both endpoints implemented exactly to the documented contract, live-verified end-to-end against the real dev stack (not just unit tests), zero regression across 91 backend unit suites and 14 e2e suites. ADR-018 was **not** modified — implementation revealed no contradiction with it.

## 2. Environment

Node v24.18.0, npm 11.16.0. Docker Desktop already running from the M1 session (`phuquoc-postgres`/`-redis`/`-minio`, all healthy) — no relaunch needed this turn.

## 3. Files added

- `apps/api/src/modules/moderation/dto/moderation.dto.ts` + `.spec.ts`
- `apps/api/src/modules/moderation/moderation-target-preview.ts` (discriminated union type)
- `apps/api/src/modules/moderation/moderation.mapper.ts` + `.spec.ts`
- `apps/api/src/modules/moderation/moderation.service.ts` + `.spec.ts`
- `apps/api/src/modules/moderation/moderation.controller.ts`
- `apps/api/test/moderation-queue.e2e-spec.ts`
- This report.

## 4. Files modified

- `apps/api/src/modules/moderation/repositories/moderation-cases.repository.ts` (+`list()`, +`findTargetPreview()`) and its `.spec.ts`.
- `apps/api/src/modules/moderation/repositories/reports.repository.ts` (+`findByCaseId()`) and its `.spec.ts`.
- `apps/api/src/modules/moderation/moderation.module.ts` (registered `ModerationController`/`ModerationService`).
- `docs/api/openapi.yaml` (new `Moderation` tag, two paths, four schemas).
- `docs/data/modules/moderation-design.md` (M2 marked done in the roadmap table and status banner).
- `docs/delivery/state.yaml` (governance entry).

No new migration, no `media`/`reviews`/`users` file touched, no frontend file touched.

## 5. Endpoints

| Method | Path | Permission |
|---|---|---|
| `GET` | `/moderation/cases` | `Moderation.Queue.View` |
| `GET` | `/moderation/cases/{id}` | `Moderation.Queue.View` |

Both routes reuse the two stubs' sibling prefix (`/moderation`) exactly as named in moderation-design.md §9; neither `/moderation/cases/{id}/claim|decide|reopen` nor either `/report` endpoint exists yet — those are M3–M5.

## 6. Filters and sorting

Exactly the 5 filters documented in moderation-design.md §9 — `status`, `target_type`, `source`, `severity`, `assigned_to` — plus `page`/`limit`. **No `created`-date-range filter and no `sort_by`/`sort_dir` parameter were added.** I re-checked §9's API table specifically for these before implementing: it lists only the 5 filters above, and §4 documents exactly one fixed queue order with no mention of a configurable sort. Adding either would have been inventing a contract the ADR doesn't specify, which the task explicitly forbids — so I did not add them, even though the task's own Phase 2 language listed "created date range" and "documented sorting" among filter examples.

**Default `status` behavior:** omitted → `[open, claimed]` (the literal definition of "the queue," moderation-design.md §4); supplied → filters to that exact one value, including `resolved`/`dismissed` (so a moderator can look up a target's history via this same endpoint).

**Sort order is fixed, not client-selectable:** `priority DESC, report_count DESC, created_at ASC, id ASC` (the last as a determinism tie-break, matching the `PlacesRepository.list()`/`BookingsRepository.list()` precedent).

## 7. Authorization behavior

Both routes require `Moderation.Queue.View` via the existing `@RequirePermissions` decorator — no new permission, no role name ever appears in service or controller code. `JwtAuthGuard`/`PermissionsGuard` are already global (`APP_GUARD` in `AuthModule`, confirmed by reading the module rather than assuming), so no per-route guard decoration was needed, matching `BookingsController` exactly.

Live-verified (e2e, against real tokens and a real role grant, not mocked):

| Scenario | Result |
|---|---|
| Anonymous | `401` |
| `member` (no `Moderation.Queue.View`) | `403` on both `GET /moderation/cases` and `GET /moderation/cases/{id}` |
| `moderator` | `200` on both |

**Administrator inheritance:** not separately tested. `administrator` inherits `moderator` via the existing `role_parents` DAG (seeded in M1, unchanged here), and `AuthorizationService.getEffectivePermissions()` already expands ancestors before evaluating — the mechanism is identical to every other DAG-inherited permission in this codebase and untouched by M2. No existing test in the repo separately re-verifies DAG inheritance for every permission-gated endpoint either (it's tested once, generically, for the DAG mechanism itself), so adding an administrator-specific case here would test RBAC's DAG logic again rather than anything M2-specific.

## 8. Response/data-exposure behavior

**List response** — `ModerationCaseSummary[]` inside the standard pagination envelope (`{success, data, meta: {page, pageSize, total, totalPages, timestamp}}`, via the existing `paginate()` helper — no new envelope shape).

**Detail response** — `ModerationCaseSummary` + `reports: ModerationReportSummary[]` + `target_preview: ModerationTargetPreview`.

**Deliberately excluded, with reasoning:**

- **`ai_score`/`ai_labels`** — exist on the entity since ADR-009, but M2 is explicitly out of AI scope. Excluded from *both* responses so no API surface exists yet for a capability (M6/M7 AI flagging) that hasn't been built.
- **Media preview: `object_key`/`bucket`/`content_type`/`size_bytes`/`checksum_sha256`/`url`** — storage internals, not needed to make a moderation decision. **Honest limitation:** there is currently no way to see the actual image through this endpoint — that requires `StorageService` signed-URL generation, which ADR-018 never specifies and which would have pulled a new dependency into read-only queue logic. Deferred, not silently worked around.
- **Reporter name/email** — only `reporter_id` (UUID) is exposed. moderation-design.md §12 states reporter identity may be shown *to holders of `Moderation.Queue.View`* (exactly this endpoint's audience) — so exposing the UUID is correct per spec, but no join to `users` was added since a display name was never part of the documented report summary.

**Included, with reasoning:**

- **Review preview includes full `content`** — unlike media, reading the review text *is* the moderation workflow; withholding it would make the endpoint useless for its stated purpose.
- **`target_preview.found: false`** for a deleted/nonexistent target, or for any `place`-type case (no FSM registered, MR-4) — never a 500, confirmed live.

## 9. Unit test results

**96 new/updated tests** across 9 suites in `apps/api/src/modules/moderation/`:

- DTO (9 tests): valid empty query, valid full filter set, each of the 5 enum/UUID/int validations rejected individually, and an explicit test that undocumented fields (`date_from`, `sort_by`) are rejected — proving no invented filter can slip through `whitelist: true`.
- Repository — `ModerationCasesRepository.list()` (6 tests): default-statuses where clause, all 4 optional filters applied via `andWhere`, the fixed sort chain, `getCount()`/`getMany()` sharing one `QueryBuilder` instance (list/count parity is structural, not just tested-for), skip/take pagination math, empty-result behavior.
- Repository — `findTargetPreview()` (5 tests): media found (asserted the SQL string does *not* contain `object_key`/`bucket`/`checksum`), media not found, review found (asserts `content` is present), review not found, `place` short-circuits with zero DB calls.
- `ReportsRepository.findByCaseId` (1 new test).
- Mapper (11 tests): summary field mapping, ISO-string date formatting, explicit `ai_score`/`ai_labels` absence, report summary shape with an explicit absence check for `reporter_email`/`reporter_name`, both target-preview branches, the not-found branch, and detail composition.
- Service (12 tests): default-status behavior, explicit-status behavior, pagination defaults and math, filter passthrough, envelope shape, an explicit assertion that no write method (`createOpenCase`) is ever called from `list()`, 404 on unknown id with no downstream calls made, and confirmation the raw detail object is returned unwrapped for `TransformInterceptor` to wrap.

## 10. E2E results

**20 new tests**, `apps/api/test/moderation-queue.e2e-spec.ts`, run against the real Postgres/Redis containers:

Authorization (401/403×2/200×2), filters (default queue exclusion of `resolved`, explicit `status=resolved` history lookup, combined `target_type`+`severity`, `assigned_to`), fixed sort order (verified `priority` 35 ranks above `priority` 0 in real query results), pagination envelope shape, invalid-enum → `400`, detail 404, detail invalid-UUID → `400`, `reports[]` populated with the right `reporter_id`/`reason`, an explicit `JSON.stringify` scan of the whole response body confirming the moderator's own email never appears, target-preview `found:false` for a fixture with a nonexistent target id (no 500), `ai_score`/`ai_labels` absence, and two no-mutation checks (`status`/`updated_at` unchanged before/after repeated GETs; `reports` row count unchanged after a detail read).

## 11. Live validation

Ran directly against the containers, not simulated:

1. Registered a real `member` and a real `moderator` user via `/api/auth/register`.
2. Granted the `moderator` role to the second user with a direct `INSERT INTO user_roles` — the **first** e2e test in this repository to grant an elevated role this way (no prior precedent existed; documented here for future e2e authors).
3. Inserted 4 disposable `moderation_cases` rows spanning `open`/`claimed`/`resolved` status, `media`/`review` target types, `low`/`high`/`critical`/`normal` severity, `new_content`/`report`/`ai_flag`/`manual` source, and one assigned/three unassigned — plus one `reports` row.
4. Exercised every filter, the combined-filter case, the fixed sort, pagination, and every auth/error path with real HTTP calls through `supertest` against the live app.
5. Directly queried `moderation_cases`/`reports` before and after the full run to confirm zero mutation.
6. Deleted all 4 case rows, the 1 report row, and the 1 `user_roles` grant in `afterAll`; independently re-queried the database afterward and confirmed **0** residual rows matching the fixture pattern.

## 12. Full regression results

| Suite | Result |
|---|---|
| Moderation unit tests | 9 suites / 96 tests, all passing |
| Full backend unit suite | **91 suites / 951 tests** (up from 88/911 at end of M1), zero regression |
| Moderation e2e | 1 suite / 20 tests, all passing |
| Full backend e2e suite | **14 suites / 124 tests** (up from 13/104), zero regression |

## 13. Build/typecheck/lint results

| Check | Result |
|---|---|
| Backend typecheck | Clean |
| Backend lint | Clean |
| Backend build | Clean |
| Monorepo build | 4/4 green |
| Monorepo typecheck | 6/6 green |
| Monorepo lint | 6/6 green |
| `git diff --check` | Clean (benign LF→CRLF `autocrlf` notices only) |
| Secret scan | No matches |

## 14. Documentation/governance updates

- `docs/api/openapi.yaml` — `Moderation` tag; `GET /moderation/cases` and `GET /moderation/cases/{id}` paths with full parameter/response definitions; `ModerationCaseSummary`, `ModerationReportSummary`, `ModerationTargetPreview`, `ModerationCaseDetail` schemas. Validated by parsing with `js-yaml` before commit.
- `docs/data/modules/moderation-design.md` — M2 marked done in both the top status banner and the M1–M7 roadmap table; **no other content changed**.
- `docs/delivery/state.yaml` — governance entry for this session.
- This report.

**ADR-018 itself was not modified.** No implementation decision in M2 contradicted it; every filter, permission, and exposure choice traces to an explicit line in the ADR or the design doc, and is cited as such above.

## 15. Remaining work for M3

Per the roadmap (moderation-design.md §18): **Media Decision Workflow + auto-publish-on-review-attach**.

- `POST /moderation/cases/{id}/{claim,release,decide,reopen}` for `media` targets.
- `POST /media/{id}/moderate` (the reserved stub).
- Transaction T1 (D4): making `ReviewsService.create()` atomic and adding the 6-condition auto-publish-on-attach logic (O2).
- `BackfillModerationCases` migration for pre-M3 media already attached to reviews (D14/O7), with the mandatory count-before-run step.
- Audit (`moderation.decided`, `media.auto_published`) and event emission.

M3 requires no new Owner decision (O1–O7 already cover everything it touches) and is not blocked by anything from M1 or M2. **Not started**, per instruction.

## 16. Final git status

Working tree has the files listed in §3/§4, staged for review, not yet committed — Phase 9 commits follow immediately after this report.

## 17. Commit hashes

| Commit | Scope |
|---|---|
| `28b85d6` | `feat(moderation)`: add queue read API |
| `b179a69` | `test(moderation)`: verify queue access |
| _(this commit)_ | `docs(moderation)`: record M2 completion |
