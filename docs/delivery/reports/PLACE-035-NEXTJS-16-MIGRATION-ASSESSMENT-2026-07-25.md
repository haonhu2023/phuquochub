# PLACE-035 — Next.js 16 Migration Assessment (Before/After)

- **Date:** 2026-07-25
- **Scope:** Standalone technical assessment of the Next.js 14 → 16 migration's actual effect, separate from the narrative completion report.

---

## Dependency versions before and after

See `PLACE-035-nextjs-16-migration-report.md` §"Dependency versions" for the full table. Summary: 3 packages bumped (`next` 14.2.35 → 16.2.11, `eslint-config-next` 14.2.35 → 16.2.11, `eslint` 8.57.1 → 9.39.5), plus the `lint` script changed (`next lint` → `eslint . --max-warnings=0`, forced by `next lint`'s complete removal in Next 16). Every "must remain unchanged" package (`react`, `react-dom`, `typescript`, `maplibre-gl`, `jest`, `ts-jest`, Node.js version, all `apps/api`/`packages/*` dependencies) is byte-identical to before. `apps/api/package.json` has zero diff.

## Package-lock impact

The lockfile diff reflects `eslint@9`'s substantially larger dependency tree (dozens of new `@eslint/*`/`@humanfs/*`/`@humanwhocodes/*`/`@unrs/*` packages) plus `next@16`'s own updated transitive tree (`@swc/helpers`, `styled-jsx`, platform-specific `@next/swc-*` binaries, a new `sharp` optional dependency). No package outside the 3 approved lines' own transitive closure was affected — verified via `npm ls next react react-dom typescript --all` showing each at a single, correct, expected version.

## ESLint migration impact

The migration from `.eslintrc.json` to `eslint.config.mjs` was **forced**, not optional — `eslint-config-next@16.2.11` declares a hard peer of `eslint>=9.0.0`, and `next lint` (the CLI wrapper that made the legacy config format tolerable) is removed entirely in Next 16, not merely deprecated. `eslint-config-next@16` ships its own native flat-config array at `eslint-config-next/core-web-vitals` — inspected directly and confirmed to bundle the same plugin set as the legacy `next/core-web-vitals` preset (`@next/eslint-plugin-next`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, `typescript-eslint`), so no rule was dropped or substituted — only the config *format* changed, not its semantic content.

**One real behavioral delta surfaced, root-caused precisely:** `eslint-plugin-react-hooks` jumped from a Next-14-line canary build to the bundled `7.1.1` release, which added `react-hooks/set-state-in-effect` to its `recommended` ruleset — a genuinely new rule, not a config mistake on this task's part. It flagged one pre-existing, deliberate hydrate-on-mount pattern in `AuthProvider.tsx`. Resolved with a single targeted `eslint-disable-next-line` comment (not a blanket rule disable, not a rearchitecture) — the smallest change that restores `--max-warnings=0` without touching runtime behavior or expanding this task's scope beyond its authorized file list.

## Async-params conversion impact

**Zero runtime behavior change**, confirmed multiple ways: (1) `tsc --noEmit` passes, proving every `Promise<{slug:string}>` is correctly awaited before use; (2) `eslint` passes, confirming no stale sync-`params` reference survives; (3) live Docker verification shows byte-identical HTTP status codes, page titles, and body content on both the real-data route (`/places/dinh-cau`) and all four graceful-not-found routes, comparing the Next-16 image directly against the retained Next-14 baseline image. The conversion is exactly what Next.js's own migration guide prescribes for this breaking change — `params` becoming a `Promise` in dynamic route segments — applied identically across all 5 affected files with no divergence in pattern.

## Turbopack compatibility results

Genuinely compatible, confirmed by an isolated, contention-free build completing in 31 seconds (1.7s of that in static-page generation) with zero warnings or retries. The initial alarming 25-minute run with repeated 60-second timeout retries was investigated rather than dismissed or silently accepted: it was reproduced to be an artifact of this task's own concurrent background load (a simultaneous Docker image build and `npm audit` pass competing for the same host resources), not a Turbopack/Next-16 defect. No `next.config.mjs` change, no `--webpack` fallback flag, and no build-tooling workaround were needed — the codebase carried no custom Webpack configuration to migrate in the first place.

## Security audit results — a corrected expectation

| Scope | Before | After | Change |
|---|---|---|---|
| Production (`--omit=dev`) | 7 | **8** | **+1**, fully explained |
| Incl. dev | (not separately captured at Next-14 baseline in this task) | **44** | driven by `eslint@9`'s larger dev-only tree; zero production risk implication |

This is the one place this task's actual finding diverges materially from what PLACE-032's report and PLACE-034's draft task authority both assumed ("the Next.js migration will close the `next`/`postcss` findings"). Re-tracing each finding's `via`/`range`/`nodes` fields — the same discipline applied throughout every prior PLACE dependency task this session — showed that assumption does not hold:

- `next`'s own advisory entry already had an open-ended range at the Next-14 baseline (extending through a **near-current, unreleased** canary/preview boundary) — there is no stable Next.js release, at 14.x or 16.x, that npm's advisory database currently marks as fixed for this bundle of CVEs.
- `postcss`'s top-level finding (a transitive choice made by `next` itself, not a direct dependency of this repository) carried the **same 3 CVEs, same vulnerable range** before this migration as after — unaffected by the version bump.
- One genuinely new finding, `sharp`, appeared — traced conclusively to `next@16.2.11` itself declaring `sharp: ^0.34.5` as a new `optionalDependency` for its image-optimization feature (absent from `next@14.2.35`'s own dependency graph). This is not a consequence of any choice made in this task; it is an unavoidable property of the approved `next@16.2.11` version itself.

No unapproved package was installed to chase a "clean" audit result, and no `npm audit fix --force` was run. The honest outcome is recorded here precisely so a future task does not repeat the same false assumption.

## Docker runtime results

Full production-image build (after one transient, non-reproducible `npm ci` registry-timeout retry), boot, and live verification against the real dev Postgres/Redis succeeded. Every route checked against the Next-14 baseline image returned identical HTTP status codes and identical rendered content, including SEO metadata (`og:*`, `twitter:*`, canonical link) and a pre-existing status-code quirk on `/places/[slug]`'s not-found path that was deliberately reproduced rather than silently fixed (it predates this migration and lies outside this task's authorized file list).

## Rollback rehearsal

A full N16 → N14-baseline → N16 cycle was executed and verified. Because the web application has no direct database access (all data flows through the API), this rollback is a **pure, stateless, application-level swap** — proven by `places`/`migrations` row counts remaining identical (49/20) at every checkpoint throughout the entire rehearsal, with zero database operation of any kind performed.

## Tests

Web unit: 17/17 (3 suites), identical before and after. API unit: 251/251 (34 suites), identical to the PLACE-032 baseline — confirming zero cross-workspace impact. API e2e: 59/59 (10 suites), identical to the PLACE-032 baseline. Zero test added, zero test skipped, zero test weakened — the only source changes were the 5 mechanical `params` unwraps and one targeted lint-driven comment, neither of which alters any behavior the existing suite exercises.

## Remaining deprecations / follow-ups

- `next`/`postcss` production audit findings remain open, blocked on an upstream fix with no ETA visible from this repository's vantage point.
- `sharp` is now tracked as a new, unavoidable production finding inherited from `next@16.2.11` itself.
- The pre-existing `/places/[slug]` not-found status-code quirk (200 instead of 404) remains unfixed, confirmed unchanged by this migration.
- `hotels`/`restaurants`/`tours`/`events` dynamic routes have zero seeded data in the dev database — a pre-existing gap, not something this task could remediate or fully exercise.
- `redis.health.ts`'s deprecated `HealthIndicator` pattern (recorded by PLACE-032) remains an open, low-urgency follow-up, unrelated to and unaffected by this task.

## Future migration recommendations

- Re-check the `next`/`postcss`/`sharp` production audit findings whenever a newer stable Next.js release ships — this task's evidence shows no current stable release resolves them, so periodic re-verification (not a one-time fix) is the appropriate posture.
- Seed representative rows for `hotels`/`restaurants`/`tours`/`events` in the dev database so their dynamic routes can be live-verified against real data in future work, the way `places` already can be.
- No other Next-16-driven follow-up work was identified — the migration's actual blast radius matched the decision gate's prediction closely, with the two additions being the corrected audit-closure expectation and the async-params/flat-config mechanics documented in the completion report.
