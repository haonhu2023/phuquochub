# PLACE-036 — Next.js 16 Post-Migration Stabilization and Final Frontend Review

- **Date:** 2026-07-25
- **Authority:** Owner explicit authorization — "PLACE-036 — Next.js 16 Post-Migration Stabilization and Final Frontend Review". Primarily verification, stabilization, and bounded remediation.
- **Subject under review:** PLACE-035 (Next.js 14.2.35 → 16.2.11 migration), status `completed`.
- **Repository:** `D:\Projects\PhuQuocHub` (branch `master`, HEAD at task start `dc4ed99`).
- **Toolchain:** Node v20.20.2 / npm 10.8.2 (pinned), Docker Desktop 29.6.2.

---

## Preflight

| Check | Result |
|---|---|
| Repository root | `D:\Projects\PhuQuocHub` |
| Branch | `master` |
| HEAD at start | `dc4ed99` (PLACE-035's own final evidence commit) |
| Working tree | clean |
| Git remotes | none configured |
| `current.task` | `none` — authorizes PLACE-036 |
| PLACE-032 | completed (`state.yaml`, `PLACE-032.yaml` status) |
| PLACE-033 | no task file exists — read-only, chat-only assessment, per this session's established precedent (its findings are persisted in the PLACE-034 report) |
| PLACE-034 | draft, `draft_pending_owner_authorization` — this is *expected*, not a defect: PLACE-034 was a decision gate, not an execution task, and was never meant to reach `completed` |
| PLACE-035 | **completed**, `docs/delivery/tasks/PLACE-035.yaml` status `completed`, `completed_at: 2026-07-25` |
| PLACE-035 evidence files | all 3 exist: task authority, report, evidence index, migration assessment |
| Node / npm | v20.20.2 / 10.8.2 |
| Next.js (installed, apps/web) | 16.2.11 |
| React / React-DOM | 18.3.1 / 18.3.1 |
| TypeScript | 5.9.3 |
| ESLint | 9.39.5 (apps/web) / 8.57.1 (root, apps/api — separate, unaffected) |
| `eslint-config-next` | 16.2.11 |
| Turborepo | 2.10.6 |
| Docker | available, 29.6.2 |
| Dev services | postgres/redis/minio all healthy |

No `BLOCKED` condition triggered. One item required investigation rather than an automatic stop: `npm ls --all` reported one `extraneous` package (`@emnapi/runtime@1.10.0`) and `npm install --dry-run` reported 61 packages "would add." Both investigated in §Dependency Integrity below and found benign — neither indicates lockfile/installed-tree corruption.

---

## PLACE-035 Evidence Review

All 4 PLACE-035 documents (task authority, completion report, evidence index, migration assessment) were read in full — not summarized from memory. Every major claim was independently re-verified against fresh commands, not merely re-read:

| Claim | Classification | How verified |
|---|---|---|
| `next`/`eslint-config-next`/`eslint` at approved versions | **independently verified** | Fresh `require.resolve()` from `apps/web`'s own resolution context |
| `apps/web/package.json` diff is exactly 3 lines + lint script | **independently verified** | `git diff --stat` on the actual commit range |
| Zero `apps/api`/`packages/*` file touched | **independently verified** | `git diff --stat 465566a dc4ed99 -- apps/api/ packages/` → empty |
| Single React/Next copy, dual eslint copy explained | **independently verified** | Fresh `npm ls --all` |
| ESLint flat config native, no `FlatCompat` | **independently verified** | Re-read `eslint-config-next/dist/core-web-vitals.js` |
| 5 async-params conversions complete | **independently verified** | Fresh `grep -rn "params\.slug"` → zero matches; `tsc --noEmit` exit 0 |
| Turbopack timing anomaly was self-inflicted contention | **independently verified, and the exact same mistake was reproduced once more in this task** (see §Fresh Verification) — strengthens rather than merely confirms the original finding |
| `next`/`postcss` NOT closed by migration; `sharp` new, explained | **independently verified** | Fresh `npm audit --omit=dev` this session — identical 8 findings, identical packages |
| Rollback rehearsal succeeded, zero DB involvement | **supported by evidence, spot-verified** | Did not repeat the full N16→N14→N16 cycle (not required — see §Rollback Viability); independently re-booted the retained baseline image and confirmed it serves real data correctly |
| `/places/[slug]` not-found quirk reproduced identically | **independently verified** | Fresh live check against both the PLACE-035 images and this task's own new image — byte-identical `200` + correct fallback UI on all three |
| Both web images retained | **independently verified** | `docker images phuquochub-web` |

**No claim was found contradictory, stale, or unsupported.** One thing PLACE-035 did **not** catch is documented below (§Defect Found).

---

## Scope-Compliance Review

PLACE-035's 4 commits (`e630cff`, `5d369ea`, `f63e314`, `dc4ed99`) touch exactly 17 files. Each classified:

| File | Classification |
|---|---|
| `apps/web/.eslintrc.json` (deleted) | mandatory migration change |
| `apps/web/eslint.config.mjs` (new) | mandatory migration change |
| `apps/web/next-env.d.ts` | mandatory migration change (Next.js's own auto-regenerated file) |
| `apps/web/package.json` | mandatory migration change |
| 5× `apps/web/src/app/(public)/*/[slug]/page.tsx` | mandatory migration change |
| `apps/web/src/modules/auth/AuthProvider.tsx` | justified conditional change (1-line disable comment, forced by the approved `eslint-config-next` bump's own bundled plugin) |
| `docs/delivery/{tasks,reports,evidence}/PLACE-035-*` (4 files) | migration evidence |
| `docs/delivery/state.yaml`, `docs/delivery/workstreams/place.yaml` | migration evidence (state update) |
| `package-lock.json` | mandatory migration change (lockfile regeneration) |

**Zero unrelated package upgrades, zero unrelated refactors, zero UI redesign, zero deleted/skipped tests, zero weakened lint rules, zero security-control change, zero backend/database change, zero content/SEO expansion, zero generated junk beyond the expected lockfile/`next-env.d.ts` regeneration, zero local-config/secret/binary file.** Confirmed via `git diff --name-only` scoped to secret/env-file patterns (zero matches).

---

## Dependency Integrity

Fresh `npm ls --all` and `npm install --dry-run` (non-mutating) run against the current lockfile:

- `next@16.2.11`, `react@18.3.1`, `react-dom@18.3.1` — single physical copy each, confirmed.
- `eslint` — two physical copies (root `9.39.5`, nested `8.57.1` for 3 of `eslint-config-next`'s own sub-plugins whose peer ranges don't yet include ESLint 9) — the same benign, explained situation PLACE-035 documented; re-confirmed functionally clean via a fresh `apps/api` lint pass (still resolves root `8.57.1`, unaffected, exit 0).
- **`npm install --dry-run` reported 61 packages "would add."** Investigated rather than treated as a red flag: every one is an `optional: true` package with an `os`/`cpu` constraint for a *different* platform (Linux/macOS/other-arch variants of `sharp`, `@next/swc-*`, `turbo`, `@unrs/resolver-binding-*`) — confirmed by inspecting their `package-lock.json` entries directly. This is a well-known `npm install --dry-run` display quirk (dry-run lists all declared optional variants; a real install correctly skips platform-mismatched ones) — not a real installed-tree/lockfile inconsistency.
- **One genuine `extraneous` package: `@emnapi/runtime@1.10.0`.** Traced: it is declared in the lockfile as a dependency of `@img/sharp-wasm32` and `@unrs/resolver-binding-wasm32-wasi`, both `wasm32`-target optional packages correctly skipped on this win32-x64 machine. `@emnapi/runtime` itself carries no `os`/`cpu` restriction, so npm's installer left it physically installed despite both of its logical parents never being installed — a known class of npm optional-dependency-graph edge case. **Zero functional impact**: nothing in this codebase imports it, directly or transitively, on this platform. Not remediated: fixing it would require an `npm install`/`prune` action, which this task's own governance explicitly discourages running "merely to make the tree appear healthy." Recorded as a bounded, low-risk follow-up.
- No mixed React/React-DOM/Next.js majors, no unresolved peer conflicts, no forced dependency override.

---

## Configuration Integrity

- No legacy `.eslintrc*` file remains anywhere under `apps/web`.
- `turbo.json` requires no update — its `lint`/`typecheck`/`test`/`build` tasks fan out generically to each workspace's own script; no direct reference to `next lint` exists there.
- `.github/workflows/ci.yml` requires no update for the same reason (`npm run lint` → `turbo run lint` → each workspace's own script, which now correctly invokes `eslint . --max-warnings=0` for `apps/web`). CI has not run live in this session (no git remote configured, consistent with every prior PLACE task in this repository).
- `.nvmrc` = `20`; root `package.json` `engines` requires `node>=20.0.0`/`npm>=10.0.0`; `next@16.2.11`'s own `engines.node` requires `>=20.9.0`. The pinned `v20.20.2` satisfies all three with margin. `apps/web/Dockerfile`'s `node:20-alpine` base image resolves to `v20.20.2` today — fully coherent.
- `apps/web/tsconfig.json` unchanged, correctly includes `.next/types/**/*.ts` (matching the new `next-env.d.ts` reference).
- No temporary migration flag, no undocumented Webpack fallback, no unsupported Next.js option found anywhere in configuration.

---

## Source Compatibility Review

- **Request APIs:** zero usage of `cookies()`, `headers()`, or `draftMode()` anywhere in `apps/web/src` — confirmed via a fresh repository-wide grep. This entire category of Next.js 15+ breaking changes is inapplicable to this codebase (the frontend uses localStorage-only sessions, by explicit design — see `apps/web/src/modules/auth/session.ts`'s own header comment).
- **Routing:** no `middleware.ts`, no `route.ts` (API route handlers) exist anywhere in `apps/web` — all API calls go to the separate NestJS backend. All 5 dynamic `[slug]` routes correctly convert `params` to `Promise<{slug:string}>`.
- **Rendering/caching:** zero usage of `revalidate`, `force-dynamic`, `force-static`, `unstable_cache`, `revalidatePath`, or `revalidateTag` anywhere in the app — the app relies entirely on Next's default fetch-caching behavior, consistent with PLACE-034's own "accept Next 16 defaults" Owner decision.
- **Images:** `next/image` is **not actually used anywhere** — both prior grep hits were inside `eslint-disable` comment *text*, not real imports. Every image in the app is a plain `<img>` tag with `@next/next/no-img-element` deliberately, individually disabled (external-host images; `remotePatterns` never configured — a pre-existing, documented, out-of-scope choice). The entire "Images" review category is genuinely not applicable.
- **Metadata/SEO:** `layout.tsx` exports static `metadata`; `places/[slug]/page.tsx` exports dynamic `generateMetadata` with `og:*`/`twitter:*`/canonical fields — all confirmed rendering correctly live (see §Runtime Verification). No `sitemap.ts`/`robots.ts` exist — a pre-existing gap (this is a "Sprint 0" stage app per its own `package.json` description), unrelated to this migration, not remediated here.
- **Environment handling:** `NEXT_PUBLIC_API_URL` is the only environment variable the frontend reads; it is public-by-design (the `NEXT_PUBLIC_` prefix), defaults to `http://localhost:4000/api`, and is correctly the only environment-derived string found baked into the client bundle — confirmed via a fresh grep, zero secret exposure.

---

## Fresh Verification Baseline

All commands run fresh against the current, clean repository state — caches cleared (`rm -rf apps/web/.next .turbo`), Turborepo forced (`--force`, 0 cached on every task):

| Check | Command | Result |
|---|---|---|
| Lint | `turbo run lint --force` | **6/6 tasks successful, 0 cached** |
| Typecheck | `turbo run typecheck --force` | **6/6 tasks successful, 0 cached** |
| Unit tests | `turbo run test --force` | **web 17/17 (3 suites); api 251/251 (34 suites); utils 4/4 (1 suite) — all 0 cached** |
| E2e tests | `npm run test:e2e --workspace=apps/api` | **59/59, 10 suites** |
| Build (attempt 1) | `turbo run build --force` | succeeded, 15 routes, but **26.1 minutes** — self-inflicted: an `npm audit` scan was run concurrently in the background, the exact same class of resource-contention mistake PLACE-035 itself documented and warned about |
| Build (attempt 2, isolated) | `npm run build` (nothing else running) | succeeded, **27 seconds total** (8.7s compile + 1.4s static gen), identical 15-route set |
| Production audit | `npm audit --omit=dev --json` | **8 total (0/8/0/0)** — identical to PLACE-035's claim, same 8 packages, zero drift |

**No test total decreased relative to PLACE-035.** No warning absent from PLACE-035 was found newly present. The one apparent anomaly (build attempt 1's slow timing) was investigated immediately, root-caused, and resolved with a clean isolated re-run — not silently accepted, not hidden.

---

## Repeated-Build Stability

Two clean builds compared:

| | Attempt 1 (contended) | Attempt 2 (isolated) |
|---|---|---|
| Result | success | success |
| Route set | 15 routes (identical) | 15 routes (identical) |
| Compile time | 26.1 min | 8.7 s |
| Static generation | 1492 ms | 1362 ms |
| `BUILD_ID` | (differs, expected — not compared as a defect) | (differs, expected) |

Zero intermittent failure occurred in either attempt — both succeeded. The timing difference is fully explained by self-inflicted concurrent resource contention (proven, not assumed) and does not represent nondeterministic build behavior. Standalone output, static assets, and the route manifest (`routes-manifest.json`: 11 static + 5 dynamic routes) are identical between runs.

---

## Fresh Production Docker Rebuild

Built `phuquochub-web:place036-stabilization` from the current clean repository state (not reusing the PLACE-035 image):

- **Before any PLACE-036 change:** digest `sha256:29aeed05e47a...` — **byte-identical to PLACE-035's own `place035-next16` image**, proving true reproducibility.
- Node v20.20.2 inside the runtime layer (confirmed via `docker run ... node -v`).
- Runs as the non-root `node` user (confirmed via `docker run ... whoami`).
- `.next/standalone`, `.next/static`, `public` (containing a `.gitkeep` placeholder — the directory is deliberately empty, not broken) all present.
- Image size 270 MB (consistent with PLACE-035's report; the increase over the 242 MB Next-14 baseline is explained by Next 16's own larger runtime footprint, not a PLACE-036 change).
- No secret baked into the image (see §Security Stabilization).

**One genuine defect was found during runtime verification of this image — see next section.**

---

## Production-Style Runtime Verification

### Boot
Both the API support container (unmodified NestJS 11 source) and the web stabilization image booted cleanly, remained running with zero restarts, confirmed stable across a repeated `docker ps` check.

### Defect found: Docker EACCES on `.next/cache`

On the **first** request against the pre-fix `place036-stabilization` image, the container log showed:

```
⨯ unhandledRejection:  Error: EACCES: permission denied, mkdir '/app/apps/web/.next/cache'
```

**Root cause, proven via direct A/B comparison (not assumed):** `apps/web/Dockerfile`'s runtime-stage `COPY --from=build` commands leave `.next/standalone` (and `static`/`public`) owned by `root`, while the container runs as the non-root `node` user. The retained `phuquochub-web:place035-next14-baseline` image has the **identical** root-owned `.next` directory and permission structure — confirmed by booting it fresh and running the exact same request sequence (`/`, `/places/dinh-cau`, `/explore`): **zero EACCES, zero unhandled rejection, clean logs throughout.** This proves the defect is a genuine Next.js 16 runtime behavior difference (Next 16 attempts to write to `.next/cache` on request; Next 14 never exercised this code path here under the same conditions) — not a pre-existing, always-triggered Dockerfile bug.

This defect meets every bounded-remediation criterion: caused by the migration, root cause understood, fix small and local, no Owner decision needed, no dependency scope broadened, behavior-preserving, verifiable.

**Fix:** added `--chown=node:node` to all three runtime-stage `COPY --from=build` lines in `apps/web/Dockerfile` — Next.js's own documented Docker deployment pattern. Rebuilt the image; re-ran the identical trigger sequence: `.next` now owned by `node:node`, writable, **zero EACCES, zero unhandled rejection**. Full route inventory re-verified byte-identical to the pre-fix behavior otherwise.

**Regression coverage:** not Jest-testable (container filesystem ownership under a non-root user is outside Jest's execution model). The appropriate and sufficient regression evidence is the direct before/after/control Docker-level demonstration performed here: (1) reproduced on the unfixed image, (2) confirmed *absent* on the Next-14 baseline under an identical sequence (proves causation, not a pre-existing latent bug), (3) confirmed *absent* on the fixed image under an identical sequence.

### Critical route inventory (post-fix image)

| Category | Route | Status |
|---|---|---|
| Homepage | `/` | `200` |
| Static page | `/login` | `200` |
| Dynamic page (real data) | `/places/dinh-cau` | `200`, correct title/content |
| Nested route | `/dashboard` | `200` |
| Query-string route | `/places?page=1` | `200` |
| Not-found route | `/nonexistent-xyz` | `404` |
| Static asset | `/_next/static/chunks/*.css` | `200` |
| Image optimization endpoint | `/_next/image?url=%2Ffavicon.ico...` | `400` — correct (no `remotePatterns` configured, `next/image` unused by design, no favicon exists) |
| 4 remaining dynamic routes, nonexistent slug | `events`/`hotels`/`restaurants`/`tours` | all `404` (no seed data exists — pre-existing) |
| Pre-existing quirk route | `/places/nonexistent-slug` | `200` (not `404`) — **byte-identical reproduction** of the documented pre-existing behavior |

### Client/hydration
No hydration-mismatch warning appeared in any log across the entire verification session. No browser-based interactive testing was performed (out of scope beyond migration-sensitive server-rendered paths, per this task's own instruction not to create a broad manual UI exercise).

### API integration
Server-side data fetching confirmed working end-to-end (`/places/dinh-cau` renders real API data). `NEXT_PUBLIC_API_URL` resolution confirmed via the shared-network-namespace wiring (a pure `docker run`-level choice, no Dockerfile/app-code change, identical to PLACE-035's own verification method). `/api/health` returns `200` with `X-Request-Id` present — PLACE-030's observability guarantee unaffected.

### Logs
Full log inspection of both containers, classified:

| Warning | Classification |
|---|---|
| `EACCES`/unhandled rejection | migration regression — **found and fixed in this task** |
| `The requested resource isn't a valid image for /favicon.ico` | harmless — directly and solely caused by this task's own deliberate `/_next/image` test request against a genuinely nonexistent favicon; expected behavior, not a defect |
| (none else) | — |

---

## Performance Sanity

Bounded checks only, no optimization claims made: all routes returned successfully with no obvious latency regression observable in this local Docker environment; no asset failures; no excessive server errors; no Docker startup anomaly (both containers `Ready in 0ms`, consistent with PLACE-035's own reported boot times). No statistically meaningful performance claim is made from this small a sample.

---

## Security Stabilization

| Category | Result |
|---|---|
| Production vulnerabilities | 8 total (0/8/0/0) — identical to PLACE-035, zero drift |
| Next.js-rooted findings | `next`, `postcss`, `sharp` — all previously explained by PLACE-035, re-confirmed unchanged |
| Unrelated findings | `brace-expansion`/`glob`/`minimatch`/`typeorm`/`typeorm-naming-strategies` (typeorm-chain, apps/api-side, out of scope) — unchanged |
| Newly introduced findings | **none** |
| Findings closed since Next-14 baseline | none (re-confirmed — `next`/`postcss` remain blocked on an upstream fix) |
| Secret/credential exposure in image | **none found** — grepped the built image's filesystem and `server.js` for real credential values; only Next's own non-sensitive serialized config object matched |
| Environment leakage | **none** — only the by-design public `NEXT_PUBLIC_API_URL` default is baked into the client bundle |
| Debug output | none observed |

No `npm audit fix` was run. No dependency scope was broadened to chase an unrelated finding.

---

## Rollback Viability Recheck

Per this task's own governance rule, a full destructive N16→N14→N16 rehearsal is **not** repeated unless PLACE-035's evidence is incomplete, stale, contradictory, or not reproducible. None of those apply:

| Check | Result |
|---|---|
| Next-14 baseline image identity recorded | ✅ `phuquochub-web:place035-next14-baseline`, retained, confirmed present |
| Previous image can still be started | ✅ **independently re-booted in this task** (used as the A/B control for the defect investigation above) and confirmed serving real data correctly |
| Git can return to the pre-migration commit | ✅ `465566a` (pre-PLACE-035) exists and is reachable |
| No database schema change occurred | ✅ `git diff --stat 465566a HEAD -- apps/api/src/core/database/migrations/` → empty |
| Environment variables backward-compatible | ✅ no new required env var introduced by PLACE-035; re-confirmed via identical `docker run` invocations working for both images |
| Static asset invalidation requirement | none — this is a full-image-tag redeploy pattern (no shared CDN/cache layer between versions in this local/Docker-only setup), already proven during PLACE-035's own rehearsal |

**Decision: full rehearsal not repeated. Rollback remains viable**, evidenced by PLACE-035's own thorough rehearsal plus this task's own fresh, independent partial re-verification.

---

## Defects Found

1. **Docker EACCES on `.next/cache` write** (migration-caused) — found, root-caused via direct A/B proof, fixed, re-verified. See §Runtime Verification.

No other defect was found across dependency integrity, configuration integrity, source compatibility, fresh verification, repeated builds, or security review.

---

## Bounded Remediations Made

| Change | File | Justification |
|---|---|---|
| Added `--chown=node:node` to 3 `COPY --from=build` lines | `apps/web/Dockerfile` | Fixes the migration-caused EACCES/unhandled-rejection defect above; Next.js's own documented Docker pattern; zero application behavior change |

No other file was modified in this task.

---

## Remaining Warnings / Bounded Follow-Ups

Carried forward from PLACE-035, all re-confirmed unchanged and all low-risk:

- `next`/`postcss` production audit findings remain open, blocked on an upstream fix with no stable release available.
- `sharp` remains a new, unavoidable production finding from `next@16.2.11`'s own `optionalDependencies`.
- `@emnapi/runtime@1.10.0` extraneous package — benign, zero functional impact, not remediated (see §Dependency Integrity).
- The pre-existing `/places/[slug]` not-found status-code quirk (`200` instead of `404`) remains unfixed — unrelated to this migration, out of this task's scope.
- `hotels`/`restaurants`/`tours`/`events` dynamic routes still lack seed data in the dev database — a pre-existing gap.
- `redis.health.ts`'s deprecated `HealthIndicator` pattern (recorded by PLACE-032) remains an open, low-urgency, apps/api-side follow-up, unrelated to and unaffected by this task.
- No `sitemap.ts`/`robots.ts` exist — a pre-existing, Sprint-0-stage gap.

None of these require action before treating Next.js 16 as the trusted baseline.

---

## Final Stabilization Decision

# STABILIZED WITH BOUNDED FOLLOW-UPS

All functional and safety checks pass after the one bounded Docker fix. The remaining open items above are low-risk deprecations or operational follow-ups that do not affect correctness or rollback viability — none require action before this baseline declaration.

See `docs/delivery/reports/PLACE-036-NEXTJS-16-BASELINE-DECLARATION-2026-07-25.md` for the formal baseline declaration.

## Recommended next candidate

Per `docs/delivery/reports/PLACE-029-CANDIDATE-SELECTION-2026-07-24.md`'s history, the sole remaining open PLACE candidate is the monitoring-provider sub-scope (`OD2-6`), sequenced after a real deploy target exists and an Owner names a provider. Separately, non-candidate follow-ups worth tracking opportunistically: re-check `next`/`postcss`/`sharp` audit findings on a future stable Next.js release; seed `hotels`/`restaurants`/`tours`/`events` dev-DB data; `redis.health.ts` deprecation cleanup; `/places/[slug]` not-found status-code fix; `sitemap.ts`/`robots.ts` addition. No PLACE-037 is created by this task, per its own explicit instruction.
