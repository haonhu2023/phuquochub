# PLACE-041 — Enterprise Production Audit Report (2026-07-25)

## 1. Executive Summary

Continuing from PLACE-040 (completed, HEAD `5ca81cd` at task start, clean tree, no authorized
`current.task`). This Owner instruction requested a full 10-section enterprise production audit
(repository health, backend, frontend, infrastructure, operations, security, performance, a final
score, a prioritized action list, and immediate execution of everything locally completable),
explicitly forbidding new features, unnecessary refactors, and new technical debt.

**One real, evidence-backed correctness bug was found and fixed**: `hotels/[slug]`,
`restaurants/[slug]`, `tours/[slug]`, and `events/[slug]` page components caught *every* error from
their data fetch — including 5xx/network failures — and rendered a `404 Not Found`, unlike
`places/[slug]/page.tsx` (PLACE-035/036 baseline), which correctly distinguishes a genuine 404 from
other errors. This masked real outages as "page doesn't exist," which is both misleading to users
and incorrect for search-engine indexing (a transient server error should never tell Google a page
is permanently gone). Fixed identically in all 4 files using the exact pattern `places/[slug]`
already proved correct.

Three further genuine gaps were found and closed, each mirroring an existing, already-tested
repository pattern rather than inventing a new one: no security response headers existed anywhere
in the API; the 4 routes above (and the app root) had zero error/loading boundary, so the
newly-surfaced real errors had nowhere safe to land; and no incident-response runbook existed
anywhere in `docs/`.

