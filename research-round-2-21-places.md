# Research Round 2 — Phase 1: Research Queue (21 places)

Status: **PLANNING ONLY**. No DB writes, no `source_attributions`, no `wiki_revisions`, no
`place`/`contact` updates, no migration, no commit/push/deploy in this phase. This file is
intentionally **untracked** (not `git add`-ed).

## 0. What was read before selecting

- `git status --short` → only `deploy-c9cf9e5.sh` untracked (left alone, per instruction).
- `git log -1 --oneline` → `a045a8f feat(admin-data): add verified facts ingestion and administrative backfill`.
- `npm run audit:data-quality` (from `apps/api`) → **failed**: local Postgres is not running
  (`ECONNREFUSED 127.0.0.1:5432`, script retried 10× then exited 1). No git-ignored report exists
  under `apps/api/reports/data-quality/` to fall back on either. The script itself is confirmed
  read-only (`DataQualityAuditService.audit()` never writes; `assertNotProduction()` blocks it
  from ever pointing at prod anyway) — it just isn't runnable from this machine right now without
  starting Docker, which I did not do unasked. **Blocker, logged below.**
- Fell back to the read-only path already proven safe by a prior audit (see project memory
  `content-seed-audit-2026-08-17`): the **public API**, unauthenticated, no SSH, no DB —
  `GET https://phuquochub.com/api/places?limit=100` (all 49) and `GET /api/places/:slug` (detail),
  plus `GET /api/categories`. Sampled two place details (`jw-marriott-phu-quoc`,
  `cho-dem-phu-quoc`) to ground the missing-fields pattern rather than assume it.
- Read source-of-truth code, not just docs, for the rules that govern this round:
  - `apps/api/src/modules/admin-data/data-quality-audit.service.ts` / `.types.ts` — issue
    taxonomy, `NOT_APPLICABLE` rule for beaches without an operator, the two standing
    curator-claim issues (see below), duplicate-detection logic.
  - `apps/api/src/modules/admin-data/administrative-backfill.manifest.ts` — all 49 places already
    have `province=An Giang` / `admin_area=Đặc khu Phú Quốc` from Nghị quyết 1654/NQ-UBTVQH15
    (government, reliability 95). **Province/admin_area is not a gap for any of the 21** — do not
    re-research it. `address` (street/ward-level) is a separate, still-open gap for some places.
  - `apps/api/src/modules/admin-data/verified-facts.manifest.ts` — Round 1 already produced
    candidate facts (contacts + partial hours) for `sun-world-hon-thom` and `vinwonders-phu-quoc`.
    Confirmed via the public API that these **have not been ingested yet** (both still show
    `verification_status: pending`, `completeness: minimal`) — so they're not blockers, but they
    are **excluded from this Round 2 list** since Round 1 already did their research work; ingesting
    the existing manifest is a separate, already-unblocked task.
  - `docs/data/modules/source.md` §4.1/§7 — the source-type reliability table and the conflict
    resolution ladder (`is_primary` → `reliability` → `retrieved_at` → moderator). This is the
    "existing source/reliability policy" the brief asks to use instead of inventing a new one.
  - `docs/99-decisions/ADR-008-verification-model.md` — confirms `verification_status` is a
    derived cache from the `verifications` state machine; nothing in this phase touches it.
  - `docs/delivery/state.yaml` — `PLACE-0xx` task IDs are an unrelated engineering-delivery track
    (schema/API build tasks), not a content-research backlog; no open item there maps to "which
    places need more data."
- No existing `research-round-*` or `research-queue-*` file convention exists in the repo, so the
  brief's suggested filename is used as-is.

## 1. Selection logic (why these 21, not others)

49 published places total. 2 already covered by Round 1 (excluded, see above) → 47 eligible.
Categories (from `/api/categories`): `beach`(10) `market`(3) `attraction`(12, 2 done) `hotel`(5)
`restaurant`(7) `cafe`(3) `resort`(6) `tour`(3) `transport`(0 instances).

Two confirmed-empty place details (`jw-marriott-phu-quoc`, `cho-dem-phu-quoc`) plus the
`content-seed-audit-2026-08-17` memory (0/49 places have a published photo; every place sampled
has `contacts: []`, `media: []`, `faqs: []`) establish the **systemic pattern**: Tier 1 facts
(phone/hotline/website/opening_hours) are structurally missing platform-wide, not per-place
noise. That makes category + commercial stakes the right selection axis, not per-place audit
scores (which I could not compute locally this round — see blocker).

Applied in this order:
1. **Booking-stakes commercial operators** (resort/hotel) — visitors act on this data directly
   (where to pay to stay); all have a findable brand-operated official site in principle. → 9 of 11
   eligible hotels/resorts selected.
2. **Two standing P0 audit claims already on record** in `data-quality-audit.service.ts`
   (`knownCuratorClaims()`), unverified and explicitly needing a real source before any status
   change: `cho-dem-phu-quoc` (possibly closed since 28/02/2026) and `tour-3-dao-an-thoi` (possibly
   a route name covering multiple operators, not one business). Both carry real user-safety /
   duplicate-modeling risk if left unresolved.
3. **High-traffic ticketed attractions** with a real operator (museum/monastery/theme-park/
   historic site) — official hours + admission info has direct trip-planning value. → 6 selected.
4. **Restaurants with strong tourist mindshare** (seafood/dining destinations) — phone + hours
   drives real bookings/walk-ins. → 4 selected.

**Explicitly not selected this round:** public beaches without a documented operator (per
`hasOperator()` in the audit service, phone/hours/website are legitimately `NOT_APPLICABLE` for
most of them — researching Tier 1 facts there would be researching something that structurally
doesn't exist), cafes (enrichment-tier value, Section 5 says research Tier 2/3 only once Tier 1 is
solid), and `cho-ham-ninh`/`cho-duong-dong` (real markets, but lower urgency than the P0 closure
claim on `cho-dem-phu-quoc`). These are fine candidates for a Round 3, not dropped for cause.

## 2. The 21 places

| place_slug | place_name | category | priority | reason |
|---|---|---|---|---|
| cho-dem-phu-quoc | Chợ đêm Phú Quốc | market | P0 | Standing unverified claim in `data-quality-audit.service.ts`: possibly closed since 2026-02-28. Site currently shows as live/published — real risk of sending visitors to a closed venue. |
| tour-3-dao-an-thoi | Tour 3 đảo An Thới (cano) | tour | P0 | Standing unverified claim: may be a route name covering multiple independent operators, not a single business — entity-modeling risk (`GENERIC_CATEGORY`), not just a data gap. |
| jw-marriott-phu-quoc | JW Marriott Phú Quốc Emerald Bay | resort | P0 | 5-star international chain, highest booking stakes; confirmed empty `contacts`/`opening_hours`/`media` via API sample. |
| vinpearl-resort-phu-quoc | Vinpearl Resort & Spa Phú Quốc | resort | P0 | Major branded resort, high search/booking volume, part of the largest domestic hospitality group on the island. |
| vinpearl-safari | Vinpearl Safari | attraction | P0 | Ticketed, high-traffic wildlife park; opening hours/admission directly affects trip planning; VinGroup family (same domain family as `vinwonders.com`, which is known from Round 1 to 403 automated fetch — flagged as a fetch-method risk up front). |
| premier-village-phu-quoc | Premier Village Phú Quốc Resort | resort | P1 | Branded resort (Accor/Premier Village), booking-stakes gap. |
| salinda-resort-phu-quoc | Salinda Resort Phú Quốc | resort | P1 | Independent boutique resort with real tourist mindshare, booking-stakes gap. |
| fusion-resort-phu-quoc | Fusion Resort Phú Quốc | resort | P1 | Branded all-inclusive resort, booking-stakes gap. |
| sunset-sanato-resort | Sunset Sanato Resort | resort | P1 | Popular mid-market resort, booking-stakes gap. |
| novotel-phu-quoc | Novotel Phú Quốc Resort | hotel | P1 | Accor-branded hotel, booking-stakes gap. |
| la-veranda-resort | La Veranda Resort (MGallery) | hotel | P1 | Accor MGallery boutique, established address landmark (near Dinh Cậu), booking-stakes gap. |
| muong-thanh-luxury-phu-quoc | Mường Thanh Luxury Phú Quốc | hotel | P1 | Large domestic chain, booking-stakes gap. |
| grand-world-phu-quoc | Grand World Phú Quốc | attraction | P1 | High-traffic entertainment complex. Province/admin_area already resolved (backfill manifest); `address` field explicitly left `NEEDS_REVIEW` by that same manifest — Tier 1 phone/hours still fully open and separable from the address problem. |
| bao-tang-coi-nguon | Bảo tàng Cội Nguồn | attraction | P1 | Private museum, ticketed — official hours/admission plausible via an owned site. |
| chua-ho-quoc | Thiền viện Trúc Lâm Hộ Quốc | attraction | P1 | Major pilgrimage/tourist site; likely covered by press or an official temple/monastery notice even if no commercial site exists. |
| dinh-cau | Dinh Cậu | attraction | P1 | Iconic identity landmark for the whole island; core to trip-planning even though it's public (a temple, not a business) — hours/access info still has real user value. |
| sailing-club-phu-quoc | Sailing Club Phú Quốc | restaurant | P1 | Official site's existence and content are already partially known (an invariant comment in `verified-facts.manifest.ts` quotes it verbatim for an address caveat), but it was never added as a `VerifiedFactTarget` for phone/hours — worth finishing that thread rather than re-discovering it blind. |
| crab-house-phu-quoc | Crab House Phú Quốc | restaurant | P1 | Seafood specialty destination with strong tourist mindshare, phone/hours gap. |
| nha-tu-phu-quoc | Nhà tù Phú Quốc | attraction | P2 | Historic site (former prison, now a memorial/museum) — likely state-managed, so a government or press source is plausible; lower urgency than the ticketed commercial attractions above. |
| nha-hang-ra-khoi | Nhà hàng Ra Khơi | restaurant | P2 | Established seafood restaurant, phone/hours gap, secondary to the P1 restaurants above. |
| chuon-chuon-bistro | Chuồn Chuồn Bistro | restaurant | P2 | Known dining spot, phone/hours gap, lower tourist-volume than the P1 restaurants. |

## 3. Evidence classification per place

Per Section 3 of the brief: nothing below has been "collected" this round — direct fetches were
not attempted for any of these 21 (that is explicitly out of scope for Phase 1). Two places carry
evidence that already exists **on record in this repository** from prior work; everything else is
genuinely unresearched.

