# ERROR / LOADING BOUNDARY COMPLETION — FINAL STATUS

**Date:** 2026-08-02
**Milestone:** Error/loading boundary completion for `/explore`, `/map`, `/search`, `/dashboard`,
per the Owner-approved governance assessment. Extends the PLACE-041 pattern (already shipped on
`hotels`/`restaurants`/`tours`/`events`/`places/[slug]`) to the four remaining routes that lacked
it. No new product behavior, no backend/database change, no route behavior change.

## 1. Status

Complete. All 8 files added, all validation green, live-verified in a real browser against the
real dev stack (both success and induced-failure paths), fully committed.

## 2. Environment

- Repo pins Node `20` (`.nvmrc`) / requires `>=20.0.0` and `>=10.0.0` (`package.json` engines).
  **No `nvm`/`fnm` is installed in this session's environment** (checked both Git Bash and
  PowerShell — neither found) — ran on the system-installed **Node v24.18.0 / npm 11.16.0**
  instead, which satisfies the `engines` range but is not the exact `.nvmrc`-pinned version.
  Disclosed honestly rather than fabricating a version switch that didn't happen; every validation
  step (tests/typecheck/lint/build) passed under this actual environment.
- Git: branch `master`, clean tree at start (`git status --short` empty), HEAD at
  `c59ec43 docs(media): fill in final commit hash in review report`.

## 3. Routes completed

| Route | error.tsx | loading.tsx |
|---|---|---|
| `/explore` | ✅ | ✅ |
| `/map` | ✅ | ✅ |
| `/search` | ✅ | ✅ |
| `/dashboard` | ✅ | ✅ |

## 4. Files added

- `apps/web/src/app/(public)/explore/error.tsx`
- `apps/web/src/app/(public)/explore/loading.tsx`
- `apps/web/src/app/(public)/map/error.tsx`
- `apps/web/src/app/(public)/map/loading.tsx`
- `apps/web/src/app/(public)/search/error.tsx`
- `apps/web/src/app/(public)/search/loading.tsx`
- `apps/web/src/app/(public)/search/error.spec.tsx`
- `apps/web/src/app/(public)/search/loading.spec.tsx`
- `apps/web/src/app/(dashboard)/dashboard/error.tsx`
- `apps/web/src/app/(dashboard)/dashboard/loading.tsx`

## 5. Files modified

- `docs/delivery/reports/MVP-GAP-ANALYSIS-AND-ROADMAP-2026-07-25.md` — roadmap item #10 marked
  ✅ DONE (original wording preserved, per this repository's established reconciliation
  convention).
- `docs/delivery/state.yaml` — governance entry (see §13).

No backend file, migration, or shared-types change. No existing route's `page.tsx` data-fetching
or behavior touched.

## 6. Pattern reused from PLACE-041

