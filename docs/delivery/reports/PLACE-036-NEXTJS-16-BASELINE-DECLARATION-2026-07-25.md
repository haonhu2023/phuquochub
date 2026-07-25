# Next.js 16 Baseline Declaration

- **Date:** 2026-07-25
- **Status:** `STABILIZED WITH BOUNDED FOLLOW-UPS` (per `docs/delivery/reports/PLACE-036-nextjs-16-stabilization-report.md`)
- **Effective as of:** commit range `e630cff..<PLACE-036 delivery-evidence commit>` on `master`

This document is the authoritative statement of the trusted `apps/web` frontend baseline going forward. It supersedes the Next.js 14 baseline for all purposes except an active rollback.

## Approved framework versions

| Package | Approved version |
|---|---|
| `next` | `^16.2.11` |
| `react` | `^18.3.1` (unchanged — **not** React 19) |
| `react-dom` | `^18.3.1` (unchanged) |
| `eslint` | `^9.39.5` |
| `eslint-config-next` | `^16.2.11` |
| `typescript` | `^5.5.4` declared / `5.9.3` resolved (unchanged) |

## Approved runtime versions

| Component | Version |
|---|---|
| Node.js | `v20.20.2` (pinned; `.nvmrc` = `20`; `engines.node >= 20.0.0`) |
| npm | `10.8.2` (`engines.npm >= 10.0.0`) |
| Docker base image (`apps/web/Dockerfile`) | `node:20-alpine` (currently resolves to `v20.20.2`) |
| Turborepo | `2.10.6` |

## Approved lint configuration

Flat config only: `apps/web/eslint.config.mjs`, importing `eslint-config-next/core-web-vitals` (native flat array, no `FlatCompat`). No `.eslintrc*` file may exist under `apps/web`. `--max-warnings=0` is the enforced standard.

## Required build command

```
npm run build --workspace=@phuquochub/web
```
(equivalently `turbo run build` from the repo root). Uses Turbopack by default (Next 16's default bundler) — no `--webpack` fallback flag is present or required.

## Required test suite

- `npm run lint --workspace=@phuquochub/web` → must exit 0 with zero output.
- `npm run typecheck --workspace=@phuquochub/web` → must exit 0.
- `npm run test --workspace=@phuquochub/web` → must report **17/17, 3 suites** passing (or an explicitly explained delta).
- Full monorepo: `apps/api` unit **251/251, 34 suites**; e2e **59/59, 10 suites** — both must remain unaffected by any future `apps/web`-only change.

## Docker build and start expectations

```
docker build -f apps/web/Dockerfile -t phuquochub-web:<tag> .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=<api-url> phuquochub-web:<tag>
```

- Runs as the non-root `node` user.
- `.next/standalone`, `.next/static`, `public` must all be copied with `--chown=node:node` (required since Next 16's runtime writes to `.next/cache` at request time — see the PLACE-036 report's defect section for why this is now mandatory, not merely good practice).
- Expected boot: `Ready in <1s` in this local environment; `GET /` → `200`.

## Known bounded warnings (as of this declaration)

| Warning | Status |
|---|---|
| `next`/`postcss` production audit findings | open, blocked on an upstream fix not yet in any stable release — re-check on future Next.js/PostCSS releases |
| `sharp` production audit finding | open, unavoidable consequence of `next@16.2.11`'s own `optionalDependencies` |
| `@emnapi/runtime@1.10.0` extraneous package | benign, zero functional impact, not remediated |
| `/places/[slug]` not-found returns `200` not `404` for a nonexistent slug | pre-existing, unrelated to this migration |
| `hotels`/`restaurants`/`tours`/`events` dynamic routes have no dev-DB seed data | pre-existing gap |
| No `sitemap.ts`/`robots.ts` | pre-existing, Sprint-0-stage gap |
| `redis.health.ts` deprecated `HealthIndicator` pattern (apps/api-side) | open, low-urgency, unrelated to this baseline |

None of the above block treating this baseline as stable.

## Rollback reference

- Application-level: `git revert` of the PLACE-035 migration commits (`e630cff`, `5d369ea`, `f63e314`) restores Next.js 14.2.35 exactly. The PLACE-036 Dockerfile fix (`--chown=node:node`) is independent of the Next.js version and should be **retained** even under a Next-14 rollback (it is a strict permission-correctness improvement, harmless either way).
- Deployment-level: redeploy the retained `phuquochub-web:place035-next14-baseline` image (proven to boot and serve real data correctly, independently re-verified in PLACE-036).
- No database schema is involved in any rollback direction (the frontend has no direct database access).

## Next permitted workstream

The monitoring-provider sub-scope (`OD2-6` from `docs/delivery/reports/PLACE-029-CANDIDATE-SELECTION-2026-07-24.md`), sequenced after a real deploy target exists and an Owner names a provider. No PLACE-037 is created by this declaration.
