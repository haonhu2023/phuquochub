# Evidence manifest tooling — runbook

Generic, schema-driven pipeline for turning researched sources/claims into `evidence_artifacts` +
`place_translation_evidence_links` (PR #8's schema — this branch never duplicates or writes to it
except through PR #8's own `EvidenceService`). See `apps/api/src/modules/evidence/tooling/` for the
implementation and its own tests.

## 1. Source research

Find an authoritative source (government > official operator > trusted secondary — see any prior
cohort's claim-matrix work for the classification convention). Capture: URL, publisher, retrieval
date, and the specific claims it supports (field/value/support-level triples).

## 2. Author a manifest

One JSON file, `manifest_version: "1.0"`, an array of `entries`. See
`evidence-manifest.types.ts` for the exact shape and
`apps/api/src/scripts/next-cohort-evidence-manifest-2026-09-04.json` for a worked example. Each
entry names a `place_slug` (never a raw UUID — resolved against the DB at run time), a `source`,
an `evidence` block, optional `claims`, and `links` to the translation rows the evidence supports.

**`evidence.verification_status` is always `NEEDS_REVIEW` in practice** — the validator rejects
`VERIFIED`/`BUSINESS_VERIFIED_AND_REVIEWED` outright, and the importer forces `NEEDS_REVIEW` at the
one call site that reaches the database regardless of what the manifest says. There is no manifest
field, flag, or CLI option that can mark evidence verified — only a real human review can.

## 3. Validate

```bash
npm run admin:evidence-manifest --workspace=apps/api -- --file=<path> --offline
```
Pure, deterministic, no DB connection at all. Fix every `severity: "error"` issue; `warning`
(e.g. `NO_LINKS`, `TRANSLATION_TARGET_NOT_FOUND`) is informational.

## 4. Dry-run against a real database

```bash
npm run admin:evidence-manifest --workspace=apps/api -- --file=<path> --db-name=<expected db>
```
`--db-name` is required for any DB-connecting run — the CLI refuses to guess. It's checked against
`SELECT current_database()` before anything else. Read-only: resolves place/translation targets,
reports what *would* happen, writes nothing.

## 5. Execute

```bash
npm run admin:evidence-manifest --workspace=apps/api -- --file=<path> --db-name=<expected db> --execute
```
Idempotent by design: reruns are always safe. `ensureEvidenceArtifact` is idempotent by
`business_key`; `linkEvidenceToTranslation` is idempotent by `(translation_id, evidence_id)`. The
importer also fails closed per entry — one entry's exception doesn't abort the rest of the manifest
— and refuses to link evidence when a `business_key` collides with a pre-existing, unrelated
evidence row (`BUSINESS_KEY_COLLISION`).

## 6. PR #8 dependency

This tooling calls PR #8's real `EvidenceService`/`SourcesRepository`/`EvidenceArtifactsRepository`
— it never reimplements their logic. It cannot run against a database that doesn't have PR #8's
migrations applied (`evidence_artifacts`, `place_translation_evidence_links`), and it must not be
merged or used against staging/production before PR #8 itself is merged and migrated there.

## 7. What this tool never does

Publish anything, approve anything, grant a review, or touch `place_translations`' governance
columns (`human_review_status`, `is_public`, `is_production_data`, `production_eligible`) — those
are owned exclusively by `TranslationReviewService.reviewTranslation()` on a different branch
entirely.
