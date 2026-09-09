# Opening-hours owner-capture batch (2026-09-09)

Field-scoped human-review intake package for **exactly four** `opening_hours` claims, prepared
under REAL DATA SPRINT 1C. **Zero database writes.** No `verification_status` was changed, no
evidence was linked, no migration ran, no deploy ran.

This package is a **sibling** of, not a replacement for, `../pilot-gate-20260909/` (the PR #29
package for VinWonders / Hon Thom / Vinpearl Safari whole-pilot review). That package is
unmodified — it is only cross-referenced from here. This package is narrower: it exists purely to
get four specific `opening_hours` values in front of the owner for capture/approval as fast as
possible, without waiting on the broader pilot-cohort process.

## Identity / freshness this round

```
MAIN_SHA=8639b50f01ec37d71d8efd2639c41c02479f4c75  (matches expected; no drift)
STAGING_DATABASE=phuquochub_staging (local docker phuquochub-staging-postgres)
MIGRATIONS_APPLIED=55
PENDING_MIGRATIONS=0  (55 migration files in apps/api/src/core/database/migrations vs 55 applied rows)
PR #29 = MERGED, untouched by this package
```

## The four claims

| # | Place | Slug | Status |
|---|-------|------|--------|
| 1 | VinWonders Phu Quoc | `vinwonders-phu-quoc` | Target constructed, hash computed, cross-validated against production |
| 2 | Sun World Hon Thom | `sun-world-hon-thom` | **HOLD — insufficient evidence**, no target payload constructed |
| 3 | VUI-Fest Bazaar | `vui-fest-bazaar` | Target constructed, hash computed |
| 4 | Sailing Club Phu Quoc | `sailing-club-phu-quoc` | Target constructed, hash computed |

## Current-value snapshot (re-verified fresh this round, both environments)

| Place | Staging `opening_hours` | Production `opening_hours` | Current opening_hours evidence links (staging) |
|---|---|---|---|
| VinWonders Phu Quoc | `null` (absent) | **present** — `09:00–19:30` daily, timezone `Asia/Ho_Chi_Minh` | 0 |
| Sun World Hon Thom | `null` (absent) | `null` (absent) | 0 |
| VUI-Fest Bazaar | `null` (absent) | `null` (absent) | 0 |
| Sailing Club Phu Quoc | `null` (absent) | `null` (absent) | 0 |

**VinWonders integrity note (read this before doing anything with VinWonders):** PR #29 already
established that production exposes `opening_hours` for VinWonders while its one supporting
evidence row (`place_field_evidence_links` → `evidence_artifacts.id`, hash
`02f2639dda91bdfd1357d514d1523edda7555f4980067aa06ccfc595e62a0a11`) is `NEEDS_REVIEW`, never
`VERIFIED`/`BUSINESS_VERIFIED_AND_REVIEWED`. Re-confirmed live this round via a read-only
production query — the row and its status are unchanged. **Do not modify VinWonders' current
production value or its evidence row in this package.** The owner-capture flow below produces a
*new*, properly-reviewed evidence chain for the *same* value; it does not touch the existing row.
See "VinWonders production-integrity finding" below for the exposure/gating analysis.

## Normalized target values

Full-schema `OpeningHours` payloads (current `packages/shared-types/src/place.ts` contract:
explicit `mon`..`sun` keys, each an array of `{open, close}` HH:MM strings, plus `timezone`).

**VinWonders Phu Quoc** — `09:00`–`19:30` every day:
```json
{"timezone":"Asia/Ho_Chi_Minh","regular":{"mon":[{"open":"09:00","close":"19:30"}],"tue":[{"open":"09:00","close":"19:30"}],"wed":[{"open":"09:00","close":"19:30"}],"thu":[{"open":"09:00","close":"19:30"}],"fri":[{"open":"09:00","close":"19:30"}],"sat":[{"open":"09:00","close":"19:30"}],"sun":[{"open":"09:00","close":"19:30"}]}}
```

