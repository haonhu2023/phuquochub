# MODERATION FOUNDATION M1 — SCHEMA FOUNDATION — FINAL STATUS

**Date:** 2026-08-02
**Milestone:** M1 of the Moderation Foundation roadmap ([ADR-018](../../99-decisions/ADR-018-moderation-foundation.md), Accepted; [moderation-design.md](../../data/modules/moderation-design.md)). Schema, enums, entities, FSM modules, permission seed, foundational repositories. **No endpoint, no service, no UI, no queue, no notification, no AI** — all explicitly out of scope for M1 per the Owner's instruction and the design doc's own M1 row.

## 1. Status

Complete. All required M1 deliverables implemented, live-validated against the real dev database (migration run → revert → reapply, both directions verified byte-for-byte), and fully covered by unit tests. Zero deviation from ADR-018 — no new Owner decision was introduced; no design element was reinterpreted.

## 2. Environment

- Node v24.18.0, npm 11.16.0 (same environment as every recent session).
- Docker Desktop was not running at session start (`docker ps` failed to connect). Located it at a non-default install path (`%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`, not the usual `C:\Program Files\...`) and launched it directly — same safe, reversible approach as the PLACE-042 precedent. The existing dev stack (`phuquoc-postgres`/`-redis`/`-minio`) auto-restarted healthy; no reinstall, no config change.
- All validation ran against the live local Postgres/PostGIS container, not mocks.

## 3. Files added

**Enums, entities, FSM, repositories, module** (`apps/api/src/modules/moderation/`):
- `moderation.enums.ts` — 7 enums exactly matching design doc §6.1.
- `entities/moderation-case.entity.ts`, `entities/report.entity.ts`.
- `media-moderation.transition.ts` + `.spec.ts` — pure FSM, no DB dependency, mirrors `booking-status.transition.ts`.
- `review-moderation.transition.ts` + `.spec.ts` — same pattern.
- `repositories/moderation-cases.repository.ts` + `.spec.ts`.
- `repositories/reports.repository.ts` + `.spec.ts`.
- `moderation.module.ts`.

**Migrations** (`apps/api/src/core/database/migrations/`):
- `1720003200000-InitModeration.ts` + `__tests__/1720003200000-InitModeration.spec.ts`.
- `1720003300000-SeedModerationPermissions.ts` + `__tests__/1720003300000-SeedModerationPermissions.spec.ts`.

**Documentation:**
- This report.

## 4. Files modified

- `apps/api/src/app.module.ts` — registered `ModerationModule`.
- `docs/data/database.md` §11 — `moderation_cases`/`reports` added to the entity catalog as ✅ Accepted; `reports` struck from the "referenced but not approved" list it had carried since Wave 1.
- `docs/data/modules/moderation-design.md` — M1 roadmap row and status banner marked done.
- `docs/delivery/state.yaml` — governance entry (see §7 below).

