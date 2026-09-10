# ADR-022 — Opening-Hours Evidence Governance v1

## Status

Proposed — 2026-09-10.

Extends [ADR-020](ADR-020-place-translation-model.md)'s "vocabulary-is-evolving, not a closed enum"
convention and [ADR-021](ADR-021-human-translation-review.md)'s "real reviewer + decision +
timestamp + content version, never inferred from a system actor" rule, applied here to a different
subsystem (`evidence_artifacts`/`place_field_evidence_links`, not `place_translations`). Does not
supersede either.

## Context

`evidence_artifacts.verification_status` has never had a real write path. Every place it is set
today goes through `EvidenceService.ensureEvidenceArtifact` (import/backfill, explicitly forbidden
from upgrading an existing row's status) or through one-off administrative scripts operating
directly on the table. `evidence-trust.ts` and the entity's own column comment both flag this
explicitly: "no real write path in this codebase that ever sets it to a gate-passing value at all."
A handful of `evidence_artifacts` rows already carry `verification_status = 'VERIFIED'` from such
scripts, asserted, not reviewed.

`PlacesRepository`'s Right Now / Trusted Nearby field-evidence gate (`getVerifiedOpeningHoursHashes`)
trusted that column, plus source-type authority, as sufficient — with no time dimension at all. A
`VERIFIED` row from 2025 and one from five minutes ago were indistinguishable to that query. Opening
hours are exactly the kind of fact that goes stale silently: a business changes its schedule, no
evidence artifact is ever superseded, and the old "VERIFIED" evidence keeps clearing the gate
forever.

## Problem

Two gaps, one root cause: there was no code path that could turn a piece of opening-hours evidence
into "VERIFIED" through an identifiable human review bound to the exact evidence content reviewed,
and no mechanism that ever stopped trusting a review once enough time had passed.

## Decision

### Scope

`OPENING_HOURS_OFFICIAL_STABLE_V1` applies only to evidence where **all** of the following hold:

- `claim_type = opening_hours` (no other field claim type is in scope for this policy version).
- The schedule is **stable** — a regular, recurring weekly pattern. Temporary/event/holiday
  schedules are explicitly out of scope (see below), not merely unhandled.
- The source is first-party (`OFFICIAL_WEBSITE` / `BUSINESS_OWNER` / `GOVERNMENT` —
  `evidence-trust.ts`'s existing `OFFICIAL_SOURCE_TYPES`, reused rather than duplicated).
- The evidence has a real `captured_at`.
- A human approval is recorded, bound to the exact evidence content SHA-256 it reviewed.

### The 7-day review gate

A review may only approve evidence whose `captured_at` is within the last 168 hours (7 days) of the
review timestamp — measured from `captured_at`, exactly 168 hours passes, 168 hours + 1ms fails.
`captured_at` in the future is treated the same as a capture-age violation (there is no well-defined
"age" for it). This bounds how stale a capture is allowed to be at the moment someone reviews it.

### The 30-day validity window

Independently of the review gate, an APPROVE sets `verification_expires_at = captured_at + 30 days`
— **never** recomputed from `reviewed_at`. Reviewing evidence promptly (within the 7-day window)
does not "reset the clock" to 30 days from the review; it is always 30 days from when the underlying
fact was actually captured. This is deliberate: the claim is "this schedule was true as of
`captured_at`," and that claim's shelf life does not extend just because a human got to it quickly.

### Expiry behavior

When `verification_expires_at <= now`, the evidence is no longer eligible for Right Now or Trusted
Nearby, **regardless of what `verification_status` still says in the database**. No batch job flips
`verification_status` back to something else on expiry — the column keeps saying `VERIFIED`
indefinitely; only the freshness gate (a `verification_expires_at > NOW()` condition added to
`PlacesRepository`'s existing evidence-gate query) treats it as no longer usable for those two
surfaces. Any other consumer of `verification_status` alone still sees "VERIFIED" — that is a
correct description of "a human, at some point, approved this," just not sufficient on its own for
an operational "open right now" claim.

### Human approval bound to evidence hash

Every review records the evidence content SHA-256 the approval receipt attests to
(`evidence_content_sha256`); this is compared against the evidence artifact's actual, current
`content_hash_sha256` at review time. A mismatch fails the review (`EVIDENCE_HASH_MISMATCH`) even
if the human decision was APPROVE — human approval cannot be recorded against different content than
what it was actually bound to. This, together with the capture-age and source-authority checks, is
never bypassed by the decision alone: an APPROVE with a failing gate is audited as a real review that
did not clear the policy, not silently discarded and not silently upgraded.

### Temporary schedules excluded, not unhandled

A temporary/event/holiday schedule fails `TEMPORARY_SCHEDULE_UNSUPPORTED` under this policy version
— it is explicitly HELD, pending a policy version with its own `valid_until` semantics (a temporary
schedule's "freshness" is not a fixed 30-day window; it is bounded by whatever event it describes).
Building that policy is out of scope for v1.

### No automatic backfill

This policy applies only to evidence reviewed **after** this migration ships. The evidence rows
already carrying an administratively-asserted `VERIFIED` status are not retroactively upgraded —
their `verification_expires_at` stays `NULL`, which the freshness gate treats as never-eligible
(`NULL > NOW()` is never true in Postgres). This is the intended effect: those rows stop clearing
Right Now / Trusted Nearby the moment this ships, until someone actually reviews them under this
policy. Their `verification_status` column itself is never rewritten by this migration or by
shipping this feature — only evidence a real review touches ever gets a `verification_expires_at`.

### Recapture / re-review workflow

Re-reviewing evidence (a fresh capture, or a later review of the same evidence) is a **new**
`evidence_reviews` row, never an update to a previous one — the table is append-only. Recapturing
expired (or about-to-expire) evidence means: capture fresh source content, create a new
`evidence_artifacts` row (or reuse the existing one if its content genuinely has not changed and its
`captured_at` is being intentionally re-anchored — a product/ops decision outside this ADR's scope),
and submit a new review through `EvidenceService.reviewEvidenceArtifact`. The operational query below
is how an operator finds evidence that needs this before it lapses.

### Privacy

`evidence_reviews.reviewer_name` is a free-text human identifier, not a public-facing field by
default — no route in this change exposes it, and any future public surface built on top of this
table should treat reviewer identity the same way `wiki_revisions.editor_id` and verification actor
fields are already treated elsewhere in this codebase (internal/moderator-facing, not exposed on
`@Public` routes without a deliberate decision to do so).

### Rollback

The migration's `down()` refuses if any `evidence_reviews` rows exist, or if any `evidence_artifacts`
row carries governance state (`verification_expires_at`/`approval_artifact_sha256`/
`freshness_policy_key` non-null) — the same fail-closed convention as `InitVerifications` and
`InitPlaceFieldEvidenceLinks`. A revert is only mechanically possible before any real review has
happened against a live database.

### Operational query — evidence nearing/at expiry

The partial index `idx_evidence_artifacts_verification_expires_at` (`WHERE verification_expires_at
IS NOT NULL`) supports:

```sql
SELECT id, source_id, verification_expires_at
FROM evidence_artifacts
WHERE verification_expires_at IS NOT NULL
  AND verification_expires_at <= NOW() + INTERVAL '7 days'
ORDER BY verification_expires_at ASC;
```

## Schema

- **`evidence_reviews`** (new, append-only) — one row per human review decision (`APPROVE` /
  `NEEDS_CHANGES` / `REJECT`), never updated after insert. Idempotency key:
  `(evidence_artifact_id, approval_artifact_sha256)` — the same receipt digest replayed against the
  same evidence is a no-op; the same digest with a different payload is a conflict, never a silent
  overwrite.
- **`evidence_artifacts`** gains four nullable, denormalized columns (`verification_expires_at`,
  `approval_artifact_sha256`, `freshness_policy_key`, `freshness_policy_version`) — a read-optimized
  mirror of the evidence's latest APPROVE row, always written in the same transaction as the
  `evidence_reviews` insert that justifies them.

## Application layer

`EvidenceService.reviewEvidenceArtifact(...)` is the sole write path — deliberately not named
`markVerified(id)`, since it always runs the full policy evaluator and always records an audit row,
even for outcomes that do not verify anything. See
`apps/api/src/modules/evidence/policy/opening-hours-official-stable-v1.policy.ts` for the pure,
deterministic evaluator (clock injected, never calls `new Date()` internally) and
`apps/api/src/modules/evidence/evidence.service.ts` for the transactional service method.

## Consequences

- Right Now / Trusted Nearby immediately stop surfacing opening-hours claims backed only by
  administratively-asserted, never-reviewed evidence — a real behavior change on those two surfaces,
  and the entire point of this change, not a side effect to mitigate.
- No other read path is affected: this policy only ever governs `claim_type = opening_hours`
  evidence, and the freshness gate is scoped to the same `place_field_evidence_links` query that
  already existed for opening hours specifically.
- A future policy version can extend coverage (temporary schedules, other claim types) without
  touching this one — `policy_key`/`policy_version` are recorded per review, so mixed-version history
  is representable from day one.
