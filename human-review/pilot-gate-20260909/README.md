# Pilot launch human-review gate (2026-09-09)

Read-only audit package for the three pilot places — VinWonders Phu Quoc, Sun World Hon Thom,
Vinpearl Safari Phu Quoc. Nothing in this package writes to any database. No `verification_status`
was changed, no evidence was moved to `VERIFIED`, no evidence row was deleted, no staging import
ran, no production write ran, no production deploy was triggered by this package.

## Launch scope — read this first

**VinWonders Phu Quoc and Sun World Hon Thom are the two required pilots for soft launch.**
**Vinpearl Safari is a supplementary research pilot only, held at `HOLD`, and does not block
soft launch** — it is not counted as a "ready" place, and its unresolved evidence does not gate
the other two. Once the two required pilots clear real human review, the next step (a separate,
future task) is to bring **13–18 more places** through the same evidence-gated process to reach a
total soft-launch cohort of 15–20 places. This package does not do that work — see
`evidence-gap-manifest.csv` for what each required pilot is still missing.

## What this package contains

- `pilot-readiness.csv` — the full per-place inventory: identity (slug/UUID) across workbook,
  staging, and production; verification/publication status; evidence and translation counts;
  known blockers.
- `vinwonders-field-review.csv`, `hon-thom-field-review.csv`, `safari-field-review.csv` — one row
  per field/claim, with its evidence chain (source, hash, capture date), a recommendation
  (`APPROVE_RECOMMENDED` / `NEEDS_CHANGES` / `REJECT` / `INSUFFICIENT_EVIDENCE` / `HOLD`), and notes.
- `evidence-gap-manifest.csv` — schema gaps (no evidence-expiry field, no evidence-level
  human-review-status field, no lifecycle for rejected/ineligible/superseded evidence) and
  missing-evidence items, each with what a file the owner supplies would need to contain.
- `owner-approval-form.md` — the actual human sign-off gate. Every decision field is blank.
  **A Claude-generated recommendation in this package is not an approval of anything, and this
  package being produced/updated is not itself human approval of anything in it.**
- `proposed-workbook-patch.csv` — proposed field changes, status `PROPOSED_NOT_APPLIED` or a
  `BLOCKED_*` reason. Nothing here has been applied anywhere.
- `proposed-staging-import-plan.md` — the step order a **separate, future, explicitly-approved**
  task would follow once the owner has signed off. Not executed.
- `checksums.sha256` — SHA-256 of every other file in this package (the checksums file does not
  hash itself), regenerated after every edit round.

## Pilot readiness — current conclusion

```
VINWONDERS_GATE=HOLD
HON_THOM_GATE=HOLD
SAFARI_GATE=HOLD
REQUIRED_PILOTS_READY=0/2
SOFT_LAUNCH_READY_PLACES=0
SAFARI_BLOCKS_LAUNCH=NO
```

- **VinWonders**: `opening_hours` is already live on production, but its one supporting evidence
  row is `NEEDS_REVIEW` (never through a real human VERIFIED step) — HOLD, not PASS.
  `display_name`/`short_description` are `APPROVE_RECOMMENDED` only, not approved. The
  government-sourced `province`/`admin_area` values in staging resolve those two fields
  specifically — they do not mean the whole place is officially verified.
- **Hon Thom**: `opening_hours` does not exist yet in either environment (a live check of the
  official page this round found only a real-time "closes at 17:00" status widget, not a complete
  range). `address` is null in both environments. `phone`/`website` have no field-level evidence at
  all. `display_name`/`short_description` are `APPROVE_RECOMMENDED` only. HOLD, not PASS.
- **Safari**: production correctly has no `opening_hours` value. Held at `HOLD`. Its existing
  staging evidence for `opening_hours`/`short_description` is confirmed ineligible (see below) —
  it does not qualify as a basis for anything, but Safari being unresolved does **not** block
  VinWonders or Hon Thom from proceeding once *their* evidence clears real review.

