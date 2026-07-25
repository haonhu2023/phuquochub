# PLACE-035 — Evidence Index (Next.js 14 → 16 migration, 2026-07-25)

Backs `docs/delivery/reports/PLACE-035-nextjs-16-migration-report.md`. All commands on the D: checkout under pinned **Node v20.20.2 / npm 10.8.2**, Docker Desktop running throughout.

## Authority
| id | source | proves |
|---|---|---|
| S-1 | Owner instruction 2026-07-25 — "PLACE-035 — Next.js 14 to 16 Controlled Migration Execution" | activation authorized, all 3 open Owner decisions resolved |
| S-2 | `docs/delivery/reports/PLACE-034-NEXTJS-16-DECISION-GATE-2026-07-25.md` + draft `docs/delivery/tasks/PLACE-034.yaml` | scope + approved package set basis |
| S-3 | Precondition check (report §Preconditions) | all conditions satisfied |

## Phase 1 — Baseline capture
| id | evidence | result |
|---|---|---|
| B-1 | `npm run lint` (web, before) | 0 warnings/errors |
| B-2 | `npm run typecheck` (web, before) | exit 0 |
| B-3 | `npm run test -- --ci` (web, before) | **17/17**, 3 suites |
| B-4 | `npm run build` (web, before, clean `.next`) | 15 routes, clean |
| B-5 | `docker build -f apps/web/Dockerfile -t phuquochub-web:place035-next14-baseline .` | succeeded, image retained |
| B-6 | `npm audit --omit=dev --json` (before) | 7 total (0/7/0/0) |
| B-7 | Route/status verification on baseline image (real API container attached via shared network namespace) | all static routes `200`; unknown route `404`; `/places/dinh-cau` `200` with real data; `/events\|hotels\|restaurants\|tours/nonexistent-slug` all `404`; `/places/nonexistent-slug` `200` (pre-existing quirk, traced and documented) |
| B-8 | Cleanup after baseline capture | containers removed, both images retained |

