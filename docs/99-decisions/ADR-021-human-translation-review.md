# ADR-021 — Human Translation Review Workflow

## Status

Proposed — 2026-09-04.

Not yet through this repo's owner-approval ritual (contrast ADR-018/020's Accepted status with
recorded owner decisions). Recorded now because the underlying rule it encodes — real reviewer +
decision + timestamp + content version + audit trail, never inferred from a system actor — is an
explicit, already-given owner directive; this ADR documents the resulting design, not a proposal
awaiting a separate approval round. Extends [ADR-020](ADR-020-place-translation-model.md) and
[ADR-014](ADR-014-revision-model.md); does not supersede either.

## Context

A staging governance audit (2026-09-04) found all 8 existing `place_translations` rows carrying
`human_review_status=APPROVED`, `is_public=true`, `is_production_data=true` — with no real reviewer
behind any of it. The values traced to hardcoded literal constants in a one-off remediation script,
never derived from the workbook's actual `review_status=NEEDS_REVIEW`/`reviewer=null` columns.
`wiki_revisions.editor_id` for all 8 was the SYSTEM import service account
(`local-staging-import-actor@local.invalid`, `is_service_account=true`), not a human.

Root cause was architectural, not just the one script: `PlaceTranslationsService.publishOneTranslation()`
— the single write chokepoint for every place_translations row — trusted `isPublic`/`isProductionData`/
`productionEligible`/`humanReviewStatus`/`translationStatus` directly from whatever caller invoked it
(importer, bundle, script), with zero independent validation. `MultilingualPlaceImportService` held a
hard gate rejecting any row not pre-marked `translationStatus=APPROVED`, meaning nothing could import
without already being pre-asserted approved by whatever produced the import contract — the opposite of
"import as pending, review afterward."

## Problem

There was no code path that could turn PENDING content into APPROVED content that required a real,
identifiable, authorized human actor. Approval was structurally indistinguishable from "whatever the
importer happened to assert."

## Decision

Build the smallest mechanism that closes the loop, reusing existing infrastructure rather than adding
new tables:

1. **`wiki_revisions` is the review audit trail** — no new table. It already had `reviewed_by`/
   `reviewed_at` columns (nullable, never written by any code path) and a `status` enum. A review
   decision is recorded as a **new** `wiki_revisions` row for the **same `entity_id`** as the
   translation being reviewed (reusing `RevisionsRepository.record()`'s existing auto-numbering/
   parent-chaining) — `editor_id=null` (no content edit occurred), `reviewed_by=<real actor id>`,
   `reviewed_at=now()`, `status` mapped from the decision, `origin=MODERATOR_EDIT`.
2. **Content-version identity** — the translation's own `revision_id` (pointing at the `wiki_revisions`
   row that captured its text snapshot) is recorded inside the review revision's own snapshot as
   `reviewedContentRevisionId`, so an auditor can always prove which exact text a decision applied to,
   even after a later edit supersedes the row.
3. **`PlaceTranslationsService.publishOneTranslation()` (and `rollbackTranslationTo()`) now force**
   `translation_status`/`human_review_status='PENDING'`, `is_public`/`is_production_data`/
   `production_eligible=false` on every row they write, **regardless of what the caller claims**. This
   is the actual fix: no caller can ever assert approval through a content-write call again.
4. **`isSameTranslationContent()` (the republish-idempotency check) now compares content fields only**
   (text/format/locale/hash/method/qualityGate) — governance fields were removed from the comparison,
   so re-publishing byte-identical text never strips an existing real approval, and content-edit
   invalidation falls out "for free": any actual text change inserts a new row, which always starts
   PENDING.
5. **The multilingual importer's `translationStatus !== APPROVED → HELD` gate is removed.** The
   importer's job is to create content; approval is a separate human act. Its other structural gates
   (duplicate/foreign-key/validation/error-count) are untouched.
6. **New `TranslationReviewService.reviewTranslation(translationId, actorId, decision, notes)`** — the
   ONLY caller ever allowed to write the five governance columns after this change. Validates, in
   order: actor exists, `isActive=true`, `isServiceAccount=false`, holds `PlaceTranslation.Review.Any`
   via the existing RBAC `AuthorizationService` (never inferred from an email pattern). Then, in one
   transaction: inserts the review revision (point 1), then updates
   `place_translations` via a new `PlaceTranslationsRepository.updateReviewState()` — a method no
   other caller uses.
7. **`POST /admin/place-translations/:id/review`** (`PlaceTranslationsController`) accepts only
   `{decision, notes}` — `class-validator` + the app's global `forbidNonWhitelisted` ValidationPipe
   reject any other field (`reviewer_id`, `reviewed_at`, `is_public`, …) with 400 before the handler
   runs. The reviewer identity is always the authenticated principal (`CurrentUser`), never
   client-supplied. `GET /admin/place-translations/review-queue[?placeId=]` lists every current row
   still `PENDING`/`NEEDS_CHANGES`.
