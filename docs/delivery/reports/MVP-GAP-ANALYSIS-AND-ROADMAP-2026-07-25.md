# PhuQuocHub — MVP Gap Analysis and Roadmap (2026-07-25)

**Authority:** Owner explicit instruction 2026-07-25 — pivot focus away from infrastructure
(PLACE-037 through PLACE-043 all completed/deferred; production deployment blocked on a VPS
purchase, not an engineering gap) and back to MVP feature completeness. Explicitly: do not create
PLACE-044, do not continue the infrastructure task chain. This is a standalone assessment +
roadmap, not tied to a new PLACE task number — matching this repository's own precedent for
freestanding reports (`PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md`,
`OWNER-DECISION-PACKAGE-2026-07-24.md`).

## 1. Repository Truth (verified fresh, not from conversation)

Branch `master`, HEAD `66c0c81` at start, clean working tree, `current.task: none`. Backend has 22
modules (`apps/api/src/modules/*`); frontend has 10 modules and 15 route segments
(`apps/web/src/app/**`).

## 2. MVP Gap Analysis

### Backend features
- **READY:** places/hotels/restaurants/tours/events CRUD (write paths permission-gated), geo
  (nearby/bbox), search (full-text), health, auth (JWT access+refresh), RBAC, rate limiting,
  contacts, prices, media (entity + mapper), sources, categories, revisions (wiki-style history).
- **STUBBED, NOT IMPLEMENTED (zero code beyond `.gitkeep`):** `community`, `contributions`,
  `notifications`, **`reviews`** — despite "Reddit" being one of this project's three named
  pillars (`docs/overview/vision.md`: "Wikipedia + Reddit + Google Maps"), the review/community
  layer does not exist at all yet, backend or frontend.

### Frontend pages
- **READY:** places list+detail, hotels/restaurants/tours/events detail, explore, map, search,
  login/register, a minimal dashboard stub.
- **GAP:** no list/browse page exists for hotels, restaurants, or tours (only detail pages,
  reachable by direct link/search only) — confirmed via `find`, PLACE-041.
- **GAP:** `/search`, `/map`, `/explore` are all under 20-65 lines — thin stubs, not the full
  filter/map-interaction experience `docs/product/discovery.md` describes.

### Authentication / Authorization
- **READY.** JWT access+refresh, RBAC with roles/permissions, login/register pages, route guard
  proven on the dashboard stub, bearer-token-only (no CSRF surface), rate-limited auth endpoints.

### Business workflow
- **MISSING.** No business-claim flow, no owner-editing UI for a claimed listing, no moderation
  queue UI. `business_claims`/`business_members` tables and permission strings exist in the
  backend design (ADR-015) but no controller/service/frontend surface was found for them this
  session (out of scope to verify exhaustively here; flagged for a future task, not fabricated as
  either present or absent beyond what was checked).

### CRUD completeness (the single biggest finding this session)
- **The web frontend has ZERO write capability beyond auth** (login/register/logout). Grepped for
  any `POST`/`PATCH` call outside `auth.api.ts` — none found. There is no create-place form, no
  edit form, no review submission, no image-upload UI, no business-claim UI, no admin/moderation
  UI anywhere in `apps/web`. The backend fully supports place CRUD (`POST/PATCH/DELETE /places`,
  permission-gated) — the frontend simply never calls it. **This is the biggest remaining gap.**

### Search / Filters / Maps
- Full-text search exists on the backend (`/search`); the `/search` page (62 lines) does not
  appear to expose category/price_range/ward filters in its UI (grepped, none found) despite the
  backend supporting them (`ListPlacesQueryDto`). The `/map` page (16 lines) is a thin wrapper.

### Image upload
- **MISSING on the frontend entirely.** `media` entity/mapper exist on the backend; no upload
  form, no file-input component, no signed-upload flow was found anywhere in `apps/web`.

### SEO / Sitemap / Robots / Structured data
- **Were the biggest, most tractable, purely-local gap** — confirmed absent (PLACE-036/041):
  no `sitemap.xml`, no `robots.txt`, no JSON-LD structured data anywhere, and no `metadataBase`
  (meaning canonical URLs/OG images silently resolved against `localhost:3000` even in a
  production build). **Selected and closed this session — see §4.**

### Performance
- Backend: PostGIS/FTS indexes present, Redis caching used correctly, offset pagination ratified
  (PLACE-007/021/040/041 findings, unchanged). Frontend: bundle ~1.5M (PLACE-041), not measured
  against a budget; no regression beyond that was newly found this session.

### Accessibility
- Thin: only 8 files repository-wide use `aria-*`/`role` (PLACE-041 finding, unchanged this
  session — no dedicated audit tool was run).

### Testing
- Backend: 256 unit tests + 59 e2e (PLACE-038 baseline), strong. **Frontend: only 3 unit test
  files (`lib/api`, two auth files) — zero component/page rendering tests exist anywhere.**