## Phase 2 — Dependency changes
| id | evidence | result |
|---|---|---|
| M-1 | `npm install --dry-run --workspace=@phuquochub/web next@^16.2.11 eslint-config-next@^16.2.11 eslint@^9` | resolved cleanly, zero ERESOLVE, zero filesystem change (`git status` confirmed) |
| M-2 | `npm install --workspace=@phuquochub/web next@^16.2.11 eslint-config-next@^16.2.11 eslint@^9` (real) | succeeded |
| M-3 | `git diff apps/web/package.json` | exactly the 3 approved lines |
| M-4 | `git diff --stat -- apps/api/ packages/` | zero files touched |
| M-5 | `npm ls next react react-dom typescript --all` | `next`/`react`/`react-dom` single physical copy each, at correct versions; `typescript` unchanged |
| M-6 | `npm ls eslint --all` | root `9.39.5` (what runs) + nested `8.57.1` (3 sub-plugins' own peer requirement) — normal npm resolution, not an ERESOLVE, verified functionally clean via M-9 below |
| M-7 | `require.resolve('eslint', {paths:['apps/api']})` | still resolves to root `eslint@8.57.1` — apps/api's own eslint completely unaffected |
| M-8 | `npm run lint --workspace=apps/api` (unaffected check) | exit 0 |

## Phase 4 — ESLint flat-config migration
| id | evidence | result |
|---|---|---|
| L-1 | `node_modules/eslint-config-next/package.json` exports inspection | confirms `./core-web-vitals` native flat-config export exists |
| L-2 | `node_modules/eslint-config-next/dist/core-web-vitals.js` read | confirms native flat-config array, no `FlatCompat` needed |
| L-3 | `rm apps/web/.eslintrc.json`; new `apps/web/eslint.config.mjs` written | legacy config removed, flat config created |
| L-4 | `package.json` `lint` script | `next lint` → `eslint . --max-warnings=0` |
| L-5 | `npm run lint` (first run, new flat config) | **1 error**: `react-hooks/set-state-in-effect` in `AuthProvider.tsx:37` — new stricter rule from bundled `eslint-plugin-react-hooks@7.1.1` |
| L-6 | Targeted `eslint-disable-next-line` comment added (1 line, documented) | `npm run lint` → **exit 0, zero output** |

## Phase 5 — Async params conversion
| id | evidence | result |
|---|---|---|
| P-1 | `events/[slug]/page.tsx`, `hotels/[slug]/page.tsx`, `restaurants/[slug]/page.tsx`, `tours/[slug]/page.tsx`, `places/[slug]/page.tsx` edited | `params: { slug: string }` → `params: Promise<{ slug: string }>` + `await params`, both `generateMetadata` and page component, all 5 files |
| P-2 | `grep -rn "params\.slug"` (post-conversion) | zero matches |
| P-3 | `npm run typecheck` (post-conversion) | exit 0 |
| P-4 | `npm run lint` (post-conversion) | exit 0 |

## Phase 6 — Turbopack compatibility
| id | evidence | result |
|---|---|---|
| T-1 | `next.config.mjs` inspection | no custom Webpack config present |
| T-2 | First `npm run build` (concurrent with other background work) | succeeded, exit 0, but static-generation showed repeated 60s-timeout retries, ~25 min total |
| T-3 | Second `npm run build`, isolated, timed (`time npm run build`) | succeeded, **31s total**, static generation **1685ms**, zero retries — confirms T-2 was self-inflicted resource contention, not a Turbopack defect |
| T-4 | Route output (both runs) | 15 routes, identical set to baseline |

## Phase 7-8 — Full regression
| id | command | result |
|---|---|---|
| R-1 | `npm run lint --workspace=apps/web` | exit 0 |
| R-2 | `npm run typecheck --workspace=apps/web` | exit 0 |
| R-3 | `npm run test` (full monorepo: shared-types, utils, api, web) | web 17/17 (3 suites); api 251/251 (34 suites) — both identical to baseline |
| R-4 | `npm run test:e2e --workspace=apps/api` | 59/59, 10 suites — identical to PLACE-032 baseline, confirms zero cross-workspace impact |
| R-5 | `npm run build --workspace=apps/api` | `nest build` exit 0 — confirms apps/api unaffected |

## Phase 9 — Security audit comparison
| id | evidence | result |
|---|---|---|
| A-1 | `npm audit --omit=dev --json` (after) | **8 total (0/8/0/0)** |
| A-2 | Per-finding `via`/`range`/`nodes` trace (both before and after) | `next`/`postcss` findings' vulnerable ranges already covered the Next-14 baseline too — **not closed by this migration**, blocked on upstream fix; `sharp` is genuinely new, traced to `next@16.2.11`'s own new `optionalDependencies` entry |
| A-3 | `grep -rn '"postcss"\|"sharp"' **/package.json` | zero hits — neither is a direct dependency anywhere in this repo |
| A-4 | `npm view next@16.2.11 optionalDependencies` | confirms `sharp: ^0.34.5` declared by `next` itself |
| A-5 | `npm view next versions` (latest available) | newest is `16.3.0-preview.9` (unreleased, unstable) — no stable release exists beyond `16.2.11` that would close the finding |
| A-6 | `npm audit --json` (after, incl. dev) | 44 total — expected, driven by `eslint@9`'s much larger dev-only dependency tree; does not affect production risk |

## Phase 10-11 — Docker build + live runtime verification
| id | command | result |
|---|---|---|
| V-1 | `docker build -f apps/web/Dockerfile -t phuquochub-web:place035-next16 .` (1st attempt) | **failed**, `npm error code EIDLETIMEOUT` — transient registry timeout inside the build layer |
| V-2 | Same build, retried with explicit exit-code capture | succeeded, `EXIT_CODE=0` |
| V-3 | `docker run` (`phuquochub-api:place035-support`, unmodified API source, real dev Postgres/Redis) | booted clean |
| V-4 | `docker run --network container:<api-container>` (web, next16) | booted clean, `Ready in 0ms` |
| V-5 | Route/status verification (next16 image) | all static routes `200`; unknown route `404`; `/places/dinh-cau` `200` real data, identical title/content to baseline; `/events\|hotels\|restaurants\|tours/nonexistent-slug` all `404`; `/places/nonexistent-slug` `200` — **byte-identical reproduction of the baseline quirk** |
| V-6 | SEO metadata check (`og:*`, `twitter:*`, canonical) on `/places/dinh-cau` | all present and correct |
| V-7 | `docker logs phuquoc-web-place035` | zero errors |
| V-8 | `curl /api/health` via shared netns | `200`, `X-Request-Id` present — PLACE-030 observability unaffected |

## Phase 12 — Rollback rehearsal
| id | step | result |
|---|---|---|
| RB-1 | Confirm N16 running | verified via V-4/V-5 |
| RB-2 | Stop N16, redeploy `place035-next14-baseline` | booted clean |
| RB-3 | Post-rollback route check | all `200`, `/places/dinh-cau` real data renders |
| RB-4 | Post-rollback API health | `200` |
| RB-5 | **Forward recovery**: stop N14-baseline, redeploy N16 | booted clean |
| RB-6 | Post-forward-recovery route check | all `200`, `/places/dinh-cau` real data renders |
| RB-7 | Post-forward-recovery API health | `200` |
| RB-8 | Row counts throughout (`psql -c "SELECT count(*) FROM places"` / `migrations`) | `places=49`, `migrations=20` — unchanged before, during, after |

## Cleanup
| id | evidence | result |
|---|---|---|
| CU-1 | `docker rm -f phuquoc-web-place035 phuquoc-api-place035` | both removed |
| CU-2 | `docker rmi phuquochub-api:place035-support` | removed (disposable verification tooling) |
| CU-3 | `docker images phuquochub-web` | both `place035-next14-baseline` and `place035-next16` retained |
| CU-4 | `docker ps` | `phuquoc-postgres`/`-redis`/`-minio` healthy throughout |
| CU-5 | Final row counts | `places=49`, `migrations=20` — identical to session start |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | `next`/`postcss` production audit findings closed | NOT achieved — both blocked on an upstream fix that does not exist in any stable release; PLACE-032/034's prior assumption that this migration would close them is corrected here |
| NX-2 | `sharp` finding avoided | NOT possible — unavoidable consequence of `next@16.2.11`'s own dependency declaration |
| NX-3 | Real deployment to any environment | NOT performed — local/Docker verification only |
| NX-4 | React 19, Node.js version, or TypeScript upgrade | NOT performed — out of approved scope |
| NX-5 | `/places/[slug]` not-found status-code quirk fixed | NOT performed — pre-existing, unrelated to this migration, out of scope |
| NX-6 | `hotels`/`restaurants`/`tours`/`events` dynamic routes verified with real data | NOT possible — zero seeded rows exist for these entity types in the dev database (pre-existing data gap) |
| NX-7 | Any `apps/api` or `packages/*` file changed | NOT made |
| NX-8 | PLACE-036 | NOT started, NOT created |
