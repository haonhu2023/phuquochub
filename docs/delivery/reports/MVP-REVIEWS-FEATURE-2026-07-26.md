# PhuQuocHub — MVP Gap Re-Verification + Reviews Feature (2026-07-26)

**Authority:** Owner explicit instruction 2026-07-26 — "PRODUCT COMPLETION" priority; ignore
VPS/production infrastructure/deployment/governance unless it blocks implementation; do not
create PLACE-044; do not produce more governance documents unless implementation requires them.
Standalone report, same convention as `MVP-GAP-ANALYSIS-AND-ROADMAP-2026-07-25.md` and
`PRODUCTION-READINESS-ASSESSMENT-2026-07-24.md`.

## 1. Repository truth (re-verified fresh this session, not from prior conversation)

Branch `master`, HEAD `4c7f9de` at start, clean tree. Re-checked the biggest finding from
2026-07-25 directly against the filesystem before doing anything else:
`apps/api/src/modules/{reviews,community,contributions,notifications}` and
`apps/web/src/modules/{reviews,community}` all contained **only `.gitkeep`** — confirmed still
true, unchanged since yesterday. `prisma/schema.prisma` already models `Review` (line 825) in
full, including `ReviewStatus` (pending/published/hidden) and a `@@unique([place_id, user_id])`
constraint — this is a design that had never been migrated or built, not a gap that needed
inventing from scratch.

**Unexpected find:** `docs/api/openapi.yaml` already documents `GET/POST /places/{id}/reviews`
(`listPlaceReviews`/`createReview`, exact field names `rating`/`content`/`media_ids`) plus
`/reviews/{id}` PATCH/DELETE and report/reply/vote endpoints — but the referenced `Review` schema
was a **dangling `$ref`** (never defined). The contract for the core read/write loop was already
committed to; it had simply never been implemented on either side.

## 2. Module-by-module status (14 groups, requested breakdown)

| # | Module | Status | Completion | Notes |
|---|---|---|---|---|
| 1 | Places | Implemented | ~90% | Full CRUD, geo, search, revisions. Frontend list+detail only (no create/edit UI). |
| 2 | Hotels | Partial | ~60% | Backend CRUD; frontend detail-only, **no list/browse page**. |
| 3 | Restaurants | Partial | ~60% | Same as Hotels. |
| 4 | Tours | Partial | ~60% | Same as Hotels. |
| 5 | Events | Partial | ~65% | Backend CRUD + calendar; frontend list+detail exist, thin. |
| 6 | Search | Partial | ~50% | Backend FTS solid; `/search` UI (62 lines) doesn't surface category/price/ward filters. |
| 7 | Maps | Partial | ~35% | Backend clustering/bbox/nearby solid; `/map` page is a thin wrapper. |
| 8 | Authentication | Implemented | ~95% | JWT access+refresh, RBAC, login/register, route guard. No email verification (documented, deferred). |
| 9 | Business dashboard | Missing | ~5% | Dashboard page is a stub; no claim flow, no owner-editing UI, no moderation queue UI. |
| 10 | Images | Missing (frontend) | ~30% | `media` entity/mapper/gallery-read exist; **zero upload UI anywhere**; no presign/upload endpoint either. |
| 11 | Reviews | **Was 0% → now implemented (MVP scope)** | ~75% | See §3/§4. Create+read done; edit/delete/report/reply/vote (already in openapi.yaml) and moderation queue remain open. |
| 12 | SEO | Implemented | ~90% | sitemap/robots/JSON-LD/metadataBase done 2026-07-25. |
| 13 | Admin | Missing | ~5% | No moderation queue UI; approve/archive exist only as backend endpoints with no frontend surface. |
| 14 | Testing | Partial | Backend ~85%, Frontend ~15% | Backend: 274 unit + e2e suite. Frontend: `.spec.ts` only (jest env=node, no jsdom/RTL) — component rendering cannot be tested with the current jest config; only pure-logic files are unit-tested. |

## 3. Selected task