| place_slug | missing_fields (Tier 1 unless noted) | candidate_sources (types, not yet fetched) | primary_source | fallback_source | evidence_type | source_reliability (predicted) | expected_confidence | conflict_risk | administrative_risk | ingestion_candidate | notes |
|---|---|---|---|---|---:|---:|---:|---|---|---|---|
| cho-dem-phu-quoc | operational status (open/closed), phone, opening_hours, address | Kiên Giang/An Giang tourism board notice, local press, Google Business listing (corroboration only, not a citable source) | local press coverage of closure/reopening | tourism board or municipal market-management notice | unverified | 65 (press) / 95 (government, if found) | LOW until status resolved | high — direct contradiction risk (open vs closed) | low (province/admin_area already resolved) | no — status must resolve first | Do not flip `status`/publish state on a single unofficial claim; needs ≥1 citable source before any change proposal. |
| tour-3-dao-an-thoi | operator identity, phone, hotline, website, price_range | tour-booking aggregator listings (search-index only, do not treat as authoritative), individual boat-tour operator sites in An Thới | none identified yet | none identified yet | unverified | n/a until operator identity resolved | LOW | high — may not be a single entity at all | low | no — entity-modeling question precedes fact collection | If confirmed multi-operator, this is a `POSSIBLE_DUPLICATE`/entity-split question for the owner, not a normal research task. |
| jw-marriott-phu-quoc | phone, hotline, website, opening_hours, media | Marriott brand site (marriott.com property page) | official Marriott property page | resort's own domain if one exists separate from marriott.com | unverified | 90 if direct_fetch succeeds | MEDIUM–HIGH (chain sites are usually fetchable) | low | none | yes, if direct_fetch succeeds | — |
| vinpearl-resort-phu-quoc | phone, hotline, website, opening_hours, media | Vinpearl corporate site (vinpearl.com) | official Vinpearl property page | booking-aggregator corroboration only | unverified | 90 if direct_fetch succeeds | MEDIUM | low | none | yes, if direct_fetch succeeds | — |
| vinpearl-safari | phone, hotline, website, opening_hours, price_range | VinGroup family site (vinpearlsafari.vn or vinwonders.com family) | official VinGroup attraction page | press coverage of ticket prices/hours | unverified | 90 target / may downgrade to 75 (search_index) | MEDIUM — flagged fetch risk | low | none | yes, pending fetch-method confirmation | `vinwonders.com` is documented (Round 1) to return HTTP 403 to automated fetch on both `/vi/` and `/en/` — same domain family risk applies here; do not silently upgrade a blocked-fetch/search-index result to `direct_fetch`. |
| premier-village-phu-quoc | phone, hotline, website, opening_hours, media | Accor/Premier Village brand site | official brand property page | booking-aggregator corroboration only | unverified | 90 if direct_fetch succeeds | MEDIUM | low | none | yes, if direct_fetch succeeds | — |
| salinda-resort-phu-quoc | phone, hotline, website, opening_hours, media | resort's own domain | official resort website | booking-aggregator corroboration only | unverified | 90 if direct_fetch succeeds | MEDIUM | low | none | yes, if direct_fetch succeeds | — |
| fusion-resort-phu-quoc | phone, hotline, website, opening_hours, media | Fusion Resorts brand site | official brand property page | booking-aggregator corroboration only | unverified | 90 if direct_fetch succeeds | MEDIUM | low | none | yes, if direct_fetch succeeds | — |
| sunset-sanato-resort | phone, hotline, website, opening_hours, media | resort's own domain | official resort website | booking-aggregator corroboration only | unverified | 90 if direct_fetch succeeds | MEDIUM | low | none | yes, if direct_fetch succeeds | — |
| novotel-phu-quoc | phone, hotline, website, opening_hours, media | Accor/`all.accor.com` brand site | official Accor property page | booking-aggregator corroboration only | unverified | 90 if direct_fetch succeeds | MEDIUM | low | none | yes, if direct_fetch succeeds | — |
| la-veranda-resort | phone, hotline, website, opening_hours, media | Accor MGallery brand site | official brand property page | booking-aggregator corroboration only | unverified | 90 if direct_fetch succeeds | MEDIUM | low | none | yes, if direct_fetch succeeds | — |
| muong-thanh-luxury-phu-quoc | phone, hotline, website, opening_hours, media | Mường Thanh corporate site | official Mường Thanh property page | booking-aggregator corroboration only | unverified | 90 if direct_fetch succeeds | MEDIUM | low | none | yes, if direct_fetch succeeds | — |
| grand-world-phu-quoc | phone, hotline, website, opening_hours, media (address explicitly excluded — see notes) | grandworldphuquoc.vn (already surfaced, not fetched for Tier 1 facts), Sun Group family sites | grandworldphuquoc.vn official page | press coverage | unverified for Tier 1; address already `NEEDS_REVIEW` on record | 90 if direct_fetch of Tier1 facts succeeds | MEDIUM for phone/hours; address stays NEEDS_REVIEW | address only: medium (sources found so far are all travel-blog tier and use outdated province/ward terms) | province/admin_area resolved; address is not | yes for phone/hours; no for address | `administrative-backfill.manifest.ts` header already documents that every address source found (dulichvietnam.com.vn, VinWonders Wonderpedia, Klook blog, Facebook, grandworldphuquoc.vn itself) uses stale terms ("Kiên Giang", "Gành Dầu ward") — do not resolve address from those; Tier 1 contact facts are a separate, unblocked question. |
| bao-tang-coi-nguon | phone, hotline, website, opening_hours, price_range (admission) | museum's own site if any, press coverage | official museum site | press coverage | unverified | 90 (official) / 65 (press) | LOW–MEDIUM — existence of an official site unconfirmed | low | none | yes, if a citable source exists | Private museum — plausible but not confirmed to have a maintained official website; may end up press-sourced only. |
| chua-ho-quoc | phone, opening_hours, visitor/access info | provincial Buddhist association notice, press coverage, Sun Group (site is Sun Group-adjacent infrastructure) | press coverage | provincial Buddhist association notice | unverified | 65 (press) | LOW–MEDIUM | low | none | yes, if a citable source exists | Religious site — "hotline"/"phone" may not meaningfully exist; expect the researched field set to shrink to opening_hours/access once evidence is gathered. |
| dinh-cau | opening_hours, access/visitor info | municipal tourism board page, press coverage | tourism board page | press coverage | unverified | 95 (government) / 65 (press) | LOW–MEDIUM | low | none | yes, if a citable source exists | Public landmark/shrine, no business operator — phone/hotline/website are plausibly legitimately absent (same `NOT_APPLICABLE` logic the audit applies to unmanaged beaches); confirm rather than assume in Phase 2. |
| sailing-club-phu-quoc | phone, opening_hours, media | Sailing Club Phú Quốc official website (existence + partial content already known — see notes) | official Sailing Club Phú Quốc website | booking-aggregator corroboration only | partially known (address quote on record), Tier 1 facts unverified | 90 if direct_fetch of the already-known page succeeds | MEDIUM–HIGH — page is known to exist and be fetchable (it was fetched once before) | low for phone/hours; **the source is proven UNRELIABLE for province/ward** (see below) | do not re-derive province/ward from this source | yes for phone/hours only | `verified-facts.manifest.ts` invariant #3 documents this site's own page reading "Duong To ward, Phu Quoc City, Kien Province" — both terms superseded. That's a hard exclusion for administrative fields from this source, not a reason to distrust its phone/hours. |
| crab-house-phu-quoc | phone, hotline, website, opening_hours, media | own website/Facebook page, press/food-blog coverage | own website if one exists | Facebook page (lower reliability, `facebook`=55 per source.md) | unverified | 90 (official_website) / 55 (facebook) | LOW–MEDIUM | low | none | yes, if a citable source exists | — |
| nha-tu-phu-quoc | phone, opening_hours, admission info | state heritage-site management board notice, press coverage | government/heritage-site notice | press coverage | unverified | 95 (government) / 65 (press) | LOW–MEDIUM | low | none | yes, if a citable source exists | Likely state-managed memorial site — expect government-tier source if found, per the source-conflict ladder in `source.md` §7. |
| nha-hang-ra-khoi | phone, hotline, website, opening_hours, media | own website/Facebook page | own website if one exists | Facebook page | unverified | 90 / 55 | LOW–MEDIUM | low | none | yes, if a citable source exists | — |
| chuon-chuon-bistro | phone, hotline, website, opening_hours, media | own website/Facebook page | own website if one exists | Facebook page | unverified | 90 / 55 | LOW–MEDIUM | low | none | yes, if a citable source exists | — |

## 4. Duplicate / entity-confusion check (Section 9)

- No slug collisions or obvious aliases found among the 21 — all 21 are distinct slugs from the
  49-place manifest, none overlap the 2 already-researched Round 1 places.
- **`tour-3-dao-an-thoi` is flagged `NEEDS_REVIEW` for entity type itself** (see table) — possible
  route/category-vs-business confusion, already an open audit claim, not something this session
  resolves.
- **`grand-world-phu-quoc` vs `sun-world-hon-thom` (Round 1, not in this list):** both are large
  Sun Group entertainment properties on the island but at different, non-overlapping locations
  (Grand World is a township/entertainment complex near Dương Đông; Sun World Hòn Thơm is the
  island/cable-car attraction) — no duplicate risk, noted only because both are Sun Group brands
  and could be confused by name alone.
- Did not run the audit service's `detectPossibleDuplicates()` (25m haversine check) since the
  local DB is unreachable this round (see blockers) — this is a real gap, not a clean bill of
  health. Flagging as a blocker rather than skipping silently.

## 5. Evidence matrix

Per Section 7 — decisions are Phase-1 outcomes only (what to do next), not verified facts.
`VERIFIED` is never used, per the brief.

| Place | Field | Source | Evidence | Reliability | Confidence | Decision |
|---|---|---|---:|---:|---|
| cho-dem-phu-quoc | operational status | (none identified yet) | unverified | — | — | NEEDS_REVIEW |
| cho-dem-phu-quoc | phone / opening_hours | (blocked on status resolution) | unverified | — | — | HOLD |
| tour-3-dao-an-thoi | operator identity | (none identified yet) | unverified | — | — | NEEDS_REVIEW |
| jw-marriott-phu-quoc | phone / hotline | Marriott brand site (candidate) | unverified | 90 (predicted) | LOW (pre-fetch) | RESEARCH |
| jw-marriott-phu-quoc | opening_hours | Marriott brand site (candidate) | unverified | 90 (predicted) | LOW (pre-fetch) | RESEARCH |
| vinpearl-resort-phu-quoc | phone / hotline | Vinpearl corporate site (candidate) | unverified | 90 (predicted) | LOW (pre-fetch) | RESEARCH |
| vinpearl-resort-phu-quoc | opening_hours | Vinpearl corporate site (candidate) | unverified | 90 (predicted) | LOW (pre-fetch) | RESEARCH |
| vinpearl-safari | phone / hotline | VinGroup attraction site (candidate) | unverified | 90 target / 75 if blocked | LOW (pre-fetch) | RESEARCH |
| vinpearl-safari | opening_hours / price_range | VinGroup attraction site (candidate) | unverified | 90 target / 75 if blocked | LOW (pre-fetch) | RESEARCH |
| premier-village-phu-quoc | phone / opening_hours | brand site (candidate) | unverified | 90 (predicted) | LOW (pre-fetch) | RESEARCH |
| salinda-resort-phu-quoc | phone / opening_hours | resort site (candidate) | unverified | 90 (predicted) | LOW (pre-fetch) | RESEARCH |
| fusion-resort-phu-quoc | phone / opening_hours | brand site (candidate) | unverified | 90 (predicted) | LOW (pre-fetch) | RESEARCH |
| sunset-sanato-resort | phone / opening_hours | resort site (candidate) | unverified | 90 (predicted) | LOW (pre-fetch) | RESEARCH |
| novotel-phu-quoc | phone / opening_hours | Accor brand site (candidate) | unverified | 90 (predicted) | LOW (pre-fetch) | RESEARCH |
| la-veranda-resort | phone / opening_hours | Accor MGallery brand site (candidate) | unverified | 90 (predicted) | LOW (pre-fetch) | RESEARCH |
| muong-thanh-luxury-phu-quoc | phone / opening_hours | corporate site (candidate) | unverified | 90 (predicted) | LOW (pre-fetch) | RESEARCH |
| grand-world-phu-quoc | phone / opening_hours | grandworldphuquoc.vn (candidate) | unverified | 90 (predicted) | LOW (pre-fetch) | RESEARCH |
| grand-world-phu-quoc | address | dulichvietnam.com.vn / Wonderpedia / Klook / Facebook / grandworldphuquoc.vn (all already checked, all stale-terminology) | search_index (blog-tier) | 40–55 (community/other tier, not official) | LOW | NEEDS_REVIEW |
| bao-tang-coi-nguon | phone / opening_hours | museum site or press (candidate) | unverified | 90 or 65 | LOW (pre-fetch) | RESEARCH |
| chua-ho-quoc | opening_hours / access | press or provincial Buddhist association (candidate) | unverified | 65 or 95 | LOW (pre-fetch) | RESEARCH |
| dinh-cau | opening_hours / access | tourism board or press (candidate) | unverified | 95 or 65 | LOW (pre-fetch) | RESEARCH |
| sailing-club-phu-quoc | address / province / ward | Sailing Club Phú Quốc official site (already quoted in repo) | direct_fetch (prior, on record) | 90 nominal, but content is stale ("Kien Province") | HIGH that the source is stale | HOLD (excluded as an administrative source — see §3) |
| sailing-club-phu-quoc | phone / opening_hours | same official site (not yet checked for these fields) | unverified | 90 (predicted) | LOW (pre-fetch) | RESEARCH |
| crab-house-phu-quoc | phone / opening_hours | own site or Facebook (candidate) | unverified | 90 or 55 | LOW (pre-fetch) | RESEARCH |
| nha-tu-phu-quoc | opening_hours / admission | heritage board or press (candidate) | unverified | 95 or 65 | LOW (pre-fetch) | RESEARCH |
| nha-hang-ra-khoi | phone / opening_hours | own site or Facebook (candidate) | unverified | 90 or 55 | LOW (pre-fetch) | RESEARCH |
| chuon-chuon-bistro | phone / opening_hours | own site or Facebook (candidate) | unverified | 90 or 55 | LOW (pre-fetch) | RESEARCH |

