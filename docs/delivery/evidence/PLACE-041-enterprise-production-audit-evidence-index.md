# PLACE-041 — Evidence Index (Enterprise Production Audit, 2026-07-25)

Backs `docs/delivery/reports/PLACE-041-enterprise-production-audit-report.md`. All commands on
the D: checkout, Git Bash, pinned Node v20.20.2/npm 10.8.2 for lint/typecheck/test/build.

## Phase 1 — Repository state

| id | evidence | result |
|---|---|---|
| S-1 | `git branch --show-current` | `master` |
| S-2 | `git log -1 --format="%H %s"` | `5ca81cd... docs(delivery): PLACE-040 task, report, evidence index, state updates` |
| S-3 | `git status` | clean at start |
| S-4 | `grep -n "task: none\|status: awaiting" docs/delivery/state.yaml` | `current.task: none`, `awaiting_task_authorization` |

## Section 1 — Repository health

| id | evidence | result |
|---|---|---|
| H-1 | `grep -rn "TODO\|FIXME\|HACK\|XXX" apps/api/src apps/web/src packages` | 0 matches |
| H-2 | `grep -rn "console\.(log\|debug\|warn\|error)" apps/api/src apps/web/src --include="*.ts" --include="*.tsx"` (excl. `.spec.ts`) | 1 match: `places/error.tsx:17`, read in full, confirmed a deliberate documented error-boundary log |
| H-3 | `grep -rln "debugger;"` | 0 matches |
| H-4 | `Read .eslintrc.cjs` | root ESLint 8 config, explicitly `ignorePatterns: ['apps/web/**']`, comment confirms deliberate coexistence with web's own flat config |
| H-5 | `find . -iname "tsconfig*.json"`, `find . -iname "docker-compose*"` | 6 tsconfigs / 2 compose files, all individually legitimate (see report §2) |
| H-6 | `find . \( -iname "*.orig" -o -iname "*.bak" -o -iname "*~" -o -iname "*.old" \)` | 0 matches |
| H-7 | `git ls-files \| grep -E "^\.env$\|/\.env$"` | 0 matches |
| H-8 | `cat apps/api/package.json` dependencies list (20 entries) manually reviewed | no obviously orphaned package found |

## Section 2 — Backend audit

| id | evidence | result |
|---|---|---|
| B-1 | `grep -rn "forwardRef("` apps/api/src | 0 matches (no circular-DI workaround pattern found) |
| B-2 | `grep -rn "SwaggerModule\|@nestjs/swagger" apps/api/src apps/api/package.json` | 0 matches — no live Swagger UI |
| B-3 | `Read apps/api/src/modules/health/health.controller.ts` | `/api/health`, DB+Redis checks, `@Public`+`@SkipThrottle` |
| B-4 | `grep -rn "S3_\|MinIO\|minio\|@aws-sdk" apps/api/src` | 0 matches — object storage confirmed unused |
| B-5 | `grep -n "createTransaction\|this.ds.transaction" apps/api/src/modules/hotels/repositories/hotels.repository.ts apps/api/src/modules/restaurants/repositories/restaurants.repository.ts` + full read | both use `this.ds.transaction(...)` correctly for multi-row writes |
| B-6 | `grep -n "minio" -A3 docker-compose.prod.yml` | `image: minio/minio:latest` — unpinned tag confirmed (carried from PLACE-040) |

## Section 3 — Frontend audit

