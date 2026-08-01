# FRONTEND COMPONENT TEST COVERAGE FOUNDATION — FINAL STATUS

**Date:** 2026-08-01
**Milestone:** Frontend Component Test Coverage Foundation, per the approved governance
recommendation following the Transport documentation reconciliation. Establishes the first
reliable component/page rendering test pattern for `apps/web`. No new product behavior, no
backend/database change.

## 1. Preflight findings

- Next.js `^16.2.11`, React `^18.3.1`/`react-dom ^18.3.1`, Jest `^29.7.0`, `ts-jest ^29.2.5`
  (confirmed via `apps/web/package.json`, not assumed).
- 13 existing test files, all `*.spec.ts`, all pure logic/API-client tests (no rendering):
  `src/lib/{api,http,pagination}.spec.ts`, `src/modules/{attractions,auth,beaches,categories,
  restaurants,search,tours}/api/*.spec.ts`, `src/modules/auth/session.spec.ts`,
  `src/modules/reviews/format.spec.ts`, `src/modules/tours/format.spec.ts`.
- `apps/web/jest.config.js` had `testEnvironment: 'node'` globally, `testMatch: ['**/*.spec.ts']`
  (does not match `.spec.tsx`), and a ts-jest `globals` tsconfig override setting only
  `module`/`moduleResolution` — no JSX transform.
- `apps/web/tsconfig.json` has `jsx: "preserve"`, which does not work directly for ts-jest (needs
  an actual transform).
- No `@testing-library/*` package or `jest-environment-jsdom` installed anywhere in the repo
  (confirmed via `package.json` read, not assumed).
- No existing `jest.mock('next/navigation' | 'next/link' | 'next/image', ...)` anywhere in the
  repo (confirmed via grep) — this milestone establishes the first such mocks.
- Both candidate cards (`AttractionCard`, `HotelCard`) use a plain `<img>` (not `next/image`),
  wrapped in `next/link`'s `<Link>`.

## 2. Test tooling decision

Added exactly 3 devDependencies to `apps/web/package.json`:
`@testing-library/react@^16.3.2`, `@testing-library/jest-dom@^6.9.1`,
`jest-environment-jsdom@^29.7.0`.

**`@testing-library/user-event` deliberately NOT added.** Every required target component
(`SearchFilters`, `AttractionFilters`) only exposes plain `<select onChange>` controls — no text
input, no keyboard-sequence-dependent interaction, no drag/hover behavior. RTL's own
`fireEvent.change(...)` is a fully faithful simulation of "user picks an option" for a native
`<select>`; `user-event`'s only material advantage (more realistic event sequencing for things
like typing or focus order) does not apply here. Adding it would be unused tooling, contrary to
the "do not introduce unnecessary tooling" constraint.

No second test runner, no Storybook, no visual regression tooling introduced.

## 3. Files added

- `apps/web/jest.setup.ts` — `import '@testing-library/jest-dom';`, wired via
  `setupFilesAfterEnv`.
- `apps/web/jest.cssModuleMock.js` — a bare `Proxy` returning the accessed property name for any
  `*.module.css` import. Avoids adding the `identity-obj-proxy` package for a one-line need (no
  CSS module import had ever been exercised by a test before this milestone, since no prior test
  rendered a component).
- `apps/web/src/modules/attractions/AttractionCard.spec.tsx` (9 tests) — the representative
  presentational card. Covers: link target (`/places/{slug}`, not a dedicated attraction route),
  fallback initial vs. real `<img>` rendering, all-optional-fields-omitted-when-null/empty,
  rating with/without a count suffix, the verified badge, a localized `price_range` label, and
  `ward`/`short_description` rendering.
- `apps/web/src/components/ui/Pagination.spec.tsx` (7 tests) — the shared cross-module pagination
  component. Covers: renders nothing at `totalPages <= 1`, disabled prev/next at the first/last
  page, prev/next link hrefs shift by one page, current page is a non-linked `aria-current`
  element, ellipsis rendering for skipped ranges, and existing filter query-string preservation
  across page links.
- `apps/web/src/modules/search/SearchFilters.spec.tsx` (5 tests) — result count rendering,
  category options render from props, and 3 `updateParam` behaviors (set a param, clear a param
  back to "Tất cả", set a param while preserving other existing params) — all via a
  `jest.mock('next/navigation', ...)` stubbing `useRouter`/`useSearchParams`.
- `apps/web/src/modules/attractions/AttractionFilters.spec.tsx` (5 tests) — the representative
  browse filter component (chosen over `HotelFilters`; see §4). Result count, default `sort`
  value when absent, and the same 3 `updateParam` behaviors as `SearchFilters`.