## Read this before anything else: the Vinpearl Safari evidence finding

Vinpearl Safari's staging environment has **3** evidence_artifacts rows tied to `opening_hours`/
`short_description`, all sourced from `vinwonders.com/en/vinpearl-safari-phu-quoc/`. Traced each
one individually, read-only, against its own stored `metadata` (not inferred from `evidence_type`):

- **2 of 3 are `AUTOMATED_CAPTURE_CONFIRMED`** — their own metadata states outright "Fetched via
  curl for evidence-closure pass" and describes a programmatic content check against "the static
  payload". `vinwonders.com`'s `robots.txt` was fetched directly and explicitly disallows the
  `ClaudeBot` user-agent (`User-agent: ClaudeBot` / `Disallow: /`) — exactly the rule these 2 rows
  violate.
- **1 of 3 is `CAPTURE_METHOD_UNCONFIRMED`** — its own metadata says it is "not a direct fetch" (a
  search-index-tier derivation) but does not claim human capture either.

**None of the 3 rows qualify as evidence this package (or any future review) can act on: they may
not gate PASS, may not be promoted, and may not be cited as the basis for a production write.**

**This is not a request to delete anything.** All 3 rows stay in the database exactly as they are
— chain of custody and audit history are preserved. Each is marked `INELIGIBLE_AUTOMATED_CAPTURE`
in `safari-field-review.csv`, not removed. The schema currently has no approved lifecycle for
rejecting/superseding an evidence row (see `evidence-gap-manifest.csv`'s schema-gap entry on this),
so this package does not invent a write path around that gap — it only refuses to treat the rows as
usable. If a human captures `opening_hours` properly later (per
`../../evidence-intake/vinpearl-safari/owner-capture-checklist.md`), the new evidence gets linked
as normal, optionally noting that it supersedes these 3 ineligible rows.

## Access limitations encountered while building this package (read before trusting any "unknown")

- **The raw content workbook (sheets 01–17) is not a file in this repository or session** — it is
  an external Excel/Sheets document the content team maintains directly. Everywhere this package
  says `workbook_reference_uuid: NOT_AVAILABLE`, that is because of this — the workbook appears to
  use human-readable business keys (e.g. `EVD-VIN-OFFICIAL-VI-20260829`), not UUIDs, as far as can
  be seen from `apps/api/src/scripts/remediate-pilot-evidence.ts` and
  `remediate-pilot-translations.ts`, which transcribe specific workbook rows into code but are not
  the workbook itself.
- **Direct production database access is generally read-only-only for this package's purposes.**
  The public read-only API (`https://phuquochub.com/api/places/:slug`) was used for most
  production place-level facts (opening_hours value, address, province/admin_area,
  verification_status, status, and the `trust_sources` array, which is built from
  `source_attributions` per `apps/api/src/modules/places/places.service.ts`); a small number of
  read-only SQL queries (via the documented `docker compose exec -T postgres psql` pattern) were
  used only where the public API genuinely could not answer the question (e.g. translation
  `human_review_status`, which is not exposed publicly). No production data was written at any
  point.
- **Staging was reached via the local Docker container `phuquochub-staging-postgres`** (port
  15432), resumed with `docker start` when needed — no data was written, only read via `psql`
  `SELECT` queries.

## Live status (updated this round)

- `main` is at `b32764755c54ede0ebeec6af9f44db0397714cc4`, and **production is deployed to the
  same commit** (`API_IMAGE_TAG`/`WEB_IMAGE_TAG` both confirmed on the live VPS). PR #26, #27, and
  #28 are all merged.
- A post-deploy performance baseline passed cleanly: real backend request-duration logs (excluding
  network/TLS) showed 1–13ms per request across every route sampled, Postgres at 2/100
  connections, sub-millisecond Redis latency, no resource pressure.
- Nothing in this update wrote to staging or production, imported evidence, raised any
  `verification_status`, or deployed anything.