8. **New `RevisionStatus.NEEDS_CHANGES`** (`ALTER TYPE revision_status ADD VALUE`, forward-safe,
   non-destructive migration) and matching `HumanReviewStatus`/`TranslationApprovalStatus.NEEDS_CHANGES`
   (plain varchar values, no migration needed). Decision → outcome mapping:

   | Decision | `is_public` | `is_production_data` | `production_eligible` |
   |---|---|---|---|
   | APPROVED | true | true | true |
   | REJECTED | false | false | false |
   | NEEDS_CHANGES | false | false | false |

9. **New permission `PlaceTranslation.Review.Any`**, seeded via migration, granted to `moderator`
   (inherited upward to `administrator`/`super_administrator` via the existing `role_parents` DAG —
   same precedent as `SeedEditorialMediaPermission`). No user is assigned this role by the migration;
   granting a real reviewer is a separate, explicit operator action.

## Alternatives Considered

- **New dedicated review-events table.** Rejected: `wiki_revisions` already had every column needed
  (`reviewed_by`, `reviewed_at`, `status`) and an append-only, auto-numbering write path — a new table
  would duplicate that infrastructure for no benefit.
- **Extend `ModerationModule`** (existing case/decide workflow). Rejected: `ModerationTargetType` has no
  `translation` value, and the module's own code documents that even its `PLACE` target has no FSM
  implemented yet — extending it was a larger, riskier lift than this task's "smallest safe mechanism"
  scope.
- **Compute publication eligibility live via a JOIN through `wiki_revisions` on every read**, instead of
  stored booleans. More architecturally pure, but would touch the already-tested, hot `findCurrentPublic()`
  read path for no immediate governance benefit — deferred to a future iteration. The stored-boolean
  approach is safe as implemented because exactly one service (`TranslationReviewService`) may ever
  write those columns, and it always derives them fresh from the decision rather than trusting input.
- **Treat `wiki_revisions.status=APPROVED` on a content-write revision as a review signal.** Rejected —
  it has always meant "this write committed," not "a human approved this text," for every existing
  content-write call site (`publishOneTranslation`, `rollbackTranslationTo`, `backfillProvenance`,
  `publishRoute`, `publishSeo`). Changing that meaning globally was larger scope than the actual defect
  required; instead, the review decision is now a distinct, separate revision row that alone carries
  `reviewed_by`/`reviewed_at`.

## Consequences

### Positive

- `IMPORTER_CAN_FABRICATE_APPROVAL=NO`, `SYSTEM_ACTOR_CAN_APPROVE=NO`, `UNREVIEWED_TRANSLATION_LEAK=NO`,
  `REAL_HUMAN_APPROVAL_PATH=YES` — the four governance invariants this workstream set out to prove.
- No new table; the audit trail is the same append-only mechanism every other revision already uses.
- Content-edit invalidation requires no bespoke code — it is a consequence of point 3/4 above.

### Negative

- Every existing importer/bundle caller that asserted `isPublic`/`isProductionData`/`productionEligible`/
  `translationStatus`/`humanReviewStatus=APPROVED` now has that assertion silently ignored (forced to
  PENDING/false) — call sites that relied on immediate publication at import time must be updated to
  expect a PENDING row and a separate review step. `i18n-contract-fixtures.spec.ts` and
  `multilingual-place-import.service.spec.ts` were updated to reflect this.
- Publication eligibility is still stored as denormalized booleans (see Alternatives) — a future
  iteration may want to make it a fully derived read, at the cost of touching the read path.
- `TranslationApprovalStatus`/`HumanReviewStatus` remain plain `varchar(40)` (ADR-020's original
  decision, deliberately not revisited here) — the DB itself does not constrain these values; only
  application code (`TranslationReviewService`) does.

## Related Documents

- [ADR-020 — Place Translation Model](ADR-020-place-translation-model.md)
- [ADR-014 — Revision Model](ADR-014-revision-model.md)
- [ADR-019 — Resource-Scoped Authorization](ADR-019-resource-scoped-authorization.md)

## Related ADR

Extends ADR-020 (adds the review layer on top of its i18n foundation) and ADR-014 (reuses
`wiki_revisions` for a second purpose — review decisions, not just content snapshots). Does not
supersede either.

## Notes

- Branch: `feat/human-translation-review`. Migrations: `1720005100000-AddNeedsChangesRevisionStatus`,
  `1720005200000-SeedPlaceTranslationReviewPermission`.
- Open point: no genuine staging human-reviewer identity is known to exist yet — granting
  `PlaceTranslation.Review.Any` to a real staging user, and the first real VinWonders review decision,
  are separate, explicit owner/operator actions this ADR does not perform.
