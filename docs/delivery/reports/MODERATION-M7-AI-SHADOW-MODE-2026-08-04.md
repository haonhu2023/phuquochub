# MODERATION M7 — AI SHADOW MODE

**Date:** 2026-08-04
**Authority:** [ADR-018](../../99-decisions/ADR-018-moderation-foundation.md) (Accepted + Addendum M7), [moderation-design.md](../../data/modules/moderation-design.md) §13
**Status:** **COMPLETE**
**Repository:** `D:\Projects\PhuQuocHub` (branch `master`)

M7 delivers AI Shadow Mode: the system generates AI recommendations for moderation cases, stores
them, and measures how often they agree with real moderator decisions — **and never acts on them**.
Human moderators remain the only decision maker. All work is complete and validated, including live
validation against the real Docker stack (Postgres/Redis/MinIO), a real running API server, and real
HTTP calls — see [Live validation](#live-validation-2026-08-04--complete) below.

---

## Scope discipline (shadow mode invariant)

The AI recommendation surface **never**:

- publishes, rejects, hides, or restores content
- resolves or dismisses moderation cases
- mutates `moderation_cases`, `media`, or `reviews`
- calls `assertValidMediaTransition`/`assertValidReviewTransition` or any FSM

Every write in this milestone targets exactly one table: `ai_recommendations`. This is enforced
structurally (`AiRecommendationsRepository`/`AiRecommendationsService` inject nothing that could
write to another table) and verified live (§Live validation, checks D/G).

## Database

**One migration, one new table**: `AddAiRecommendations` (`1720003500000`) creates
`ai_recommendations` only. No change to `moderation_cases`, `reports`, `media`, or `reviews`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `case_id` | `uuid` NOT NULL, FK → `moderation_cases(id)` ON DELETE CASCADE | Real FK + cascade, same shape as `reports.case_id` |
| `provider` / `model` | `varchar(100)` | |
| `decision` | `moderation_decision` (existing enum, no new type) | AI's suggestion — never applied |
| `confidence` | `numeric(4,3)` | 0..1 |
| `labels` | `jsonb` nullable | |
| `reasoning` | `text` nullable | |
| `prompt_version` | `varchar(50)` nullable | |
| `created_at` | `timestamptz` | |
| `evaluated_at` | `timestamptz` nullable | set only after a real moderator decision is compared |
| `moderator_decision` | `moderation_decision` nullable | |
| `matched` | `boolean` nullable | |
| `latency_ms` | `int` nullable | |
| `metadata` | `jsonb` nullable | |

Indexes: `(case_id, created_at DESC)` for `findLatestByCase()`; partial `(case_id) WHERE
evaluated_at IS NULL` for pending-evaluation scans.

`decision`/`moderator_decision` **reuse** the existing `moderation_decision` Postgres enum
(`InitModeration`, M1) — no new enum type, and the two columns are directly comparable.

**Rollback:** `down()` unconditionally drops the table. Unlike `InitModeration.down()` (which
refuses when a real moderator decision — `resolved` case — exists), shadow-mode recommendations are
AI suggestions, never moderation outcomes, so there is no decision history to protect. Rehearsed
live: apply → revert (table verified gone) → reapply, against the real Docker Postgres instance.

## Design deviation from the original §13 sketch (ADR-018 Addendum M7)

The pre-M7 sketch in `moderation-design.md` §13 imagined shadow mode writing directly to
`media.ai_moderation_score`/`ai_labels` (ADR-009's dormant AI columns). Building M7 for real
surfaced why that doesn't work: a single-slot column can hold exactly one score (a re-run
overwrites it, destroying the history needed to measure "how often was the AI right"), has no way
to record `matched`/`moderator_decision`/`evaluated_at`, and only exists on `media` — not `reviews`.
M7 instead adds **one new table**, `ai_recommendations`. This is a genuine deviation from ADR-018
D1 ("Two new tables: `reports` and `moderation_cases`. Nothing else.") — documented as an
**Addendum**, not a rewrite, since D1 governed the M1–M6 foundation scope and the original decision
record is preserved verbatim. See [ADR-018 Addendum — M7](../../99-decisions/ADR-018-moderation-foundation.md#addendum--m7-ai-shadow-mode-2026-08-04)
for the full reasoning. Every Shadow-mode invariant (never mutates content/case status, never calls
FSM, AI never decides) is unchanged — only the storage location moved.

## Entity, repository, service

- **Entity** `AiRecommendation` (`entities/ai-recommendation.entity.ts`) — the table above, 1:1.
- **Repository** `AiRecommendationsRepository` — `findById`, `findLatestByCase` (ORDER BY
  `created_at DESC`), `create`, `recordModeratorOutcome` (updates exactly 3 columns on exactly one
  row), `getStatistics()` (aggregate: totals, evaluated, agreement rate, average confidence, false
  positives/negatives, breakdown by `decision` and by `target_type` via a read-only JOIN to
  `moderation_cases` — `ai_recommendations` does not denormalize `target_type` onto itself).
- **Service** `AiRecommendationsService`:
  - `generateRecommendation(moderationCase)` — accepts an already-loaded `ModerationCase`, calls
    the provider, persists one row, publishes `ai.recommendation.created`. No transaction (a single
    INSERT has no multi-table invariant to protect).
  - `evaluateModeratorDecision(caseId, moderatorDecision)` — called **after** `ModerationService`'s
    T2 transaction commits. Compares the case's latest recommendation (if any, and if not already
    evaluated) against the real decision, writes `matched`/`moderator_decision`/`evaluated_at`,
    publishes `ai.recommendation.evaluated`. No-op if the case has no recommendation, or if the
    latest one was already evaluated (a `reopen` + re-decide does not overwrite the first
    evaluation — the metric stays "did the AI call the *first* real decision correctly").
  - `getStatistics()` / `findLatestByCase()` — thin delegation to the repository.

## AI provider abstraction

`AiModerationProvider` (`ai/ai-moderation-provider.ts`) — `recommend(input) → { provider, model,
decision, confidence, labels, reasoning, promptVersion, latencyMs, metadata }`, DI token
`AI_MODERATION_PROVIDER`. Default and only implementation: `LoggingAiModerationProvider` — a
**deterministic fake** derived from a stable hash of `targetType:targetId` (same input → same
output, needed for reproducible tests and comparisons), never `restore` (not a sensible *first*
recommendation — restore only makes sense reversing a prior decision), confidence in `[0.5, 0.99]`,
structured logging only. **No OpenAI. No Anthropic. No external HTTP call anywhere in this path.**

## Integration point: `ModerationService.decide()` (T2)

`ModerationModule` now imports `AiRecommendationsModule` one-way (`AiRecommendationsModule` imports
only `ModerationCoreModule`, never `ModerationModule` back — no cycle).
`ModerationService.emitPostCommit()` gained a **third, independent** try/catch block calling
`aiRecommendations.evaluateModeratorDecision(outcome.caseId, outcome.decision)` — after the audit
and event try/catches, at the same trust level (INV-9: post-commit only, a failure here can never
roll back or fail the real decision). Verified live and in unit tests that a thrown error from this
call does not propagate — `decide()` still resolves normally, media/case still mutate correctly.

## Permissions — no new permission

`POST /moderation/cases/{id}/ai-recommendation` reuses `AI.ModerateMedia` (seeded in M1, granted
only to `ai_agent`, per ADR-018 D10 — "AI never decides" enforced by *not granting*
`Media.Moderate`, not by an `if`). `GET /moderation/cases/{id}/ai-recommendation` reuses
`Moderation.Queue.View`. Zero new permission codes.

## Events — exactly the two named in the M7 spec

`ai.recommendation.created` and `ai.recommendation.evaluated`, added to the existing
`ModerationDomainEvent` union and published through the existing `MODERATION_EVENT_PUBLISHER` token
(`LoggingModerationEventPublisher` — logs only, no broker, same as every other moderation event).
No second event channel was introduced.

## Tests

| Suite | Coverage |
|---|---|
| `1720003500000-AddAiRecommendations.spec.ts` | migration structure: one table, FK+cascade, enum reuse, no `status` column, nullable evaluation columns, index shape, unconditional `down()` |
| `logging-ai-moderation-provider.spec.ts` | determinism, decision set (never `restore`), confidence range, no network calls |
| `ai-recommendations.repository.spec.ts` | CRUD, `findLatestByCase` ordering, `recordModeratorOutcome` column scope, `getStatistics()` aggregation (incl. empty/never-evaluated case) |
| `ai-recommendations.service.spec.ts` | `generateRecommendation` (provider call shape, persistence, event, error isolation, no case mutation), `evaluateModeratorDecision` (no-op paths, matched true/false, event, error propagation to caller) |
| `ai-recommendations.controller.spec.ts` | permission metadata (`AI.ModerateMedia` / `Moderation.Queue.View`), throttle limits |
| `moderation.service.spec.ts` (extended) | post-commit hook call args, commit-ordering, error isolation (decide() still 200), fires for `dismiss` too |

Results: **all new + existing moderation unit suites PASS** (16 suites / 245 tests in
`src/modules/moderation` + the new migration spec).

## Live validation (2026-08-04 — COMPLETE)

Docker Desktop was started, containers confirmed healthy (`phuquoc-postgres`, `phuquoc-redis`,
`phuquoc-minio`). Migration rehearsed **apply → revert (table confirmed gone via `\dt`) → reapply**
against the real Postgres instance. Real API server (`npm run dev`, port 4000) was started; all
checks below are real HTTP calls plus direct `psql` queries against the live database.

**Fixtures:** 2 real users registered via `/api/auth/register` (`ai_agent`, `moderator`), roles
granted via direct SQL `INSERT INTO user_roles` (matching every prior milestone's fixture
convention); 2 disposable `pending` media + moderation cases inserted directly in Postgres.

### A. Permission matrix (live HTTP)

| Caller | `POST .../ai-recommendation` | `GET .../ai-recommendation` (nonexistent case) |
|---|---|---|
| anonymous | **401** | — |
| moderator (no `AI.ModerateMedia`) | **403** | — |
| `ai_agent` | **201** | — |
| — | — | **404** |

### B. Recommendation creation — moderation state confirmed untouched

`POST` returned `{decision: "hide", confidence: 0.8, evaluated_at: null, matched: null, ...}`.
Direct DB query confirmed `media.status` still `pending` and `moderation_cases.status` still `open`
with `decision IS NULL` — **zero mutation** from generating a recommendation.

### C. Moderator decides — both agreement branches verified

- **Mismatch:** AI recommended `hide` (not valid on `pending` media — the AI is a fake and doesn't
  know the FSM); moderator legitimately decided `reject`. `GET` afterward showed
  `moderator_decision: "reject"`, `matched: false`, `evaluated_at` set.
- **Match:** on a second case, AI recommended `reject`; moderator deliberately decided `reject` to
  match it. `GET` showed `matched: true`.

### D. Statistics — exact arithmetic confirmed via direct SQL

Reproducing `getStatistics()`'s aggregate query directly in `psql` against the two live
recommendations above: `total=2, evaluated=2, matched=1, avg_confidence=0.855 ((0.8+0.91)/2),
false_positives=0, false_negatives=0`. Every value matched hand-computed expectations exactly.

### E. Cleanup — zero residue confirmed

All disposable fixtures removed in FK-safe order (moderation_cases — cascades `ai_recommendations`
automatically — → media → user_roles → audit_logs → users). Post-cleanup: `ai_recommendations`
count for the test case IDs = 0, moderation queue count returned to the pre-existing baseline of
**11** (the same baseline recorded in the M6 report, confirming no residue accumulated).

## Full regression (2026-08-04)

| Check | Result |
|---|---|
| Backend unit | **103 suites / 1155 tests PASS** |
| Backend e2e (all 20 suites, real Postgres/Redis) | **20 suites / 172 tests PASS** (includes the new `moderation-ai-shadow.e2e-spec.ts`, 9 tests) |
| Backend build | PASS (exit 0) |
| Backend lint | PASS, `--max-warnings=0` |
| Backend typecheck | PASS |
| Migration apply → revert → reapply | PASS, rehearsed against real Postgres |

## E2E coverage detail (`moderation-ai-shadow.e2e-spec.ts`)

- **Recommendation creation**: `ai_agent` → 201 with no moderation-state mutation; moderator (no
  `AI.ModerateMedia`) → 403; nonexistent case → 404; `GET` before any `POST` → 404.
- **Moderator decision → agreement recording**: matched=true and matched=false paths, both
  confirmed via `GET`; a case with **no** recommendation still decides normally (no-op AI side).
- **Statistics**: before/after delta assertions on `getStatistics()` (repository + service only —
  no HTTP endpoint, per spec) isolate this suite's fixtures from any pre-existing data.
- **Rollback** (the inverse of `moderation-decide-rollback.e2e-spec.ts`): a Nest DI spy makes
  `AiRecommendationsRepository.recordModeratorOutcome` throw. Unlike the M6 rollback spec (where an
  in-transaction failure causes a full T2 rollback and a 500), here `decide()` still returns **200**
  and `media`/`moderation_cases` still resolve correctly — because the AI evaluation call happens
  strictly after commit, in its own try/catch. The recommendation itself is left un-evaluated
  (`evaluated_at`/`matched` stay `NULL`) rather than silently faking success.

## Documentation updated

- [moderation-design.md](../../data/modules/moderation-design.md) — top banner (M7 entry), §13
  (AI integration — marked done, documents the table-vs-columns deviation), §18 roadmap table (M6
  and M7 rows marked done).
- [ADR-018](../../99-decisions/ADR-018-moderation-foundation.md) — **Addendum** appended (original
  decision record D1–D14/O1–O7 untouched) documenting the `ai_recommendations` table deviation from
  the original §13 sketch and why a single-slot media column could not satisfy the M7 spec.
- [openapi.yaml](../../api/openapi.yaml) — `POST`/`GET /moderation/cases/{id}/ai-recommendation`,
  `AiRecommendation` schema. No changes to any existing path.
- `state.yaml` — this milestone recorded as current state.

## Remaining work (out of M7 scope, unchanged)

Sanctions, appeals, notifications, analytics/SLA dashboards, bulk decisions, keyboard shortcuts,
real-time/websocket updates, and the later AI phases (**Assist**, **Auto-hide** — both explicitly
un-approved, gated on Owner review of the agreement data this milestone now starts collecting). No
dashboard/UI surfaces the AI recommendation data — repository + service only, per spec.
