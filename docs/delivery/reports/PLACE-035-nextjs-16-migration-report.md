# PLACE-035 — Next.js 14 → 16 Controlled Migration Execution

- **Date:** 2026-07-25
- **Authority:** Owner explicit authorization — "PLACE-035 — Next.js 14 to 16 Controlled Migration Execution", resolving the three open Owner decisions from the PLACE-034 decision gate (timing = now; ESLint flat-config migration bundled into this task; fetch-caching behavior = accept Next 16 defaults as-is).
- **Basis:** `docs/delivery/reports/PLACE-034-NEXTJS-16-DECISION-GATE-2026-07-25.md` (gate result `AUTHORIZED WITH CONDITIONS`) and its draft task authority `docs/delivery/tasks/PLACE-034.yaml`, adapted into the activated `docs/delivery/tasks/PLACE-035.yaml`.
- **Nature:** Framework dependency migration + forced ESLint flat-config migration + 5 mandatory async-params source conversions. No apps/api or packages/* change. No real deployment.
- **Repository:** `D:\Projects\PhuQuocHub` (branch `master`)
- **Toolchain:** Node v20.20.2 / npm 10.8.2 (pinned), Docker Desktop.

---

## Preconditions

| Check | Result |
|---|---|
| PLACE-032 completed | ✅ `state.yaml` `completed_tasks` |
| PLACE-033/034 findings persisted | ✅ report + draft task authority both exist |
| Working tree clean at start | ✅ |
| `current.task: none` at start | ✅ |
| No `PLACE-035.yaml` existed before this task | ✅ |
| Node v20.20.2 pinned | ✅ |
| Docker running, dev stack healthy | ✅ postgres/redis/minio |
| Owner decisions resolved | ✅ timing=now, ESLint bundled, fetch-caching defaults accepted |

---

## Dependency versions: before → after

| Package | Before | After |
|---|---|---|
| `next` | 14.2.35 | **16.2.11** |
| `eslint-config-next` | 14.2.35 | **16.2.11** |
| `eslint` | 8.57.1 | **9.39.5** |
| `react`, `react-dom` | 18.3.1 | **unchanged** |
| `typescript` | 5.9.3 (workspace-resolved) | **unchanged** |
| `maplibre-gl`, `jest`, `ts-jest` | unchanged | **unchanged** |
| All `apps/api` / `packages/*` dependencies | unchanged | **unchanged** — zero file touched |

`apps/web/package.json` diff is exactly the 3 approved dependency lines plus the `lint` script (`next lint` → `eslint . --max-warnings=0`, forced by `next lint`'s removal in Next 16). Confirmed via `git diff`.

## Dependency tree verification

`npm install --dry-run` (non-mutating, `git status` confirmed clean afterward) resolved cleanly with zero `ERESOLVE` before the real install was applied. Post-install: `next@16.2.11` and `react@18.3.1`/`react-dom@18.3.1` each resolve to a **single physical copy** throughout the tree (`npm ls --all`). `eslint` resolves to **two physical copies** — `9.39.5` at the root (what actually runs) and a nested `8.57.1` used only internally by `eslint-plugin-import`/`eslint-plugin-jsx-a11y`/`eslint-plugin-react` (three of `eslint-config-next`'s own sub-dependencies whose own peer ranges don't yet include ESLint 9). This is normal, expected npm resolution for the ESLint 8→9 ecosystem transition — not an `ERESOLVE` error, not a functional conflict (verified empirically: the flat-config lint run below is clean) — and is entirely a consequence of `eslint-config-next@16.2.11`'s own dependency graph, not an unapproved package choice on this task's part.

---

## ESLint flat-config migration

`apps/web/.eslintrc.json` (legacy, `{"root":true,"extends":"next/core-web-vitals"}`) removed and replaced with `apps/web/eslint.config.mjs`:

```js
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [...nextCoreWebVitals];

export default eslintConfig;
```

`eslint-config-next@16.2.11` ships a **native flat-config array** at `eslint-config-next/core-web-vitals` (no `FlatCompat` wrapper needed) — inspected directly (`node_modules/eslint-config-next/dist/core-web-vitals.js`) and confirmed to be the exact flat-config parallel of the legacy `next/core-web-vitals` preset (same plugin set: `@next/eslint-plugin-next`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, `typescript-eslint`). `lint` script changed to `eslint . --max-warnings=0` (forced — `next lint` is removed entirely in Next 16, not merely deprecated).

**One real lint delta surfaced by the bundled plugin version bump:** `eslint-plugin-react-hooks` jumped from the Next-14-line's `5.0.0-canary-...` to `7.1.1` (`eslint-config-next@16.2.11`'s own bundled dependency), which added the stricter `react-hooks/set-state-in-effect` rule to its `recommended` ruleset. This flagged one pre-existing pattern in `apps/web/src/modules/auth/AuthProvider.tsx:37` — a deliberate hydrate-once-on-mount call reading `localStorage` (no external-store subscription exists to replace it, and rearchitecting session hydration is out of this task's scope). Fixed with a single targeted, documented `eslint-disable-next-line` comment on that one line — consistent with this codebase's existing inline-disable convention (see `places/[slug]/page.tsx`'s own `@next/next/no-img-element` disable) — rather than a broad rule weakening or an out-of-scope architecture change. No other file, behavior, or rule was touched.

Lint result after the fix: `eslint . --max-warnings=0` → **exit 0, zero output** — identical `--max-warnings=0` discipline preserved.

---

## Mandatory async-params conversion (5 files)

All 5 dynamic-route files converted from `params: { slug: string }` to `params: Promise<{ slug: string }>` + `await params`, in both `generateMetadata` and the default page component:

| File | `generateMetadata` | Page component |
|---|---|---|
| `apps/web/src/app/(public)/events/[slug]/page.tsx` | ✅ | ✅ |
| `apps/web/src/app/(public)/hotels/[slug]/page.tsx` | ✅ | ✅ |
| `apps/web/src/app/(public)/places/[slug]/page.tsx` | ✅ | ✅ |
| `apps/web/src/app/(public)/restaurants/[slug]/page.tsx` | ✅ | ✅ |
| `apps/web/src/app/(public)/tours/[slug]/page.tsx` | ✅ | ✅ |

Purely mechanical: `const { slug } = await params;` added as the first line of each function, all downstream `params.slug` references replaced with `slug`. No other logic, error handling, or rendering changed. Confirmed via `grep -rn "params\.slug"` returning zero matches afterward. `tsc --noEmit` exit 0 confirms the `Promise<>` wrapper is correctly typed and awaited everywhere.

---

## Turbopack compatibility

`next.config.mjs` carries no custom Webpack configuration (`reactStrictMode`, `transpilePackages`, `output: 'standalone'` only) — confirmed by direct read before this task began. Next.js 16 defaults to Turbopack for `next build`.

**First build attempt showed repeated `"took more than 60 seconds, retrying"` warnings during static-page generation**, taking ~25 minutes total. Investigated rather than accepted at face value: this build ran concurrently with several other heavy background operations in this same session (a Docker image build, an `npm audit` pass, dependency installation) competing for the same host's CPU/disk/Docker-Desktop-VM resources. **Re-ran the identical build in isolation** (nothing else running): completed in **31 seconds total**, static-page generation in **1685ms**, zero retry warnings, identical 15-route output. This confirms the slowdown was self-inflicted host resource contention from this task's own concurrent tooling, not a genuine Turbopack incompatibility — Turbopack is fully compatible with this codebase as-is; no `--webpack` fallback flag was needed (the one conditional allowance PLACE-034's draft scope reserved for this scenario was not exercised).

---

## Focused verification + full regression

| Check | Baseline (Next 14.2.35) | After (Next 16.2.11) |
|---|---|---|
| Lint (web, flat config) | 0 warnings/errors | **0 warnings/errors** (after the 1 targeted disable above) |
| Typecheck (web) | exit 0 | **exit 0** |
| Unit tests (web) | 17/17, 3 suites | **17/17, 3 suites** — identical |
| Unit tests (api, unaffected) | — | **251/251, 34 suites** — identical to PLACE-032 baseline |
| E2e tests (api, unaffected) | — | **59/59, 10 suites** — identical to PLACE-032 baseline |
| Build (web) | 15 routes, clean | **15 routes, clean** — identical route set |
| Build (api, unaffected) | — | `nest build` exit 0 |

Zero test skipped, zero test weakened, zero test added (no application logic changed that would require new coverage — only mechanical `params` unwrapping and one lint-driven comment).

---

## Security audit comparison

Both runs use `npm audit --omit=dev` for apples-to-apples comparison with prior PLACE tasks' methodology.

| Finding | Baseline (Next 14) | After (Next 16) | Disposition |
|---|---|---|---|
| `brace-expansion` | high | high | unchanged, unrelated (typeorm-chain), out of scope |
| `glob` | high | high | unchanged, unrelated (typeorm-chain), out of scope |
| `minimatch` | high | high | unchanged, unrelated (typeorm-chain), out of scope |
| `typeorm` | high | high | unchanged, unrelated, out of scope |
| `typeorm-naming-strategies` | high | high | unchanged, unrelated, out of scope |
| `next` | high (range `9.3.4-canary.0 – 16.3.0-canary.5`) | high (range `9.3.4-canary.0 – 16.3.0-preview.7`) | **NOT closed** — see below |
| `postcss` | high (range `<=8.5.17`, top-level) | high (same 3 CVEs, same range, top-level) | **NOT closed** — see below |
| `sharp` | *(absent)* | high (range `<0.35.0`, libvips CVEs) | **NEW**, explained — see below |
| **Total (prod)** | **7** | **8** | +1, fully explained |

**Correcting an inherited assumption.** PLACE-032's report speculated the migration would close the `next`/`postcss` findings; PLACE-034's draft task authority AC6 repeated that assumption. Live re-verification here shows it was **false**, caught by tracing each finding's `via`/`range`/`nodes` fields rather than trusting the closure claim (the same discipline used throughout this session):

- **`next`**: its advisory range already spanned from an old canary version through a **near-current, still-unreleased canary/preview boundary** at baseline (`16.3.0-canary.5`) — this is npm audit's advisory data for a long-running bundle of Next.js CVEs with **no version boundary marking any release as fixed**. The exact same characteristic persists post-migration (boundary now `16.3.0-preview.7`, reflecting time passing, not a change this task made). `16.2.11` is the newest **stable** release; only unreleased canary/preview builds exist beyond the vulnerable range, and installing one would violate the approved package set (`^16.2.11`) and introduce real production instability — not done.
- **`postcss`**: baseline's top-level `postcss` finding (`node_modules/postcss`, same 3 CVEs, same `<=8.5.17` range) already existed before this migration. `postcss` is not a direct dependency anywhere in this repository (confirmed via `grep -rn '"postcss"' **/package.json` — zero hits); it is purely a transitive choice made internally by `next` itself, both at 14.2.35 and 16.2.11.
- **`sharp`** (genuinely new): `next@16.2.11` declares `sharp: ^0.34.5` as a **new** `optionalDependency` (for its image-optimization feature) that `next@14.2.35` did not have — confirmed via `npm view next@16.2.11 optionalDependencies` and absence in the baseline audit. Traced, explained, not an unapproved package choice.

Net effect: no unexplained new finding; the two findings previously hoped to close (`next`, `postcss`) remain open, blocked on upstream fixes outside this repository's control; one new, fully-traced finding (`sharp`) appears as a direct, unavoidable consequence of the approved `next@16.2.11` bump itself.

---

## Docker build and live runtime verification

**Baseline image** `phuquochub-web:place035-next14-baseline` built, tagged, retained.

**Migrated image** `phuquochub-web:place035-next16`: first build attempt failed with `npm error code EIDLETIMEOUT` (`registry.npmjs.org` idle timeout ~20 minutes into `npm ci`, inside the Docker build layer) — a transient network condition, not a code defect. Retried with explicit exit-code capture (avoiding a shell-pipeline exit-code-masking mistake made on the first attempt) — succeeded cleanly, `EXIT_CODE=0`.

Both images booted for live verification. Since no deployed environment exists, a NestJS API container (`phuquochub-api:place035-support`, built from the **unmodified** current API source, unaffected by this task) was run against the real dev Postgres/Redis to provide real data; the web container was run with `--network container:<api-container>` (a pure `docker run`-level wiring choice — no Dockerfile or app-code change) so its baked-in `NEXT_PUBLIC_API_URL=http://localhost:4000/api` default resolves correctly via a shared network namespace.

