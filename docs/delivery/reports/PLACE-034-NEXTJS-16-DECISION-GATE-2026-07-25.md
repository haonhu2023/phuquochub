# PLACE-034 — Next.js 16 Migration Decision Gate and Implementation Planning

- **Date:** 2026-07-25
- **Nature:** Governance decision gate and implementation planning only. Does **not** authorize the Next.js migration itself. No dependency upgraded, no source code edited, no lockfile regenerated, no Dockerfile modified, no commit implementing the migration.
- **Repository:** `D:\Projects\PhuQuocHub` (branch `master`)
- **Predecessor:** PLACE-033 — Next.js 14 → 16 Migration Readiness Assessment (conducted 2026-07-25, same session, immediately prior turn).

---

## 1. Executive summary

PLACE-033's underlying analysis is sound, complete, internally consistent, and — on independent, fresh re-verification against the live repository — **100% reproducible**: every material claim checked (dependency versions, config file presence/absence, code patterns, audit totals, lint/typecheck/test results) matched exactly. However, PLACE-033 was never persisted to the repository as a committed artifact — no task authority YAML, report, or evidence index exists anywhere in `docs/delivery/`. This is a genuine governance/reproducibility gap (Section 6 below), not a technical defect, and this report cures it by re-stating, re-verifying, and formally persisting the material findings.

No technical blocker was found. The mandatory change set is small (5 files for async `params`, 2 package bumps, 1 ESLint-tooling bump, 1 script change, 1 config-format migration). Node.js, React, TypeScript, and Turborepo all require no change. Genuine Owner decisions remain open (migration timing, acceptance of a fetch-caching behavior change, and whether to bundle the ESLint flat-config restructuring into the same task). Deployment-provider (Hostinger) compatibility remains an honestly-disclosed unknown, unchanged since PLACE-033, because no real infrastructure exists yet.

## 2. Gate status

**`AUTHORIZED WITH CONDITIONS`** — see §23 for the full decision and §24 for the exact conditions. This gate result does not itself authorize implementation; a separate, explicit Owner authorization is still required to activate any migration task.

---

## 3. Preflight

| Item | Value |
|---|---|
| Repository root | `D:\Projects\PhuQuocHub` |
| Branch | `master` |
| HEAD | `3d4cc724f20b7d969adf05190338a8a8162b8b2b` — unchanged since PLACE-033 concluded |
| Working-tree status | Clean, before, during, and after this gate |
| Git remotes | None configured |
| Current delivery task | `current.task: none`, `status: awaiting_task_authorization` |
| PLACE-032 completion | ✅ Confirmed — `completed_tasks[0].id == "PLACE-032"` |
| PLACE-033 existence | ⚠️ **No repository artifact exists** — see §4/§6 |
| PLACE-033 task authority file | **Absent** — `find docs/delivery -iname "*PLACE-033*"` returns nothing |
| PLACE-033 assessment report | **Absent** |
| PLACE-033 evidence index | **Absent** |
| `docs/delivery/state.yaml` | Unaffected by PLACE-033 — `current.task: none` throughout |
| `docs/delivery/workstreams/place.yaml` | Unaffected by PLACE-033 — no `place_033_status` entry exists |
| Node.js (pinned) | `v20.20.2` |
| npm (pinned) | `10.8.2` |
| Next.js (installed) | `14.2.35` (declared `^14.2.5`) |
| React / React DOM (installed) | `18.3.1` / `18.3.1` |
| ESLint configuration model | Legacy `.eslintrc.json` (`apps/web/.eslintrc.json`), extends `next/core-web-vitals` — confirmed present, no `eslint.config.*` found |

**The working tree was clean throughout — this does not make the decision gate unreliable.**

---

## 4. PLACE-033 artifact inventory

| Artifact | Expected location | Found? |
|---|---|---|
| Task authority YAML | `docs/delivery/tasks/PLACE-033.yaml` | ❌ Not found |
| Assessment report | `docs/delivery/reports/PLACE-033-*.md` | ❌ Not found |
| Evidence index | `docs/delivery/evidence/PLACE-033-*.md` | ❌ Not found |
| Command logs | N/A | Not persisted anywhere |
| Dependency inventory | N/A | Not persisted as a standalone artifact |
| Breaking-change inventory | N/A | Not persisted as a standalone artifact |
| Baseline test/build/Docker results | N/A | Not persisted as a standalone artifact |
| Audit output | N/A | Not persisted as a standalone artifact |
| Rollback plan | N/A | Not persisted as a standalone artifact |
| Decision matrix | N/A | Not persisted as a standalone artifact |
| Owner-decision section | N/A | Not persisted as a standalone artifact |
| Recommended implementation scope | N/A | Not persisted as a standalone artifact |

