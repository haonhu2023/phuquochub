# Pilot launch human-review gate (2026-09-09)

Read-only audit package for the three pilot places — VinWonders Phu Quoc, Sun World Hon Thom,
Vinpearl Safari Phu Quoc — produced alongside a review/merge of PR #27 (Vinpearl Safari
evidence-intake tooling). Nothing in this package writes to any database. No `verification_status`
was changed, no evidence was moved to `VERIFIED`, no staging import ran, no production write ran.

## What this package contains

- `pilot-readiness.csv` — the full per-place inventory: identity (slug/UUID) across workbook,
  staging, and production; verification/publication status; evidence and translation counts;
  known blockers.
- `vinwonders-field-review.csv`, `hon-thom-field-review.csv`, `safari-field-review.csv` — one row
  per field/claim, with its evidence chain (source, hash, capture date), a recommendation
  (`APPROVE_RECOMMENDED` / `NEEDS_CHANGES` / `REJECT` / `INSUFFICIENT_EVIDENCE`), and notes.
- `evidence-gap-manifest.csv` — schema gaps (no evidence-expiry field, no evidence-level
  human-review-status field) and missing-evidence items, each with what a file the owner supplies
  would need to contain.
- `owner-approval-form.md` — the actual human sign-off gate. Every decision field is blank.
  **A Claude-generated recommendation in this package is not an approval of anything.**
- `proposed-workbook-patch.csv` — proposed field changes, status `PROPOSED_NOT_APPLIED` or a
  `BLOCKED_*` reason. Nothing here has been applied anywhere.
- `proposed-staging-import-plan.md` — the step order a **separate, future, explicitly-approved**
  task would follow once the owner has signed off. Not executed.
- `checksums.sha256` — SHA-256 of every file in this package (generated last, from the actual
  files, the same way `verify-evidence-files.sh` in the Vinpearl Safari evidence-intake package
  does it).

## Read this before anything else: the most important finding

**Vinpearl Safari's staging environment has 2 evidence artifacts + a `place_field_evidence_links`
row for `opening_hours`, all sourced from `vinwonders.com/en/vinpearl-safari-phu-quoc/`, whose
capture method (human vs. automated) is not recorded.** `vinwonders.com`'s robots.txt blocks
automated fetching — the entire reason PR #27's evidence-intake package exists is that no code in
this repo may fetch that domain. The staging row's own `note` field says "staging rehearsal ...
NOT owner-approved", which is reassuring, but does not answer *how* the underlying pages were
captured. This must be confirmed (see `owner-approval-form.md`'s Vinpearl Safari section) before
any of that evidence is trusted, regardless of its `NEEDS_REVIEW`/`PASS` technical status.
Production correctly has zero `opening_hours` value for Safari — the D2 HOLD from
`../../evidence-intake/SAFARI-DECISIONS.md` is being honored where it counts.

## Access limitations encountered while building this package (read before trusting any "unknown")

- **The raw content workbook (sheets 01–17) is not a file in this repository or session** — it is
  an external Excel/Sheets document the content team maintains directly. Everywhere this package
  says `workbook_reference_uuid: NOT_AVAILABLE`, that is because of this — the workbook appears to
  use human-readable business keys (e.g. `EVD-VIN-OFFICIAL-VI-20260829`), not UUIDs, as far as can
  be seen from `apps/api/src/scripts/remediate-pilot-evidence.ts` and
  `remediate-pilot-translations.ts`, which transcribe specific workbook rows into code but are not
  the workbook itself.
- **Direct production database access was blocked by the Claude Code auto-mode classifier during
  this task.** The public read-only API (`https://phuquochub.com/api/places/:slug`) was used
  instead for production place-level facts (opening_hours value, address, province/admin_area,
  verification_status, status, and the `trust_sources` array, which is built from
  `source_attributions` per `apps/api/src/modules/places/places.service.ts`). Anything in this
  package attributed to "staging" but not confirmed against production should be read as
  staging-only until someone with production DB access confirms it — several real staging/
  production divergences were found this way (see `pilot-readiness.csv`'s `blockers` column),
  including `verification_status` (staging shows `official` from an administrative-only backfill,
  production correctly still shows `pending`) and `province`/`admin_area` (real government-sourced
  data exists in staging, not yet promoted to production for any of the three places).
- **Staging was reached via the local Docker container `phuquochub-staging-postgres`** (port
  15432), which existed already (stopped) and was resumed with `docker start` — no data was
  written, only read via `psql` `SELECT` queries.

## PR #27 status (for context — this package is separate from it)

PR #27 (the Vinpearl Safari evidence-intake tooling this package's Safari section builds on) was
reviewed, hardened against 3 real gaps found in its validator script (path traversal, symlink
following, CSV formula injection — commit `91f46e0`), and is CI-green on every job its own diff
affects. Its merge is blocked by the repository's `main-one-owner-safe` ruleset because a required
check (`Dependency security audit`) is red — a pre-existing condition of `main` itself, unrelated
to PR #27's content, tracked separately by PR #28. See this session's final report for the exact
current state of both PRs.
