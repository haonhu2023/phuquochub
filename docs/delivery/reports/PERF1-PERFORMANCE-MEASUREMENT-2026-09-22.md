# PERF1 — PERFORMANCE MEASUREMENT (LCP/CLS/TTFB, JS/IMAGE BYTES)

**Date:** 2026-09-22
**Scope:** measurement and documentation only, per the launch-readiness plan's PERF1 row.
**Depends on:** C1 (general cache/revalidation policy) — **C1 is NOT done** (deferred; see the S1
closing-pass note in the plan checkpoint). The numbers below are therefore a **baseline under
today's cache policy** (mostly `no-store`), not a "post-C1" measurement — there is no post-C1 state
to compare against yet. This report exists to give a real, reproducible starting point, not to
claim PERF1's own stated dependency was satisfied.

## 1. Environment

- Windows, Node (via `npm`), Next.js `16.3.0` (Turbopack build).
- Production build (`next build`, NOT `next dev`) measured for bundle size — dev-mode output is not
  representative (unminified, HMR overhead, inline source maps).
- Browser-side timing captured via the built-in browser pane (Chromium-based), against a
  **production build served with `next start`**, not the dev server.
- **Caveat on `next start`:** this repo's `next.config.mjs` sets `output: 'standalone'`; `next start`
  itself prints `"next start" does not work with "output: standalone" configuration. Use "node
  .next/standalone/server.js" instead.` The server still started and served real pages correctly
  (confirmed: correct HTML, correct `<title>`, zero console errors) — `next start` against the
  regular (non-standalone) `.next` build output is a valid way to run a REAL production build
  locally, just not the exact artifact Docker/production actually runs (`.next/standalone/server.js`
  — see `docker-compose.prod.yml`). Numbers below reflect "a real production build, locally served,"
  not "the exact production container."

## 2. Bundle size (JS/CSS bytes) — reproducible, no browser needed

### 2.1 Tooling fix (found and fixed as part of this measurement)

`apps/web/scripts/measure-bundle-size.mjs` already existed (from the 2026-08-02 baseline,
`docs/delivery/reports/FRONTEND-BUNDLE-SIZE-BASELINE-2026-08-02.md`) but its **route-level
estimates were silently broken** for every public route and had been since `[locale]` dynamic
routing was introduced (after that baseline was captured):

1. `ROUTE_DIRS` still pointed at the pre-locale paths (`app/(public)/search`, etc.) — the real build
   output is `app/[locale]/(public)/search`. Verified against the actual `.next/server/app/**`
   directory tree before fixing, not guessed.
2. Even after fixing the paths, the regex that parses `page_client-reference-manifest.js`
   (`globalThis.__RSC_MANIFEST\[[^\]]+\]\s*=\s*(\{.*\});?\s*$`) used a negated character class
   (`[^\]]+`) that cannot backtrack past a `]` — and every locale-scoped route's manifest key looks
   like `"/[locale]/(public)/search/page"`, which contains a `]` (closing `[locale]`) **before** the
   real closing bracket of the `__RSC_MANIFEST[...]` accessor. The regex silently failed to match
   for every one of these, reported as generic `"manifest not found"` (a mislabeled error — the file
   was found, the regex just didn't match its content). Changed to a lazy `.+?` (any char, can
   backtrack past an inner `]`) — confirmed fixed against real files, not assumed.

Before the fix: only `/dashboard` (no `[locale]` in its route) ever produced real numbers; every
other route silently reported "manifest not found" and was invisible to anyone reading this script's
output. Both are now fixed in the same file (`scripts/measure-bundle-size.mjs`); a new `/guide` and
`/dashboard/content` route were also added to the measured set since neither existed at the
2026-08-02 baseline.

### 2.2 Method (unchanged from baseline)

```bash
cd apps/web
rm -rf .next && npx next build
npm run measure-bundle
```

Reads the actual generated artifacts under `apps/web/.next` — never estimates, never reads from
`next build`'s console output.

### 2.3 Results vs. 2026-08-02 baseline

| Metric | 2026-08-02 baseline | 2026-09-22 (this report) | Δ |
|---|---|---|---|
| Total client JS — raw | 1468.1 KB | 1782.2 KB | +21.4% |
| Total client JS — gzip | 420.7 KB | 519.7 KB | **+23.5%** |
| Total client JS — Brotli | 356.7 KB | 443.1 KB | +24.2% |
| Total CSS — raw / gzip | 74.4 KB / 11.3 KB | 119.8 KB / 18.5 KB | +61% / +64% |
| Largest single chunk — gzip | 203.7 KB (MapLibre) | 205.8 KB (MapLibre) | +1% (stable) |
| JS file count | 39 | 62 | +23 files |
| Client-shipped source maps | 0 | 0 | unchanged |

**This crosses the baseline's own advisory threshold** ("warn if total client JS gzip increases by
more than 10%" — §11 of the 2026-08-02 report). Reported here factually, not silently: between
2026-08-02 and now this session alone shipped the guide CMS (editor + public pages + structured
data), the site-content CMS (S1), a new dashboard nav shell (N1/N2), place-detail i18n (G10/X1), and
the sitemap EN-indexability fix (SEO1) — each added real, non-trivial client code (a rich block
editor, a media picker, a 5-item nav, new dashboard pages). A +23.5% gzip increase against that much
genuinely new owner-facing functionality is not, on its face, an unexplained regression — but it is
a real number, and CLEAN1 (code cleanup, not yet done) or a dedicated bundle-diff pass would be the
right place to look for anything trimmable (e.g. whether the guide editor's block UI is fully
tree-shaken from routes that never render it).

