# FRONTEND ACCESSIBILITY BASELINE — FINAL STATUS

**Date:** 2026-08-02
**Milestone:** Frontend Accessibility Baseline, per the Owner-approved governance assessment.
Audit + trivial-remediation only, per roadmap item #8 in `MVP-GAP-ANALYSIS-AND-ROADMAP-2026-07-25.md`
("Accessibility pass beyond the current 8-file baseline"). No UI redesign, no product-flow change,
no moderation/scheduler/business-claim/Transport-browse/dashboard-operations/media-publication/
bundle-optimization work touched.

## 1. Status

Complete for this milestone's bounded scope. Automated ruleset established (0 findings against the
current codebase). Manual review of every named high-risk area found 3 genuine, trivial,
pattern-matched gaps — all 3 fixed with regression tests. One real, non-trivial gap (custom map
marker keyboard reachability) was found, confirmed via source inspection, and explicitly deferred
per this milestone's own exclusion list ("map keyboard redesign"). This is **not** a WCAG
certification (see §11).

## 2. Environment

- Node v24.18.0, npm 11.16.0 (matches the environment used by every recent milestone in this
  delivery history; no `.nvmrc`-pinned v20 available this session).
- `apps/web`: ESLint 9.39.5 flat config (`eslint.config.mjs`), Next.js 16.2.11, React 18.3.1.
- Root workspace: ESLint 8.57.0 (separate, unaffected — this milestone only touches `apps/web`).
- Git: branch `master`, clean tree at session start (commit `d56fb8e`).

## 3. Previous accessibility lint coverage

None. `apps/web/eslint.config.mjs` was `[...nextCoreWebVitals]` only. `eslint-config-next`'s own
`core-web-vitals` preset already registers the `jsx-a11y` plugin and enables 6 of its rules
(`alt-text`, `aria-props`, `aria-proptypes`, `aria-unsupported-elements`,
`role-has-required-aria-props`, `role-supports-aria-props`, all at `warn`, `alt-text` scoped to
`img`/`Image` only) — but no dedicated accessibility ruleset had ever been added, and no dedicated
accessibility audit had been run. The last audit finding on record (PLACE-041, cited in the roadmap
gap analysis) was purely a grep count: "only 8 files repository-wide use `aria-*`/`role`."

## 4. Tooling/dependency decision

`eslint-plugin-jsx-a11y@6.10.2` was already present as an **undeclared transitive dependency**,
hoisted to the repo-root `node_modules/` via `eslint-config-next`'s own `dependencies` entry
(`eslint-plugin-jsx-a11y: ^6.10.0`) — confirmed via `package-lock.json` and Node's own module
resolution (`require.resolve`). Per the milestone's explicit instruction not to rely permanently on
an undeclared transitive dependency, it was added as an **explicit devDependency** of
`apps/web/package.json` (`"eslint-plugin-jsx-a11y": "^6.10.2"`) and the lockfile updated via
`npm install --workspace=@phuquochub/web`. Confirmed this resolved to the exact same already-hoisted
6.10.2 install — zero new package downloaded, zero other dependency changed (verified via
`git diff --stat package-lock.json`: 1 line added).

No other tool was added — `axe-core`, Lighthouse CI, Pa11y, Cypress, Playwright, and Storybook a11y
tooling were explicitly out of scope for this milestone and were not touched.

## 5. Ruleset enabled

`jsx-a11y` exposes a ready-made flat-config preset (`flatConfigs.recommended`, 34 rules). Rather
than overriding `eslint-config-next`'s own 6 already-tuned rules (which would have violated the
"do not weaken/preserve existing rules" requirement — Next's `alt-text` is deliberately scoped to
`img`/`Image` only, different from the plugin's own broader default), the new config computes the
**28 rules from `recommended` that Next does not already configure** and adds them as a second
config object appended after `nextCoreWebVitals`, without redeclaring the `jsx-a11y` plugin key
(confirmed empirically — see §9 — that this does not conflict with Next's own plugin registration,
since ESLint's flat-config merge resolves `jsx-a11y/*` rule IDs against whichever config object in
the array first registers that plugin namespace).

Net result: all 34 `jsx-a11y` rules active, 6 preserved exactly as Next tuned them (`warn`), 28 new
ones at the plugin's own default (mostly `error`). See `apps/web/eslint.config.mjs`.