| Check | Baseline (Next 14) | Migrated (Next 16) |
|---|---|---|
| `/`, `/explore`, `/map`, `/login`, `/register`, `/search`, `/dashboard`, `/places`, `/events` | all `200` | all `200` — **identical** |
| Unknown route (`/nonexistent-xyz`) | `404` | `404` — **identical** |
| `/places/dinh-cau` (real seeded data) | `200`, title `Dinh Cậu · PhuQuocHub`, content rendered | `200` — **identical**, byte-identical title/content |
| `/events/nonexistent-slug`, `/hotels/nonexistent-slug`, `/restaurants/nonexistent-slug`, `/tours/nonexistent-slug` | all `404` (no seed data exists for these entity types — `hotels`/`restaurants`/`tours`/`events` tables are empty in the dev DB, confirmed via the API's own list endpoints) | all `404` — **identical** |
| `/places/nonexistent-slug` | `200` (not `404`) — a **pre-existing baseline quirk**, traced to `places/[slug]`'s own custom `not-found.tsx` + conditional `notFound()` call in its `catch` block; correct not-found UI (`Không tìm thấy địa điểm`) and fallback `<title>Địa điểm · PhuQuocHub</title>` both render correctly, only the HTTP status code is `200` instead of `404` | `200` — **identical reproduction**, same UI, same fallback title, same status quirk. Out of scope to fix (unrelated to this migration, present in the codebase before it, not a UI/behavior redesign this task is authorized to make). |
| SEO metadata (`og:title`, `og:description`, `og:type`, `twitter:card`, canonical link) on `/places/dinh-cau` | present | **identical**, all fields present and correct |
| Web container error logs | none | **none** |
| API correlation-ID / structured logging (PLACE-030 guarantee, unaffected by this task) | intact | **intact** — `X-Request-Id` header present, `/api/health` 200 |

---

## Rollback rehearsal

Full N16 → N14-baseline → N16 cycle, mirroring PLACE-031/032's proven mechanism:

1. `phuquochub-web:place035-next16` booted and verified (above).
2. **Rollback:** N16 web container stopped; `phuquochub-web:place035-next14-baseline` (retained from Phase 1) redeployed against the same running API container.
3. Re-verified: all static routes `200`, `/places/dinh-cau` real data renders correctly, API `/api/health` still `200`.
4. **Forward recovery:** N14-baseline stopped, N16 redeployed once more — all static routes `200`, `/places/dinh-cau` real data renders correctly, API `/api/health` still `200`.
5. **Zero database involvement confirmed:** `places`=49, `migrations`=20 — identical before, during, and after the entire rehearsal (the web app has no direct database access; this is a purely stateless, application-level rollback, exactly as `PLACE-035.yaml`'s rollback plan states).

---

## Cleanup

All verification containers (`phuquoc-web-place035`, `phuquoc-api-place035`) removed. The disposable API support image (`phuquochub-api:place035-support`, built from unmodified current API source purely to serve real data during web verification) removed. Both migration-relevant web images retained (`phuquochub-web:place035-next14-baseline`, `phuquochub-web:place035-next16`), per the rollback plan. Dev stack (`phuquoc-postgres`/`-redis`/`-minio`) confirmed healthy throughout and unaffected; `places`=49, `migrations`=20 unchanged from session start.

---

## Preserved guarantees

| Guarantee | Result |
|---|---|
| No apps/api or packages/* file touched | ✅ `git diff --stat` scoped, zero matches |
| React/Next single-copy dependency tree | ✅ |
| `--max-warnings=0` lint discipline preserved | ✅ |
| All 5 dynamic routes render real data correctly | ✅ (`places` — the only seeded entity type) |
| All 5 dynamic routes handle not-found gracefully | ✅ (identical behavior, including the one pre-existing status-code quirk, reproduced unchanged) |
| SEO metadata intact | ✅ |
| Zero database involvement in rollback | ✅ `places`=49, `migrations`=20 unchanged throughout |
| PLACE-030 observability (correlation ID, structured logs) unaffected | ✅ (API-side, untouched by this task) |
| Turbopack default build works, no `--webpack` fallback needed | ✅ |

---

## Unresolved limitations

- **`next`/`postcss` production audit findings remain open**, blocked on an upstream Next.js/PostCSS fix that does not yet exist in any stable release. Re-check on a future Next.js patch release.
- **`sharp` is a new production audit finding**, introduced unavoidably by `next@16.2.11`'s own `optionalDependencies`. No repository-level action can close it without an upstream `next`/`sharp` fix.
- **The pre-existing `/places/[slug]` not-found status-code quirk** (`200` instead of `404` for a nonexistent slug) was confirmed unchanged by this migration but was not fixed — it predates this task, is unrelated to the Next.js version, and fixing it would require touching `places/[slug]`'s error-handling logic beyond this task's mechanical async-params-conversion scope.
- **`hotels`/`restaurants`/`tours`/`events` dynamic routes could only be live-verified against a nonexistent slug** (graceful-404 path) — the dev database has zero seeded rows for these four entity types (`places`=49 is the only populated table), a pre-existing data-seeding gap unrelated to this migration.
- **The first Docker build attempt failed on a transient `npm ci` registry timeout** — not reproducible on retry; recorded here for completeness, not treated as a defect.
- **The first Turbopack build run showed misleading ~25-minute static-generation timing** due to self-inflicted concurrent resource contention from this same task's other background operations; the isolated re-run (31s total) is the trustworthy measurement.

## Rollback approach

Application-level: `git revert` of the migration commit(s) restores Next.js 14.2.35, `eslint`/`eslint-config-next` 8.x/14.x, the legacy `.eslintrc.json`, and synchronous `params` exactly — zero schema/data involvement (the web app has no direct database access). Deployment-level: identical to the rehearsal above — the pre-migration image tag (`phuquochub-web:place035-next14-baseline`) is proven to redeploy cleanly in both directions.

## Recommended next candidate

Per `docs/delivery/reports/PLACE-029-CANDIDATE-SELECTION-2026-07-24.md` and the `next_action.eligible_candidate_disposition` history in `state.yaml`, the remaining open items are: (1) Candidate D's monitoring-provider sub-scope (`OD2-6`), sequenced after a real deploy target exists and an Owner names a provider; (2) a future re-check of the `next`/`postcss`/`sharp` audit findings once an upstream fix ships in a stable Next.js/PostCSS release; (3) the `redis.health.ts` deprecated-API follow-up recorded by PLACE-032. No PLACE-036 is created by this task, per its own explicit instruction.
