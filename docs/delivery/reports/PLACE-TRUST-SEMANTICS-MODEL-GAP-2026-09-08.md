# Place trust semantics model gap (2026-09-08)

**Status:** reported, not fixed. No migration was created for this. Written during the PR #24
final trust-semantics review (`fix/right-now-trust-semantics`).

## The gap

`places.verification_status` (backed by `verifications.status`/`method`) is a whole-**place**
aggregate. It has no field/scope column recording *which fact* was checked, or *how strongly*.
Two concrete, code-confirmed consequences:

1. **`official` routinely means "an address string matched a 2025 administrative-boundary
   resolution," nothing more.** `AdministrativeBackfillService` reaches `official` purely via
   `VerificationsService.ensureOfficialFromClaim({ method: SOURCE_MATCH })` against Nghị quyết
   1654/NQ-UBTVQH15 — no human ever looked at the place, no operational fact (hours, phone,
   ownership) was checked. Empirically, most of the current cohort's `official` rows are exactly
   this.
2. **`verifications.method` cannot reliably distinguish that case from a stronger one, even after
   the fact.** `method=source_match` is *also* used by the unrelated, legitimate
   `VerifiedFactsIngestionService` for real operational facts sourced from a business's own
   website. Both callers produce the identical `(status='official', method='source_match')` tuple.
   The only place the distinction survives is a free-text `verifications.note` string — not a
   structured, enum-validated, indexed signal, and not something a query should depend on.

`PlacesRepository.rightNow()` was amended in this review to stop depending on this whitelist
entirely, replacing it with a field-scoped, source-authoritative evidence check for the one fact
it actually asserts (`opening_hours`) — see that method's doc comment. That fix does **not**
generalize to `nearbyTrusted()` ("Trusted Nearby"): that feature makes no field-specific claim to
substitute a scoped check for; its entire purpose is "show me places you can generally trust
nearby," which is precisely the whole-place claim the data model cannot honestly back today. It is
left unchanged, with this known overclaim.

## Why it isn't fixed here

Closing it for Trusted Nearby needs a real distinction between "administrative-only" and
"identity/operator verified" — that is a genuine new semantic dimension, not something derivable
from existing columns. Inventing a schema field or migration was explicitly out of scope for this
review.

## Minimal future model options

**Option A — `verifications.scope` enum column.** Add a `verification_scope` enum
(`administrative` | `identity` | `operational` | `full`) to `verifications`, set explicitly by
every writer (`administrative-backfill.service.ts` → `administrative`;
`business-claims.service.ts` → `identity`; `verified-facts-ingestion.service.ts` → `operational`;
moderator `/verify`/`/official` endpoints → prompt the moderator, default `full` if unspecified).
`nearbyTrusted()` (and anywhere else needing a real "trusted place" claim) would then require
`scope IN ('identity','full')` instead of the bare status whitelist.
- *Migration:* add nullable column + backfill existing rows by inferring from `method` (source_match
  + note matching "Administrative Data Backfill" → `administrative`; everything else → best-effort
  `full`, flagged for manual review).
- *Pro:* smallest, most direct fix; reuses the existing `verifications` table and state machine.
- *Con:* backfill of ~20 existing `official` rows is a genuine reclassification decision, not a
  mechanical one — some may need a human to actually confirm identity before they can move to
  `identity`/`full` rather than being silently downgraded.

**Option B — a separate `place_identity_verifications` table**, mirroring
`place_field_evidence_links`'s shape (place_id, verified_by, source_id, method, verified_at),
recording identity/operator confirmation as its own first-class fact rather than overloading
`verifications.status`. `nearbyTrusted()` would require a current row here instead of a
`verification_status` whitelist.
- *Pro:* cleanest separation — doesn't retrofit meaning onto a table whose current rows were never
  written with a scope concept in mind; new rows going forward have unambiguous meaning.
- *Con:* new table, new migration, and (unlike Option A) the ~22-place cohort would need this
  populated from scratch — no existing data maps onto it, so Trusted Nearby would show *fewer*
  places immediately after cutover, not just relabeled ones.

**Option C — do nothing structurally; add an explicit UI/copy disclosure instead**, e.g. Trusted
Nearby's badge/copy is changed to something honest about what `verification_status` actually
proves ("address matches official records" rather than implying a general "verified" claim), and
the query is left as-is. `trust.ts`'s own comment shows this codebase has already done exactly
this once (banning "Đã xác minh chính thức" for `official`).
- *Pro:* zero schema risk, ships immediately, no reclassification decision needed.
- *Con:* doesn't fix the underlying query — a place still surfaces in "Trusted Nearby" on the
  strength of address-matching alone; only the label stops overclaiming, the *selection* still does.

## Recommended option

**Option A**, conditional on the owner (or a moderator with real business/place-identity context)
reviewing the ~20-place administrative-backfill-only cohort's reclassification rather than an
automated backfill silently assigning `scope='full'` to rows that were never actually reviewed for
identity. Option C could ship immediately as an interim measure (cheap, honest) while Option A is
scheduled.

## Which historical `official` records would need reclassification

Every row in `verifications` with `status='official' AND method='source_match' AND note ILIKE
'%Administrative Data Backfill%'` — this is the exact query used to identify the ~20/22-place
cohort in the prior Right Now activation-cohort audit. These would default to `scope='administrative'`
under Option A and would need an explicit, separate identity/operator check before ever
qualifying for a feature (like Trusted Nearby) that claims general place trust.

## Why PR #24 can proceed without this

`rightNow()`'s fix does not depend on any of this — it replaced the whole-place whitelist with a
field-scoped, source-authoritative evidence check that already answers "is *this specific claim*
trustworthy," which is the only claim that feature actually makes. `nearbyTrusted()` is the part of
the codebase that still needs this model, and it is explicitly left unmerged/unfixed pending it —
see PR #24's final report for the exact classification.