**Finding:** PLACE-033's full analytical content exists only in this session's own conversation history — it was delivered as a structured chat response (32 numbered sections, matching its own required-output specification), consistent with the precedent already established twice earlier in this same session for read-only assessment steps (the fresh PLACE-031 candidate assessment and the PLACE-032 read-only migration-readiness assessment were both delivered the same way, each explicitly instructed not to create files). Unlike those two, however, PLACE-033 was explicitly *named* as a numbered PLACE task in its own title, which invites the expectation — made explicit by this current task's own preflight/evidence requirements — that a persisted artifact should exist. **This report treats that gap as real and resolves it**, by independently re-deriving and re-verifying every material claim from PLACE-033 directly against the live repository (§8), rather than trusting the prior turn's own unpersisted output at face value.

---

## 5. Assessment completeness review

Cross-checked against the 21-item completeness checklist required by this task (§4.1 of the assigned instructions):

| Category | Covered by PLACE-033? |
|---|---|
| Node.js compatibility | ✅ |
| React compatibility | ✅ |
| Async request APIs | ✅ |
| Route `params` | ✅ |
| `searchParams` | ✅ |
| Cookies | ✅ |
| Headers | ✅ |
| Middleware/proxy changes | ✅ |
| Dynamic routes | ✅ |
| Caching and rendering | ✅ |
| Turbopack | ✅ |
| ESLint flat config | ✅ |
| `next lint` removal/replacement | ✅ |
| Image optimization | ✅ |
| Metadata and SEO | ✅ |
| Docker and standalone output | ✅ |
| Production runtime | ✅ |
| Test coverage | ✅ |
| Security audit | ✅ |
| Deployment compatibility | ✅ |
| Rollback | ✅ |
| Owner decisions | ✅ |

**No section from the required checklist was missing.** PLACE-033's own structure (32 numbered sections) maps cleanly onto all 21 categories above with no gaps.

---

## 6. Evidence-quality review

**Repository grounding:** Re-checked against the standard required by this gate (actual file paths, line references, installed vs. declared versions, command output, test counts). PLACE-033's claims consistently cited precise evidence — e.g., the 5 dynamic-route `params` sync-pattern findings named exact file paths and line numbers (`apps/web/src/app/(public)/places/[slug]/page.tsx:11`, etc.), the ESLint finding cited `apps/web/package.json:10` and `.eslintrc.json:2-4`, and the audit findings included per-package dependency-path attribution (`node_modules/typeorm/node_modules/glob`) rather than bare severity counts. **This is repository-specific evidence, not generic migration advice** — confirmed by re-deriving every one of these citations fresh in §8 below and finding them accurate.

**The one persistent gap:** as established in §4, none of this evidence was committed to the repository. This is the material finding this review surfaces: PLACE-033 is evidentially sound but was not durably recorded, meaning — prior to this report — no future engineer could have reproduced or even located it without access to this session's conversation transcript.

---

## 7. Scope-compliance review

Checked via `git log` and working-tree inspection for any unauthorized change during the PLACE-033 turn:

| Category | Result |
|---|---|
| Package manifests | Unchanged — `git log -p --since="2026-07-25" -- apps/web/package.json` (and root `package.json`) shows no commit in this window |
| Lockfile | Unchanged |
| Source code | Unchanged |
| Configuration | Unchanged |
| Task state (`state.yaml`) | Unchanged |
| Dockerfiles | Unchanged |
| Tests | Unchanged |
| Documentation outside evidence artifacts | Unchanged |