---

## Research Round 2 — Phase 1 Result

### 21 selected places

See §2 table above (full 21, with slug/name/category/priority/reason).

### Priority distribution

- P0: 5 (`cho-dem-phu-quoc`, `tour-3-dao-an-thoi`, `jw-marriott-phu-quoc`, `vinpearl-resort-phu-quoc`, `vinpearl-safari`)
- P1: 13 (`premier-village-phu-quoc`, `salinda-resort-phu-quoc`, `fusion-resort-phu-quoc`, `sunset-sanato-resort`, `novotel-phu-quoc`, `la-veranda-resort`, `muong-thanh-luxury-phu-quoc`, `grand-world-phu-quoc`, `bao-tang-coi-nguon`, `chua-ho-quoc`, `dinh-cau`, `sailing-club-phu-quoc`, `crab-house-phu-quoc`)
- P2: 3 (`nha-tu-phu-quoc`, `nha-hang-ra-khoi`, `chuon-chuon-bistro`)

### Expected impact

- **Fields potentially recoverable:** phone/hotline + opening_hours for up to 18 of 21 places
  (the 9 hotels/resorts + 6 attractions + 3 remaining restaurants), conditional on each business
  actually maintaining a fetchable official page — unconfirmed until Phase 2 direct-fetch attempts
  run. `cho-dem-phu-quoc` and `tour-3-dao-an-thoi` recover nothing until their structural questions
  (closed? single entity?) are resolved first.
- **High-value places:** the 9 hotels/resorts (direct booking-decision impact) and
  `vinpearl-safari` (highest-traffic ticketed attraction in the set) carry the most user-facing
  value if research succeeds.
- **High-confidence sources available:** none confirmed yet — this phase deliberately stopped
  short of fetching. Best candidates by prior precedent: branded chain sites (Marriott, Accor,
  Vinpearl, Mường Thanh) are the type of source that resolved cleanly for Sun World/VinWonders in
  Round 1, modulo the same VinGroup 403-on-fetch risk documented there.
- **Conflicts requiring review:** `cho-dem-phu-quoc` (closed vs. open), `tour-3-dao-an-thoi`
  (single business vs. multi-operator category), `grand-world-phu-quoc` address (every source
  found so far is blog-tier and uses superseded administrative terms).

### Research blockers

1. **Local Postgres is not reachable** (`ECONNREFUSED 127.0.0.1:5432`) — `npm run
   audit:data-quality` could not run this session, so per-place issue lists (P0/P1/P2 counts,
   exact field coverage, live duplicate-distance check) are **not available for this round** and
   were not fabricated. The place-detail sampling done via the public API (2 of 49) is a
   corroborating substitute, not a replacement — starting the local DB was out of scope to do
   unasked in a research-only phase.
2. **No candidate source URLs have been fetched or confirmed** for 19 of the 21 places — every
   "candidate_sources" entry in §3 is a source *type* (brand site, press, government notice), not
   a checked URL. Section 8 of the brief prohibits inventing source URLs, so none were written in
   as fact.
3. **`cho-dem-phu-quoc` closure claim has no citable source on file** — the only record of it is
   an unattributed note in the audit service's own code comment (Phase 6 of an earlier brief).
   Needs a real press/government/tourism-board source before any status change is even proposable.
4. **`tour-3-dao-an-thoi` entity-type question is unresolved** — same standing-claim situation;
   needs owner input on whether to research it as one business or split it.
5. **Duplicate-distance check not run** (§4) — the 25m-haversine check in
   `detectPossibleDuplicates()` requires the local DB that's currently unreachable.

### DB writes

```text
0
```

### Git actions

```text
No commit
No push
No deploy
```

### Final status

```text
NEEDS_REVIEW
```

Not `READY_FOR_RESEARCH`: two of the 21 places (`cho-dem-phu-quoc`, `tour-3-dao-an-thoi`) carry
open structural questions (closed? single entity?) that block productive research until resolved,
and the local-DB blocker means the standard per-place audit signal that would normally validate
this selection could not be cross-checked. The other 19 places are individually ready to move to
direct-fetch research in Phase 2 — recommend proceeding with those 19 while `cho-dem-phu-quoc` and
`tour-3-dao-an-thoi` get an owner decision in parallel, rather than blocking the whole queue.

**Stopping here per instruction — awaiting review of this 21-place list before Phase 2.**

---

# Phase 2 — Batch 1 (5 places): Evidence Collection

Status: **RESEARCH-ONLY, EVIDENCE COLLECTION.** No DB writes, no `places`/`contacts` updates, no
`source_attributions`, no `wiki_revisions`, no `verifications`, no ingestion service invocation, no
migration, no commit/push/deploy, no SSH/VPS/Cloudflare, no source-code edits. Phase 1 (§0–§5
above) was reviewed and approved before this batch started.

**Pre-batch git check:** `git status --short` → only `deploy-c9cf9e5.sh` and this file untracked;
`git log -1 --oneline` → `a045a8f` (unchanged). No staged changes. Confirmed before any research
began; nothing below alters git state.

**Method note (applies to all 5 places):** `marriott.com`, `vinpearl.com`, and `vinwonders.com`
all returned **HTTP 403** to direct fetch on every URL attempted this batch — consistent with the
`vinwonders.com` 403 already documented from Round 1. This is now confirmed as a **domain-family
pattern** (Marriott's WAF and VinGroup's WAF both block automated fetch), not a one-off. Every
fact sourced from those three domains in this batch is therefore `search_index` at best — found
via `WebSearch` result snippets that named the official domain, never fetched directly — and is
**not upgraded to `direct_fetch`** anywhere below, per instruction §4/§6. `premiervillage-phuquoc.com`
and `salindaresort.com` did not block fetch and are recorded as genuine `direct_fetch`.

## jw-marriott-phu-quoc

### Identity
"JW Marriott Phu Quoc Emerald Bay Resort & Spa" — confirmed as a single, unambiguous property
(Marriott property code `PQCJW`) across every source seen this batch. No ambiguity with generic
"Marriott" corporate found.

### Tier 1 evidence
- **Official name:** "JW Marriott Phu Quoc Emerald Bay Resort & Spa" — search_index, from
  `marriott.com/en-us/hotels/pqcjw-.../overview/` snippet (direct fetch of this exact URL returned
  403).
- **Phone:** `+84 297 377 9999` — search_index only; the WebSearch answer aggregated this from
  multiple result snippets (HotelsCombined, TravelWeekly, Marriott-family pages) **without a single
  pinpointed citing URL** — weaker than a normal search_index hit tied to one page. Direct fetch of
  the TravelWeekly listing page (a candidate citable source) also returned 403, so this could not be
  strengthened this batch.
- **Hotline:** not found. Marriott's global reservations line (`1-800-...`) was not surfaced by
  search and would in any case be a *corporate* hotline, not this property's — not recorded, per
  instruction §7 (do not guess phone vs hotline).
- **Opening_hours:** not found for the property itself. Note: a resort does not have a single
  "opening hours" the way a shop does (24-hour operation is typical but was not stated by any
  source for *this* property specifically) — left UNVERIFIED rather than assumed, per instruction §8.
- **Operator:** Marriott International (JW Marriott brand) — search_index, consistent across every
  source, no conflicting claim seen.

### Tier 2 evidence
- **Address:** "Eco-Tourism at Bai Khem, Phu Quoc Special Economic Zone, An Giang Province,
  Vietnam" — search_index (aggregated, same caveat as phone above).
- **Price range:** not collected this batch (not in the search results pulled; would need a
  dedicated rates search).
- **Short description:** "231 artistically unique rooms, suites and stand-alone villas, 5
  restaurants... reimagined from a 19th-century French university concept by architect Bill
  Bensley" — search_index, `marriott.com` overview page snippet.

### Tier 3 evidence
Not collected — Tier 1/2 evidence for this property was already weak enough (no confirmed
direct_fetch) that spending further effort on amenities/social/media was not a good use of a
research-only pass, per instruction §2 ("không cố hoàn thành mọi field nếu evidence yếu").

### Conflicts
None detected — no contradicting value found for any field collected.

### Administrative considerations
None raised. Address string above uses "An Giang Province" / "Phu Quoc Special Economic Zone",
consistent with the already-resolved `province`/`admin_area` in `administrative-backfill.manifest.ts`
— not a new administrative fact, just a corroborating mention. Not proposed for ingestion into
`province`/`admin_area` (already resolved via the government source, per repo policy — a hotel
website would never outrank that source anyway).

### Evidence quality
Weak. Zero `direct_fetch` this batch — `marriott.com` and the one aggregator page tried both
returned 403. Every fact is `search_index`, and the phone/address facts specifically lack a single
pinpointed source URL (aggregated WebSearch answer, not a page-level citation) — worse than a
typical search_index case. Not ready for ingestion.

### Proposed ingestion candidates

| Field | Proposed value | Evidence | Reliability | Confidence | Ingest? | Reason |
|---|---|---|---:|---:|---|---|
| name | JW Marriott Phu Quoc Emerald Bay Resort & Spa | search_index | 75 | 70 | HOLD | No direct_fetch confirmation this batch; name is low-risk but still unconfirmed by policy. |
| phone | +84 297 377 9999 | search_index (no single pinpointed URL) | ≤75 | ≤70, arguably lower | NO | Source URL not pinned to one page — below the bar for `search_index` as defined (§3/§4 requires a specific indexed page, not an aggregated answer). |
| operator | Marriott International (JW Marriott brand) | search_index | 75 | 70 | HOLD | Consistent across sources but still not direct_fetch. |
| opening_hours | — | none | — | — | NO | Not found; not guessed. |
| address | Bai Khem, Phu Quoc Special Economic Zone, An Giang Province | search_index (aggregated) | ≤75 | ≤70 | HOLD | Same aggregation caveat as phone. |

### Fields intentionally left unresolved
hotline (not found, not guessed from a corporate number), opening_hours (resort — no citable
"hours" claim), price_range, Tier 3 (amenities/media/social/tags) — none attempted this batch.

---