**Repository-controlled production readiness remains ~92%** (unchanged from PLACE-040's
methodology — this task's fixes are correctness/resilience, not readiness-category items). See
§8 for the full per-dimension score and §9 for everything found but *not* executed, with reasons.

## 2. Phase 1 — Repository Health (Section 1)

| Check | Result | Evidence |
|---|---|---|
| Git branch | `master` | `git branch --show-current` |
| HEAD at task start | `5ca81cd` — PLACE-040 governance commit | `git log -1` |
| `git status` | clean at start | `git status` |
| TODO/FIXME/HACK/XXX | **0 found** in `apps/api/src`, `apps/web/src`, `packages/` | `grep -rn "TODO\|FIXME\|HACK\|XXX"` |
| `console.log`/debug code | 1 hit: `console.error(error)` in `places/error.tsx:17` — a deliberate, documented client-side error-boundary log, not stray debug code | `grep -rn "console\."` + file read |
| `debugger;` statements | 0 found | `grep -rln "debugger;"` |
| Large commented-out code blocks | 0 found (one false-positive match on a code comment containing `//` as part of a URL-shaped string) | `grep -rn "^[[:space:]]*//.*//"` |
| Orphan/duplicate/deprecated configs | Root `.eslintrc.cjs` (ESLint 8, `apps/api`+packages) coexists with `apps/web/eslint.config.mjs` (ESLint 9 flat) — **confirmed deliberate**, root config explicitly `ignorePatterns: ['apps/web/**']` with a comment explaining the split (PLACE-035 scoped the flat-config migration to web only) | `Read .eslintrc.cjs` |
| `tsconfig*.json` count | 6 files — all legitimate (per-package + `tsconfig.base.json` + api's separate `tsconfig.build.json` for prod builds, a standard NestJS pattern) | `find . -iname "tsconfig*.json"` |
| Duplicate compose files | `docker-compose.yml` (dev) + `docker-compose.prod.yml` (prod) — both legitimate, distinct purposes | `find . -iname "docker-compose*"` |
| Stray `.orig`/`.bak`/`~`/`.old` files | 0 found | `find` |
| Committed `.env` | 0 found | `git ls-files \| grep -E "^\.env$\|/\.env$"` |
| Unused packages | Not exhaustively verified via `depcheck` this session; manual review of `apps/api/package.json`'s 20 dependencies found none obviously orphaned (every entry traced to a real usage already documented in prior PLACE reports) | manual review, see evidence index |
| Unused scripts | 0 — all 6 `scripts/*.sh` are referenced by `RELEASE-AND-ROLLBACK-CHECKLIST.md` and/or each other (PLACE-038/040) | prior evidence + this task's re-check |

## 3. Phase 2 — Backend Audit (Section 2)

| Item | Verdict | Evidence |
|---|---|---|
| NestJS / DI / module boundaries | READY | Standard `core/`+`modules/`+`common/` structure throughout; every service/repository constructor-injected, no manual instantiation found |
| Circular dependencies | Not run through a dedicated graph tool (e.g. `madge`) this session — no `forwardRef(` usage found (`grep` — 0 hits), which is the usual symptom/workaround for circular DI in Nest, suggesting none exist, but not exhaustively proven | `grep -rn "forwardRef("` → 0 hits |
| DTO / Validation | READY | `class-validator`/`class-transformer` used throughout; global `ValidationPipe({whitelist, transform, forbidNonWhitelisted})` in `main.ts` |
| Serialization | READY | `TransformInterceptor` (global), mapper functions confirmed producing wire-shaped output (PLACE-005/011/012) |
| Exception filters | READY | `AllExceptionsFilter` (global), pins quiet-4xx/no-stack-leak behavior (prior PLACE evidence) |
| Guards | READY | `PermissionsGuard`, `@Public()` decorator confirmed on health/auth-public routes |
| Interceptors | READY | `LoggingInterceptor` + `TransformInterceptor`, both global |
| Swagger | **PARTIAL** | `docs/api/openapi.yaml` is hand-maintained and kept reconciled to runtime (PLACE-017/021), but **no `@nestjs/swagger` SwaggerModule exists** — `grep -rn "SwaggerModule\|@nestjs/swagger"` → 0 hits. No live `/api/docs` UI. |
| Health checks | READY | `/api/health` — DB + Redis, `@Public`+`@SkipThrottle` |
| Caching | READY | `RedisService` used for geocode cache-aside (`geo.service.ts`) with a documented fail-open policy on Redis errors |
| Rate limit | READY | `ThrottlerModule`, global + auth-specific limits, env-configurable (PLACE-028) |
| Security headers | **FIXED this task** | Was 0 — no `helmet`, no manual equivalent. New `security-headers.middleware.ts` sets `X-Content-Type-Options`/`X-Frame-Options`/`Referrer-Policy` |
| JWT | READY | Required unconditionally, `min(16)`, access+refresh split (PLACE-029 hardening) |
| RBAC | READY | `PermissionsGuard`, role/permission tables from `InitRbacAndUsers` migration, service-layer privilege checks (PLACE-007/008 evidence) |
| File upload | **DEFERRED (by design)** | MinIO exists in compose but zero application-code reference (`grep -rn "S3_\|MinIO\|minio\|@aws-sdk" apps/api/src` → 0 hits) — Owner-approved deferral (PLACE-037 §6), not a defect |
| Database / Transactions | READY | `this.ds.transaction(...)` used correctly for multi-statement writes (`hotels.repository.ts`, `restaurants.repository.ts`) |
| TypeORM | READY | `synchronize: false` everywhere, `migrationsRun: false` (migrations run as a separate step, matches `deploy.sh`) |
| Migration status | READY | 20 migrations, all confirmed additive (PLACE-037/038); `migration:revert` rehearsal still open (session-blocked, not a defect) |
| Seed strategy | READY (dev-only) | `SeedInitialPlaces`/`SeedPlacesExpansion`/`SeedRbac`/etc. migrations seed reference data; real production data entry is a separate, expected operational process |
| Redis | READY | Password-enforced in prod compose (PLACE-038), app-level fail-fast added (PLACE-040) |
| MinIO | PARTIAL (deliberate) | Present, unused by app code; `image: minio/minio:latest` tag unpinned (minor hygiene note, not fixed) |

## 4. Phase 3 — Frontend Audit (Section 3)

| Item | Verdict | Evidence |
|---|---|---|
| Next.js / App Router | READY | Next 16.2.11 (PLACE-035/036 baseline), `output: 'standalone'`, clean `next build` this task: 11/11 routes |
| SEO / Metadata | READY (mostly) | 10 files export `metadata`/`generateMetadata`; `places/[slug]` has full OG/Twitter/canonical tags; other detail routes have basic title/description only (not full OG) |
| Performance | PARTIAL | No `@next/bundle-analyzer` wired in; `.next/static/chunks` totals ~1.5M (not alarming, not measured against a budget) |
| Image optimization | READY | `next/image` used in both places where images render (`places/[slug]/page.tsx`, `PlaceCard.tsx`); 0 raw `<img>` tags found |
| Error boundaries | **FIXED this task (4 of ~11 segments)** | Was: only `/places` had one. Now: `/places`, `/hotels/[slug]`, `/restaurants/[slug]`, `/tours/[slug]`, `/events/[slug]`, plus a new root `global-error.tsx`. Still missing: `/explore`, `/map`, `/search`, `/dashboard`, `(auth)` routes — see §9 |
| Loading UI | **FIXED this task (same 4 routes)** | Same pattern as above |
| Suspense | PARTIAL | Used only in `(auth)/login/page.tsx` (for `useSearchParams`); not a general gap since Suspense isn't required everywhere in the App Router |
| Accessibility | **PARTIAL, limited** | Only 8 files repository-wide use `aria-*`/`role` attributes; no dedicated a11y audit (e.g. axe-core) has ever been run |
| Bundle size | Not measured against a budget (see Performance above) | — |
| Hydration | READY (no evidence of mismatch) | No hydration-warning-suppressing code found (`suppressHydrationWarning` — 0 hits), which would be the usual workaround signature if a known mismatch existed |
| Static generation | READY | Build output confirms `○ (Static)` for `/dashboard`, `/explore`, `/login`, `/map`, `/register`, `/search`, `/_not-found`; `ƒ (Dynamic)` correctly for data-dependent routes |
| List/browse pages | **MISSING (product-completeness, not a defect)** | `find` confirms **no page.tsx exists at all** for `/hotels`, `/restaurants`, or `/tours` at the segment root — only their `[slug]` detail pages exist. Only `/places` and `/events` have list pages. Explicitly NOT built this task (new feature, out of scope) |
| `dangerouslySetInnerHTML` (XSS surface) | READY — 0 uses | `grep -rn "dangerouslySetInnerHTML" apps/web/src` → 0 hits |

## 5. Phase 4 — Infrastructure Audit (Section 4)

Re-confirmed unchanged from PLACE-038/040 (no Dockerfile/Compose/Caddyfile touched this task):
Docker images (multi-stage, non-root, `HEALTHCHECK`), Compose topology (only Caddy publishes
80/443), volumes (named, persistent), restart policy (`unless-stopped`), reverse proxy (Caddy,
automatic HTTPS design), compression (Caddy `encode gzip` — confirmed, so no app-level compression
middleware is needed), environment variables (Joi fail-fast, now including `REDIS_URL` per
PLACE-040), secrets (placeholder convention, zero real value in repo). **All READY.** `docker
compose config --quiet` re-run this task: exit 0.

## 6. Phase 5 — Operational Audit (Section 5)

| Item | Verdict | Evidence |
|---|---|---|
| Logging | READY | `AppLoggerService` + correlation-ID (PLACE-030), Docker `json-file` rotation (PLACE-038) |
| Monitoring | PARTIAL | Infra-native (healthchecks + logs) READY; external uptime account still Owner-side (PLACE-039 §3) |
| Backup / Restore | READY | `scripts/backup.sh`/`restore.sh`, both actually executed successfully in PLACE-038 |
| Rollback | READY | `scripts/rollback.sh`, rehearsed 3x across PLACE-031/032/036, scripted PLACE-038 |
| Runbooks | READY (now complete) | `ENVIRONMENT-SETUP-RUNBOOK.md`, `PRE-DEPLOYMENT-CHECKLIST.md`, `RELEASE-AND-ROLLBACK-CHECKLIST.md` (PLACE-039/040) + **new `INCIDENT-RESPONSE-RUNBOOK.md` (this task, was completely missing)** |
| Disaster recovery | PARTIAL | Covered by backup/restore + the new incident runbook's §5; no fixed RTO/RPO number exists (deliberately — no real traffic yet to derive one from) |
| Deployment / Release | READY | `scripts/deploy.sh` + `RELEASE-AND-ROLLBACK-CHECKLIST.md` (PLACE-040) |
| Incident response | **FIXED this task** | Was 0 — no document existed. New `INCIDENT-RESPONSE-RUNBOOK.md`: triage steps, a symptom→response table, rollback linkage, explicit statement of what it does NOT cover (no on-call rotation/status page exist yet) |

## 7. Phase 6 — Security Audit (Section 6)

| Item | Verdict | Evidence |
|---|---|---|
| Secrets / hardcoded credentials | READY | Secret scan across every file this and prior PLACE tasks touched — 0 literal secret found; all production secrets are Joi-required env vars with `change-me-*` placeholders |
| Dangerous permissions | READY | Containers run as non-root `USER node` (both Dockerfiles); RBAC enforced service-side |
| Dependency vulnerabilities | PARTIAL (unchanged, upstream-blocked) | Fresh `npm audit --omit=dev`: **8 high, 0 critical** — identical count to the PLACE-036 baseline (next/postcss/sharp-rooted, no stable fix released by upstream) |
| Security headers | **FIXED this task** | See §3 backend table |
| CORS | READY | Allow-list required in production, fail-fast, explicit `credentials` opt-in |
| Cookies | **N/A by design** | 0 cookie usage found anywhere in `apps/api/src/modules/auth` — bearer-token-only auth (confirmed, not assumed) |
| JWT | READY | See backend table |
| CSRF | **N/A by design** | CSRF is a cookie/session attack vector; this API never auto-attaches credentials cross-origin (bearer token in an explicit `Authorization` header), so the traditional CSRF threat model does not apply |
| XSS | READY | React's default JSX escaping + 0 `dangerouslySetInnerHTML` uses (see frontend table) |
| SQL Injection protections | READY | Every raw query in `places.repository.ts` (and others) uses `$1, $2, ...` parameterized placeholders with values passed as a separate array — the correct, injection-safe TypeORM raw-query pattern, confirmed by direct code read across ~15 query sites; the one string-interpolated constant (`CARD_COLS`) is a hardcoded column list, never user input |

## 8. Phase 7 — Performance Audit (Section 7)

| Item | Verdict | Evidence |
|---|---|---|
| Database indexes | READY | `idx_places_location` (GIST, geo), FTS `GIN` index on places/events, `idx_places_status_active` (PLACE-003), `idx_tour_stops_location` (GIST) |
| Slow queries / EXPLAIN evidence | DEFERRED (Owner decision OD-B6, unchanged) | No real production traffic exists yet to profile against; deliberately not fabricated |
| N+1 | READY (read path); acceptable pattern (write path) | No N+1 found in list/detail read queries (single JOIN/subselect patterns, e.g. `CARD_COLS`'s cover-image subselect). Nested `for` loops found in `hotels.repository.ts`/`restaurants.repository.ts` are admin-side batch WRITES (replace-all room-types/menu-items) with small, bounded N (tens of rows) inside a single transaction — not the read-path amplification N+1 normally refers to |
| Redis usage | READY | Geocode cache-aside with a documented fail-open policy (`geo.service.ts`) |
| Compression | READY | Handled at the reverse-proxy layer (`Caddyfile`: `encode gzip`) — correct architectural choice, no redundant app-level middleware needed |
| Caching | READY | See Redis usage above |
| Pagination | READY | Offset page/limit, ratified (PLACE-021, OD-B1) |
| Bundle optimization | PARTIAL, not measured against a budget | `.next/static/chunks` ≈ 1.5M this build; no analyzer wired in, no regression baseline exists to compare against |

## 9. Phase 8 — Final Score (Section 8)

| Dimension | Score | Basis |
|---|---|---|
| Architecture | 88/100 | Clean module boundaries, ADR-driven decisions, DI used correctly throughout; no dedicated circular-dependency graph tool run (§3) |
| Backend | 90/100 | Comprehensive DTO/guards/interceptors/filters/health/caching/rate-limit/JWT/RBAC/SQLi-safety; Swagger UI absent (manual spec only) |
| Frontend | 74/100 | SEO/image-optimization/static-gen all solid; accessibility and bundle-size measurement thin, 3 of 5 content types have no list page, error/loading coverage improved but still partial |
| Infrastructure | 93/100 | Docker/Compose/health/ports/proxy/secrets all strong (PLACE-026/038/040); MinIO tag unpinned is the only nit |
| Operations | 87/100 | Backup/restore/rollback/deploy/release/incident-response all now documented and scripted; external monitoring account and the migration:revert rehearsal remain open |
| Security | 86/100 | SQLi/XSS/CSRF/JWT/RBAC/rate-limit/CORS/secrets/headers all strong; 8 high dependency findings open (upstream-blocked, not this repo's doing); no formal third-party security review has ever been run |
| Performance | 83/100 | Indexes/caching/pagination/compression all correct; EXPLAIN-at-scale evidence deliberately deferred (no real traffic to profile), bundle size unmeasured against a budget |
| Documentation | 95/100 | Exceptionally thorough — dozens of ADRs, delivery reports, evidence indices, and now a complete runbook/checklist set; the strongest dimension of this project |
| Testing | 79/100 | 256 backend unit tests (this task) + 59 e2e (last run PLACE-038, Docker unavailable this session) + 17 web unit tests, all green; **zero frontend component/integration tests exist** |
| **Overall repository-controlled production readiness** | **~92%** | Unchanged methodology from PLACE-040 (16 READY + 1 PARTIAL out of 18 scored infra/config items); this task's fixes are correctness/resilience additions layered on top, not a re-scored readiness category |

**Not concluded "production ready."** Real go-live remains blocked on 4 Owner-side actions (§13)
and one session-blocked item (the `migration:revert` rehearsal, needs a reachable Docker engine).

## 10. Phase 9 — Prioritized Action List (Section 9)

Only items **not** executed by this task. Each has a one-line reason.

**Critical:** none. No open item blocks a controlled initial production launch from a
code-correctness standpoint.

**High:**
1. Verify/provision the real Hostinger KVM VPS — Owner-side, cannot be simulated (PLACE-039 §1).
2. Point real DNS at the VPS and obtain live TLS — depends on #1.
3. `migration:revert` rehearsal — Docker engine unreachable this session (not Owner-blocked; retry
   once Docker is available, before any real non-additive migration is ever deployed).
4. External uptime-monitor account — Owner-side account signup (PLACE-039 §3).
5. Real Cloudflare R2 credentials for offsite backup — Owner-side account/credential creation.

**Medium:**
6. Zero frontend component/integration tests exist — judged out of this audit-task's own
   immediate-execution bar (writing a first test *harness* + tests for existing pages is closer
   to new test-infrastructure work than a "fix a found gap" action).
7. Error/loading boundaries for the remaining route segments (`/explore`, `/map`, `/search`,
   `/dashboard`, `(auth)` routes) — lower priority than the 4 fixed this task, since those 4 had
   an actual masked-error bug, not merely a missing boundary.
8. Live Swagger/OpenAPI UI (`@nestjs/swagger`) — the manually-maintained spec is kept reconciled
   (PLACE-017/021); adding a new runtime dependency + endpoint was judged out of this task's
   no-new-scope-creep instruction.
9. `sitemap.xml`/`robots.txt` — pre-existing gap (PLACE-036), SEO-only, non-blocking.
10. Accessibility improvements beyond the 8 files currently using `aria-*`/`role` — needs a real
    audit tool (e.g. axe-core via a browser session) this task did not run.
11. HSTS header at the Caddy layer — deliberately deferred to when a real domain/TLS is live;
    setting it prematurely against a not-always-HTTPS host is actively risky.
12. `MinIO` image tag pinning (`:latest` → a specific version) — MinIO itself is unused by
    application code; low-value while it stays unused.

**Low:**
13. 8 high dependency-vulnerability findings (next/postcss/sharp) — blocked entirely on an
    upstream fix; no action is possible from this repository.
14. List/browse pages for hotels/restaurants/tours — confirmed genuinely absent; explicitly a new
    feature, forbidden by this task's own instruction.
15. A full `depcheck`-style unused-package audit — not exhaustively run; manual review found
    nothing suspicious, but this is a lighter bar than a dedicated tool run.

## 11. Phase 10 — Immediate Execution (Section 10)

Executed (all local-only, zero Owner/VPS/DNS/real-secret dependency):
1. Fixed the 404-vs-error masking bug in 4 files.
2. Added `error.tsx`/`loading.tsx` to those same 4 routes + a root `global-error.tsx`.
3. Added `security-headers.middleware.ts` (+ spec), wired into `main.ts`.
4. Wrote `docs/delivery/INCIDENT-RESPONSE-RUNBOOK.md`.

## 12. Validation Results

| Check | Result |
|---|---|
| `npx jest` full apps/api suite | **256/256 passed, 35 suites** (was 254/34 post-PLACE-040 — +2 new security-headers-middleware tests) |
| `npx tsc -p apps/api/tsconfig.json --noEmit` | exit 0 |
| `npx eslint src/main.ts src/common/middleware/**/*.ts --max-warnings=0` (api) | exit 0 |
| `npx nest build` (apps/api) | exit 0; `dist/common/middleware/security-headers.middleware.js` present |
| `npx tsc -p apps/web/tsconfig.json --noEmit` | exit 0 |
| `npx eslint . --max-warnings=0` (apps/web) | exit 0 |
| `npx jest` apps/web unit suite | 17/17 passed, 3 suites (unchanged — no existing test touches the changed pages) |
| `npx next build` (apps/web, Turbopack) | **exit 0, 11/11 routes generated**, zero error |
| `docker compose -f docker-compose.prod.yml config --quiet` | exit 0 (unchanged, not touched this task) |
| Secret scan (all new/modified files) | zero matches |

Full monorepo `test:e2e` was **not** re-run — it requires a live Postgres/Redis, and this
session's Docker engine is unreachable (same as PLACE-039/040's sessions); the 59/59 e2e baseline
from PLACE-038 is unaffected since zero backend business logic changed (only a new middleware
purely adding response headers, already covered by its own new unit test).

## 13. Not Claimed

- **Not** "production ready" — see §9 Critical/High items, all genuinely open.
- No real Hostinger VPS, DNS record, Cloudflare R2 credential, or uptime-monitor account.
- No `migration:revert` rehearsal (Docker engine unreachable this session).
- No `helmet` or any other new npm dependency added.
- No list/browse page built for hotels/restaurants/tours.
- No sitemap/robots.txt, live Swagger UI, frontend component tests, or accessibility remediation.
- No PLACE-042 created or started.