**VUI-Fest Bazaar** — source claim "16:00–24:00 daily", **normalized as `open:"16:00", close:"00:00"`**
(never `23:59` — `close:"00:00"` is the schema-correct representation of a range ending exactly at
midnight; see "Midnight-boundary verification" below for why this is not an invented interpretation):
```json
{"timezone":"Asia/Ho_Chi_Minh","regular":{"mon":[{"open":"16:00","close":"00:00"}],"tue":[{"open":"16:00","close":"00:00"}],"wed":[{"open":"16:00","close":"00:00"}],"thu":[{"open":"16:00","close":"00:00"}],"fri":[{"open":"16:00","close":"00:00"}],"sat":[{"open":"16:00","close":"00:00"}],"sun":[{"open":"16:00","close":"00:00"}]}}
```

**Sailing Club Phu Quoc** — `06:30`–`22:00` every day:
```json
{"timezone":"Asia/Ho_Chi_Minh","regular":{"mon":[{"open":"06:30","close":"22:00"}],"tue":[{"open":"06:30","close":"22:00"}],"wed":[{"open":"06:30","close":"22:00"}],"thu":[{"open":"06:30","close":"22:00"}],"fri":[{"open":"06:30","close":"22:00"}],"sat":[{"open":"06:30","close":"22:00"}],"sun":[{"open":"06:30","close":"22:00"}]}}
```