## vinpearl-resort-phu-quoc

### Identity
"Vinpearl Resort & Spa Phu Quoc" — **entity-identity risk flagged**, see Conflicts below: search
results repeatedly surfaced a *different*-named property, "Vinpearl Wonderworld Phu Quoc," in the
same result set and it is not established whether that is the same property under a renamed
listing, a sister property in the same complex, or an unrelated place. Per instruction §12, this is
recorded as `NEEDS_REVIEW`, not resolved by assumption.

### Tier 1 evidence
- **Official name:** "Vinpearl Resort & Spa Phu Quoc" — search_index,
  `vinpearl.com/en/vinpearl-resort-spa-phu-quoc` (direct fetch → 403).
- **Phone:** "84 297-355-0550" — attributed by a WebSearch summary to a third-party aggregator
  (makemytrip.global), **not** to vinpearl.com itself — Tier C/corroboration only, not official.
- **Phone (different number, different entity name):** "0297 3550 550 (reservation) / 0297 3779 888
  (other services)" — this was returned attributed to **"Vinpearl Wonderworld Phu Quoc,"** not
  "Vinpearl Resort & Spa Phu Quoc." Not applied to this place — see Conflicts.
- **Hotline:** "1900 23 23 28" — search_index, appears as a general/corporate Vinpearl hotline
  (surfaced alongside `vinpearl.com/en/contact`), not stated by any source as property-specific.
  Recorded as `hotline` (corporate), explicitly not as `phone`, per instruction §7.
- **Opening_hours:** not stated for the property itself. A separate WebSearch claimed "24-hour
  front desk," but every citing link was a third-party OTA (Tripadvisor, Orbitz, Expedia,
  Booking.com, Reserving, Dao Ngoc Tourist) — **no official source** made this claim despite the
  WebSearch tool's own summary calling it "confirmed across multiple official sources." That
  characterization is not accepted here — OTA amenity checkboxes are not an official source per
  `docs/data/modules/source.md` §4.1, and 24-hour front desk is a different field from "opening
  hours" per instruction §8 anyway. Left UNVERIFIED.
- **Operator:** Vin Group / Vinpearl JSC — search_index, consistent.

### Tier 2 evidence
- **Address:** "Bai Dai Area, Phu Quoc Special Zone, An Giang Province, Vietnam" — search_index,
  `vinpearl.com` snippet.
- **Price range:** not collected this batch.
- **Short description:** "3.5km private beach... largest swimming pool on Phu Quoc Island
  (4,864m²)... World Travel Awards 2019 Leading Family Beach Resort in Vietnam and Asia" —
  search_index, `vinpearl.com` snippet.

### Tier 3 evidence
Not collected (same reasoning as JW Marriott — weak Tier 1 evidence, not worth extending scope).

### Conflicts

| Field | Source A | Source B | Conflict? | Winner | Reason |
|---|---|---|---|---|---|
| phone | "84 297-355-0550" (attributed to makemytrip.global, re: "Vinpearl Resort & Spa Phu Quoc") | "0297 3550 550" (search snippet, re: "Vinpearl Wonderworld Phu Quoc") | Yes — different numbers **and** possibly different entities | Neither — HOLD | Cannot confirm "Vinpearl Wonderworld" and "Vinpearl Resort & Spa" are the same property; assigning either number risks attaching the wrong entity's contact info. |
| front-desk/opening hours | OTA amenity listings ("24-hour front desk") | (no official source found) | Not a true conflict, but a sourcing-quality issue | — | OTA claim not accepted as evidence per source policy; not ingested either way. |

### Administrative considerations
Address string says "Phu Quoc Special Zone, An Giang Province" — consistent with the already-
resolved government source in `administrative-backfill.manifest.ts`. No new administrative fact
proposed; not a conflict.

### Evidence quality
Weak-to-moderate. Zero direct_fetch. Name and general location are consistent across sources
(moderate confidence), but the phone number is actively conflicted with a same-family, differently-
named property, and hotline is only a corporate-level number. Not ready for ingestion on any Tier 1
contact field.

### Proposed ingestion candidates

| Field | Proposed value | Evidence | Reliability | Confidence | Ingest? | Reason |
|---|---|---|---:|---:|---|---|
| name | Vinpearl Resort & Spa Phu Quoc | search_index | 75 | 70 | HOLD | No direct_fetch; name itself is low-risk but still policy-blocked without one. |
| phone | — | conflicting (see above) | — | — | NO | Two different numbers tied to possibly two different entities — cannot pick a winner without direct_fetch or owner input. |
| hotline | 1900 23 23 28 | search_index (corporate) | 75 | 70 | HOLD | Corporate-level, not property-specific — usable as a fallback hotline only, needs an explicit "is this acceptable for a property-level hotline field" call, not assumed here. |
| operator | Vin Group / Vinpearl JSC | search_index | 75 | 70 | HOLD | Consistent, not direct_fetch. |
| opening_hours | — | none accepted | — | — | NO | Only OTA-sourced claims found; not an official source. |

### Fields intentionally left unresolved
phone (conflicted), price_range, Tier 3 fields, whether "Vinpearl Wonderworld Phu Quoc" is the same
entity as this place (flag for owner/Phase 3, not resolved here).

---

## vinpearl-safari

### Identity
"Vinpearl Safari Phu Quoc" (also referenced as part of "Phu Quoc United Center" in one indexed
page title: *"Vinpearl Safari Phu Quoc | Phu Quoc United Center"*). **Entity-confusion risk
flagged and explicitly NOT carried forward:** one aggregated WebSearch answer stated Vinpearl
Safari is "located at Grand World, Bai Dai Beach, Ganh Dau Commune" — this conflates **two
different places in this repository's 49-place list** (`grand-world-phu-quoc` is a separate Sun
Group property near Dương Đông; Vinpearl Safari is a VinGroup property in the Bãi Dài/Gành Dầu
complex). This reads as a WebSearch-side summarization error (merging unrelated snippets), not a
claim any single source actually made. **Not recorded as evidence for either place.** Per
instruction §12/§13, flagged `NEEDS_REVIEW` and excluded rather than guessed at.

### Tier 1 evidence
- **Official name:** "Vinpearl Safari Phu Quoc" — search_index, multiple `vinwonders.com` and
  `vinpearl.com` snippets (direct fetch of both domains → 403).
- **Phone/hotline:** "1900 23 23 28" and "1900 6677 (#2)" — search_index, both corporate-level
  Vinpearl/VinWonders hotlines, not safari-specific. Notably, "1900 6677, nhánh 2" **matches** the
  hotline already recorded for `vinwonders-phu-quoc` in Round 1's `verified-facts.manifest.ts`
  (`direct_fetch`, that time successfully) — this is a genuine corroboration of a prior finding, not
  new evidence for this place specifically, since it's the same shared park-wide hotline, not a
  Vinpearl-Safari-only line.
- **Opening_hours:** **conflicting between two search_index sources** — one says "9 am to 4 pm
  daily... stops admitting visitors after 2 pm"; another (aggregated with the Grand World
  confusion above, so lower trust) says "08:30 AM – 04:00 PM." See Conflicts.
- **Operator:** VinGroup / Vinpearl JSC (Phu Quoc United Center ecosystem) — search_index.

### Tier 2 evidence
- **Price range:** "VinWonders + Vinpearl Safari combo ticket ~1,000,000–1,350,000 VND"; children
  under 100cm free; senior discount 60+ — search_index, price not confirmed as *current* (no
  retrieval date attached to the underlying page, and ticket prices are explicitly noted by the
  source itself as subject to change).
- **Address:** not independently confirmed this batch beyond the Grand World-confused claim above,
  which is excluded. Left UNVERIFIED.
- **Short description:** "largest safari park in Vietnam" — search_index, generic claim, multiple
  sources.

### Tier 3 evidence
Not collected.

### Conflicts

| Field | Source A | Source B | Conflict? | Winner | Reason |
|---|---|---|---|---|---|
| opening_hours | "9:00–16:00, last entry 14:00" | "08:30–16:00" | Yes — start time differs (9:00 vs 8:30) | Neither — NEEDS_REVIEW | Both are search_index only; no reliability tiebreaker applies between two same-tier sources without `is_primary`/fresher `retrieved_at` per `source.md` §7's ladder — needs direct_fetch to resolve, not a coin flip. |
| location/complex | "Phu Quoc United Center" (title) | "located at Grand World... Ganh Dau" (aggregated) | Yes, and likely a tooling artifact, not a real second source | N/A | Treated as unusable rather than as a real conflicting claim — see Identity section. |

### Administrative considerations
None resolved this batch — location claims were too conflicted/unreliable to even reach an
administrative question. No province/admin_area/ward fact proposed.

### Evidence quality
Weak. Zero direct_fetch (same VinGroup-domain 403 pattern). Opening hours actively conflict between
two sources of equal (low) reliability. One location claim is likely a cross-place confusion
artifact and was discarded rather than used. The one solid thing here is the hotline-number
corroboration with Round 1's already-fetched VinWonders finding.

### Proposed ingestion candidates