### 2.4 Route-level estimates (NEW — the 2026-08-02 baseline could not produce these for any public
route due to the bug fixed in §2.1)

| Route | Chunks | Raw | Gzip |
|---|---|---|---|
| `/` (homepage) | 5 | 41.0 KB | 13.4 KB |
| `/search` | 6 | 35.6 KB | 12.3 KB |
| `/explore` | 7 | 812.5 KB | 219.3 KB |
| `/map` | 7 | 811.6 KB | 218.7 KB |
| `/hotels` | 6 | 35.1 KB | 12.2 KB |
| `/restaurants` | 6 | 36.0 KB | 12.4 KB |
| `/tours` | 6 | 37.9 KB | 12.8 KB |
| `/guide` | 4 | 29.5 KB | 10.1 KB |
| `/dashboard` | 5 | 37.0 KB | 12.3 KB |
| `/dashboard/content` | 5 | 49.2 KB | 16.1 KB |

`/explore` and `/map` remain the clear outliers (MapLibre GL JS, same attribution evidence as the
2026-08-02 baseline §7 — content markers `maplibregl`/WebGL shader source/`RTLTextPlugin` present
only in those two routes' chunk sets). Every other route — including the two genuinely new ones this
session added (`/guide`, `/dashboard/content`) — clusters in the same 10–16 KB gzip band the
baseline's non-map routes occupied (15.6–20.2 KB), i.e. new routes did not individually blow the
existing per-route budget; the aggregate JS growth in §2.3 is spread across many small additions,
not concentrated in one bloated route.

## 3. Browser-observed timing (real navigation, not synthetic)

Captured via the Navigation Timing API / PerformanceObserver against `http://localhost:3002` (the
`next start` production server from §1), homepage (`/vi`), after the page had already loaded once
(warm — see §4 limitation on cold-start not being isolated here).

| Metric | Value |
|---|---|
| TTFB (`responseStart - requestStart`) | 75–111 ms (varied slightly across repeated navigations, all local — no real network) |
| DOMContentLoaded | ~150–220 ms |
| Load event | ~210–230 ms |
| Document transfer size | 11.6 KB (HTML) |
| CLS (layout-shift, `buffered: true`, cumulative) | **0** — no layout shift observed during the measured window |

These are **local-loopback numbers on a development machine**, not numbers from a real network path,
real client device, or real production server under real load — they establish "does this page load
and settle without doing anything obviously pathological locally," not a production Core Web Vitals
baseline.

## 4. What could NOT be measured, and why (disclosed, not guessed around)

**LCP and FCP could not be captured in this session's automated browser environment.** Every attempt
(`performance.getEntriesByType('paint')`, `performance.getEntriesByType('largest-contentful-paint')`,
and a `PerformanceObserver` with `buffered: true` registered both before and after navigation)
returned empty. Root cause, confirmed directly: `document.visibilityState` reports `"hidden"` for
this tab even when fronted in the tool's own UI. Per the Paint Timing and Largest Contentful Paint
specs, browsers **do not fire these entries for a hidden page** — a page that "loads" in a
background/non-visible tab genuinely never has a first or largest contentful paint recorded, by
design (these metrics measure what a real viewer actually saw). This is a property of the automated
browser pane used in this session, not a bug in the application being measured, and not something
this report will paper over with an estimated or assumed number.

**Recommendation for real LCP/CLS/FCP/INP numbers:** run Lighthouse (Chrome DevTools → Lighthouse
tab, or `npx lighthouse http://localhost:3002/vi --view`) or PageSpeed Insights against a real,
visible browser tab, ideally against the actual deployed production URL (`phuquochub.com`) once a
candidate is live — those tools drive a genuinely visible/foregrounded page and do not hit this
limitation. That was not run as part of this pass; disclosed as NOT EXECUTED rather than
approximated, per this repo's own anti-fabrication convention (`docs/delivery/README.md`).

## 5. Summary (baseline values for future comparison)

| Metric | Value | Condition |
|---|---|---|
| Total client JS — gzip | 519.7 KB | production build, `next build` |
| Total client JS — Brotli | 443.1 KB | production build |
| Total CSS — gzip | 18.5 KB | production build |
| Largest chunk — gzip | 205.8 KB (MapLibre, `/map` + `/explore` only) | production build |
| Homepage (`/`) route JS — gzip | 13.4 KB | production build, route-manifest estimate |
| TTFB | 75–111 ms | local loopback, `next start`, warm |
| CLS | 0 | local loopback, warm, single homepage load |
| LCP / FCP | **NOT MEASURED** | automated browser reports page as always-hidden; see §4 |

## 6. Reproduction commands

```bash
# Bundle size (JS/CSS bytes) — fully reproducible, no browser needed
cd apps/web
rm -rf .next && npx next build
npm run measure-bundle              # human-readable
npm run measure-bundle -- --json    # machine-readable

# Real production server, for manual/Lighthouse testing
npm run start --workspace=apps/web -- -p 3002
npx lighthouse http://localhost:3002/vi --view   # NOT run as part of this pass
```