## 4. Representative component selection

`AttractionFilters` was chosen over `HotelFilters` after reading both source files fresh:
`AttractionFilters` has 3 filter fields (`sort`, `ward`, `price_range`) vs. `HotelFilters`'s 2
(`sort`, `stars`) — objectively richer, matching the plan's own stated preference order
("AttractionFilters or HotelFilters").

`AttractionCard` was chosen as the card (paired with `AttractionFilters` in the same module, and
already read in full during Phase 1).

## 5. Page testing boundary

No full Server Component page-level tests were added. All 4 target areas are self-contained
Client/presentational components with clear prop boundaries — component-level tests give full
coverage of their actual logic (URL param read/write, conditional rendering) without the
brittleness of mocking an entire Server Component page's data-fetching tree. This matches the
plan's stated preference for component-level tests over full page rendering.

## 6. Mocking conventions established

- **`next/navigation`**: `jest.mock('next/navigation', () => ({ useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsString) }))`, declared per test file
  (only 2 consumers so far — not worth extracting to a shared reusable mock module yet).
- **`next/link`**: confirmed empirically (ran `AttractionCard.spec.tsx` before writing the rest)
  that `<Link>` renders correctly under jsdom + RTL with **no mock and no router context** —
  Next's App Router `Link` does not require one to render. No mock added, per "only where
  necessary."
- **`next/image`**: not needed — neither target card uses it (both use a plain `<img>`,
  confirmed by reading source).
- **CSS Modules**: `moduleNameMapper` entry for `\.module\.css$` → `jest.cssModuleMock.js`. Must
  be listed **before** the `^@/(.*)$` alias mapping in `moduleNameMapper` — Jest uses the first
  matching pattern, and `@/modules/x/y.module.css`-style imports would otherwise be caught by the
  alias mapper first and never reach the CSS mock. Discovered by a real test failure during
  Phase 3, not anticipated in the plan — documented here and in an inline code comment.

## 7. jest.config.js changes

- `testMatch` extended: `['**/*.spec.ts', '**/*.spec.tsx']`.
- `setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']` (new).
- `moduleNameMapper` gained the CSS module entry described above (ordered first).
- ts-jest `globals` tsconfig override gained `jsx: 'react-jsx'`. Applied globally (not
  conditionally) since it only affects files that actually contain JSX syntax; the 13
  pre-existing `.spec.ts` files have none and are unaffected.
- **`testEnvironment` was NOT changed globally** — it remains `'node'`. All 4 new component test
  files opt into jsdom individually via Jest's native `/** @jest-environment jsdom */` docblock
  pragma at the top of the file. This was the deliberate mechanism chosen (per the approved plan)
  specifically to avoid touching the execution environment of the 13 existing suites.

## 8. Quality requirements

All new tests are deterministic (no timers, no real network — `next/navigation` is mocked, no
component here makes a fetch call directly), behavior-focused (assert on rendered text/attributes
and mock call arguments, not on internal implementation), independent (each `it` renders fresh via
RTL, `push.mockClear()` / `searchParamsString` reset in `beforeEach`), and free of snapshot tests
or brittle full-HTML/className assertions — all assertions target `getByRole`/`getByText`/
`getByLabelText` and specific attribute values.

## 9. Validation results

| Check | Result |
|---|---|
| `apps/web` full test suite (`npx jest`) | **17 suites / 103 tests passed** (up from 13 suites / 77 tests) — zero regression in the 13 pre-existing suites |
| `apps/web` typecheck (`tsc --noEmit`) | clean |
| `apps/web` lint (`eslint . --max-warnings=0`) | clean |
| `apps/web` build (`next build`) | clean, all 17 routes generated |
| Full monorepo build (`npm run build`, turbo) | 4/4 tasks succeeded |
| Full monorepo test (`npm run test`, turbo) | 6/6 tasks succeeded — backend 80 suites/824 tests unaffected (no backend file touched) |
| Full monorepo typecheck (`npm run typecheck`, turbo) | 6/6 tasks succeeded, all 5 packages clean |
| Full monorepo lint (`npm run lint`, turbo) | 6/6 tasks succeeded, all 5 packages clean |
| `git diff --check` | no whitespace errors (only benign LF→CRLF autocrlf notices) |
| Secret scan (new/changed files) | no matches for key/token/secret/password patterns |