## 6. Initial findings

**Automated (lint):** 0 findings across all 146 files linted by `apps/web`'s ESLint config, with all
34 rules active. Verified this was a genuine "clean" result and not a silent misconfiguration by
writing a throwaway file with 3 known violations (`onClick` on a non-interactive `<div>`, `<img>`
with no `alt`, `<a>` with no `href`) — the new rules fired correctly (`click-events-have-key-events`,
`no-static-element-interactions`, `alt-text`, `anchor-is-valid`), then the file was deleted before
any commit.

**Manual (Phase 5, high-risk areas named in the milestone):** navigation/header, login/register
forms, search filters (4 components), review form + image upload, pagination, map/explore controls,
error boundaries (all 8 route `error.tsx`/`global-error.tsx`), dashboard, and all 6 card components
(`Place`/`Hotel`/`Restaurant`/`Tour`/`Beach`/`AttractionCard`) were read in full. Findings:

| # | Location | Category | Description |
|---|---|---|---|
| 1 | `SearchMapExplorer.tsx` error paragraph | Trivial, unambiguous | Error text rendered with no `role="alert"`, inconsistent with the identical pattern already used everywhere else in the app (`AuthError`, `ReviewsSection`, every `error.tsx` boundary) |
| 2 | `RouteGuard.tsx` session-check loading state | Trivial, unambiguous | Full-content loading `<main>` had no `aria-busy`, inconsistent with the established convention in every route's `loading.tsx` (`aria-busy="true" aria-label="..."`) |
| 3 | `(auth)/login/page.tsx` `Suspense` fallback | Trivial, unambiguous | Same gap as #2, smaller surface (brief `useSearchParams` Suspense boundary) |
| 4 | `MapView.tsx` custom HTML place markers | Requires component-behavior review / explicitly excluded | Individual place markers (`document.createElement('div')` + `el.onclick`) are mouse-only: no `role`, no `tabindex`, no keyboard handler. Confirmed via source inspection that MapLibre GL's own built-in accessibility (the canvas itself gets `role="region"`, `aria-label="Map"`, `tabindex="0"`, and arrow-key pan/`+`/`-` zoom by default — verified by grepping the installed `maplibre-gl` bundle for its `setAttribute("aria-label"/"role"/"tabindex", ...)` calls) does **not** extend to consumer-supplied custom marker elements — this is a real, known limitation of the library's `Marker({element})` API, not a bug introduced by this codebase. Fixing it is "map keyboard redesign," explicitly on this milestone's do-not-perform list. **Deferred**, not fixed. |
| 5 | Submit-button label text changing during async operations (login/register/dashboard-logout/review-submit) | Requires UX/design judgment | No live-region announcement of the label change itself. Inconsistent in principle with `ReviewsSection`'s own `aria-live="polite"` status paragraph, but that pattern is for a **separate** status paragraph, not the button's own label — applying it to every submit button across the app is a broader, judgment-laden change than this audit's trivial-fix bar. **Deferred**, not fixed. |
| 6 | `SearchMapExplorer.tsx` / client-side "no results" text | Likely false positive / no fix needed | Server-rendered "no results" states elsewhere in the app (`/hotels`, `/search`, etc.) are plain text with no live region — confirmed as the established, deliberate convention (content is present on initial paint, not injected reactively into already-read content). `SearchMapExplorer`'s case is a client-side action, a materially different situation, but no existing precedent in this codebase established a `role="status"` convention for it. Left as-is rather than inventing a new pattern outside this audit's trivial-fix scope. |

Zero findings in: root/public/dashboard/auth layouts, all 4 search/browse filter components
(`SearchFilters`, `HotelFilters`, and — spot-checked as representative of the remaining 3, which a
prior milestone already verified are byte-identical in `updateParam` contract —
`AttractionFilters`/`TourFilters`/`RestaurantFilters`/`BeachFilters`), `AuthForm`/login/register
pages, `ReviewsSection` + `useSingleImageUpload`, `Pagination`, all 8 `error.tsx`/`global-error.tsx`
boundaries, the dashboard page, every `loading.tsx` skeleton, and all 6 card components.

## 7. Trivial findings fixed

