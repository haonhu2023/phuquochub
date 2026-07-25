# PLACE-036 — Evidence Index (Next.js 16 post-migration stabilization, 2026-07-25)

Backs `docs/delivery/reports/PLACE-036-nextjs-16-stabilization-report.md`. All commands on the D: checkout under pinned **Node v20.20.2 / npm 10.8.2**, Docker Desktop running throughout.

## Preflight
| id | evidence | result |
|---|---|---|
| S-1 | `git rev-parse HEAD`, `git status --short`, `git remote -v` | `dc4ed99`, clean, no remotes |
| S-2 | `state.yaml` `current.task` | `none` |
| S-3 | `docs/delivery/tasks/PLACE-032.yaml`/`PLACE-034.yaml`/`PLACE-035.yaml` status fields | `completed` / `draft_pending_owner_authorization` (expected) / `completed` |
| S-4 | `node -v`, `npm -v`, `npx turbo --version`, `docker version` | v20.20.2, 10.8.2, 2.10.6, 29.6.2 |
| S-5 | `require.resolve()` version checks (next/react/react-dom/typescript/eslint×2/eslint-config-next) | all confirmed, matches PLACE-035's claims |
| S-6 | `docker ps` | postgres/redis/minio healthy |
| S-7 | `docker images phuquochub-web` | both PLACE-035 images retained |

## PLACE-035 Evidence Review
| id | evidence | result |
|---|---|---|
| E-1 | Full read of all 4 PLACE-035 documents | no contradictory/stale/unsupported claim found |
| E-2 | Fresh `require.resolve()` re-check of every claimed version | independently verified, matches |
| E-3 | Fresh `npm audit --omit=dev --json` this session | 8 total, identical packages to PLACE-035's claim |
| E-4 | Live re-check of all 5 dynamic routes + the pre-existing `/places/[slug]` quirk, both before and after this task's own fix | byte-identical to PLACE-035's documented behavior throughout |

