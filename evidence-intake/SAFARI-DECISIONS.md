# Vinpearl Safari — open owner decisions (2026-09-09)

Status snapshot for the Vinpearl Safari place record (production id
`7ab06900-8d98-4222-8cfd-794526e65667`). None of these were changed by this task — no
`verification_status`, `opening_hours`, `price_range`, or contact field was written. This is a
record of what is still pending, kept alongside `vinpearl-safari/` so the evidence-intake package
and the decisions it will eventually support stay in one place.

Current production evidence for Vinpearl Safari lives only at the `search_index` layer — there is
no `place_field_evidence_links` row for this place. That is precisely the gap
`vinpearl-safari/` exists to start closing, with real owner-captured evidence rather than an
automated fetch (`vinwonders.com` blocks automated crawling).

## D1 — display_name

- Current: "Vinpearl Safari"
- Proposed: "Vinpearl Safari Phú Quốc"
- Recommendation: ACCEPT_COSMETIC
- **Still needs an explicit owner decision.** A cosmetic rename recommendation is not the same as
  an approval — do not apply it without the owner saying so.

## D2 — opening_hours

- Proposed: 09:00-16:00 daily, `Asia/Ho_Chi_Minh`.
- **Status: HOLD.**
- Source today is `search_index` only — no direct, human-verifiable evidence (screenshot/PDF of an
  official page) backs this specific value.
- **Do not write this to production** until a `vinpearl-safari/` evidence batch passes validation
  and is separately reviewed. This is exactly the kind of claim
  `PlacesRepository.rightNow()`/`nearbyTrusted()`'s field-evidence gate (see
  `docs/delivery/reports/PLACE-TRUST-SEMANTICS-MODEL-GAP-2026-09-08.md`) is designed to require
  real evidence for before it can support an "open now"/"closed now" claim.

## D3 — phone

- **Status: UNRESOLVED.**
- The only phone numbers found so far trace back to `rootytrip.com` and other resellers, not an
  official Vinpearl/VinWonders source — those must be excluded.
- **Do not publish a phone number for this place until it has a primary-source citation.** A
  reseller's contact number is not evidence of the venue's own number.

## D4 — province / admin_area

- **Status: OUT_OF_SCOPE for this package.**
- This is an administrative-boundary fact, resolved via the same official administrative-source
  process used for other places (see `AdministrativeBackfillService` /
  `docs/delivery/reports/PLACE-TRUST-SEMANTICS-MODEL-GAP-2026-09-08.md`'s discussion of
  administrative-only `official` rows) — not from a business's own marketing/booking pages.
  Vinpearl Safari's business-source evidence (this package) must not be used to resolve D4.

## D5 — short_description

- **Status: HOLD.**
- Do not publish specific numbers or superlative claims (visitor capacity, "largest in ...", etc.)
  in the short description until each such claim has its own primary-source evidence. A vague,
  unverifiable superlative is worse than no description.

## What changes this

Nothing here moves out of HOLD/UNRESOLVED/OUT_OF_SCOPE by itself. Moving any of D1/D2/D3/D5 forward
needs, in order:

1. A real evidence batch in `vinpearl-safari/files/` + `vinpearl-safari/evidence-intake-manifest.csv`.
2. A signed `vinpearl-safari/owner-approval-form.md` for that batch.
3. A clean `verify-evidence-files.sh` run (PASS, or HOLD items explicitly resolved).
4. A **separate**, explicitly-approved task to actually import the evidence and make the
   verification/`verification_status` decision — this package does not do that step, and finding
   files in `vinpearl-safari/files/` is not itself authorization to start it.