**Reviews — create + read, MVP-scoped (roadmap Critical #2 from 2026-07-25).** Chosen over
"write capability for places" (Critical #1) because: it is a **complete, self-contained,
already-contracted** vertical slice (schema designed, openapi documented, permission model
established) that finishes in one session, whereas a general place-create/edit UI is a
multi-session surface (forms, image attach, revision UI, moderation preview) with no natural
stopping point that would count as "finishes completely." Reviews also directly closes the
"Reddit pillar" gap named in `docs/overview/vision.md` ("Wikipedia + Reddit + Google Maps") and is
the first real write capability exposed to ordinary end users (not just business/admin flows).

**Scope boundary (deliberate, to keep this task actually finishable):**
- Implemented: `GET /places/{id}/reviews` (public), `POST /places/{id}/reviews` (auth, one review
  per user per place, enforced by a real DB unique constraint + a pre-check).
- **Not implemented** (each already has its own openapi.yaml stub, separate future work):
  `PATCH /reviews/{id}` (edit), `DELETE /reviews/{id}`, `POST /reviews/{id}/report`,
  `/reply`, `/vote`. A moderation queue UI/endpoint for the `pending`/`hidden` states.
- **MVP moderation decision:** the DB enum `review_status` (`pending`/`published`/`hidden`) is
  built exactly as designed in `prisma/schema.prisma`, but since no moderation queue exists yet,
  the application writes `published` immediately on create — writing `pending` with nothing to
  ever promote it would make the review invisible forever, i.e. a broken half-feature. When a
  moderation flow is built later, it can hide/unhide reviews directly via this same column; no
  schema change needed.
- `media_ids` (already in the openapi.yaml request body) is implemented on the backend
  (attaches pre-existing orphan media the same user uploaded) for contract fidelity, but the
  frontend review form does not offer image attachment — there is still no upload UI anywhere in
  this app (roadmap item 4, unchanged, separate task).

## 4. What was implemented

### Backend (`apps/api`)
- `1720002000000-InitReviews.ts` — `reviews` table (FK `place_id`→places CASCADE, `user_id`→users
  CASCADE, `CHECK (rating BETWEEN 1 AND 5)`, unique `(place_id,user_id)`), `review_status` enum,
  and the `fk_media_review` FK on `media.review_id` (that column existed already, unlinked,
  exactly like `media.event_id` before `InitEvent` — same closing pattern reused).
- `1720002100000-SeedReviewPermissions.ts` — `Review.View`/`Review.Create`, `Review.Create`
  granted to the `member` role (every registered user gets `member` on signup — verified in
  `auth.service.ts`), following the exact `SeedEventPermissions` template.
- `modules/reviews/` — entity, DTO (`class-validator`, `rating` 1–5, optional `content`/`media_ids`),
  repository, service, controller, module. Registered in `app.module.ts`.
- `PlacesRepository.existsById` — new, deliberately **not** the privileged
  `getCardByIdIncludingInactive` (reserved for PlacesService's own approved callers per
  `places-privileged-access.arch.spec.ts`) — a plain boolean existence check is all a review-create
  needs, so a new privileged-data path was avoided rather than reused.
- `PlacesRepository.recalculateRating` — after a review is created, synchronously recomputes
  `places.rating_avg`/`rating_count` from `reviews` (published only). Makes the feature visibly
  useful immediately: the star rating already rendered on every Place card/detail page now
  reflects real reviews instead of being permanently null/zero.
- `MediaRepository.attachToReview` — attaches only orphan media owned by the requesting user
  (guards against attaching someone else's media via a guessed UUID).
- `docs/api/openapi.yaml` — defined the previously-dangling `Review` schema; added `404` to
  `createReview`'s documented responses (place-not-found was previously unaccounted for).

### Frontend (`apps/web`)
- `lib/http.ts` — added `apiPost` (Bearer-authenticated POST + envelope unwrap) and
  `ApiError.isConflict`. This is the **first authenticated write helper in the frontend** — every
  prior request was either public `apiGet` or auth's own local `postJson`.
- `modules/reviews/` — `types.ts` (re-exports from `@phuquochub/shared-types`), `api/reviews.api.ts`
  (`listReviews`, `createReview`), `format.ts` (pure `ratingStars`/`formatReviewDate`, unit-tested),
  `ReviewsSection.tsx` (client component: list + star-rating form, optimistic append on success,
  "already reviewed" / "log in to review" states), `reviews.module.css`.
- `packages/shared-types/src/review.ts` — `Review`/`CreateReviewInput`/`ReviewStatusValue`, same
  FE/BE-shared-contract convention as `place.ts` (GAP-11).
- Wired into `places/[slug]/page.tsx`: server-fetches reviews alongside the place (wrapped in its
  own try/catch — a reviews-fetch failure must not break the whole detail page), renders
  `<ReviewsSection>`.

## 5. Validation

| Check | Result |
|---|---|
| `apps/api`: `npx tsc --noEmit` | exit 0 |
| `apps/api`: `npx eslint src --max-warnings=0` | exit 0 |
| `apps/api`: `npx jest --silent` | **274/274 passed** (was 256 before this session; +18 new: reviews service/mapper/dto, `PlacesRepository.existsById`/`recalculateRating`, `MediaRepository.attachToReview`) |
| `apps/web`: `npx tsc --noEmit` | exit 0 |
| `apps/web`: `npx eslint . --max-warnings=0` | exit 0 |
| `apps/web`: `npx jest --silent` | **24/24 passed** (was 17; +7 new: `http.spec.ts` for `apiPost`, `reviews/format.spec.ts`) |
| `apps/web`: `npx next build` (Turbopack) | exit 0, zero error, 17/17 routes; `/places/[slug]` still correctly `ƒ` dynamic |
| `packages/shared-types`: `npm run build` | exit 0 (rebuilt `dist/` so the new `review.ts` export resolves — was stale before this session, unrelated pre-existing state, not a regression introduced here) |

## 6. Known limitation — disclosed, not worked around

**The new migration was never run against a live database.** This machine has neither a running
Postgres instance nor Docker available (`docker ps` fails: no daemon; Docker Desktop is not
installed) — this is an environment constraint, not a choice. The SQL was written by directly
mirroring `InitEvent`'s already-proven structure (inline `REFERENCES`, `CHECK`, unique/plain
indexes, and the identical "FK the pre-existing nullable arc column now that its target table
exists" pattern used for `media.event_id`), and reviewed by eye, but **has not been executed**.
Whoever next has a local Postgres (or restores Docker) should run
`npm run migration:run --workspace=apps/api` before relying on this feature end-to-end, and watch
specifically for constraint-name collisions or a typo in the raw SQL — the one class of bug static
review cannot catch.

Similarly, **the UI was never exercised in a browser** for the same reason (no backend+DB to run
against locally). `next build` proves it compiles and doesn't break static generation; it does not
prove the star-rating form actually posts and re-renders correctly against a live API.

Frontend component-level testing remains structurally impossible under the current jest config
(`testMatch: ['**/*.spec.ts']`, `testEnvironment: 'node'`) — `ReviewsSection.tsx` has no
render/interaction test, matching this repository's pre-existing testing gap (roadmap item 6,
unchanged, out of scope for this task: reconfiguring jest for jsdom+RTL is its own bounded task,
not folded in here silently).

## 7. Not claimed

- Does not claim the reviews feature is fully built to the openapi.yaml spec — edit/delete/report/
  reply/vote and moderation remain open, each already has its own documented (unimplemented)
  endpoint.
- Does not claim the migration has been run against a real database (§6).
- Does not claim the MVP is feature-complete. Remaining Critical/High items: general place
  write/edit UI, hotel/restaurant/tour list pages, image upload UI, search filters, moderation
  queue UI, business-claim workflow, frontend component test infrastructure.
- Does not create PLACE-044 or any successor task, per the Owner's explicit instruction.