| id | evidence | result |
|---|---|---|
| F-1 | `find apps/web/src/app -iname "error.tsx" -o -iname "global-error.tsx"` (before this task) | only `places/error.tsx` existed |
| F-2 | `find apps/web/src/app -iname "loading.tsx"` (before this task) | only `places/loading.tsx` + `places/[slug]/loading.tsx` |
| F-3 | `find apps/web/src/app -maxdepth 3 -type d` | full segment tree — confirmed `hotels/`, `restaurants/`, `tours/` have ONLY a `[slug]` subdirectory, no list-page files at their root (`find ... -maxdepth 1 -type f` on each → empty) |
| F-4 | `Read apps/web/src/app/(public)/hotels/[slug]/page.tsx` (before fix) | confirmed the blanket `catch { notFound(); }` bug |
| F-5 | `Read apps/web/src/app/(public)/places/[slug]/page.tsx` lines 56-67 | confirmed the CORRECT existing pattern: `if (err instanceof ApiError && err.isNotFound) notFound(); throw err;` — used as this task's fix template |
| F-6 | `grep -n "catch\|notFound()" apps/web/src/app/(public)/{restaurants,tours,events}/[slug]/page.tsx` | confirmed the identical blanket-catch bug in all 3 |
| F-7 | `grep -n "isNotFound\|class ApiError" apps/web/src/lib/http.ts` | confirmed `ApiError`/`isNotFound` exists and is the shared mechanism all 4 modules' `apiGet` already uses |
| F-8 | `grep -rln "next/image"` / `grep -rln "<img "` apps/web/src | 2 files use `next/image`; 0 raw `<img>` tags |
| F-9 | `grep -rln "aria-\|role="` apps/web/src --include="*.tsx" | 8 files repository-wide |
| F-10 | `grep -rln "Suspense"` apps/web/src | 1 file (`(auth)/login/page.tsx`) |
| F-11 | `grep -rn "dangerouslySetInnerHTML"` apps/web/src | 0 matches |
| F-12 | `find apps/web/src/app -iname "sitemap*" -o -iname "robots*"` | 0 matches (pre-existing, unchanged) |
| F-13 | `du -sh apps/web/.next/static/chunks` (post-build) | 1.5M |

## Section 4 — Infrastructure audit

| id | evidence | result |
|---|---|---|
| I-1 | `docker compose -f docker-compose.prod.yml config --quiet` | exit 0 — unchanged, not touched this task |
| I-2 | `grep -n "encode gzip" infrastructure/caddy/Caddyfile` (re-check) | present — confirms compression handled at proxy layer |

## Section 5 — Operational audit

| id | evidence | result |
|---|---|---|
| O-1 | `find docs -iname "*incident*" -o -iname "*disaster*"` (before this task) | 0 matches — confirmed the gap |
| O-2 | `ls docs/delivery/RELEASE-AND-ROLLBACK-CHECKLIST.md docs/delivery/PRE-DEPLOYMENT-CHECKLIST.md` | both present (PLACE-039/040), cross-referenced from the new runbook |

## Section 6 — Security audit

| id | evidence | result |
|---|---|---|
| SEC-1 | `grep -rn "helmet\|X-Frame-Options\|Content-Security-Policy\|Strict-Transport-Security" apps/api/src` (before this task) | 0 matches — confirmed the gap |
| SEC-2 | `npm audit --omit=dev --json` (fresh run) | `{critical:0, high:8, moderate:0, low:0, info:0}` — identical to the PLACE-036 baseline |
| SEC-3 | `grep -rln "csrf\|CSRF"` apps/api/src | 0 matches — confirms CSRF middleware absent; judged N/A given bearer-token auth (no cookie-based session) |
| SEC-4 | `grep -rn "\.query(\|\$1\|\$2"` `apps/api/src/modules/places/repositories/places.repository.ts` (full file read) | ~15 raw-query sites, ALL using `$1,$2,...` parameterized placeholders with a separate values array; `CARD_COLS` confirmed a static hardcoded constant, not user input |
| SEC-5 | `grep -rn "\.where(\|\.andWhere(\|\.orWhere("` places/geo/search repositories | 0 matches — these repositories use raw parameterized queries instead of QueryBuilder `.where`, consistent with SEC-4 |

## Section 7 — Performance audit