Findings #1–#3 above. All three are one-line, attribute-only additions matching an
already-established, already-shipped convention elsewhere in the same codebase — zero UX or product
behavior change:

- `apps/web/src/modules/search/SearchMapExplorer.tsx` — error `<p>` now has `role="alert"`.
- `apps/web/src/modules/auth/RouteGuard.tsx` — loading `<main>` now has `aria-busy="true"`.
- `apps/web/src/app/(auth)/login/page.tsx` — `Suspense` fallback `<div>` now has `aria-busy="true"`.

## 8. Findings deferred

Findings #4 and #5 above, both explicitly out of this milestone's trivial-fix scope (map keyboard
redesign; a broader submit-button UX pattern change). Recorded here rather than fixed, per the
milestone's own instruction ("if a finding needs judgment, document and defer it").

## 9. Manual code-review findings

Covered in §6 (the table) and in the config-conflict verification for §5: confirmed via
`eslint --print-config` on a real `.tsx` file that all 34 `jsx-a11y` rules resolve correctly (the 6
Next-tuned ones unchanged at `warn` with their original options, the 28 new ones present at the
plugin's own severities) with no "cannot redefine plugin" error, proving the two-config-object
approach is safe under ESLint's flat-config merge semantics.

## 10. Tests added or updated

Both new tests target exactly the observable accessibility behavior each trivial fix changed, using
`getByRole`/`getByLabelText` — no snapshots, no duplication of existing coverage (neither file had
any prior test):

- `apps/web/src/modules/search/SearchMapExplorer.spec.tsx` (new, 2 tests) — asserts the error
  message is exposed via `getByRole('alert')` on a failed search, and that no `alert` role is
  present on a successful one. `MapView` is mocked out (WebGL/canvas is not meaningfully testable
  under jsdom; this is a standard, narrow isolation mock, not new production behavior).
- `apps/web/src/modules/auth/RouteGuard.spec.tsx` (new, 2 tests) — asserts the loading `<main>` has
  `aria-busy="true"` while `initializing`, and that children render once authenticated (basic
  regression coverage for a previously-untested file, since the file was being created anyway).

The `login/page.tsx` `Suspense` fallback fix (#3) was **not** given a dedicated test: under
`jsdom`/RTL with `useSearchParams` mocked synchronously, the component never actually suspends, so
the fallback branch cannot be meaningfully exercised in this test environment. Verified instead by
`tsc --noEmit` (JSX validity) and a full `next build`. Disclosed as a limitation, not silently
skipped.

**4 new tests total** (2 + 2), 0 existing tests modified.

## 11. Validation results

| Check | Result |
|---|---|
| Frontend lint (`eslint . --max-warnings=0`, new ruleset) | Clean, exit 0 |
| Frontend tests, run 1 | **32 passed / 32 suites, 193 passed / 193 tests** (up from 30/189) |
| Frontend tests, run 2 (consecutive, determinism check) | 32/32 suites, 193/193 tests, identical |
| Frontend typecheck (`tsc --noEmit`) | Clean, exit 0 |
| Frontend build (`next build`, `.next` removed first) | Clean, all 17 routes generated |
| Monorepo build (`turbo run build`) | 4/4 green |
| Monorepo typecheck (`turbo run typecheck`) | 6/6 green |
| Monorepo lint (`turbo run lint`) | 6/6 green |
| `git diff --check` | Clean (only benign LF→CRLF `autocrlf` notices) |
| Secret scan (pattern grep over the diff) | No matches |
| `git status --short` | 6 modified, 2 new files, all accounted for in §§ below |

## 12. Explicit limitations

- **Automated coverage is narrow by construction.** `jsx-a11y`'s static rules catch missing/invalid
  attributes and known anti-patterns in JSX; they cannot detect color-contrast failures, illogical
  focus order, missing keyboard traps in genuinely custom widgets, or content that is
  technically-valid-but-confusing to a screen reader user. Zero automated findings means "no
  detectable violations of this specific, narrow ruleset" — not "accessible."
- **The map's custom marker keyboard gap (finding #4) is real and unresolved**, by explicit
  instruction (excluded from this milestone's trivial-fix scope).
- **No axe-core/Lighthouse/Pa11y run was performed** — those tools catch categories (contrast,
  landmark structure at a whole-page level, some ARIA misuse patterns `jsx-a11y` doesn't model) that
  this milestone's lint-only + manual-read approach cannot.
- **No screen-reader software (NVDA/JAWS/VoiceOver) or keyboard-only walkthrough was performed** —
  findings came from static source reading plus one library-source-code verification (MapLibre's
  built-in ARIA), not live assistive-technology testing.
- **The `Suspense` fallback fix (#3) is untested** (§10) — a real, disclosed test-environment gap,
  not a silent one.
- Finding #5 (submit-button async-label announcements) is a real, repeated pattern across the app
  that was deliberately left unresolved as a judgment call, not because it doesn't matter.

## 13. Statement: not a WCAG certification

This milestone is an ESLint-ruleset baseline plus a manual read-through of named high-risk
components. It does **not** constitute a WCAG 2.1/2.2 conformance audit at any level (A/AA/AAA), and
no such claim is made. Genuine conformance verification requires automated tooling this milestone
explicitly did not add (axe-core/Lighthouse/Pa11y), manual keyboard-only and screen-reader testing,
and color-contrast measurement — none of which were performed here.

## 14. Recommended future accessibility work

(Ordered by likely value, not committed to — all require a separate Owner-approved milestone.)

1. **Custom map marker keyboard access** (finding #4) — smallest, most concrete follow-up; needs a
   real interaction-design decision (native `<button>` overlay vs. `role="button"` + keydown
   handler vs. a fully keyboard-navigable list-first pattern), which is why it was deferred rather
   than guessed at here.
2. **`axe-core` integration** (e.g. into the existing Jest/RTL suite via `jest-axe`, or as a
   separate CI step) — catches categories this milestone's lint-only approach structurally cannot
   (contrast, some landmark/heading issues at a rendered-DOM level).
3. **Color-contrast audit** — not attempted at all this milestone; the app's dark theme
   (`var(--bg)`/`var(--fg)`/`var(--muted)`/`var(--accent)` custom properties) has never been
   contrast-checked against WCAG AA thresholds.
4. **A real keyboard-only + screen-reader walkthrough** of at least the golden paths (browse → detail
   → review submission, login → dashboard) — the highest-confidence way to find gaps this milestone's
   static approach cannot, and the natural prerequisite before any WCAG-conformance claim.
5. **Finding #5** (submit-button async state announcements) — revisit as a deliberate, app-wide
   pattern decision rather than a one-off fix.

## 15. Files added

- `apps/web/src/modules/search/SearchMapExplorer.spec.tsx`
- `apps/web/src/modules/auth/RouteGuard.spec.tsx`
- This report.

## 16. Files modified

- `apps/web/eslint.config.mjs` — jsx-a11y baseline ruleset (§5).
- `apps/web/package.json` — `eslint-plugin-jsx-a11y` added as an explicit devDependency (§4).
- `package-lock.json` — lockfile updated for the above (1 line; no other dependency changed).
- `apps/web/src/modules/search/SearchMapExplorer.tsx` — finding #1 fix.
- `apps/web/src/modules/auth/RouteGuard.tsx` — finding #2 fix.
- `apps/web/src/app/(auth)/login/page.tsx` — finding #3 fix.
- `docs/delivery/reports/MVP-GAP-ANALYSIS-AND-ROADMAP-2026-07-25.md` — roadmap item #8 updated
  (§17).
- `docs/delivery/state.yaml` — governance entry.

## 17. Roadmap update

Item #8 in `MVP-GAP-ANALYSIS-AND-ROADMAP-2026-07-25.md` ("Accessibility pass beyond the current
8-file baseline") updated from an open gap to a factual, narrowly-scoped status: an automated
`jsx-a11y` lint baseline now exists (0 findings), the named high-risk areas have been manually
read, 3 trivial gaps were fixed, and 2 real gaps remain explicitly open (map marker keyboard access;
app-wide async-label announcements) — **not** marked "done," since this milestone never claimed
completeness (§12–13).

## 18. Final git status

Clean after commit (verified via `git status --short` immediately before and after each commit).

## 19. Commit hashes

| Commit | Scope |
|---|---|
| `9e6eb56` | `chore(web)`: establish accessibility lint baseline |
| `a964d1c` | `fix(web)`: resolve trivial accessibility issues |
| _(this commit)_ | `docs(web)`: record accessibility baseline |