**One typecheck-time fixture bug caught and fixed during validation:** the first draft of
`AttractionCard.spec.tsx` used `verification_status: 'unverified'`, which is not a member of
`VerificationStatusValue` (`'pending' | 'verified' | 'official' | 'community_verified'`, defined
in `@phuquochub/shared-types`). Corrected to `'pending'` before typecheck passed — caught by
`tsc --noEmit`, not silently ignored.

**4 pre-existing high-severity `npm audit` findings** (`brace-expansion`, `postcss`, `sharp`) were
observed after installing the new devDependencies. Traced via `npm audit`'s own dependency paths
to `next`/`eslint`/`jest` transitive dependencies — **not** introduced by
`@testing-library/react`, `@testing-library/jest-dom`, or `jest-environment-jsdom`. Not fixed:
the only available fix (`npm audit fix --force`) would downgrade `next` to `9.3.3`, a breaking
change entirely out of this milestone's scope. Disclosed here rather than silently worked around.

## 10. Documentation and governance updates

- `docs/delivery/state.yaml`: new `current.task` comment entry and `next_action.objective` entry
  prepended, following the established ad-hoc convention (prior entries preserved under a
  `---- prior state (...) ----` marker).
- This report.
- No other documentation was stale as a result of this milestone (no API/data-model change).

## 11. Explicit exclusions honored

No new product behavior added. No backend code touched. No database schema touched. No Image
Upload UI or any other feature started after this milestone.

## 12. Deferred coverage (explicitly out of scope for this milestone)

- `HotelFilters`, `RestaurantFilters` (if any), `TourFilters`, and their corresponding cards
  (`HotelCard`, `RestaurantCard`, `TourCard`, `BeachCard`) are not yet covered — only one
  representative filter component and one representative card were required by the plan.
  `HotelCard`/`HotelFilters` were read and compared but deliberately not chosen (see §4).
- No full-page integration tests (Server Component data fetching + client filter component
  together) exist yet — see §5 for the reasoning.
- No visual/screenshot regression testing was introduced.
- `@testing-library/user-event` was not added; if a future component genuinely requires realistic
  multi-step keyboard/focus interaction (e.g. a combobox with type-ahead), that would be the
  trigger to reconsider adding it — not before.

## 13. Files changed summary

New:
- `apps/web/jest.setup.ts`
- `apps/web/jest.cssModuleMock.js`
- `apps/web/src/modules/attractions/AttractionCard.spec.tsx`
- `apps/web/src/components/ui/Pagination.spec.tsx`
- `apps/web/src/modules/search/SearchFilters.spec.tsx`
- `apps/web/src/modules/attractions/AttractionFilters.spec.tsx`
- `docs/delivery/reports/FRONTEND-COMPONENT-TEST-COVERAGE-2026-08-01.md` (this report)

Modified:
- `apps/web/package.json` (3 new devDependencies)
- `apps/web/jest.config.js` (testMatch, setupFilesAfterEnv, moduleNameMapper ordering, ts-jest
  `jsx` override)
- `package-lock.json` (dependency lock update)
- `docs/delivery/state.yaml` (governance entries)

## 14. Final git status

Clean after commit (see §16 for hashes).

## 15. Commit scope

Two scoped commits, per the plan:
- `test(web): establish component testing foundation` — tooling + jest.config.js + package.json +
  package-lock.json + the 4 new test files.
- `docs(web): record component test coverage milestone` — this report + state.yaml.

## 16. Commit hashes

| Commit | Scope |
|---|---|
| `1968309` | `test(web)`: component testing foundation |
| `06db3aa` | `docs(web)`: governance + this report |

(Filled in via a small follow-up commit once known, per repository convention.)

## 17. Pattern for future modules

To add a component test for a new module going forward:
1. Name the file `*.spec.tsx` (not `.spec.ts`) — required for JSX.
2. Add `/** @jest-environment jsdom */` as the first line of the file.
3. If the component uses `next/navigation` hooks, `jest.mock('next/navigation', () => ({ ... }))`
   at the top of the test file (see `AttractionFilters.spec.tsx` for the exact shape).
4. `next/link` and plain `<img>` need no mock. `next/image` has not yet been exercised by any
   test in this repo — if a future component uses it, mock it fresh and record the outcome here.
5. Prefer `fireEvent` over `@testing-library/user-event` unless the interaction genuinely needs
   realistic keystroke/focus sequencing.

## 18. Recommendation for next milestone

Not part of this report's scope to decide (per instruction: "Do not begin Image Upload UI or any
other feature after completing this milestone"). A fresh read-only governance assessment should
be requested separately, as with the prior two milestones.