## Scope-Compliance Review
| id | evidence | result |
|---|---|---|
| C-1 | `git log --oneline e630cff^..dc4ed99` | 4 commits confirmed |
| C-2 | `git diff --stat 465566a dc4ed99` | 17 files, matches the claimed scope |
| C-3 | `git diff --stat 465566a dc4ed99 -- apps/api/ packages/` | empty — zero apps/api or packages/* touched |
| C-4 | `git diff --name-only` grepped for `.env`/secret/credential patterns | zero matches |
| C-5 | `git diff 465566a dc4ed99 -- apps/web/src/modules/auth/AuthProvider.tsx` | confirmed 1-line comment-only addition |

## Dependency Integrity
| id | evidence | result |
|---|---|---|
| D-1 | `npm ls --all` | one `extraneous`: `@emnapi/runtime@1.10.0` |
| D-2 | `npm install --dry-run` | reports 61 "would add" — all confirmed `optional:true` with non-Windows `os`/`cpu` constraints via direct `package-lock.json` inspection |
| D-3 | `npm ls @emnapi/runtime --all` + lockfile dependent-search | traced to `@img/sharp-wasm32` + `@unrs/resolver-binding-wasm32-wasi`, both skipped on win32-x64; `@emnapi/runtime` itself has no os/cpu restriction — explains the orphaned install |
| D-4 | `npm ls next react react-dom typescript --all` | single copy each, correct versions |
| D-5 | `npm ls --all \| grep UNMET` | all UNMET OPTIONAL DEPENDENCY lines traced to unused NestJS/TypeORM integrations (mongoose/sequelize/mysql2/redis-client-v3-4/etc.) or other-platform binaries — none are genuine problems |

## Configuration Integrity
| id | evidence | result |
|---|---|---|
| F-1 | `find apps/web -iname ".eslintrc*"` | empty — no legacy config remains |
| F-2 | `cat turbo.json`, `cat .github/workflows/ci.yml` | no `next lint` reference, no update needed |
| F-3 | `cat .nvmrc`, root `package.json` `engines`, `npm view next@16.2.11 engines` | `20`, `>=20.0.0`, `>=20.9.0` — all coherent with pinned `v20.20.2` |
| F-4 | `docker run --rm node:20-alpine node -v` | `v20.20.2` — Dockerfile base image coherent |
| F-5 | `cat apps/web/tsconfig.json` | unchanged, correctly includes `.next/types/**/*.ts` |

## Source Compatibility Review
| id | evidence | result |
|---|---|---|
| R-1 | `grep -rn "cookies()\|headers()\|draftMode()" apps/web/src` | zero matches — category inapplicable |
| R-2 | `find apps/web/src -iname "middleware*"`, `-iname "route.ts"` | none exist |
| R-3 | `grep -rn "revalidate\|force-dynamic\|force-static\|unstable_cache" apps/web/src` | zero matches |
| R-4 | `grep -rln "next/image" apps/web/src` + follow-up context read | both hits are inside `eslint-disable` comment text, not real imports — `next/image` genuinely unused |
| R-5 | `find apps/web/src -iname "sitemap*" -o -iname "robots*"` | none exist — pre-existing gap |

## Fresh Verification Baseline
| id | command | result |
|---|---|---|
| V-1 | `rm -rf apps/web/.next .turbo`; `turbo run lint --force` | 6/6 successful, 0 cached |
| V-2 | `turbo run typecheck --force` | 6/6 successful, 0 cached |
| V-3 | `turbo run test --force` | web 17/17 (3), api 251/251 (34), utils 4/4 (1) — 0 cached |
| V-4 | `npm run test:e2e --workspace=apps/api` | 59/59, 10 suites |
| V-5 | `turbo run build --force` (attempt 1, concurrent with V-7) | succeeded, 15 routes, 26.1 min (contended) |
| V-6 | `npm run build` (attempt 2, isolated, `time`-wrapped) | succeeded, 27s total, 15 routes (identical) |
| V-7 | `npm audit --omit=dev --json` (run concurrently with V-5, explaining V-5's slowness) | 8 total (0/8/0/0), identical to PLACE-035 |

## Repeated-Build Stability
| id | evidence | result |
|---|---|---|
| B-1 | `.next/routes-manifest.json` comparison (both builds) | 11 static + 5 dynamic routes, identical set both times |
| B-2 | `.next/BUILD_ID` (both builds) | differs, as expected — not treated as a defect |
| B-3 | `.next/standalone`, `.next/static`, `public/.gitkeep` | present after both builds |

## Docker Rebuild
| id | command | result |
|---|---|---|
| K-1 | `docker build -f apps/web/Dockerfile -t phuquochub-web:place036-stabilization .` (pre-fix) | succeeded, digest `sha256:29aeed05e47a...` — byte-identical to PLACE-035's `place035-next16` |
| K-2 | `docker run --rm ... node -v` / `whoami` | `v20.20.2` / `node` (non-root) |
| K-3 | `docker exec ... ls -ld apps/web/.next` (pre-fix) | `root:root`, not writable by `node` |
| K-4 | Rebuild `apps/api/Dockerfile` as `phuquochub-api:place036-support` (unmodified source, disposable) | succeeded — needed since PLACE-035's own support image was cleaned up |

## Production-Style Runtime Verification — Defect Investigation
| id | evidence | result |
|---|---|---|
| N-1 | Boot `phuquoc-api-place036` + `phuquoc-web-place036` (pre-fix), hit `/`, `/places/dinh-cau`, `/explore` | `⨯ unhandledRejection: Error: EACCES: permission denied, mkdir '/app/apps/web/.next/cache'` |
| N-2 | **Control**: boot the retained `phuquochub-web:place035-next14-baseline` in the identical shared-netns setup, same request sequence | **zero EACCES, zero unhandled rejection** — proves migration-caused, not a pre-existing latent bug |
| N-3 | Edit `apps/web/Dockerfile`: add `--chown=node:node` to all 3 runtime-stage `COPY --from=build` lines | applied |
| N-4 | Rebuild `place036-stabilization` (post-fix) | succeeded, new digest |
| N-5 | `docker exec ... ls -ld apps/web/.next` (post-fix) | `node:node`, writable |
| N-6 | Same identical request sequence (post-fix) | **zero EACCES, zero unhandled rejection** |
| N-7 | Full route inventory re-check (post-fix): `/`, `/explore`, `/map`, `/login`, `/register`, `/search`, `/dashboard`, `/places`, `/events`, `/nonexistent-xyz`, `/places/dinh-cau`, 4× `nonexistent-slug` dynamic routes, `/places/nonexistent-slug` | all byte-identical to PLACE-035's documented behavior |
| N-8 | Static asset check: `/_next/static/chunks/*.css` | `200` |
| N-9 | Image-optimization endpoint: `/_next/image?url=%2Ffavicon.ico&w=64&q=75` | `400` — correct (no `remotePatterns`, no favicon exists) |
| N-10 | SEO metadata check on `/places/dinh-cau` (post-fix) | `og:*`/`twitter:*`/canonical all present, identical to PLACE-035 |
| N-11 | `docker logs phuquoc-web-place036` (post-fix, full) | zero errors beyond the expected, self-triggered favicon warning |
| N-12 | `curl /api/health` via shared netns | `200`, `X-Request-Id` present |

## Security Stabilization
| id | evidence | result |
|---|---|---|
| A-1 | `docker exec ... grep -r <secret values> apps/web/.next apps/web/server.js` | zero matches for real credential values; only Next's own non-sensitive serialized config |
| A-2 | `docker logs ... \| grep -i "secret\|password"` | zero matches |
| A-3 | `docker exec ... grep -o 'localhost:4000' apps/web/.next/static/chunks/*.js` | confirms only the by-design public `NEXT_PUBLIC_API_URL` default is baked in |

## Rollback Viability Recheck
| id | evidence | result |
|---|---|---|
| G-1 | `docker images phuquochub-web:place035-next14-baseline` | present |
| G-2 | Boot the retained baseline image (used as N-2's control), confirm real-data route works | `/places/dinh-cau` → `200`, correct title |
| G-3 | `git log --oneline 465566a -1` | reachable |
| G-4 | `git diff --stat 465566a HEAD -- apps/api/src/core/database/migrations/` | empty — no schema change |
| Decision | Full N16→N14→N16 rehearsal **not repeated** — PLACE-035's evidence found complete, fresh, and independently reproduced in part (G-2) |

## Cleanup
| id | evidence | result |
|---|---|---|
| U-1 | `docker rm -f phuquoc-web-place036 phuquoc-api-place036 phuquoc-web-baseline-test` | all removed |
| U-2 | `docker rmi phuquochub-api:place036-support` | removed (disposable) |
| U-3 | `docker images phuquochub-web` | `place036-stabilization`, `place035-next16`, `place035-next14-baseline` all retained |
| U-4 | `docker ps` | postgres/redis/minio healthy throughout |

## Git commits
| id | hash | summary |
|---|---|---|
| CM-1 | (recorded after commit, see report) | `fix(web): correct Docker runtime file ownership for Next.js 16 (PLACE-036)` |
| CM-2 | (recorded after commit, see report) | `docs(delivery): PLACE-036 report, evidence index, baseline declaration` |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | `next`/`postcss`/`sharp` findings closed | NOT achieved — unchanged from PLACE-035, blocked on upstream |
| NX-2 | `@emnapi/runtime` extraneous package removed | NOT performed — benign, fixing it would require an `npm install`/`prune` this task's governance discourages |
| NX-3 | `/places/[slug]` not-found quirk fixed | NOT performed — pre-existing, out of scope |
| NX-4 | Full destructive rollback rehearsal repeated | NOT performed — not required, PLACE-035's evidence sufficient plus this task's own partial re-verification |
| NX-5 | Any `apps/api` or `packages/*` file changed | NOT made |
| NX-6 | PLACE-037 | NOT started, NOT created |