No `media`, `reviews`, or `users` file was touched — M1 introduces zero FK-requiring changes to those tables (the design's soft-FK/no-cascade target references need no schema change on the target side).

## 5. Migration names

| Migration | Contents |
|---|---|
| `InitModeration1720003200000` | 7 enum types; `moderation_cases` (18 columns, 4 indexes incl. the partial unique index); `reports` (9 columns, 2 indexes). Self-refusing `down()` per MR-5. |
| `SeedModerationPermissions1720003300000` | 6 permissions (D10); granted to `member`/`moderator`/`ai_agent`; `administrator`/`super_administrator` deliberately not seeded (DAG inheritance). |

Both follow the established `ON CONFLICT DO NOTHING` idempotency convention and the `1720003200000+` timestamp ADR-018 reserved for this milestone.

## 6. Validation output

### Live database (not mocked)

- `migration:run` — both migrations executed cleanly against the real dev Postgres.
- **Schema verification** (`\d moderation_cases`, `\d reports`): every column, type, default, FK, and index matches design doc §6.2/§6.3 exactly — confirmed by direct psql inspection, not inferred from the migration source.
- **INV-3 live-verified**: inserted an open case for a target, then attempted a second open case for the *same* target inside the same transaction — Postgres rejected it with `duplicate key value violates unique constraint "uq_moderation_cases_open_target"`. The partial unique index enforces the invariant structurally, exactly as ADR-018 requires.
- **Idempotent insert live-verified**: ran the exact `INSERT ... ON CONFLICT (target_type, target_id) WHERE status IN ('open','claimed') DO NOTHING` pattern D14's future backfill will use — first call inserted, second call against the same target inserted zero rows, no error.
- **MR-5 self-refusing `down()` live-verified twice**: inserted a case with `status='resolved'`, ran `migration:revert` — TypeORM's transaction rolled back and the migration threw `InitModeration1720003200000.down() refused: 1 case(s) are already 'resolved'...`, confirmed the DB was untouched. Deleted the test row, reverted again — succeeded cleanly this time, proving the refusal was condition-driven, not unconditional.
- **Full revert → verify → reapply drill** (PLACE-042 precedent): reverted `InitModeration` — confirmed via `\dt`/`pg_type` that both tables and all 7 enum types were gone; confirmed via a direct query that all 6 permissions were gone. Reapplied both migrations — `migration:show` confirmed `[X]` on both; `\d` output and the permission grant listing were re-verified identical to the pre-revert state.
- Permission grants read back from `role_permissions`/`roles`/`permissions` match D10 exactly: `member→Report.Create`, `moderator→{Media.Moderate, Moderation.Queue.View, Report.Resolve, Review.Moderate}`, `ai_agent→AI.ModerateMedia`. `ai_agent` does **not** hold `Media.Moderate` — verified by absence, not by a negative test alone.

### Backend unit tests

- **88 suites / 911 tests, all passing**, zero regression. New this milestone: 6 suites (2 FSM, 2 migration, 2 repository), covering:
  - **Media FSM**: all 7 valid transitions plus 11 invalid ones — the full 4×4 status×action matrix minus valid combinations — including the three INV-13-named cases (`published→rejected`, `hidden→rejected`, `pending→hidden`) and both `restore`-without-`target_status` / `restore`-with-invalid-`target_status` error paths.
  - **Review FSM**: all 3 valid transitions plus 6 invalid ones (full 3×3 matrix), plus the `restore` + non-`published` target rejection.
  - **InitModeration migration**: structural assertions on every enum, table, column default, FK, and index; both the clean-revert and the resolved-case-refuses-revert paths.
  - **SeedModerationPermissions migration**: exact permission set, exact per-role grants, explicit assertion that `ai_agent`'s grant array does not contain `Media.Moderate`, explicit assertion that `administrator`/`super_administrator` receive no grant call at all.
  - **Repositories**: `createOpenCase`'s `ON CONFLICT` SQL shape and both its insert/conflict outcomes; `findOpenCaseForTarget`'s status filter; `ReportsRepository.create`'s manager-scoped save.

### Typecheck / lint / build

| Check | Result |
|---|---|
| Backend typecheck (`tsc --noEmit`) | Clean |
| Backend lint (`eslint "src/**/*.ts" --max-warnings=0`) | Clean |
| Backend build (`nest build`) | Clean |
| Monorepo build (`turbo run build`) | 4/4 green |
| Monorepo typecheck (`turbo run typecheck`) | 6/6 green |
| Monorepo lint (`turbo run lint`) | 6/6 green |
| `git diff --check` | Clean (only benign LF→CRLF `autocrlf` notices) |
| Secret scan (pattern grep over the diff) | No matches |

## 7. Test counts

- Backend: **88 suites / 911 tests** (up from 82 suites/855 tests recorded at the last Media Orphan Cleanup milestone).
- New this milestone: **56 tests** across 6 new suites (33 FSM + 11 InitModeration + 6 SeedModerationPermissions + 6 repository).
- Frontend: untouched — no frontend file was created or modified.

## 8. Documentation updates

- `docs/data/database.md` §11 — catalog entries added for `moderation_cases`/`reports`; `reports` struck from the Wave-1 "unapproved" list.
- `docs/data/modules/moderation-design.md` — M1 marked done in the roadmap table and the top status banner.
- `docs/delivery/state.yaml` — new governance entry (this session).
- This report.

ADR-018 itself was **not** modified — it already fully specifies M1's schema, and the instruction was to implement it exactly, not to redesign or annotate the ADR.

## 9. Remaining work for M2

Per ADR-018's own roadmap (§18 of moderation-design.md), M2 — **Moderation Queue Read API** — adds:

- `GET /moderation/cases`, `GET /moderation/cases/{id}` (read-only, `Moderation.Queue.View`).
- A thin service/mapper layer over `ModerationCasesRepository` for pagination and filtering (`status`, `target_type`, `source`, `severity`, `assigned_to`).
- Nothing that changes content visibility or case state — M2 cannot mutate anything, per the design's own ordering.

M2 requires no new Owner decision (O1–O7 already cover everything M2 touches) and is not blocked by anything from M1. **Not started** — per the explicit instruction to stop after M1.

## 10. Final git status

Working tree has the files listed in §3/§4, staged for review, not yet committed (commit was not requested for this turn — awaiting instruction).
