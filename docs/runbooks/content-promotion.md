# Content promotion — staging → production

Moves human-reviewed content from staging into production. Deliberately separate from code
deployment: this pipeline never builds an image, never runs a migration, never touches application
code. It only ever moves `place_translations` rows that already passed real human review.

## Pipeline

```
STAGING (source)
  → EXPORT   (content-promotion-export-cli.ts, read-only)
  → VALIDATE (evaluatePromotionEligibility — built into export; only APPROVED + is_public +
              is_production_data + production_eligible + is_current rows ever leave staging)
  → IDENTITY RESOLVE (resolveProductionIdentity — external identifier > manual mapping > exact
                       unique slug; never fuzzy, never automatic on ambiguity)
  → DRY RUN  (content-promotion-apply-cli.ts, default mode)
  → OWNER APPROVAL (human decision — this pipeline never runs --apply on its own initiative)
  → APPLY    (content-promotion-apply-cli.ts --apply)
  → VERIFY   (re-run the export against production and eyeball, or query directly)
  → IDEMPOTENCY CHECK (re-run --apply; must report UNCHANGED for anything already applied)
```

## Commands

```bash
# 1. Export everything eligible from staging (or --slug=<one place> for a golden-record run)
npm run content-promotion:export --workspace=apps/api -- \
  --db-name=phuquochub_staging --out=promotion-manifest.json

# 2. Dry-run against production
npm run content-promotion:apply --workspace=apps/api -- \
  --manifest=promotion-manifest.json --db-name=<production db name>

# 3. Apply, once the dry-run output has been reviewed and approved
npm run content-promotion:apply --workspace=apps/api -- \
  --manifest=promotion-manifest.json --db-name=<production db name> --apply

# 4. Re-run step 3 unchanged — every entry should now report UNCHANGED
```

## Identity resolution

Staging and production place UUIDs are **never** assumed to match — proven false for both
VinWonders and Hòn Thơm during this pipeline's design (different UUIDs in each database). Instead:

1. **External identifier** (`place_external_identifiers`, once PR #8 ships) — the strongest signal,
   survives a slug rename on either side. Two production places sharing one staging external id is
   a `CONFLICT`, not an automatic pick.
2. **Manual mapping** — an explicit, human-curated `{staging_place_id, production_place_id}` entry,
   never inferred.
3. **Exact, unique slug match** — proven to already hold for both golden records today. Two
   production places sharing a slug is a `CONFLICT` (a real data-integrity problem to fix, not to
   paper over).
4. Anything else is `NO_MATCH` or `AMBIGUOUS` — both **block**, never accept.

Coordinates and place names are never inputs to an automatic decision — see
`identity-resolver.spec.ts`'s explicit test for this.

## What gets promoted

Only `place_translations`. `PromotionManifestEntry.evidence_business_keys` carries linked evidence
business keys through for **traceability only** — this pipeline does not promote
`evidence_artifacts`/`place_translation_evidence_links` rows itself; that's a deliberate, documented
scope boundary for this first increment; PR #8's schema doesn't exist in production yet regardless.

## Safety properties (all covered by tests)

- **Dry-run by default.** `--apply` is explicit.
- **`--db-name` is mandatory** for the apply CLI even in dry-run — it never guesses which database
  it's talking to.
- **Defense in depth on eligibility**: the importer re-validates `human_review_status === APPROVED`
  from the manifest itself, never trusting that the export step (or a hand-edited manifest) got it
  right.
- **Idempotent**: `ensureEvidenceArtifact`-style content-hash comparison — an unchanged approved
  translation promotes to `UNCHANGED`, never a duplicate row.
- **History preserved, never overwritten in place**: a changed approved revision inserts a NEW
  current row and marks the old one `is_current = false` — full history stays queryable, matching
  the same non-negotiable insert-before-supersede ordering this session found and fixed elsewhere
  (`uq_place_trans_current` is a plain, non-deferrable unique index).
- **Every promoted row is fully traceable**: the production `wiki_revisions` row's `snapshot`
  records the exact staging `translation_id`, `revision_id`, `reviewed_by`, and `reviewed_at` it
  came from.

## What this pipeline will never do

Approve anything, fabricate a reviewer, promote PENDING/NEEDS_CHANGES/REJECTED content, guess an
identity mapping, or run itself unattended against production — `--apply` against a real production
database is always a deliberate, separately-authorized human action.