**PLACE-033 remained genuinely read-only.** The only actions it took beyond inspection were: two temporary, fully-cleaned-up Docker artifacts (`phuquochub-web:place033-baseline` image + a container, both explicitly removed via `docker rmi`/`docker rm -f` before the turn concluded, confirmed via this gate's own fresh `docker images`/`docker ps` checks showing no trace of either) and read-only `npm view`/`npm audit` calls. **No unauthorized implementation change was found.**

---

## 8. Independent compatibility verification

All commands re-run fresh, live, in this gate's own turn (not reused from memory of the PLACE-033 turn), immediately before writing this report.

| Claim | Re-verification command | Result | Classification |
|---|---|---|---|
| Declared `next`/`react`/`react-dom`/`eslint`/`eslint-config-next`/`typescript` versions | `grep -n ... apps/web/package.json` | Identical to PLACE-033's claims | **Verified** |
| Installed versions | `npm ls ... -w apps/web` | Identical | **Verified** |
| ESLint config model (legacy, not flat) | `find apps/web -iname "eslint.config*" -o -iname ".eslintrc*"` | Only `.eslintrc.json` found, no flat config | **Verified** |
| Frontend scripts | Direct read of `apps/web/package.json` `scripts` block | Identical to PLACE-033's table | **Verified** |
| No custom Webpack config | `grep -n "webpack" apps/web/next.config.mjs` | Zero matches | **Verified** |
| No middleware | `find apps/web -iname "middleware.ts"` | Zero matches | **Verified** |
| No `cookies()`/`headers()` usage | `grep -rn "from 'next/headers'\|cookies()\|headers()" apps/web/src` | Zero matches | **Verified** |
| `params` sync pattern (5 files) | `grep -n "params: { slug" apps/web/src/app/(public)/*/[slug]/page.tsx` | All 5 files, identical line numbers to PLACE-033 | **Verified** |
| No server-side `searchParams` | `grep -rn "searchParams" apps/web/src/app --include=*.tsx` | Zero matches (server-side) | **Verified** |
| No `next/image` component usage (only comments) | `grep -rn "from 'next/image'\|<Image " apps/web/src --include=*.tsx` | Zero matches for the actual component | **Verified** |
| `output: 'standalone'` configured | `grep -n "output" apps/web/next.config.mjs` | Confirmed, line 8 | **Verified** |
| Next 16 registry peer data (Node ≥20.9.0, React ^18.2.0+) | `npm view next@latest engines.node peerDependencies.react` | Identical to PLACE-033's claim | **Verified** |
| Production audit totals | `npm audit --omit=dev --json` | **7 total (0/7/0/0)** — identical package set and counts to PLACE-033, zero further drift in this short interval | **Verified** |
| Lint/typecheck/test baseline | `npm run lint/typecheck/test --workspace=apps/web` | Identical: lint clean, typecheck clean, **3 suites / 17 tests**, all pass | **Verified** |
| Working-tree status after re-verification | `git status --short` | Clean | **Verified** |

**No claim was found unsupported, contradictory, or stale.** Every material, independently-checkable claim in PLACE-033 reproduced exactly.

---

## 9. Current frontend baseline

Re-confirmed healthy in this gate's own turn (§8): lint clean, typecheck clean, 3 test suites / 17 tests passing, no build attempted a second time in this gate (the Docker build/boot cycle was already proven in PLACE-033's turn and the working tree has not changed since — re-running an unchanged build against unchanged inputs would not add evidentiary value, consistent with this task's own "do not repeat every command unnecessarily" instruction). **The current Next.js 14 baseline is healthy.**

---

## 10. Mandatory-change register

| ID | File(s) | Current behavior | Target behavior | Why mandatory | Risk | Verification method | Rollback method |
|---|---|---|---|---|---|---|---|
| M-1 | `apps/web/package.json` | `"next": "^14.2.5"` | `"next": "^16.2.11"` | Core migration target | Medium — pulls Turbopack-by-default, Express-adjacent routing changes | Full regression suite + live Docker boot | `git revert` |
| M-2 | `apps/web/package.json` | `"eslint-config-next": "^14.2.5"` | `"eslint-config-next": "^16.2.11"` | Version-locked to `next`; peer-requires `eslint >=9.0.0` (registry-confirmed) | Low | Lint run against full `src/` tree | `git revert` |
| M-3 | `apps/web/package.json` | `"eslint": "^8.57.0"` | `"eslint": "^9.x"` | Forced by M-2's peer requirement | Medium — enables the flat-config migration (M-6) | Lint run | `git revert` |
| M-4 | `apps/web/src/app/(public)/events/[slug]/page.tsx:5,8,24` | `params: { slug: string }` (sync) | `params: Promise<{ slug: string }>` + `await` | Next 16 async-request-API breaking change (registry/docs-confirmed) | Low — mechanical | Route-level smoke test | `git revert` |
| M-5 | `apps/web/src/app/(public)/hotels/[slug]/page.tsx:5,8,18` | Same pattern | Same change | Same | Low | Same | `git revert` |
| M-6 | `apps/web/src/app/(public)/places/[slug]/page.tsx:11,24,27,55,58` | Same pattern | Same change | Same | Low | Same | `git revert` |
| M-7 | `apps/web/src/app/(public)/restaurants/[slug]/page.tsx:10,13,23` | Same pattern | Same change | Same | Low | Same | `git revert` |
| M-8 | `apps/web/src/app/(public)/tours/[slug]/page.tsx:12,15,25` | Same pattern | Same change | Same | Low | Same | `git revert` |
| M-9 | `apps/web/.eslintrc.json` → `apps/web/eslint.config.mjs` | Legacy `.eslintrc.json`, `extends: "next/core-web-vitals"` | Flat config, importing the flat `next/core-web-vitals` preset | `next lint` is **removed** (not deprecated) in Next 16; `eslint-config-next@16` defaults to flat config | Medium — genuine, if bounded, surprise-scope risk | Lint run, diffed against today's "No ESLint warnings or errors" baseline | `git revert` |
| M-10 | `apps/web/package.json:10` (`lint` script) | `"lint": "next lint"` | `"lint": "eslint . --max-warnings=0"` (or equivalent) | `next lint` command removed entirely | Low | CI's `npm run lint` fan-out via Turbo | `git revert` |

**No Node.js pin change, no Docker base-image change, no React/React-DOM change, no type-package change, no route-handler change, no CI-file change, and no deployment-configuration change is mandatory** — each was investigated and found not applicable (§12) or already satisfied (§8).

---

## 11. Conditional-change register

| ID | Change | Triggering condition |
|---|---|---|
| C-1 | Add explicit `cache`/`next: { revalidate }` options to `apps/web/src/lib/http.ts`'s `apiGet()` | **Only if** the Owner decides Next 16's changed default fetch-caching behavior (§14, risk R-5) is unacceptable and today's implicit caching characteristics must be preserved |
| C-2 | Add `data-scroll-behavior="smooth"` to `<html>` in `apps/web/src/app/layout.tsx` | **Only if** the current smooth-scroll default is found, during implementation smoke-testing, to be relied upon anywhere (not confirmed either way from static inspection) |
| C-3 | Explicit `--webpack` flag / temporary Webpack fallback in `dev`/`build` scripts | **Only if** a live Turbopack build (which this read-only gate cannot execute) surfaces an incompatibility — none is predicted, since no custom Webpack config exists, but this cannot be proven without actually running the build |
| C-4 | `next.config.mjs`'s new top-level `turbopack` key | **Only if** the implementation team chooses to explicitly configure Turbopack behavior rather than accept its defaults |
| C-5 | Add a `HEALTHCHECK` to `apps/web/Dockerfile` | **Only if** the Owner/implementation team chooses to close this pre-existing, migration-unrelated gap opportunistically alongside the migration — not required by the migration itself |
| C-6 | React 19 upgrade | **Only if** the Owner separately decides to bundle this optional, independently-timed decision into the same task (§13) |
| C-7 | Root-level `.eslintrc.cjs` flat-config migration | **Only if** the Owner wants the root and `apps/web` ESLint configs to interoperate under a single flat config; each workspace's `lint` script currently runs independently via Turbo, so no technical conflict forces this |

**No item above is mandatory.** Each is explicitly conditioned on a fact this read-only gate cannot establish (a live build result) or a decision only the Owner can make.

---

## 12. Confirmed non-issues

Investigated and proven not applicable to this repository, from direct evidence:

- No Pages Router (`pages/` directory does not exist anywhere).
- No wildcard/catch-all middleware (no `middleware.ts` exists at all).
- No custom Webpack loaders or plugins (`next.config.mjs` contains only `reactStrictMode`, `transpilePackages`, `output`).
- No deprecated `next/image` props to migrate (the component is never actually used — only referenced in ESLint-disable comments explaining its *absence*).
- No server actions (`'use server'` — zero matches).
- No database-schema impact (the frontend has no database access of any kind; all data access is via HTTP to the already-migrated NestJS API).
- No duplicated React installation (`npm ls react --all -w apps/web` shows a single `18.3.1`, deduped everywhere).
- No cookie-based session handling to migrate (`session.ts:3-6` — explicit code comment confirming `localStorage`-only design).
- No AMP usage, no `sitemap.ts`/`robots.ts`, no parallel routes, no Partial Prerendering, no `experimental_ppr`, no `serverRuntimeConfig`/`publicRuntimeConfig`.
- No third-party package (`maplibre-gl`) with a React/Next version restriction — confirmed via `npm view maplibre-gl@4.7.1 peerDependencies`, which returns no `react`/`next` entry at all.

---

## 13. Owner decisions

| Decision | Options | Technical consequence | Recommended default | Can implementation proceed without it? |
|---|---|---|---|---|
| Migration timing | Before staging / before restricted beta / before public launch / defer with accepted risk | Determines urgency of scheduling; no technical prerequisite is gated on timing itself | Not determinable from evidence alone — genuine Owner call | **No** — same class of gating decision as the already-completed NestJS migration's timing question |
| Acceptance of the fetch-caching default-behavior change (M-1's side effect) | Accept Next 16's new defaults as-is / require C-1 (explicit cache directives added) | Accepting as-is means more requests reach the live API directly; C-1 preserves today's implicit caching characteristics at the cost of extra implementation work | Recommend accepting as-is initially (no production traffic exists yet to be affected) unless the Owner has a specific performance requirement | **No** — this genuinely changes runtime behavior and only the Owner can accept that trade-off |
| Bundling the ESLint flat-config restructuring (M-9/M-10) into this same task | Bundle it (single task) / split it into its own preparatory task | Bundling keeps the diff cohesive since Next 16 *forces* this change anyway; splitting adds coordination overhead for a change with no independent value on its own | Recommend bundling — `next lint`'s removal makes ESLint migration a hard *prerequisite* of the Next.js migration itself, not a separable concern | **No** for the *sequencing* choice, though the *technical necessity* of M-9/M-10 is not itself in question |
| React 19 (C-6) | Bundle into this migration / keep independently deferred | React 18.3.1 already satisfies Next 16's actual peer range (registry-confirmed) — this is a genuinely optional, separate decision, not forced | Recommend keeping it deferred/independent, consistent with PLACE-033's own finding | **Yes** — implementation can proceed with React 18 unchanged regardless of this decision |
| Acceptable maintenance window | N/A — no real deployment exists yet, so no live cutover window is needed for *this* migration specifically | None — purely a scheduling question for a future real deployment | N/A now | **Yes** — not currently a blocking factor |
| Node.js upgrade acceptance | N/A | Not applicable — no Node upgrade is mandatory or proposed | N/A | **Yes** — no decision needed |
| Temporary Webpack fallback acceptance (C-3) | Accept as an interim state if Turbopack surfaces an issue / treat any such issue as a hard blocker | Only relevant if the conditional trigger in C-3 actually fires during implementation | Recommend accepting a temporary `--webpack` fallback as non-blocking, since Next 16 explicitly supports it as an opt-out | **Yes** for now — this decision only becomes live if C-3's condition triggers, which cannot be known until implementation begins |
| Deployment-provider (Hostinger) compatibility | N/A — genuinely unknown, not an Owner *decision* so much as an unresolved *fact* requiring infrastructure verification | See §14 | N/A | **Yes**, for *local implementation and verification*; **No**, for *actual deployment* (§14) |
| Docker-based vs. provider-native deployment | Not yet a live choice — no provider is provisioned | N/A | Docker, consistent with every other PLACE task's established pattern (`docker-compose.prod.yml`) | **Yes** — Docker is already the established, working pattern; no decision blocks proceeding on that basis |
| Rollback image-retention duration | Owner-set policy | Purely operational, no technical gate | Recommend mirroring PLACE-031/032's precedent (retained through one full verification cycle, then cleaned up) | **Yes** — not a blocker |
| Acceptable warning/deprecation threshold | Keep `--max-warnings=0` / relax temporarily | `--max-warnings=0` is fully preservable in flat config (confirmed, §14 of PLACE-033) — no technical reason to relax it | Recommend keeping `--max-warnings=0` unchanged | **Yes** — not a blocker, but worth an explicit Owner confirmation since it's a standing repository-wide discipline |

**Not escalated as Owner decisions** (repository evidence already determines the answer): Node.js version (no change needed), React version *requirement* (no change needed — only the *optional* upgrade is a real decision, listed above), whether middleware/cookies/route-handlers need migration (they don't exist), whether custom Webpack config exists (it doesn't).

---

## 14. Deployment gate

| Requirement | Classification | Evidence |
|---|---|---|
| Node runtime | **Verified compatible** (for any environment satisfying `>=20.9.0`) | `docker-compose.prod.yml`/both Dockerfiles already pin `node:20-alpine`; no real target host exists to check beyond that |
| Docker availability | **Likely compatible but unverified** | `docker-compose.prod.yml` already designs a generic VPS+Docker model; Hostinger-specific Docker support is not represented in the repository |
| Standalone output | **Verified compatible** | `output: 'standalone'` already proven working under Next 14 in live Docker verification (this session, multiple PLACE tasks); no removal of this feature found in the Next 16 migration guide |
| Environment variables (build/runtime) | **Verified compatible** | Pattern (`NEXT_PUBLIC_*` + runtime env) is provider-agnostic |
| Reverse proxy | **Not represented in the repository** | `deployment.md` designs Cloudflare→nginx, none provisioned |
| Image optimization | **Not applicable** | `next/image` unused |
| Health checking | **Likely compatible but unverified; pre-existing gap** | `apps/web/Dockerfile` has no `HEALTHCHECK` directive today, unrelated to this migration (§11, C-5) |
| Static asset handling | **Verified compatible** | `.next/static`/`public` copy pattern proven working under Next 14; no format change identified for Next 16 |
| Rollback image retention | **Verified compatible** | Directly reuses PLACE-031/032's twice-proven mechanism |

**Overall: the migration can be implemented and fully verified locally (build, lint, typecheck, test, Docker boot, rollback rehearsal) using the exact same pattern already proven for every prior PLACE task in this session. It must NOT be deployed to a real Hostinger (or any other) production environment as part of this migration, because no such environment exists yet and its compatibility is genuinely unknown — this is not a migration-specific risk, it is the same standing external-infrastructure gap named in every production-readiness document since the original reassessment.**

---

## 15. Test gate

### Pre-migration baseline (already executed, this session — see §8/§9)
- `npm run lint --workspace=apps/web` (`next lint`)
- `npm run typecheck --workspace=apps/web` (`tsc --noEmit`)
- `npm run test --workspace=apps/web` (`jest --passWithNoTests`)
- `turbo run build --filter=@phuquochub/web --force`
- `docker build -f apps/web/Dockerfile -t <tag> .`
- `docker run` + live HTTP checks against `/`, `/explore`, `/places`, `/search`, `/login`, and a 404 route
- `npm audit --omit=dev --json` / `npm audit --json`

### Post-migration verification (commands to be run during implementation — not created here)
- `npm ls next react react-dom eslint eslint-config-next -w apps/web` (dependency-tree verification, zero `ERESOLVE`)
- `npx eslint . --max-warnings=0` (through the new flat-config invocation, once `apps/web/package.json`'s `lint` script is updated per M-10)
- `npm run typecheck --workspace=apps/web` (unchanged command)
- `npm run test --workspace=apps/web` (unchanged command; expect 3/3 suites, 17/17 tests, identical to baseline)
- `turbo run build --filter=@phuquochub/web --force` (expect 2/2, 0 cached; watch for Turbopack-specific build output/warnings)
- Standalone boot: `node apps/web/.next/standalone/apps/web/server.js` (or the Docker-wrapped equivalent)
- `docker build -f apps/web/Dockerfile -t phuquochub-web:nextjs16 .`
- Live HTTP smoke test: same route set as the baseline, plus explicit checks on all 5 converted dynamic-slug routes with real data
- Metadata checks: `curl` + inspect `<head>` for `generateMetadata`'s output on at least one dynamic route
- Image checks: not applicable (no `next/image` usage)
- Authentication checks: register/login/wrong-password round-trip against the real API, exercising the client-side `AuthProvider`/`session.ts` flow end-to-end through the browser-facing app
- Environment-variable fail-fast checks: not currently designed into the frontend (no Joi-style validation exists on the web side, unlike the API) — **out of scope to add as part of this migration** unless the Owner separately requests it
- Structured log checks: not applicable — the frontend has no structured-logging framework (§4, PLACE-033)
- Audit comparison: `npm audit --omit=dev --json` before/after, expect `next`/`postcss` findings closed, `typeorm`-chain findings unaffected (unrelated)

### Rollback rehearsal (mirrors PLACE-031/032's exact, twice-proven mechanism)
1. Retain the pre-migration image tag (e.g., `phuquochub-web:nextjs14-baseline`).
2. Deploy the migrated image (`phuquochub-web:nextjs16`).
3. Verify key routes (the same smoke-test set above).
4. Roll back to the retained pre-migration tag.
5. Verify route and asset continuity (same smoke-test set; confirm no state-loss, consistent with the frontend's own stateless/standalone design).
6. Redeploy the migrated tag.
7. Verify forward recovery (same smoke-test set).

---

## 16. Rollback gate

**Adequately defined.** The rollback mechanism is not new — it is a direct reuse of the exact mechanism independently proven twice already in this session (PLACE-031's `release-N`/`release-N1` rehearsal and PLACE-032's `nestjs10-baseline`/`nestjs11` rehearsal, both including explicit data-continuity proofs). For the frontend specifically, rollback is *structurally simpler* than the backend case: the web app is stateless (`output: 'standalone'`), holds no database connection, and its only "state" is `localStorage` in the end-user's browser, which is unaffected by which server-side image version is running. No database changes are expected from this migration (§25, PLACE-033), which removes the single largest source of rollback complexity seen in typical framework migrations.

---

## 17. Proposed implementation sequence

*(Sequencing only — not executed by this task.)*

1. Capture and retain the current Next.js 14 baseline (lint/typecheck/test/build/Docker/audit — repeat of §8/§9, tagged `phuquochub-web:nextjs14-baseline`).
2. Node.js update — **skipped**, not mandatory (§10).
3. Update `next` and `eslint-config-next` to `16.2.11` (M-1, M-2); update `eslint` to `^9.x` (M-3).
4. Resolve peer dependencies via a clean install — reusing PLACE-032's own documented lesson: prefer a full clean reinstall (`node_modules` + lockfile regenerated) over an incremental one if any mixed-version artifact is observed, without `--force`/`--legacy-peer-deps`.
5. Migrate ESLint configuration to flat config (M-9); update the `lint` script (M-10).
6. Apply the 5 mandatory async-`params` conversions (M-4 through M-8).
7. Address Turbopack/Webpack compatibility (C-3/C-4) — investigate live, since this read-only gate cannot.
8. Run focused verification (lint, typecheck, targeted route smoke tests).
9. Run full regression (unit tests, full monorepo build, confirm `apps/api`/other workspaces unaffected).
10. Build the Docker image.
11. Verify runtime (full live checklist, §15).
12. Compare audit results before/after (§19 of PLACE-033's own structure).
13. Rehearse rollback (§15/§16).
14. Write delivery evidence (report, evidence index, standalone migration assessment — mirroring PLACE-032's own three-document pattern).
15. Update delivery state (`state.yaml`, `workstreams/place.yaml`).
16. Commit in logical groups (dependency + code migration; ESLint config migration; delivery evidence + state).

---

## 18. Proposed implementation-task scope

**In scope:** exactly the 10 items in the mandatory-change register (§10), plus any conditional item whose trigger fires during implementation (§11), plus the standard verification/evidence/state-update work every prior PLACE task in this session has performed.

## 19. Allowed dependency changes

| Package | Change |
|---|---|
| `next` | `^14.2.5` → `^16.2.11` |
| `eslint-config-next` | `^14.2.5` → `^16.2.11` |
| `eslint` | `^8.57.0` → `^9.x` (exact version to be pinned at implementation time against the then-current `eslint-config-next@16` peer floor) |

**No other package may change.** Specifically excluded from this list unless a peer-dependency conflict *proves* a minimal additional change is unavoidable (in which case it must be documented with the same rigor as PLACE-032's own installation-defect diagnosis): `react`, `react-dom`, `@types/react`, `@types/react-dom`, `typescript`, `maplibre-gl`, `jest`, `ts-jest`, `turbo`, and every `apps/api`/`packages/*` dependency.

## 20. Explicit exclusions

UI redesign; new features; SEO expansion beyond what's already present; performance refactors unrelated to the migration itself; any backend (`apps/api`) change; database migrations; authentication redesign (the `localStorage`-based design stays as-is); broad dependency modernization; observability-provider integration; content changes; unrelated test cleanup; the 5 unrelated `typeorm`-chain security findings (§8) — a separate, `apps/api`-side governance item; React 19 (unless separately authorized, §13); Hostinger deployment (no infrastructure exists).

**Prohibited installation flags/commands:** `--force`, `--legacy-peer-deps`, any silent peer-conflict suppression, broad `npm update`, broad `npm audit fix` (with or without `--force`).

---

## 21. Risk register

| Risk | Evidence | Likelihood | Impact | Mitigation | Validation | Rollback |
|---|---|---|---|---|---|---|
| Unsupported Node.js runtime | Registry-confirmed `>=20.9.0`; repo pinned to `20.20.2` | Very low | N/A (already satisfied) | None needed | `node -v` check | N/A |
| React peer-dependency conflict | Registry-confirmed `^18.2.0` accepted | Very low | Low | Keep React unchanged unless Owner separately authorizes 19 | `npm ls react` post-install | `git revert` |
| ESLint flat-config semantic drift | `.eslintrc.json` extends only `next/core-web-vitals`, no custom rules (§14, PLACE-033) | Low | Medium | Diff lint output before/after against today's "No ESLint warnings or errors" baseline | Lint run | `git revert` |
| Turbopack incompatibility | No custom Webpack config found; cannot be proven without a live build | Low-Medium | Medium | C-3 (temporary Webpack fallback) as an accepted interim state | Live `next build` during implementation | `--webpack` flag or `git revert` |
| Changed fetch-caching behavior | Zero explicit cache directives found anywhere (§12, PLACE-033) | High (the change *will* occur) | Low today (no production traffic exists) | C-1 if the Owner requires preserving today's implicit behavior | Manual comparison of response timing/data freshness | `git revert` or C-1 |
| Async route API regressions | 5 files identified with exact line numbers (§10) | Low (mechanical change) | Medium if missed | Route-level smoke test on all 5 dynamic-slug routes | Live HTTP checks | `git revert` |
| Middleware/proxy regressions | No middleware exists | None | None | N/A | N/A | N/A |
| Docker standalone breakage | `output: 'standalone'` proven working under Next 14 across multiple PLACE tasks; no removal found in Next 16's migration guide | Low | High if it occurred | Full Docker build+boot verification before considering the migration done | Live Docker boot, §15 | Retain `nextjs14-baseline` tag |
| Image optimization regressions | `next/image` never used | None | None | N/A | N/A | N/A |
| SEO metadata regressions | `generateMetadata` pattern stable; only the `params` source changes (§10) | Low | Low-Medium | Manual `<head>` inspection on at least one dynamic route post-migration | Live check | `git revert` |
| Deployment-provider incompatibility | Hostinger compatibility genuinely unknown (§14) | Unknown | Unknown | Do not deploy to any real environment until separately verified — implement and verify locally/in Docker only | N/A (infrastructure verification item) | N/A — no real deployment exists to roll back from |
| Rollback asset mismatch | Frontend is stateless (`output: 'standalone'`, `localStorage`-only client state) | Very low | Low | N/A — structurally simpler than the backend's already-proven case | Rollback rehearsal, §15 | N/A |
| Incomplete frontend test coverage | Only 3 unit-test files exist, none exercising React rendering/routing (§17, PLACE-033) | N/A (pre-existing condition, not caused by migration) | Elevates regression risk generally | Rely on manual smoke-testing as the primary safety net, consistent with every prior `apps/web` verification in this session | Live HTTP checklist | N/A |

---

## 22. Decision matrix

**Weighting method:** each dimension scored independently 0–10 from direct repository/registry evidence gathered in this gate and its predecessor, presented transparently per-dimension rather than collapsed into a single blended index — consistent with how PLACE-033 itself (and the earlier NestJS decision-gate work in this session) presented risk, since a single weighted number would imply false precision for a decision that is genuinely multi-dimensional and partly Owner-dependent.

| Dimension | Score | Basis |
|---|---|---|
| Security benefit | 6 | Closes 2 of 7 production findings (`next`/`postcss`) plus ≈15 ESLint-tooling dev findings; does not touch the 5 unrelated `typeorm`-chain findings |
| Maintainability benefit | 7 | Closes a standing technical-debt item; keeps the frontend from drifting further behind an actively-maintained major line |
| Performance benefit | 4 | Turbopack's benefit is plausible but unmeasured (read-only gate cannot execute a live build) |
| Urgency | 3 | Neither remaining Next.js finding is demonstrated-exploitable against this codebase's actual usage; no live production deployment exists to be at risk |
| Compatibility confidence | 8 | Zero peer conflicts (registry-confirmed); the one mandatory code-pattern change is small, mechanical, and fully enumerated |
| Test confidence | 3 | Elevated caution warranted — near-zero automated coverage for anything React/App-Router-specific (§21) |
| Deployment confidence | 2 | Genuinely unknown for the real target (Hostinger); fully confident for local/Docker verification |
| Implementation complexity | 4 | Small mandatory file set; the ESLint flat-config step carries the main bounded complexity |
| Regression risk | 5 | Same basis as test confidence — manual smoke-testing is the primary safety net |
| Rollback difficulty | 1 | Directly reuses an already-twice-proven mechanism; structurally simpler than the backend case (stateless) |
| Owner dependency | 6 | Three genuine open decisions (§13) that this gate cannot resolve on its own |

---

## 23. Final decision

### `AUTHORIZED WITH CONDITIONS`

No technical blocker exists. PLACE-033's analysis, now independently re-verified in full, is sound and reproducible. The migration is well-bounded, has a proven rollback mechanism, and requires no Node/React/TypeScript change. The conditions below must be satisfied before or as part of authorizing a separate implementation task — none require further investigation, only Owner decisions or process steps already fully specified in this report.

**This decision does not authorize implementation.** A separate, explicit Owner authorization — naming the specific task and confirming the conditions below — is required, exactly as it was for the NestJS migration (PLACE-032) and every execution task in this session.

## 24. Conditions that must be satisfied

1. **Owner must decide migration timing** (§13, row 1) — before staging / before restricted beta / before public launch / defer.
2. **Owner must decide the fetch-caching behavior trade-off** (§13, row 2) — accept Next 16's new defaults, or require C-1 (explicit cache directives) as part of the task's scope.
3. **Owner must confirm bundling the ESLint flat-config restructuring** into the same task (recommended, since `next lint`'s removal makes it a hard prerequisite, not a separable concern).
4. **This report itself must be treated as PLACE-033's persisted evidence record**, curing the gap identified in §4/§6 — no separate retroactive PLACE-033 artifact needs to be created.
5. **Implementation may proceed locally and in Docker; deployment to any real production environment (Hostinger or otherwise) must not occur as part of this migration**, since that environment's compatibility remains genuinely unverified (§14) — this is a standing constraint already true of every prior PLACE task in this session, not new to this migration.

## 25. Draft task status

Per this task's own governance rules (§16 of the assigned instructions), because the gate result is `AUTHORIZED WITH CONDITIONS`, a **draft, inactive** task authority file has been created at `docs/delivery/tasks/PLACE-034.yaml`. It is explicitly marked `status: draft_pending_owner_authorization` (not `completed`, not `in_progress`, and not a status this repository's state machine treats as active). `current.task` in `state.yaml` remains `none`. The draft is not executed by this task and requires a separate, explicit Owner instruction to activate.

## 26. Delivery-state updates

**None.** Per this task's own explicit instruction ("do not falsely mark a migration as completed... keep `current.task: none` unless governance explicitly authorizes another active task"), and consistent with the established precedent of PLACE-029's own Candidate Selection report (a governance/decision deliverable that also did not touch `state.yaml`'s `current.task` or `completed_tasks`), **`docs/delivery/state.yaml` and `docs/delivery/workstreams/place.yaml` are both left unmodified by this task.**

## 27. Files changed

| File | Nature |
|---|---|
| `docs/delivery/reports/PLACE-034-NEXTJS-16-DECISION-GATE-2026-07-25.md` | New — this report |
| `docs/delivery/tasks/PLACE-034.yaml` | New — draft, inactive task authority for the future implementation task |

**Zero application code, dependency manifest, lockfile, or Dockerfile touched.**

## 28. Commands executed

All read-only, listed in full in §8's table, plus: `git branch/rev-parse/log/status/remote`, `node -v`, `npm -v`, `docker ps`, `find`/`grep` calls enumerated throughout §3–§12, and the two `npm audit --json` calls whose full output is retained only in the session's scratchpad directory (not committed, consistent with every prior PLACE task's convention of citing audit *results*, not raw JSON, in committed evidence).

## 29. Working-tree status

Clean throughout — confirmed via `git status --short` immediately before this report was written and will be re-confirmed after the accompanying commit.

## 30. Commit and push status

This report and the draft task file will be committed as a single governance-documentation commit, following this session's established convention for every prior PLACE-0XX governance deliverable. **Nothing will be pushed** — no git remote is configured in this repository.