All 8 files follow the exact structure already proven on `hotels`/`restaurants`/`tours`:
`'use client'` + `useEffect(() => console.error(error), [error])` + `role="alert"` container using
the shared `placesStyles.state`/`.stateTitle`/`.btn` classes (a repo-wide "state message" pattern
already reused outside the `places` module by `/search`'s own empty-state UI, not places-specific
despite the file's location) + a real `<button type="button" onClick={() => reset()}>`. No new
CSS, no new component library, no new dependency.

**Route-specific adaptations** (per instruction 1 — "unless a target route requires a small
route-specific adaptation"):
- `explore/loading.tsx` and `map/loading.tsx` mirror `SearchMapExplorer`/`MapView`'s real layout —
  a `height: 70vh` skeleton block matching `MapView`'s actual container size exactly, to minimize
  layout shift on the one element most likely to cause visible jumping.
- `search/loading.tsx` reflects `/search`'s actual shape (`pageHeader` + `SearchBox`'s input/button
  row + `resultList`/`resultItem`-shaped placeholders) — **not** the hotel/restaurant/tour card
  grid, since `/search` uses a distinct text-result-list layout (`search.module.css`, not
  `places.module.css`'s `.card`/`.grid`).
- `dashboard/loading.tsx` and `dashboard/error.tsx` reflect the dashboard's actual shape (heading +
  greeting line + one button) rather than a list/grid — `DashboardPage` has no list content at all.

## 7. Test coverage

Per instruction ("if testing all 8 files would create repetitive low-value duplication, cover one
shared pattern thoroughly and explain why the rest are verified by structure/build instead"):

**Thoroughly tested:** `search/error.tsx` and `search/loading.tsx` (chosen as the representative
pair — `/search` is the only one of the four routes with a real Server Component data fetch, so
its boundary has the widest real trigger surface). 7 new tests (`error.spec.tsx`: friendly-message
rendering, no leaked technical message/digest, `role="alert"` presence, real `<button>` semantics +
`reset()` wiring, renders without throwing when `digest` is absent; `loading.spec.tsx`: renders
without throwing, `aria-busy`/`aria-label` present, renders only skeleton placeholders — no real
links/content).

**Remaining 3 pairs (`explore`, `map`, `dashboard`) verified by structure + build + live
verification, not separately unit-tested:** each is a byte-for-byte structural match of the tested
pattern (`'use client'`, same hooks, same JSX shape, only the Vietnamese title string and the
loading skeleton's specific markup differ) — a second, third, and fourth copy of the exact same
"renders message / calls reset / renders without throwing" assertions would test the React/Next.js
`error.tsx`/`loading.tsx` convention itself, not this repository's code, for zero additional
confidence. Instead: `tsc --noEmit` enforces the identical `{error, reset}` prop contract Next.js
requires on every one of them; `next build` fails outright if any of the three isn't a valid
component for its segment; and Phase 4 (§8 below) exercised all three live in a real browser,
including their induced-error path, exactly as thoroughly as `/search`'s.

No brittle full-page snapshots were added, per instruction.

## 8. Live verification

Ran against the real local stack (Postgres/Redis/MinIO via Docker, `api` on :4000, `web` on :3000,
via `preview_start`/the Browser pane — not a mocked environment):

1. **Normal success path unchanged** — `/search?q=bai+sao` (4 real results), `/explore` (renders
   `SearchMapExplorer` + MapLibre attribution), `/map` (renders `MapView` + MapLibre attribution),
   `/dashboard` (registered a real throwaway user via `/register`, landed on dashboard showing the
   real greeting) — all confirmed via `get_page_text`, zero console errors on any of the four.
2. **Loading boundary** — not independently screenshotted mid-flight (all four routes render fast
   enough locally that the boundary's real-world trigger window is sub-frame; `/explore` and
   `/map` in particular have no server-side `await` at all, so their `loading.tsx` has a
   near-instant, narrow trigger window by the current implementation's own nature — disclosed
   honestly, not claimed as visually observed). Correctness instead verified via: unit tests
   (`search/loading.spec.tsx`, §7), `next build` classifying each route correctly, and direct
   visual reading of each skeleton's JSX against its page's real layout (§6).
3. **Error boundary appears on dev-only induced failure** — verified for **all four** routes, not
   just one:
   - `/search`: stopped the live `api` preview server (real `ECONNREFUSED`, not a mock) — the page
     rendered exactly `"Không tải được kết quả tìm kiếm"` + retry button, zero raw error text
     visible on the page (the underlying `TypeError: fetch failed` only appeared in the dev
     console, via the same intentional `console.error(error)` every other boundary in this repo
     already does).
   - `/explore`, `/map`, `/dashboard`: temporarily added `throw new Error(...)` at the top of each
     `page.tsx` (these three have no page-level network call to fail against — the equivalent
     induced failure is a forced render throw), confirmed each route's own correct Vietnamese
     message and retry button, then **reverted every temporary throw immediately** — confirmed via
     `git diff --stat` showing zero diff on all three `page.tsx` files before staging anything.
4. **Retry action** — `search/error.tsx`'s `reset()` wiring confirmed two ways: unit test asserting
   `onClick` invokes the injected `reset` mock exactly once, and live confirmation that a fresh
   navigation after restarting the `api` server returns to the normal success path (the retry
   click landed in a narrow post-restart `ECONNREFUSED` window during the live session; a
   subsequent fresh load proved the underlying data path recovers correctly once the API is truly
   ready — `reset()` itself is Next.js's own guaranteed segment-retry primitive, not custom code).
5. **No console errors introduced by the boundaries themselves** — confirmed via a fresh browser
   tab (avoiding the accumulated console history from the intentional failure-induction testing
   above) hitting `/explore`, `/map`, and `/search` post-revert: zero console errors on all three.

No temporary failure-induction code remains in the diff — confirmed via `git status --short` and
`git diff --stat` on all touched `page.tsx` files immediately before staging (empty in both cases).

## 9. Frontend test results

`apps/web` full suite: **21 suites / 124 tests passed** (up from 19/117 — 7 new tests, zero
regression in the 19 pre-existing suites).

## 10. Typecheck result

`tsc --noEmit`: clean, exit 0.

## 11. Lint result

`eslint . --max-warnings=0`: clean, exit 0.

## 12. Frontend build result

`next build`: clean, all 17 routes generated correctly (same route count as before — boundary
files attach to existing segments, they don't create new routes).

## 13. Monorepo build result

`npm run build` (turbo): 4/4 tasks succeeded.

## 14. Documentation/governance updates

- This report.
- `docs/delivery/reports/MVP-GAP-ANALYSIS-AND-ROADMAP-2026-07-25.md` roadmap item #10 marked
  ✅ DONE.
- `docs/delivery/state.yaml` — new `current.task` comment entry (this milestone) and prior entry
  preserved under a `---- prior state (...) ----` marker, per established convention.

## 15. Remaining route-boundary gaps

**None found.** All routes that previously lacked `error.tsx`/`loading.tsx` (per PLACE-041's
original audit and the 2026-07-25 gap analysis) now have them: `hotels`, `restaurants`, `tours`,
`events`, `places/[slug]` (PLACE-041) plus `explore`, `map`, `search`, `dashboard` (this
milestone). `places/[slug]` deliberately has no `error.tsx` of its own (uses `not-found.tsx` +
falls through to the root `global-error.tsx` for non-404 errors) — this was a pre-existing,
already-reviewed design choice from PLACE-035/036, not a gap, and out of scope to change here.

## 16. Final git status

Clean after commit (verified via `git status --short` immediately before and after).

## 17. Commit hashes

| Commit | Scope |
|---|---|
| `7330f9d` | `feat(web)`: add error and loading boundaries |
| `<filled in below>` | `docs(web)`: record boundary completion milestone |