**Sun World Hon Thom** — **no payload constructed.** The only current claim available ("closes at
17:00", from a real-time status widget on the official page) is not a complete open-close range.
Per this task's explicit instruction, a partial claim must not be extrapolated into a weekly
schedule. `HON_THOM_TARGET=HOLD_INSUFFICIENT_EVIDENCE`. The owner must supply the opening time (and
confirm any day-of-week variation) before a target value can be constructed at all.

## Field-value hashes

Computed with the *current production implementation* of `canonicalJson()`
(`apps/api/src/common/canonical-json.ts`) + `computeFieldValueHash()`
(`apps/api/src/modules/evidence/field-value-hash.ts`) — i.e. `sha256(canonicalJson(value))`, key-order
independent. **Calculation only — no `place_field_evidence_links` row was inserted.**

| Place | `field_value_hash` |
|---|---|
| VinWonders Phu Quoc | `02f2639dda91bdfd1357d514d1523edda7555f4980067aa06ccfc595e62a0a11` |
| VUI-Fest Bazaar | `bf86257cf32ae317ef964e929fdd293dc8f2229bc061cf3ca7d4334aa1536c37` |
| Sailing Club Phu Quoc | `88bd4e41a37a30ad49ba4e5da6db009e1fe9d5b90183c1b86a3463b6f9a7292b` |
| Sun World Hon Thom | *(not computed — no target payload exists to hash)* |

**The VinWonders hash was independently cross-validated: it is byte-for-byte identical to the
real, currently-stored `field_value_hash` on production's existing (`NEEDS_REVIEW`) evidence row.**
This confirms both (a) the hash methodology used here matches production exactly, and (b) the
*value* the owner will be asked to re-confirm for VinWonders is the same value already live on
production — the capture is a review/upgrade of evidence quality, not a value change.

## VinWonders production-integrity finding (read-only, re-verified fresh this round)

```
VINWONDERS_DETAIL_UNREVIEWED_HOURS_EXPOSED=YES
VINWONDERS_RIGHT_NOW_EXCLUDED=YES
P0_DATA_INTEGRITY_REVIEW_REQUIRED=YES
```

- **A = YES**: `GET /api/places/vinwonders-phu-quoc` (the public place-detail API) returns the full
  `opening_hours` object directly from `place.opening_hours` — confirmed live this round. The
  place-detail path does not apply the field-evidence gate at all; it renders whatever is stored on
  the `places` row regardless of the linked evidence's `verification_status`.
- **B = YES (i.e. correctly excluded)**: `GET /api/places/now` (the "Right Now" MVP endpoint, which
  does apply the gate — `PlacesRepository.rightNow()` requires a gate-passing
  `place_field_evidence_links` row) returned **zero** places this round, and VinWonders specifically
  is not present. This confirms the gate is working correctly for the endpoint it protects.
- **The integrity gap is architectural, not a bug in this batch**: the detail page/API was never
  designed to apply the evidence gate, only the "Right Now" / nearby-trusted surfaces were. This
  means any place with a stored `opening_hours` value is fully visible on its own detail page
  regardless of evidence review state — VinWonders is simply the one place currently proving this
  live. **This package does not fix it** (out of scope, read-only per task instruction) — flagging
  as `P0_DATA_INTEGRITY_REVIEW_REQUIRED=YES` for separate follow-up.

## Midnight-boundary verification (VUI-Fest `close:"00:00"`)

Verified against the actual implementation of `covers()` in
`apps/web/src/modules/places/openingHours.ts` (not invented): its wrap-around branch is
`minutes >= open || minutes < close`. When `close` is `"00:00"` (0 minutes-of-day), the
`minutes < close` disjunct can never be true (minutes-of-day is never negative), so the range
behaves as closing **exactly at** the 00:00 boundary with no wrap into the next day.

A focused Jest suite was added to `apps/web/src/modules/places/openingHours.spec.ts` to lock this
in (4 new assertions, all passing, 56/56 total in the file, zero regressions):

| Time | Expected | Result |
|---|---|---|
| 15:59 | closed | ✅ closed |
| 16:00 | open | ✅ open |
| 23:59 | open | ✅ open |
| 00:00 (next day, i.e. minute 0) | closed | ✅ closed |

**This test-file change is currently local and uncommitted** — no commit/push permission was
granted in this task's scope; see the final Sprint 1C report for disposition.

## What's in this package

- `README.md` — this file.
- `capture-manifest.csv` — one row per claim: place identity, field, source URL, expected claim,
  normalized target value, capture requirement, and blank placeholders for `observed_at`,
  `artifact_hash`, and `owner_decision`.
- `owner-approval-form.md` — the actual human sign-off gate. All decision fields are blank.
  **A Claude-generated target value or hash in this package is not an approval of anything, and
  producing this package is not itself human approval of anything in it.**
- `proposed-staging-manifest.json` — the exact staging values that would be written *after* owner
  approval and a real evidence-review pass — not applied anywhere by this package.
- `checksums.sha256` — SHA-256 of every other file in this package (does not hash itself).

## Owner capture rule (read before capturing anything)

A valid capture artifact (screenshot or saved page) must show all of:
1. The browser address bar / URL of the official source page.
2. Something identifying the operator/official page (logo, business name, official domain).
3. The exact opening-hours claim as displayed.
4. Enough surrounding context (page title, other content) to prove which specific place the claim
   belongs to.

Do not perform new automated capture for any of these four sites in place of an owner-supplied
capture — this project's governance requires manual/human capture for this batch. Robots-permission
(a site *allowing* automated fetch) is not itself human-review approval, and does not substitute for
one. No artifact in this package may be marked `VERIFIED` by this process — only a real, later,
authorized human-review step (outside this package) can do that.

## Post-capture execution plan (not executed — see `proposed-staging-manifest.json` and Sprint 1C
final report for the full governed-methods list)

After the owner supplies a valid capture and approves a value in `owner-approval-form.md`, the
*separate, future, explicitly-approved* execution step is:
1. `EvidenceService.ensureEvidenceArtifact()` — register the owner-supplied capture as a proper
   `sources` + `evidence_artifacts` row (not a raw insert).
2. A real human evidence-review transition on that artifact to `VERIFIED` or
   `BUSINESS_VERIFIED_AND_REVIEWED` (an authorized reviewer action, not an automated one).
3. `PlacesService.update()` (or equivalent governed service method) to set/confirm
   `place.opening_hours` on staging first.
4. `EvidenceService.linkEvidenceToPlaceField()` — create the `place_field_evidence_links` row tying
   the now-VERIFIED artifact to the `opening_hours` field, using the exact `field_value_hash`
   already computed in this package for VUI-Fest and Sailing Club (VinWonders' value is unchanged so
   its existing hash already matches; Hon Thom needs a hash computed fresh once a complete value
   exists).
5. Only after staging review passes: promote to production through the project's existing
   staging→production promotion path (unchanged, not modified by this package).

No raw SQL mutation anywhere in this plan. No script performing any of these steps was written or
executed in this task.