### Documentation
- Exceptionally thorough at the delivery/governance layer (dozens of ADRs, reports, runbooks —
  PLACE-041's own finding, unchanged, still this project's strongest dimension).

## 3. Prioritized Roadmap

> **Status update (governance reconciliation, 2026-07-30):** items #2, #3, and #5 below are now
> **DONE**. This section is left otherwise unedited (original wording preserved as the historical
> record of what was open on 2026-07-25) — see the ✅ annotations for what closed each item and
> when.

**Critical** (blocks a real public launch even at MVP scope):
1. **Write capability for at least the core content loop** — some way for real users/business
   owners/moderators to create and edit content, not just read it. Currently zero.
   **Still open** — Reviews (#2 below) closed one narrow write path; general create/edit-place,
   business-claim, and image-upload forms remain entirely absent from the frontend.
2. **Reviews (the "Reddit" pillar)** — currently does not exist end-to-end.
   **✅ DONE — 2026-07-26.** See docs/delivery/reports/MVP-REVIEWS-FEATURE-2026-07-26.md.

**High** (materially weakens the MVP but doesn't block a first, read-only launch):
3. List/browse pages for hotels, restaurants, tours (currently detail-only).
   **✅ DONE** — found already-implemented (`apps/web/src/app/(public)/{hotels,restaurants,tours}/page.tsx`,
   full filter/pagination/SEO-canonical pages) during the governance audit preceding this
   reconciliation. No report documents when this shipped; it was delivered without a corresponding
   delivery report, which is itself the gap this reconciliation is recording.
4. Image upload UI (media entity exists, nothing calls it from the frontend).
   **✅ DONE — 2026-08-01.** See docs/delivery/reports/IMAGE-UPLOAD-UI-2026-08-01.md. (Correction
   made here 2026-08-02 while reconciling item #6 in this same section — this entry had been left
   stale since it shipped.)
5. Search filters (category/price/ward) surfaced in the `/search` UI.
   **✅ DONE — 2026-07-30.** See docs/delivery/reports/SEARCH-FILTERS-2026-07-30.md and
   docs/delivery/reports/SEARCH-FILTERS-POST-IMPLEMENTATION-REVIEW-2026-07-30.md.
6. Frontend test coverage — zero component tests exist; a regression in any page currently has no
   automated safety net beyond `tsc`/`eslint`/a production build.
   **✅ DONE — 2026-08-01 (foundation) + 2026-08-02 (extension).** Foundation established the
   first component-rendering test pattern (`AttractionCard`/`AttractionFilters`/`SearchFilters`/
   `Pagination`) — see docs/delivery/reports/FRONTEND-COMPONENT-TEST-COVERAGE-2026-08-01.md.
   Extended to the 9 remaining browse-page card/filter components — see
   docs/delivery/reports/FRONTEND-COMPONENT-COVERAGE-EXTENSION-2026-08-02.md. Page-level Server
   Component integration tests remain out of scope (deliberate, per both reports' own reasoning).

**Medium:**
7. Business-claim / owner-editing workflow.
8. Accessibility pass beyond the current 8-file baseline.
   **⚠️ PARTIALLY ADDRESSED — 2026-08-02.** Automated `jsx-a11y` ESLint baseline established (0
   findings against the current codebase, verified not a silent no-op). Named high-risk areas
   manually reviewed; 3 trivial gaps found and fixed with regression tests. 2 real gaps found and
   explicitly deferred (custom map marker keyboard access; app-wide async submit-button label
   announcements) — both need a design decision this audit-only milestone did not make. Not a WCAG
   conformance audit; no color-contrast, keyboard-only, or screen-reader testing was performed. See
   docs/delivery/reports/ACCESSIBILITY-BASELINE-2026-08-02.md.
9. A moderation queue UI (the backend already models pending/draft/published status).
10. Remaining error/loading boundaries for `/explore`, `/map`, `/search`, `/dashboard`
    (PLACE-041, still open).
    **✅ DONE — 2026-08-02.** See docs/delivery/reports/ERROR-LOADING-BOUNDARIES-2026-08-02.md.

**Low:**
11. Live Swagger/OpenAPI UI (manually-maintained spec file already kept in sync).
12. Bundle-size measurement against an explicit budget.
    **✅ DONE (measurement only) — 2026-08-02.** Baseline recorded, no budget enforced (deliberately
    out of scope — that requires an Owner-approved threshold and a CI-gate decision, neither made
    here). See docs/delivery/reports/FRONTEND-BUNDLE-SIZE-BASELINE-2026-08-02.md.
13. 8 open high-severity dependency findings (next/postcss/sharp) — blocked entirely on an
    upstream fix, no action possible from this repository (unchanged since PLACE-036).

## 4. Selected Task (this session)

**SEO & Discoverability completeness pass** — chosen because it was the highest-value item that
is (a) fully local, (b) needs zero VPS/production access, (c) needs zero Owner input, and (d) is
completable entirely in one session, unlike the Critical items above (a real write/CRUD UI or a
full review system are each multi-session feature builds, not a single bounded task).

### What was implemented

1. **`NEXT_PUBLIC_SITE_URL`** (`.env.example`, `apps/web/Dockerfile`, `docker-compose.prod.yml`) —
   found genuinely missing: no env var anywhere told the app its own production origin, so
   `metadataBase` and any absolute-URL computation would have silently used
   `http://localhost:3000` even in production. Wired through the exact same
   `ARG`/`ENV`/`build.args` pattern PLACE-038 already established for
   `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_MAP_TILE_URL`, to avoid reintroducing that exact
   build-time-vs-runtime defect class.
2. **`apps/web/src/app/layout.tsx`** — added `metadataBase`, closing the silent-localhost-fallback
   gap for every page's canonical URL and OG image resolution.
3. **`apps/web/src/app/sitemap.ts`** (new) — Next.js's native sitemap convention, served at
   `/sitemap.xml`. Fetches places/hotels/restaurants/tours/events slugs plus the static content
   routes. `export const dynamic = 'force-dynamic'` explicitly, so it is never attempted during
   `next build` (verified: the build succeeded with zero live API available this session, and the
   route is correctly classified `ƒ` dynamic in the build output, not `○` static).
4. **`apps/web/src/app/robots.ts`** (new) — Next.js's native robots convention, served at
   `/robots.txt`. Allows all crawlers, disallows the three auth-gated/non-content routes
   (`/login`, `/register`, `/dashboard`), references the sitemap.
5. **`apps/web/src/lib/structured-data.ts`** (new) — schema.org JSON-LD builders for
   `TouristAttraction` (places), `LodgingBusiness` (hotels), `Restaurant` (restaurants),
   `TouristTrip` (tours), `Event` (events) — built only from fields these pages already fetch,
   never a fabricated field. A `serializeJsonLd` helper escapes `<` in the JSON string before
   injection, because these entities carry community-contributed `name`/`description` text that
   could otherwise contain `</script>` and break out of the inline script tag — a real,
   previously-unconsidered XSS-adjacent risk in the standard Next.js inline-JSON-LD pattern, not
   present before because no JSON-LD existed to carry it.
6. **Wired the JSON-LD script tag into all 5 detail pages** (`places`, `hotels`, `restaurants`,
   `tours`, `events`) — the first use of `dangerouslySetInnerHTML` anywhere in this app (PLACE-041
   had confirmed zero prior uses); used here only for the standard, safe, escaped JSON-LD pattern,
   not for arbitrary HTML.
7. **Added `listHotelSlugs`/`listRestaurantSlugs`/`listTourSlugs`** to their respective API client
   files — minimal, sitemap-only functions (no list PAGE exists for these types, so these are
   deliberately not wired into any UI).

### What this does NOT do

- Does not build list/browse pages for hotels/restaurants/tours (roadmap item 3, not this
  session's selected task).
- Does not add reviews, write capability, or any new product feature (Critical items 1-2 remain
  fully open — these are correctly scoped as separate, larger future work, not attempted here).
- Does not touch any backend code, migration, or database.
- Does not require any VPS, DNS, or Owner decision — `NEXT_PUBLIC_SITE_URL`'s production value
  (`https://phuquochub.com`) is already the Owner-approved domain (PLACE-038), not a new decision.

## 5. Validation

| Check | Result |
|---|---|
| `npx tsc -p apps/web/tsconfig.json --noEmit` | exit 0 |
| `npx eslint . --max-warnings=0` (apps/web) | exit 0 |
| `npx jest --silent` (apps/web) | 17/17 passed, unchanged |
| `npx next build` (apps/web, Turbopack) | exit 0, **zero error**, 13/13 routes; `/robots.txt` correctly `○` static, `/sitemap.xml` correctly `ƒ` dynamic (never attempted at build time, confirming no live-API build dependency was introduced) |
| `docker compose -f docker-compose.prod.yml config --quiet` | exit 0 (validates the new build-arg wiring) |
| Generated `.next/server/app/robots.txt.body` content | manually inspected — correct `Allow`/`Disallow`/`Sitemap` lines |
| Secret scan | 0 matches |
| Backend | untouched — no re-run required |

## 6. Not Claimed

- Does not claim the MVP is feature-complete. Reviews and search filters (§3 #2, #5) closed since
  this report was authored (see the §3 status update, 2026-07-30); general write capability and
  image upload (§3 #1, #4) remain fully open.
- Does not claim any live search-engine indexing occurred — no real deployment exists yet
  (PLACE-043: VPS not purchased).
- Does not create PLACE-044 or any successor task, per the Owner's explicit instruction.