| id | evidence | result |
|---|---|---|
| P-1 | `grep -rn "USING GIST\|USING GIN"` migrations | `idx_places_location` (GIST), FTS GIN indexes (places, events), `idx_tour_stops_location` (GIST) |
| P-2 | `grep -rln "RedisService\|cache"` apps/api/src/modules | `token.service.ts`, `geo.service.ts`, `redis.health.ts` |
| P-3 | `Read apps/api/src/modules/geo/geo.service.ts` (redis lines) | confirmed cache-aside with fail-open (`catch` → warn + continue) around both `get` and `set` |
| P-4 | `grep -rn "for (const .* of .*) {"` apps/api/src/modules | 4 hits; `permissions.guard.ts` (in-memory, not DB), `hotels.repository.ts`/`restaurants.repository.ts` (bounded-N write-path batch inserts inside a single transaction, not read-path N+1) |

## Phase 10 — Implementation

| id | evidence | result |
|---|---|---|
| X-1 | 4 files edited: `apps/web/src/app/(public)/{hotels,restaurants,tours,events}/[slug]/page.tsx` | `catch { notFound(); }` → `catch (err) { if (err instanceof ApiError && err.isNotFound) notFound(); throw err; }`, `import { ApiError } from '@/lib/http';` added to each |
| X-2 | 8 new files: `.../{hotels,restaurants,tours,events}/[slug]/error.tsx` + `loading.tsx` | new, minimal, dependency-free (no CSS-module coupling) |
| X-3 | `apps/web/src/app/global-error.tsx` | new — root-level catch-all, renders its own `<html>/<body>` per Next.js's required pattern |
| X-4 | `apps/api/src/common/middleware/security-headers.middleware.ts` + `.spec.ts` | new — mirrors `correlation-id.middleware.ts`'s exact file+spec structure |
| X-5 | `apps/api/src/main.ts` edited | `app.use(securityHeadersMiddleware)` added immediately after the correlation-ID middleware |
| X-6 | `docs/delivery/INCIDENT-RESPONSE-RUNBOOK.md` | new |

## Validation

| id | command | result |
|---|---|---|
| V-1 | `npx jest --silent` (apps/api) | **256/256 passed, 35 suites** (was 254/34 — +2 new tests from `security-headers.middleware.spec.ts`) |
| V-2 | `npx tsc -p apps/api/tsconfig.json --noEmit` | exit 0 |
| V-3 | `npx eslint src/main.ts src/common/middleware/**/*.ts --max-warnings=0` (apps/api) | exit 0 |
| V-4 | `npx nest build` (apps/api) | exit 0; `dist/common/middleware/security-headers.middleware.js` present |
| V-5 | `npx tsc -p apps/web/tsconfig.json --noEmit` | exit 0 |
| V-6 | `npx eslint . --max-warnings=0` (apps/web) | exit 0 |
| V-7 | `npx jest --silent` (apps/web) | 17/17 passed, 3 suites — unchanged |
| V-8 | `npx next build` (apps/web, Turbopack) | exit 0; **11/11 routes generated**, 0 error; confirmed dynamic (`ƒ`) vs static (`○`) classification for every route |
| V-9 | `docker compose -f docker-compose.prod.yml config --quiet` | exit 0 (untouched this task) |
| V-10 | `git diff` review + secret-pattern grep across every new/modified file | scoped exactly to §Files-Modified in the report; zero secret-looking literal found |

## Not claimed

| id | item | disposition |
|---|---|---|
| NX-1 | "Production ready" conclusion | NOT made — Critical/High items remain open (report §9) |
| NX-2 | Real Hostinger/VPS/DNS/R2/uptime-monitor-account action | NOT performed |
| NX-3 | `migration:revert` rehearsal | NOT performed — Docker engine unreachable this session |
| NX-4 | `helmet` or any new npm dependency | NOT added |
| NX-5 | List/browse pages for hotels/restaurants/tours | NOT built — confirmed genuinely absent, explicitly a new feature |
| NX-6 | Sitemap/robots.txt, live Swagger UI, frontend component tests, accessibility remediation, HSTS at Caddy, MinIO tag pinning | NOT implemented — all reported in the prioritized action list |
| NX-7 | Full monorepo e2e re-run | NOT performed — Docker engine unreachable; zero backend business logic changed, so the PLACE-038 59/59 baseline is judged unaffected |
| NX-8 | PLACE-042 | NOT started, NOT created |
