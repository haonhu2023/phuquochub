# Proposed staging import plan (NOT EXECUTED — plan only)

This document describes what a **separate, explicitly-approved** future task would do once the
owner has signed `owner-approval-form.md`. Nothing in this document has been run. No staging
import, no production write, no `verification_status` change, no evidence-VERIFIED transition has
happened as part of producing this package.

## Preconditions before this plan may be executed

1. `owner-approval-form.md` is signed, with every row explicitly decided (not left blank).
2. For Vinpearl Safari specifically: the capture-method question (human vs. automated) for the
   2026-09-08 staging evidence is answered. If the answer is "automated", those rows are deleted
   from staging first — they must not be promoted or used to justify anything.
3. A human with the authority to do so has reviewed the underlying evidence files (not just this
   package's summary of them) for every row marked `APPROVE` on the owner form.

## Step order for the future task (not this one)

1. **Validate evidence** — re-run `evidence-intake/vinpearl-safari/verify-evidence-files.sh` (or
   the equivalent for any new Hon Thom / VinWonders evidence batches) against the actual files, not
   just the metadata already in the database. Confirm PASS or explicitly-resolved HOLD.
2. **Patch the workbook** — apply the rows in `proposed-workbook-patch.csv` that the owner marked
   `APPROVE`, in the workbook itself (not directly in any database). Rows marked
   `BLOCKED_NO_EVIDENCE`, `BLOCKED_OWNER_DECISION`, or `BLOCKED_CAPTURE_METHOD_UNCONFIRMED` are
   excluded until their blocker is individually resolved.
3. **Rehearsal in staging** — import the approved changes into the **local staging** environment
   only (`phuquochub-staging-postgres`, port 15432 — see this session's own access notes), using
   the existing `multilingual-import` / `content-promotion` pipelines already in the codebase. Take
   a fresh backup or snapshot first.
4. **Idempotency check** — re-run the same import a second time against the same staging state and
   confirm zero new rows / zero duplicate evidence — matching the pattern already proven by
   `remediate-pilot-evidence.ts`'s own idempotency re-run block.
5. **Request explicit permission for a production write** — present the staging rehearsal's diff
   (before/after) to whoever is authorized to approve a production database write, separately from
   this package's owner-approval-form. Production access in this session was itself restricted (see
   `README.md`) — a future task would need its own explicit grant.

## What this plan deliberately does NOT cover

- Moving any `evidence_artifacts.verification_status` from `NEEDS_REVIEW` to `VERIFIED` — that is
  a human editorial decision requiring the actual evidence file to be looked at, not a step this
  plan or any script should perform automatically.
- Resolving the Vinpearl Safari D1/D2/D3/D5 decisions — those stay with the owner regardless of
  what evidence exists, per `SAFARI-DECISIONS.md`.
- Any schema change to add an evidence expiry/`next_review_at` column (see
  `evidence-gap-manifest.csv`) — that is a separate engineering decision, out of scope here.