| Field | Proposed value | Evidence | Reliability | Confidence | Ingest? | Reason |
|---|---|---|---:|---:|---|---|
| name | Vinpearl Safari Phu Quoc | search_index | 75 | 70 | HOLD | No direct_fetch. |
| opening_hours | — | conflicting search_index | — | — | NO | Two different start times, no tiebreaker available without a direct_fetch. |
| hotline | 1900 6677, nhánh 2 | search_index (corroborates Round 1's direct_fetch for vinwonders-phu-quoc) | 75 (this batch) / 90 (Round 1 record) | 70 | HOLD | Shared park-wide hotline, not Safari-specific; also this place's own Round 1-style record doesn't exist yet — flag for a future targeted direct_fetch of a Safari-specific page. |
| price_range | ~1,000,000–1,350,000 VND (combo ticket) | search_index, source itself flags as variable | 75 | 60 | NO | Explicitly seasonal/promotional per the source; not a stable fact to ingest. |
| location/address | — | discarded (see Identity) | — | — | NO | Cross-place confusion risk too high to record even as unverified. |

### Fields intentionally left unresolved
address, exact opening hours (conflicted), price_range (unstable), Tier 3 fields, and the
Vinpearl-Safari-vs-Grand-World location confusion (flag for Phase 3/owner, not resolved here).

---

## premier-village-phu-quoc

### Identity
"Premier Village Phu Quoc Resort" ("Managed by Accor" per the property's own site) — unambiguous;
no confusion with a different Premier Village property seen in sources this batch (repo instructs
watching for this — checked, none found).

### Tier 1 evidence
- **Official name:** "Premier Village Phu Quoc Resort" — **direct_fetch**,
  `https://www.premiervillage-phuquoc.com/`, retrieved 2026-08-24.
- **Phone:** "+84 297 3546 666" — **direct_fetch**, same page/source as above.
- **Hotline:** not stated separately from the phone number above — no distinct corporate hotline
  found on this page. Not invented.
- **Opening_hours:** not stated on the fetched page.
- **Operator:** "Managed by Accor" — direct_fetch, corroborated by the email domain
  (`HB2R4@accor.com`, per the earlier WebSearch snippet) and by Accor's own listing
  (`all.accor.com/hotel/B2R4/`, not itself fetched this batch — Tier B corroboration only, not
  fetched).

### Tier 2 evidence
- **Address:** "Ong Doi Cape - 920000 - Phu Quoc - An Giang - Vietnam" — direct_fetch.
- **Price range:** not stated on the fetched page (WebSearch snippets mentioned "from $370" on a
  third-party booking-aggregator page — not treated as the resort's own price_range, Tier C only).
- **Short description:** "luxury all-pool-villa resort... 215 villas, each with a private swimming
  pool" — direct_fetch.

### Tier 3 evidence
- **Amenities:** "water sports (kayaking, pedal boating), bicycle rentals, massage, sauna" —
  direct_fetch, same page. Recorded since evidence was clear and cheap to capture (per instruction
  §2, Tier 3 only when evidence is easy).
- Social links/media/tags: not collected — the page had an Instagram handle reference
  ("premiervillagephuquocresort") per the earlier WebSearch snippet, but this was not independently
  confirmed on the direct-fetched page content returned, so not recorded as fact.

### Conflicts
None detected.

### Administrative considerations
Address string uses "An Giang" (current), not "Kiên Giang" (superseded) — **this is the opposite
of the `sailing-club-phu-quoc` situation from Round 1**, where the official site used stale
terminology. Here the official site's own terminology already matches the government source, so
there is no conflict to flag. Still not proposing this as a province/admin_area *source* — that
field is already resolved via the government source per repo policy; this is corroboration only
(`administrative_decision = CORROBORATION_ONLY`).

### Evidence quality
Good. Direct_fetch on the resort's own domain succeeded for name, phone, address, operator, and a
description — the strongest evidence set of the 5 places in this batch. Opening_hours and hotline
are genuinely absent from the source, not overlooked.

### Proposed ingestion candidates

| Field | Proposed value | Evidence | Reliability | Confidence | Ingest? | Reason |
|---|---|---|---:|---:|---|---|
| name | Premier Village Phu Quoc Resort | direct_fetch | 90 | 90 | YES | Official domain, fetched directly, unambiguous. |
| phone | +84 297 3546 666 | direct_fetch | 90 | 90 | YES | Same page, clearly labeled contact number. |
| operator | Managed by Accor | direct_fetch | 90 | 90 | YES | Stated on the resort's own site; corroborated by email domain. |
| address | Ong Doi Cape - 920000 - Phu Quoc - An Giang - Vietnam | direct_fetch | 90 | 85 | HOLD | Street-level address is solid; recommend one more corroboration pass (e.g. Accor's own listing) before ingest given address is a higher-scrutiny field per the repo's own Grand World precedent. |
| short_description | "luxury all-pool-villa resort... 215 villas..." | direct_fetch | 90 | 85 | HOLD | Good source, but exact wording for a public-facing description field should be a deliberate editorial choice, not a raw quote pasted verbatim — flag for Phase 3 drafting, not straight ingest. |
| hotline | — | none found | — | — | NO | Not stated; not guessed from the phone number. |
| opening_hours | — | none found | — | — | NO | Resort — no single "hours" field stated. |

### Fields intentionally left unresolved
hotline, opening_hours, price_range, media/social links, tags.

---

## salinda-resort-phu-quoc

### Identity
"Salinda Resort Phu Quoc Island" — unambiguous; no other Salinda-branded property surfaced in
sources this batch.

### Tier 1 evidence
- **Official name:** "Salinda Resort Phu Quoc Island" — **direct_fetch**,
  `https://salindaresort.com/contact/`, retrieved 2026-08-24.
- **Phone:** "+84 297 399 0011" — **direct_fetch**, labeled on the page as the main/reservations
  number.
- **Hotline/secondary number:** "+84 28 3929 3097" — **direct_fetch**, explicitly labeled as the
  Sales & Marketing / Ho Chi Minh City office number, i.e. **not** the property's own reception
  line. Recorded separately per instruction §7, not merged into `phone`.
- **Opening_hours:** not stated on the fetched page.
- **Operator:** "Managed by An Cuong Limited Company, Business License Number 1700522370,
  Authorized by Kien Giang Province's Department of Finance" — **direct_fetch**.

### Tier 2 evidence
- **Address (resort):** "Cua Lap Hamlet, Phu Quoc Special Zone, An Giang Province, Vietnam" —
  direct_fetch.
- **Address (sales office, separate location):** "4th Floor, 65C Cao Thang Street, Ban Co Ward, Ho
  Chi Minh City, Vietnam" — direct_fetch. Recorded as a *different* location, not merged with the
  resort address.
- **Booking/contact:** four labeled emails — general (`xinchao@salindaresort.com`), sales, reservation,
  wedding — direct_fetch.
- **Price range:** not stated on the fetched contact page.

### Tier 3 evidence
Not collected — the contact page fetched doesn't cover amenities/media/tags; a separate page would
be needed and this batch stayed within the fetched page's actual content rather than guessing at
what an unfetched page might say.

### Conflicts
None detected between fields on this page. **One conflict worth flagging against the operator's
own business-license text, not against another source:** the license is "Authorized by Kien
Giang Province's Department of Finance" — **"Kien Giang" is the pre-2025 province name**, superseded
by the Nghị quyết 1654/NQ-UBTVQH15 merger into An Giang. This is not treated as a live
administrative conflict (a business license number is a historical/legal document, dated to
whenever it was issued — it is not a claim about *current* administrative geography the way an
address line is), but it's recorded for transparency.

### Administrative considerations
The resort's own **address** line already says "An Giang Province" (current, matches government
source) — consistent, `CORROBORATION_ONLY`, not a source for that field. The **business-license
authority** line says "Kien Giang" — this is expected to lag (business licenses aren't
retroactively reissued when a province is renamed) and is **not** proposed as evidence for or
against the current province/admin_area value. `administrative_decision = CORROBORATION_ONLY` for
the address; the license-authority string is not an administrative-fact candidate at all, just
noted so a future reader doesn't mistake it for a live conflict.

### Evidence quality
Good. Direct_fetch on the resort's own domain succeeded for name, both phone numbers (correctly
distinguished), operator/license info, and two distinct addresses. Comparable strength to
`premier-village-phu-quoc`, arguably stronger since the phone/hotline distinction was made
explicit by the source itself rather than inferred.

### Proposed ingestion candidates

| Field | Proposed value | Evidence | Reliability | Confidence | Ingest? | Reason |
|---|---|---|---:|---:|---|---|
| name | Salinda Resort Phu Quoc Island | direct_fetch | 90 | 90 | YES | Official domain, fetched directly. |
| phone | +84 297 399 0011 | direct_fetch | 90 | 90 | YES | Explicitly labeled as the resort's own reservations line. |
| phone (secondary/sales office) | +84 28 3929 3097 | direct_fetch | 90 | 85 | HOLD | Real number but it's a Ho Chi Minh City sales office, not the property itself — flag for a decision on whether the schema wants this recorded at all (it's not a "hotline" in the corporate-1900-number sense either). |
| operator | Managed by An Cuong Limited Company | direct_fetch | 90 | 90 | YES | Explicitly stated with a business license number. |
| address | Cua Lap Hamlet, Phu Quoc Special Zone, An Giang Province, Vietnam | direct_fetch | 90 | 85 | HOLD | Same address-field caution as Premier Village — recommend one more corroboration pass before ingest. |
| booking_email | reservation@salindaresort.com | direct_fetch | 90 | 85 | HOLD | Solid source; whether email belongs in a "contact" record alongside phone is a schema question, not a research one — flag for Phase 3. |
| opening_hours | — | none found | — | — | NO | Not stated; not guessed. |

### Fields intentionally left unresolved
opening_hours, price_range, Tier 3 fields (amenities/media/social/tags — a different page would be
needed and wasn't fetched this batch).

---

## Batch 1 Summary

| Place | Tier 1 fields | Tier 2 fields | Ingestion candidates | Needs review | Conflicts |
|---|---:|---:|---:|---:|---:|
| jw-marriott-phu-quoc | 3 of 6 found (name, phone*, operator) — 0 direct_fetch | 2 of 4 found (address*, description) | 0 (all HOLD/NO) | 0 explicit NEEDS_REVIEW rows, but evidence uniformly weak | 0 |
| vinpearl-resort-phu-quoc | 3 of 6 found (name, phone-conflicted, hotline) — 0 direct_fetch | 2 of 4 found (address, description) | 0 (all HOLD/NO) | 1 (phone / possible Vinpearl Wonderworld entity mix-up) | 1 (phone) |
| vinpearl-safari | 3 of 6 found (name, hotline, opening_hours-conflicted) — 0 direct_fetch | 1 of 4 found (price_range, unstable) | 0 (all HOLD/NO) | 1 (opening_hours conflict; location discarded, not even logged as unverified) | 2 (opening_hours, location/complex) |
| premier-village-phu-quoc | 4 of 6 found (name, phone, operator; opening_hours/hotline absent) — direct_fetch | 2 of 4 found (address, description) | 3 YES (name, phone, operator) | 0 | 0 |
| salinda-resort-phu-quoc | 4 of 6 found (name, phone, hotline-distinguished, operator; opening_hours absent) — direct_fetch | 3 of 4 found (address, booking email, second address) | 3 YES (name, phone, operator) | 0 | 0 (only a non-live license/date note) |

*asterisk = evidence sourced from an aggregated WebSearch answer without a single pinpointed citing
URL — weaker than typical `search_index`.

### High-confidence candidates

```text
premier-village-phu-quoc.name = "Premier Village Phu Quoc Resort"
  source: https://www.premiervillage-phuquoc.com/ | publisher: Premier Village Phu Quoc Resort (Accor-managed)
  evidence_type: direct_fetch | reliability: 90 | confidence: 90

premier-village-phu-quoc.phone = "+84 297 3546 666"
  source: https://www.premiervillage-phuquoc.com/ | publisher: Premier Village Phu Quoc Resort (Accor-managed)
  evidence_type: direct_fetch | reliability: 90 | confidence: 90

premier-village-phu-quoc.operator = "Managed by Accor"
  source: https://www.premiervillage-phuquoc.com/ | publisher: Premier Village Phu Quoc Resort (Accor-managed)
  evidence_type: direct_fetch | reliability: 90 | confidence: 90

salinda-resort-phu-quoc.name = "Salinda Resort Phu Quoc Island"
  source: https://salindaresort.com/contact/ | publisher: Salinda Resort Phu Quoc Island
  evidence_type: direct_fetch | reliability: 90 | confidence: 90

salinda-resort-phu-quoc.phone = "+84 297 399 0011"
  source: https://salindaresort.com/contact/ | publisher: Salinda Resort Phu Quoc Island
  evidence_type: direct_fetch | reliability: 90 | confidence: 90

salinda-resort-phu-quoc.operator = "Managed by An Cuong Limited Company (License No. 1700522370)"
  source: https://salindaresort.com/contact/ | publisher: Salinda Resort Phu Quoc Island
  evidence_type: direct_fetch | reliability: 90 | confidence: 90
```

None of the above are being ingested this phase — listed as "high-confidence" only in the sense of
meeting the reliability/confidence bar; ingestion itself remains out of scope per instruction §14.

### Corroboration only

- `jw-marriott-phu-quoc.phone` = "+84 297 377 9999" — search_index, no single pinpointed URL (Tier C)
- `vinpearl-resort-phu-quoc.address` = "Bai Dai Area, Phu Quoc Special Zone, An Giang Province" — search_index
- `vinpearl-resort-phu-quoc.hotline` = "1900 23 23 28" — search_index, corporate-level
- `vinpearl-safari.hotline` = "1900 6677, nhánh 2" — search_index, corroborates Round 1's direct_fetch for a *different* place (vinwonders-phu-quoc), shared park-wide number
- `vinpearl-safari.price_range` = "~1,000,000–1,350,000 VND combo" — search_index, source itself flags as variable
- `salinda-resort-phu-quoc.phone (sales office)` = "+84 28 3929 3097" — direct_fetch but wrong location (Ho Chi Minh City office, not the resort)
- `premier-village-phu-quoc` — Accor's own listing (`all.accor.com/hotel/B2R4/`) was named but not fetched this batch; would be Tier B corroboration if fetched later

### Needs review

- `vinpearl-resort-phu-quoc.phone` — two non-matching numbers, one tied to a differently-named
  entity ("Vinpearl Wonderworld Phu Quoc"); cannot resolve without direct_fetch or owner input on
  whether that's the same property.
- `vinpearl-safari.opening_hours` — two search_index sources disagree on start time (9:00 vs 8:30);
  no reliability tiebreaker available between two same-tier sources.
- `vinpearl-safari` location/complex identity — one aggregated answer conflated this place with
  `grand-world-phu-quoc` (a different place in the 49-place set); discarded rather than recorded,
  flagged for anyone doing a future direct_fetch to watch for this specific confusion.

### Unverified

- `jw-marriott-phu-quoc`: hotline, opening_hours, price_range, Tier 3 fields.
- `vinpearl-resort-phu-quoc`: opening_hours (OTA-only claim rejected), price_range, Tier 3 fields.
- `vinpearl-safari`: address (discarded due to confusion risk), exact opening hours, Tier 3 fields.
- `premier-village-phu-quoc`: hotline, opening_hours, price_range, media/social/tags.
- `salinda-resort-phu-quoc`: opening_hours, price_range, Tier 3 fields.

### Administrative conflicts

None that rise to a live conflict. Two notes recorded for transparency, neither actionable:
- `salinda-resort-phu-quoc`: the operator's business-license text says "Kien Giang" (pre-2025 name)
  while the resort's own address line says "An Giang" (current) — read as a stale legal-document
  artifact, not a live source disagreement; `administrative_decision = CORROBORATION_ONLY`.
- `premier-village-phu-quoc`: address already uses current "An Giang" terminology — no conflict,
  noted only as a contrast to the Round 1 `sailing-club-phu-quoc` case where the official site used
  stale terms.
- No province/admin_area/ward fact is proposed for ingestion from any of the 5 places — the
  government source in `administrative-backfill.manifest.ts` remains the sole authority per repo
  policy, unchanged by anything found this batch.

### DB writes

```text
0
```

### Git

```text
No commit
No push
No deploy
```

### Final status

```text
NEEDS_REVIEW
```

Not `READY_FOR_REVIEW` in the unqualified sense — 3 of 5 places have real open items:
`vinpearl-resort-phu-quoc` (phone conflict / entity-identity question), `vinpearl-safari`
(opening_hours conflict + a discarded location-confusion risk), and `jw-marriott-phu-quoc` (weak,
un-pinpointed evidence, zero direct_fetch, nothing meets the ingest bar). The other 2
(`premier-village-phu-quoc`, `salinda-resort-phu-quoc`) are individually clean with real
direct_fetch evidence and 3 YES-candidates each. Recommend treating this as a mixed result: the two
resorts with clean direct_fetch evidence could move toward Phase 3 owner sign-off on their YES
candidates, while the other three need either a direct_fetch workaround (different URL, different
tool) or an owner decision on the specific conflicts before their evidence is usable.

**Stopping here per instruction — awaiting Batch 1 review before Batch 2.**

---

# Phase 2 — Batch 2 (5 places): Evidence Collection

Status: **RESEARCH-ONLY, EVIDENCE COLLECTION.** Same restrictions as Batch 1 apply in full — no DB
writes, no `places`/`contacts` updates, no `source_attributions`, no `wiki_revisions`, no
`verifications`, no ingestion, no migration, no commit/push/deploy, no SSH/VPS/Cloudflare, no
source-code edits.

**Pre-batch git check:** branch `feat/place-administrative-backfill`, `git rev-parse HEAD` →
`a045a8f84768635003802d34c5d39b114e713d1d` (unchanged since Batch 1), `git status --short` → only
`deploy-c9cf9e5.sh` and this file untracked. Confirmed before research began.

**Batch 2 selection (derived from §2's existing priority order, not re-ranked):** Batch 1 consumed
the three P0 non-structural rows plus the first two P1 rows (`premier-village-phu-quoc`,
`salinda-resort-phu-quoc`). The next five rows in the same §2 list, unbroken, are all P1
hotels/resorts: `fusion-resort-phu-quoc`, `sunset-sanato-resort`, `novotel-phu-quoc`,
`la-veranda-resort`, `muong-thanh-luxury-phu-quoc`. Taking these completes the full 9-place
hotel/resort booking-stakes tier (4 done in Batch 1 + these 5) before the queue moves on to
attractions — matching §1's own stated tier-1-first methodology, no new ranking invented.

## fusion-resort-phu-quoc

### A. Identity resolution
**Unresolved — this is the headline finding of Batch 2, not a routine field gap.** Two things are
true simultaneously and could not be reconciled with the evidence found:
1. `fusionresorts.com` (the brand's own current portfolio page, direct_fetch, Level A) lists
   exactly three properties — Fusion Resort Cam Ranh, Maia Resort Quy Nhon, Fusion Resort & Villas
   Da Nang — **Phu Quoc is not among them.**
2. A trade-press article (TTG Asia, 2026-02-26, direct_fetch, Level C — industry press, not the
   brand's own site but a first-party quote from Fusion's own CEO) states Fusion Hotel Group
   signed a management agreement with Tropical Corporation to build **a new** "Fusion Resort Phu
   Quoc" on Bãi Trường beach, **"scheduled to open in 4Q2027"** — i.e. not yet built. The CEO is
   quoted saying "delighted to... **return** to Phu Quoc with this landmark project," language that
   only makes sense if Fusion currently has no operating property on the island.

This directly contradicts the premise that `fusion-resort-phu-quoc` (published, category
`resort`, presumably seeded with some address/coordinates) is a place a visitor could book **today**.
Per Section 20 (Stop Conditions) — *"entity identity cannot be established"* / *"a field would
require inference rather than evidence"* — further Tier 1/2/3 research on this place was **not**
attempted this batch. Continuing to collect phone/address/hours for a place whose current existence
is in doubt would produce exactly the kind of unsafe, non-defensible data this task exists to avoid.

### B–D. Tier 1/2/3 findings
**Not collected.** See Identity resolution — collecting facts before resolving whether this place
currently operates would be building on an unresolved foundation.

### E. Useful user information candidates
The single most useful thing a visitor needs from this record right now is not a phone number — it
is **"is this bookable at all today?"** Recommend this become the first question resolved before
any other field research on this slug.

### F. Media candidates
Not collected.

### G. Administrative notes
Not applicable — no administrative fact was researched, since the entity's current existence
itself is unresolved.

### H. Conflicts

| Field | Source A | Source B | Conflict? | Winner | Reason |
|---|---|---|---|---|---|
| current existence / operational status | `fusionresorts.com` official portfolio (direct_fetch): Phu Quoc absent | TTG Asia trade press (direct_fetch, CEO quote): new Phu Quoc property "scheduled to open in 4Q2027" | Yes — both point the same direction (no current Phu Quoc property) but this **conflicts with `fusion-resort-phu-quoc` being `status: published`** in PhuQuocHub today | Neither — **CONFLICT**, escalate | Two Level A/C sources agree with each other and disagree with the platform's own current record. This is exactly the class of conflict Section 20 requires stopping for. |

### I. Evidence-quality assessment
Strong evidence (two independent, direct-fetched, brand-authoritative-or-near-authoritative
sources) for an uncomfortable conclusion: not evidence of a fact to ingest, but evidence that the
place's basic premise needs owner review. Rated high-confidence *as a red flag*, zero confidence as
a source of fillable fields.

### J. Proposed ingestion candidates
None. Table intentionally empty — nothing here meets the bar, and nothing should, until the
operational-status question is resolved.

### K. Needs-review fields
`operational_status` (does *any* Fusion-branded property currently exist and operate on Phu Quoc?)
— **CONFLICT**, escalate to owner. This is structurally similar to the `cho-dem-phu-quoc` P0 case
from Phase 1 (a place that may not currently be operating as listed) and is being flagged with the
same seriousness, discovered mid-research rather than pre-identified.

### L. Unknown fields
name (which "Fusion Resort Phu Quoc" — the pre-2023 property or the unbuilt 2027 one — does the
platform's slug refer to?), address, phone, opening_hours, operator, price_range — all UNKNOWN,
correctly, pending the operational-status question.

---

## sunset-sanato-resort

### A. Identity resolution
"Sunset Sanato Resort & Villas" — unambiguous. Own domain (`sunsetsanato.com`), own name
throughout, no group/brand entity to disambiguate against (independent resort, not part of a
chain).

### B. Tier 1 findings
- **Name:** "Sunset Sanato Resort & Villas" — **direct_fetch**, `https://www.sunsetsanato.com/en/contact/`, retrieved 2026-08-24.
- **Phone/hotline:** "(+84) 297 6266 662" and "(+84) 945 993 545" — **direct_fetch**, both labeled
  "Hotline" on the source page (the site does not itself distinguish a property-direct line from a
  hotline the way Salinda's did) — recorded as-is, not split into `phone` vs `hotline` since the
  source doesn't make that distinction, per instruction §6 ("if a number appears on an official
  source without clear type, NEEDS_REVIEW, don't guess"). Marking the type split `NEEDS_REVIEW`.
- **Opening_hours / reception:** **"Reception 24/7"** — **direct_fetch**, stated directly on the
  resort's own contact page (not an OTA amenity checkbox like the Batch 1 Vinpearl case — this is
  the property's own claim about itself). This is materially stronger evidence than the Vinpearl
  case, and is treated differently: see Proposed ingestion candidates.
- **Operator:** none stated separately — resort appears to operate under its own name with no
  distinct management-company statement found on the fetched page.

### C. Tier 2 findings
- **Address:** "Đường Bào, Dương Tơ, Phú Quốc, An Giang, Vietnam" — direct_fetch, current
  administrative terminology.
- **Booking/contact:** "info@sunsetsanato.com" — direct_fetch.
- **Price_range:** not found on the fetched page.
- **Short description:** not collected from this page (contact page only; a separate homepage
  fetch would be needed for descriptive copy — not done this batch to stay within actual fetched
  content).

### D. Tier 3 findings
- **Check-in/check-out:** "Check-in: 15:00 · Check-out: 12:00" — direct_fetch. Recorded under
  useful-user-info, not as `opening_hours` (per instruction §7 of Phase 2 Batch 1, carried forward:
  check-in/out is explicitly a different concept from opening hours).

### E. Useful user information candidates
- `check_in_time` = 15:00, `check_out_time` = 12:00 — direct_fetch, high confidence for what they
  are, but not proposed as ingestion into any existing `places`/`contacts` field (no such field
  exists in the schema read this round — recorded as a candidate for a future schema discussion,
  not auto-added).
- `reception_availability` = 24/7 — see Tier 1 above; this is the strongest "is it always
  accessible" signal found in either batch.

### F. Media candidates
None collected — not checked this batch (Wikimedia Commons search was done for the other 4 places
in this batch, see below; time was allocated there once the pattern of "likely zero" was seen twice).

### G. Administrative notes
Address uses "An Giang" — CURRENT_ADMINISTRATIVE_FACT-consistent language, matches the government
source already on record. No new administrative fact proposed; `administrative_decision =
CORROBORATION_ONLY`.

### H. Conflicts
None detected.

### I. Evidence-quality assessment
Good. Direct_fetch on the resort's own domain for name, contact numbers, address, email, and two
genuinely useful operational facts (24/7 reception, check-in/out times) not previously in scope for
Batch 1's places. The one soft spot is the phone/hotline type ambiguity (both numbers labeled
identically "Hotline").

### J. Proposed ingestion candidates

| Field | Proposed value | Evidence | Reliability | Confidence | Ingest? | Reason |
|---|---|---|---:|---:|---|---|
| name | Sunset Sanato Resort & Villas | direct_fetch | 90 | 90 | YES | Official domain, unambiguous. |
| phone/hotline (primary) | +84 297 6266 662 | direct_fetch | 90 | 75 | HOLD | Real number, official source, but source labels it "Hotline" without distinguishing it from a property-direct line — needs a human call on which schema field this maps to, not guessed. |
| phone/hotline (secondary) | +84 945 993 545 | direct_fetch | 90 | 70 | HOLD | Same ambiguity, plus it's a mobile-format number (unusual for a listed "hotline") — flag for clarification rather than assume it's a personal/staff line. |
| address | Đường Bào, Dương Tơ, Phú Quốc, An Giang, Vietnam | direct_fetch | 90 | 85 | HOLD | Same address-field caution applied consistently across this whole round (recommend one more corroboration pass before ingest). |
| opening_hours (as `is_24h: true`, reception) | 24/7 reception, stated by the property itself | direct_fetch | 90 | 80 | HOLD | Strong, directly-sourced signal that fits the schema's `is_24h` boolean (seen in `verified-facts.manifest.ts`'s `openingHours` shape) — recommend as a genuine ingestion candidate for a future batch, held here only because this task's scope is research, not because the evidence is weak. |
| check_in / check_out | 15:00 / 12:00 | direct_fetch | 90 | 85 | HOLD | Solid evidence; not ingested because no schema field for it was found this round — a schema question, not an evidence question. |

### K. Needs-review fields
Phone-vs-hotline type distinction (both numbers labeled identically on the source).

### L. Unknown fields
Price_range, short_description (not fetched from this page), Tier 3 amenities/social/tags beyond
check-in/out.

---

## novotel-phu-quoc

### A. Identity resolution
"Novotel Phu Quoc Resort" — unambiguous. Confirmed on both the brand's own property domain
(`novotelphuquoc.com`) and Accor's group listing (`all.accor.com/hotel/9770/`), same property code
(9770) referenced in both, no ambiguity with another Novotel property.

### B. Tier 1 findings
- **Name:** "Novotel Phu Quoc Resort" — **direct_fetch**, `https://www.novotelphuquoc.com/`,
  retrieved 2026-08-24.
- **Phone:** "+84 (0)297 626 0999" — **direct_fetch**, same domain. (Search-index earlier also
  surfaced this identical number via `all.accor.com`, plus a fax "+84 297 626 0888" and email
  "H9770@accor.com" — Level B corroboration from the group's own listing, consistent, not
  conflicting.)
- **Hotline:** not found separately.
- **Opening_hours:** **not stated for the property.** The site does state all-inclusive dining runs
  "from 06:30 AM until 11:00 PM" — **explicitly excluded** from `opening_hours` per the standing
  rule (that's a meal-service window, not the property's hours; carried forward from the JW
  Marriott/Vinpearl treatment in Batch 1).
- **Operator:** "Novotel" (Accor group brand) — direct_fetch, corroborated by `all.accor.com`.

### C. Tier 2 findings
- **Address:** "Sonasea Villas and Resort, Group 5, Duong Bao Duong To Area, Phu Quoc Special
  Zone, 922273 An Giang Province, Vietnam" — direct_fetch, current administrative terminology.
  **Cross-place note:** this places Novotel *inside* the "Sonasea Villas and Resort" complex — see
  §15 Cross-place conflict detection below, since `sonasea-phu-quoc` and `muong-thanh-luxury-phu-quoc`
  (this same batch) both reference the same or an adjacent complex.
- **Price_range:** not collected.
- **Short description:** "family friendly resort on Bai Truong Beach, featuring modern rooms and
  tropical bungalows with ocean views" — search_index (from the WebSearch summary, not
  independently re-confirmed via the direct fetch prompt, which focused on contact fields) — marked
  search_index, not direct_fetch, for this specific quote.

### D. Tier 3 findings
Not collected — stayed within the fetched page's contact-focused content.

### E. Useful user information candidates
All-inclusive dining window (06:30–23:00) is genuinely useful trip-planning info even though it is
explicitly **not** `opening_hours` — recorded as a candidate under a hypothetical
"dining_hours"/"package_details" concept, not auto-added to schema.

### F. Media candidates
Checked this batch (see below, combined search) — none found on Wikimedia Commons.

### G. Administrative notes
Address uses "An Giang Province" / "Phu Quoc Special Zone" — current terms, consistent with the
government source already on record. One third-party aggregator (`vietnambambootravel.com`, not
independently fetched, only seen in a search snippet) listed the address with **"Kien Giang
Province"** — HISTORICAL_SOURCE_TEXT, not treated as a conflict against the official direct-fetch
address, per the standing distinction this task asks to maintain.

### H. Conflicts
None material. See G for the stale-term note (not classified as a conflict, per instruction §9's
explicit guidance not to mechanically treat old terminology as a live disagreement when it's from a
lower-tier aggregator, not from an authoritative source).

### I. Evidence-quality assessment
Good. Direct_fetch on the resort's own domain for name, phone, address, operator — corroborated
independently by Accor's own group listing (same phone number, matching property code). One of the
stronger identity-resolution stories in this batch precisely because two separate official-family
domains agree.

### J. Proposed ingestion candidates

| Field | Proposed value | Evidence | Reliability | Confidence | Ingest? | Reason |
|---|---|---|---:|---:|---|---|
| name | Novotel Phu Quoc Resort | direct_fetch, corroborated by all.accor.com | 90 | 90 | YES | Two independent official-family domains agree. |
| phone | +84 (0)297 626 0999 | direct_fetch, corroborated by all.accor.com | 90 | 90 | YES | Same number on both official domains. |
| operator | Novotel (Accor) | direct_fetch | 90 | 90 | YES | Explicit brand statement, corroborated. |
| address | Sonasea Villas and Resort, Group 5, Duong Bao Duong To Area, Phu Quoc Special Zone, An Giang Province | direct_fetch | 90 | 85 | HOLD | Standard address-field caution; also worth resolving the Sonasea-complex cross-place question first (§15) before finalizing. |
| opening_hours | — | none (dining hours explicitly excluded) | — | — | NO | Not stated for the property; not conflated with meal-service hours. |
| short_description | "family friendly resort on Bai Truong Beach..." | search_index only | 75 | 65 | HOLD | Not yet direct-fetch confirmed for this exact wording. |

### K. Needs-review fields
Address, pending the Sonasea-complex cross-place check (§15).

### L. Unknown fields
Hotline, opening_hours, price_range, Tier 3 fields.

---

## la-veranda-resort

### A. Identity resolution
"La Veranda Resort Phú Quốc – MGallery" — unambiguous. Own domain (`laverandaresorts.com`), single
property, MGallery/Accor brand explicitly stated.

### B. Tier 1 findings
- **Name:** "La Veranda Resort Phú Quốc – MGallery" — **direct_fetch**,
  `https://laverandaresorts.com/contact/`, retrieved 2026-08-24.
- **Phone:** "+84 (0)297 3982 988" — **direct_fetch**, same page.
- **Hotline:** not found separately — single contact number only.
- **Opening_hours:** **not stated** on the fetched page. Not guessed.
- **Operator:** "MGALLERY. STORIES THAT STAY." — direct_fetch; part of Accor (corroborated by
  loyalty-program/ALL-app references on the same domain).

### C. Tier 2 findings
- **Address:** "Tran Hung Dao Street, Duong Dong Town, Phu Quoc Island, Vietnam" — direct_fetch.
  **Note (not a conflict, a proximity observation):** this is the same street search_index
  attributed to `fusion-resort-phu-quoc`'s pre-2023 address ("98/2 Tran Hung Dao Str, Dương Đông")
  in this batch's earlier search — Trần Hưng Đạo is a long main road through Dương Đông town with
  many businesses on it, so this is not treated as a duplicate-location signal, just noted for
  completeness since both surfaced in the same batch.
- **Booking/contact:** "contact@laverandaresorts.com", fax "+84 (0)297 3982 998" — direct_fetch.
- **Price_range:** not collected.

### D. Tier 3 findings
Not collected — fetched page was the contact page specifically.

### E. Useful user information candidates
None new beyond standard contact info — the fetched page didn't surface check-in/out, ticket
policy, etc. the way Sunset Sanato's did.

### F. Media candidates
None found on Wikimedia Commons (combined search, see below).

### G. Administrative notes
Address does not include a province/admin_area string at all on this page ("Duong Dong Town, Phu
Quoc Island, Vietnam" — no province named) — neither corroborating nor conflicting with the
government source; simply silent on it. No administrative note beyond that.

### H. Conflicts
None detected.

### I. Evidence-quality assessment
Good for contact fields (name, phone, fax, email — all direct_fetch), but the address is
lower-detail (no province/ward) than the other four places in this batch, and opening_hours is
absent, consistent with the pattern for resorts generally.

### J. Proposed ingestion candidates

| Field | Proposed value | Evidence | Reliability | Confidence | Ingest? | Reason |
|---|---|---|---:|---:|---|---|
| name | La Veranda Resort Phú Quốc – MGallery | direct_fetch | 90 | 90 | YES | Official domain, unambiguous. |
| phone | +84 (0)297 3982 988 | direct_fetch | 90 | 90 | YES | Clearly labeled contact number on the resort's own site. |
| operator | MGallery (Accor) | direct_fetch | 90 | 90 | YES | Explicit brand statement on the resort's own site. |
| address | Tran Hung Dao Street, Duong Dong Town, Phu Quoc Island, Vietnam | direct_fetch | 90 | 70 | HOLD | Real but incomplete (no province/ward) — needs a corroborating source with full address before ingest, not just the standard caution. |
| booking_email | contact@laverandaresorts.com | direct_fetch | 90 | 85 | HOLD | Same schema-fit question as Salinda's email in Batch 1. |
| opening_hours | — | none | — | — | NO | Not stated. |

### K. Needs-review fields
None beyond the standard address-completeness caveat.

### L. Unknown fields
Hotline, opening_hours, price_range, Tier 3 fields.

---

## muong-thanh-luxury-phu-quoc

### A. Identity resolution
"Khách sạn Mường Thanh Luxury Phú Quốc" — unambiguous, confirmed on the group's own booking
subdomain.

### B. Tier 1 findings
- **Name:** "Khách sạn Mường Thanh Luxury Phú Quốc" — **direct_fetch**,
  `https://booking.muongthanh.com/khach-san-muong-thanh-luxury-phu-quoc`, retrieved 2026-08-24
  (subdomain of the operator's own primary domain `muongthanh.com` — treated as Level A, the
  group's own first-party booking platform, not a third-party OTA).
- **Phone:** "0297 3 645 555" — **direct_fetch**, same page. This **corroborates** an
  earlier search_index finding from a different search (WebSearch summary quoted "+84 297 364
  5555," same number in international-dialing format) — a genuine independent-source
  strengthening, not a single-source repeat.
- **Hotline:** not distinguished from the phone above — one number only, labeled "Tel."
- **Opening_hours (property-level):** **not stated as one whole-property figure.** The page states
  individual **facility** hours instead: restaurants "06h00–22h00," karaoke "09:00–24:00," fitness
  center "06:00–22:00," pool "06:00–22:00." Per the standing rule (carried forward from Batch 1's
  Novotel/dining-hours treatment), **none of these are recorded as the property's `opening_hours`**
  — they are facility-specific and the page does not state a single reception/property hours figure.
- **Operator:** "Mường Thanh Hospitality" (Business Registration 0106011932, registered with Điện
  Biên Province) — direct_fetch.

### C. Tier 2 findings
- **Address:** "Lô CH1, Khu phức hợp Bãi Trường, Ấp Đường Bào, đặc khu Phú Quốc, An Giang, Việt
  Nam" — **direct_fetch**, in current administrative terminology (uses "đặc khu Phú Quốc" and "An
  Giang" directly, the strongest current-terms match seen in either batch). **Cross-place note:**
  "Khu phức hợp Bãi Trường" (Bãi Trường complex) — see §15, same complex family as Novotel's
  "Sonasea Villas and Resort" address above.
- **Email:** "info@phuquoc.muongthanh.com" — direct_fetch.
- **Price_range:** not collected.

### D. Tier 3 findings
Facility hours (restaurant/karaoke/fitness/pool, see B) — recorded as Tier 3/useful-info, not
Tier 1 opening_hours.

### E. Useful user information candidates
- `restaurant_hours` = 06:00–22:00, `karaoke_hours` = 09:00–24:00, `fitness_hours` = 06:00–22:00,
  `pool_hours` = 06:00–22:00 — all direct_fetch, all facility-specific, all candidates for a future
  "facilities" sub-structure rather than the top-level `opening_hours` field.

### F. Media candidates
None found on Wikimedia Commons.

### G. Administrative notes
**Government tourism-authority page (`dulich.phuquoc.gov.vn/en/muongthanhluxury`) could not be
fetched — "certificate has expired" on both attempts** (a TLS/technical failure, distinct from the
403-blocking pattern in Batch 1; this is a broken certificate on the government's own server, not a
WAF block). This would have been the single best-authority source for this place (Level A/B,
government + tourism authority) and its absence is a real gap, not glossed over. Recorded as
`DIRECT_FETCH_BLOCKED` (technical), not retried a third time per the no-hammering rule, and not
bypassed (no certificate-pinning workaround was attempted — that would be evasion). Recommend a
future batch retry once the government site's certificate is renewed.

The operator's business registration is filed with **"Điện Biên Province"** — this is Mường Thanh's
own corporate headquarters registration (Mường Thanh Group is Điện Biên-based), **not a claim about
this hotel's location** — not an administrative conflict, same category as Salinda's Batch 1
Kiên Giang license note (HISTORICAL/UNRELATED, not CURRENT_ADMINISTRATIVE_FACT for this place).

Address itself: "đặc khu Phú Quốc, An Giang" — matches the government source already on record.
`administrative_decision = CORROBORATION_ONLY`.

### H. Conflicts
None material.

### I. Evidence-quality assessment
Good for name/phone/address/operator (direct_fetch on the group's own first-party booking
subdomain, phone corroborated by a second independent search hit). The intended best source
(government tourism page) was technically unreachable — noted as a real gap, not silently dropped.

### J. Proposed ingestion candidates

| Field | Proposed value | Evidence | Reliability | Confidence | Ingest? | Reason |
|---|---|---|---:|---:|---|---|
| name | Khách sạn Mường Thanh Luxury Phú Quốc | direct_fetch | 90 | 90 | YES | Group's own first-party booking domain, unambiguous. |
| phone | 0297 3 645 555 | direct_fetch, corroborated by independent search_index hit | 90 | 90 | YES | Two independent sources agree on the same number. |
| operator | Mường Thanh Hospitality | direct_fetch | 90 | 85 | HOLD | Clear, but recommend corroborating against the (currently unreachable) government tourism page once available, given this is otherwise the strongest single source in the batch and a second confirmation is cheap once the cert issue clears. |
| address | Lô CH1, Khu phức hợp Bãi Trường, Ấp Đường Bào, đặc khu Phú Quốc, An Giang | direct_fetch | 90 | 85 | HOLD | Standard address-field caution, same as every other place this round. |
| opening_hours | — | facility-level only, not property-level | — | — | NO | Not conflated with restaurant/karaoke/fitness/pool hours. |

### K. Needs-review fields
None beyond the standing address caution; the real open item is the unreachable government source
(a blocker, not a needs-review field — see §Research blockers in the final report).

### L. Unknown fields
Hotline (vs. phone, no distinction on source), opening_hours (property-level), price_range.

---

## §15. Cross-place conflict detection (Batch 2)

Compared against Batch 1, the 49-place inventory, and known operator/complex relationships:

- **No duplicate phone numbers, shared hotlines, or one-address-two-entities cases found** among
  the 5 Batch 2 places or against Batch 1's 5.
- **Real complex-adjacency finding, not a duplicate:** `novotel-phu-quoc`'s address places it
  inside **"Sonasea Villas and Resort"**, and `muong-thanh-luxury-phu-quoc`'s address places it
  inside **"Khu phức hợp Bãi Trường"** (Bãi Trường complex) — plausibly the same or an adjacent
  master-planned development. A third place in the 49-place inventory, `sonasea-phu-quoc` (a hotel,
  **not** in this round's 21 — excluded per Phase 1's selection, see the artifact's §1), shares the
  "Sonasea" name outright. This is **not** flagged as a duplicate (three legitimately distinct
  hotel businesses can share one large resort-complex address, the way three shops can share one
  mall address) but is recorded because a future duplicate-distance check (the 25m-haversine logic
  in `data-quality-audit.service.ts`, still not runnable this round — local DB unreachable) should
  specifically sanity-check these three against each other rather than assume the adjacency is
  benign.
- **`fusion-resort-phu-quoc` vs. `la-veranda-resort`** both had a Trần Hưng Đạo street address
  surfaced this batch — noted as a shared-street coincidence (a long town road with many
  businesses), not a duplicate signal; no distance data available to check further.
- Shared VinGroup-style corporate hotlines (Batch 1's finding) do not reappear in Batch 2 — none of
  these 5 places are part of a ticketed-attraction hotline pool; each has its own direct contact
  number, which is itself a useful data point (independent hotels behave differently from a
  multi-attraction operator like VinGroup).

## Media candidate search (Batch 2, combined)

A single combined WebSearch for Wikimedia Commons coverage of Novotel/La Veranda/Mường Thanh
returned **no Commons results for any of the three** (Sunset Sanato and Fusion were not searched —
Fusion's identity is unresolved, Sunset Sanato was deprioritized once the pattern was clear from
the first search). **`MEDIA_CANDIDATE_COUNT = 0`** for this batch — an honest finding, not a gap
in effort: no owner/operator-supplied or Commons-licensed image was located for any Batch 2 place.
Per instruction §12, no Google Images result was used as license evidence, and nothing was
downloaded or ingested.

---

## Batch 2 Summary

| PLACE | TIER_1_FOUND | TIER_2_FOUND | DIRECT_FETCH_FIELDS | INGESTION_CANDIDATES | CORROBORATION_ONLY | NEEDS_REVIEW | CONFLICTS | UNKNOWN | USER_VALUE_GAIN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| fusion-resort-phu-quoc | 0 of 6 (existence itself unresolved) | 0 of 4 | 0 | 0 | 0 | 1 (operational status) | 1 (existence vs. published status) | 6 (all, by design) | Surfaced a real, previously-invisible risk: this place may not be currently bookable at all — bigger user-value question than any single field. |
| sunset-sanato-resort | 3 of 6 found (name, phone/hotline*, reception-24/7) | 3 of 4 found (address, email; price_range absent) | 5 fields | 1 YES (name) + 4 HOLD | 0 | 1 (phone/hotline type) | 0 | price_range, short_description | Can now answer "how do I reach it" and "is someone always there" with real evidence. |
| novotel-phu-quoc | 4 of 6 found (name, phone, operator; opening_hours absent) | 2 of 4 found (address, description*) | 4 fields, 2 corroborated cross-domain | 3 YES + 2 HOLD | 1 (short_description) | 1 (address, pending Sonasea complex check) | 0 material | hotline, opening_hours, price_range | Can now answer "how do I contact it" and "who runs it" with cross-corroborated evidence. |
| la-veranda-resort | 3 of 6 found (name, phone, operator; opening_hours absent) | 2 of 4 found (address-partial, email) | 5 fields | 3 YES + 2 HOLD | 0 | 0 | 0 | hotline, opening_hours, price_range, full address | Can now answer "how do I contact it" and "who runs it" with direct evidence. |
| muong-thanh-luxury-phu-quoc | 4 of 6 found (name, phone-corroborated, operator; opening_hours absent) | 2 of 4 found (address, email) | 4 fields | 2 YES + 2 HOLD | 0 | 0 (blocker, not a field-level needs-review) | 0 material | hotline (vs phone), opening_hours, price_range | Can now answer "how do I contact it" with the strongest phone corroboration in either batch. |

```text
BATCH_2_PLACES=fusion-resort-phu-quoc, sunset-sanato-resort, novotel-phu-quoc, la-veranda-resort, muong-thanh-luxury-phu-quoc
DIRECT_FETCH_SUCCESS_COUNT=4 places (sunset-sanato-resort, novotel-phu-quoc, la-veranda-resort, muong-thanh-luxury-phu-quoc); fusion-resort-phu-quoc had 2 successful direct_fetches (brand portfolio page, trade press) that resolved a status question rather than a field
DIRECT_FETCH_BLOCKED_COUNT=1 (dulich.phuquoc.gov.vn for muong-thanh-luxury-phu-quoc — certificate expired, 2 attempts)
INGESTION_CANDIDATE_FIELD_COUNT=9 (name×4 + phone×3 + operator×2, across the 4 resolvable places — see per-place tables for exact split)
CORROBORATION_ONLY_FIELD_COUNT=1 (novotel-phu-quoc short_description)
NEEDS_REVIEW_FIELD_COUNT=3 (fusion-resort-phu-quoc operational_status, sunset-sanato-resort phone/hotline type, novotel-phu-quoc address pending Sonasea-complex check)
CONFLICT_FIELD_COUNT=1 (fusion-resort-phu-quoc existence vs. published status)
UNKNOWN_FIELD_COUNT=~18 (opening_hours×4, hotline×3, price_range×4, Tier 3×remaining, plus all 6 fusion-resort-phu-quoc fields — see per-place L sections for exact list)
MEDIA_CANDIDATE_COUNT=0
```

## §18 Decision gate

```text
BATCH_STATUS=NEEDS_REVIEW
```

Not `READY_FOR_REVIEW` outright and not `BLOCKED` outright — this batch is a genuine mix:
`novotel-phu-quoc`, `la-veranda-resort`, and `muong-thanh-luxury-phu-quoc` produced clean,
direct-fetched, high-confidence evidence with real YES-candidates (comparable to Batch 1's Premier
Village/Salinda). `sunset-sanato-resort` is nearly as clean, with one minor type-ambiguity to
resolve. `fusion-resort-phu-quoc` is the outlier and the reason this batch isn't a clean
`READY_FOR_REVIEW`: it surfaced a **material conflict between two authoritative-ish sources and the
platform's own published status**, which is a Section 20 stop condition, not a normal field gap.

**Recommendation: C (Owner decision required) for `fusion-resort-phu-quoc` specifically, alongside
A (proceed to Batch 3) for everything else.** The other four places' findings are not blocked by
Fusion's problem and don't need to wait on it — but Fusion itself should not proceed to further
field research (Tier 1/2/3) until there's an owner decision on what "Fusion Resort Phu Quoc" in the
49-place inventory is actually supposed to represent (the pre-2023 property, if it in fact
reopened and this batch's trade-press read is wrong; or the unbuilt 2027 project, in which case the
place probably shouldn't be researched as a bookable resort at all right now). This mirrors how
`cho-dem-phu-quoc` was already handled in Phase 1 — an operational-status question blocks
fact-collection, and guessing which reading is correct would be worse than leaving it open.

**Stopping here per instruction — awaiting Batch 2 review before Batch 3.**
