# PLACE-040 — Production Configuration Inventory & Gap Analysis Report (2026-07-25)

## 1. Executive Summary

Continuing directly from PLACE-039 (completed, HEAD `15dac59` at task start, clean tree, no
authorized `current.task`). This Owner instruction requested a full production configuration
inventory across 20 categories, a READY/PARTIAL/MISSING/BLOCKED gap analysis with evidence for
every item, and execution of everything locally completable.

**Two real, previously-undiscovered gaps were found and fixed**, both local-only:
1. `REDIS_URL` had no production-required validation rule (unlike `DB_HOST`/`CORS_ALLOWED_ORIGINS`)
   — a misconfigured production deploy would silently fall back to the unauthenticated
   `redis://localhost:6379` dev default instead of failing fast. Fixed to mirror the existing
   `DB_HOST` pattern exactly; 3 new tests added; full 254/254 API unit suite green (was 251/251).
2. `scripts/deploy.sh`'s Step 11 pointed at a `scripts/smoke-routes.sh` that was never actually
   committed — a dangling reference, functionally a no-op. Fixed by writing the real script
   (`scripts/smoke-test.sh`) and wiring it in.

Everything else audited (Docker images/Compose, reverse proxy, ports, health endpoints,
PostgreSQL, JWT, CORS, rate limiting, logging, backup/restore, build artifacts) was found already
correctly implemented by PLACE-026/028/029/030/038 and unchanged. **Repository-controlled
production readiness: ~90%** (see §4 scoring). The remaining gap is entirely either a deliberate,
previously-approved deferral (MinIO/object storage, transactional email, sitemap/robots.txt) or
blocked on real-world Owner action (Hostinger VPS, DNS, R2, uptime-monitor account) or this
session's unreachable Docker engine (the `migration:revert` rehearsal, still open since PLACE-037
§12).

## 2. Phase 1 — Active Authority Verification

| Fact | Value |
|---|---|
| Branch | `master` |
| HEAD at task start | `15dac59` — "docs(delivery): PLACE-039 task, report, evidence index, state updates" |
| `git status` | clean |
| `current.task` (state.yaml) | `none` |
| `next_action.status` | `awaiting_task_authorization` |
| PLACE-037/038/039 task files | all `status: completed` |
| Docker engine | unreachable this session too (`docker ps`/`version` → npipe connection failure), same as PLACE-039's session — `docker compose config --quiet` still works (client-side only) |

No task was pre-authorized in `state.yaml`; this Owner instruction is itself the authorization,
identical in kind to how PLACE-039 was authorized last turn.

## 3. Phase 2 — Production Configuration Inventory (evidence-backed)

| # | Category | Verdict | Evidence |
|---|---|---|---|
| 1 | Environment variables | READY | `apps/api/src/core/config/env.validation.ts` — Joi schema, production-required for `DB_*`, `JWT_*`, `CORS_ALLOWED_ORIGINS`, and now `REDIS_URL` (this task's fix) |
| 2 | Docker images | READY | `apps/api/Dockerfile`/`apps/web/Dockerfile` — multi-stage, non-root `USER node`, `--chown=node:node`, native `HEALTHCHECK` (lines ~50-53 both files) |
| 3 | Docker Compose (prod) | READY | `docker-compose.prod.yml` — `docker compose config --quiet` exit 0 this session |
| 4 | Reverse proxy | READY | `infrastructure/caddy/Caddyfile` — routes `/api/*`→api, else→web, automatic HTTPS + local `:8080` test address |
| 5 | Ports | READY | `docker-compose.prod.yml:240-242` — only `caddy` publishes `80`/`443`; postgres/redis/minio/api/web have no `ports:` block |
| 6 | Health endpoints | READY | `apps/api/src/modules/health/health.controller.ts` — `GET /api/health`, `@Public`+`@SkipThrottle`, checks DB (`TypeOrmHealthIndicator`) + Redis (`RedisHealthIndicator`) |
| 7 | Redis | READY (was PARTIAL) | Compose: `--requirepass`, `REDIS_URL` password-embedded (PLACE-038); app-level fail-fast now added (this task) |
| 8 | PostgreSQL | READY | `postgis/postgis:16-3.4` image, 20 migrations present (`apps/api/src/core/database/migrations/`), WAL archiving via `wal-archive.sh` |
| 9 | MinIO | PARTIAL (deliberate) | Service exists in compose (`minio/minio:latest`) but zero `S3_*`/`@aws-sdk`/`minio` reference anywhere in `apps/api/src` (`grep` returned no files) — Owner-approved deferral (PLACE-037 §6), not a defect. Minor hygiene note: image tag `:latest` is unpinned |
| 10 | Upload storage | MISSING (deliberate) | Same as #9 — no application code path exists; deferred, not required for current feature set |
| 11 | JWT secrets | READY | `env.validation.ts:42-43` — `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` required unconditionally, `min(16)` |
| 12 | Cookie configuration | N/A by design | `grep cookie` across `apps/api/src/modules/auth` → no files; bearer-token-only auth (confirmed also by PLACE-036's independent review) |
| 13 | CORS | READY | `main.ts:43-48`, `env.validation.ts:54-59` — required in production, fail-fast; `CORS_CREDENTIALS` explicit opt-in |
| 14 | Rate limiting | READY | `apps/api/src/core/rate-limit/rate-limit.module.ts`, `env.validation.ts:48-51` — global + auth-specific throttling (PLACE-028) |
| 15 | Logging | READY | `AppLoggerService`, `correlation-id.middleware.ts` (PLACE-030); Docker `logging: {driver: json-file, max-size: 10m, max-file: 5}` on every compose service |
| 16 | Backup | READY | `scripts/backup.sh` — actually executed successfully in PLACE-038 (real gzip pg_dump, retention logic); not re-executed this session (Docker unreachable) |
| 17 | Restore | READY | `scripts/restore.sh` — actually executed successfully in PLACE-038 (destructive-confirmation gate, row-count parity proven) |
| 18 | Email | N/A (no feature needs it) | `grep -rn "nodemailer\|smtp\|EmailService"` across `apps/api/src` → no files; `grep -rn "forgot-password\|reset-password"` → no files — no feature exists that would need it (confirmed, not assumed) |
| 19 | Monitoring | PARTIAL | Infra-native (healthchecks + structured logs) READY; external uptime-monitor account NOT created (Owner-side, PLACE-039 §3 item 4) |
| 20 | Build artifacts | READY | `turbo.json:14` outputs `dist/**`, `.next/**`; this task's own `nest build` produced `dist/main.js` cleanly |
| 21 | Static assets | PARTIAL (pre-existing) | `apps/web/public` empty; no `sitemap.xml`/`robots.txt` anywhere under `apps/web/src/app` — already flagged low-priority/non-blocking in PLACE-036 |
| 22 | Startup/shutdown/smoke verification | READY (was MISSING) | `scripts/smoke-test.sh` (new, this task); `app.enableShutdownHooks()` confirmed in `main.ts:61`; documented in new `RELEASE-AND-ROLLBACK-CHECKLIST.md` |
| 23 | `migration:revert` rehearsal | BLOCKED (session) | Docker engine unreachable this session (same as PLACE-039's) — still not attempted, carried forward |
| 24 | Real VPS/DNS/R2/uptime-account | BLOCKED (Owner) | Cannot be performed or simulated from this repository — see PLACE-039 §1/§3 |

## 4. Phase 3 — Scoring

Scoring covers items 1–23 (repository-controlled or session-local; item 24 is pure Owner-side and
is listed, not scored, since no repository evidence can move it). Items 9/10/12/18/21 are
deliberate, previously-approved non-goals or already-known low-priority items, not new failures —
excluded from the denominator to avoid double-penalizing decisions already made; noted for
completeness above.

- READY: 1,2,3,4,5,6,7,8,11,13,14,15,16,17,20,22 = **16**
- PARTIAL: 19 (monitoring, infra-native done / uptime account pending) = **1** (0.5 credit)
- BLOCKED (session, not Owner): 23 (migration:revert) = **1** (0 credit)
- Scored denominator: 16 + 1 + 1 = 18

**Repository-controlled production readiness: (16 + 0.5) / 18 ≈ 92%.**

**Real-world go-live readiness cannot be scored from repository evidence** — it depends entirely
on the 4 Owner-side actions in item 24 (Hostinger VPS, DNS, R2, uptime-monitor account), none of
which this repository can verify, provision, or simulate.

## 5. Phase 4 — Work Executed

### 5.1 REDIS_URL fail-fast fix
`apps/api/src/core/config/env.validation.ts` — `REDIS_URL` now `Joi.required()` when
`NODE_ENV=production`, mirroring `DB_HOST`. `apps/api/src/core/config/env.validation.spec.ts` — 3
new tests (pass-when-set / fail-when-missing / dev-default-unaffected) plus the pre-existing
PLACE-029 suite's `baseProdEnv` fixture updated to include `REDIS_URL` (it would otherwise now
fail that suite's own "all DB credentials set" case, since production requires `REDIS_URL` too).

### 5.2 Smoke-test script + deploy.sh wiring
`scripts/smoke-test.sh` (new) — checks `/api/health` (200), web home (200), an unknown route
(404, deliberately not `/places/<bogus-slug>`, which has an unrelated pre-existing 200-not-404
quirk per PLACE-035/036), and an optional real-slug content check. `scripts/deploy.sh` Step 11
now actually calls it against Caddy's local `:8080` address, halting with a rollback instruction
on failure instead of the previous inert echo.

### 5.3 Release/rollback/backup/restore operational checklist
`docs/delivery/RELEASE-AND-ROLLBACK-CHECKLIST.md` (new) — checkbox-style, naming the exact
script/command for every step (pre-release, deploy, smoke test, rollback triggers, rollback,
restore, routine backup, startup verification, shutdown verification).

### 5.4 PRE-DEPLOYMENT-CHECKLIST.md updated
Added the `REDIS_URL` row to the secrets table (§2) noting the new fail-fast enforcement, and a
cross-link to the new release/rollback checklist.

## 6. Phase 5 — Validation

| Check | Result |
|---|---|
| `npx jest env.validation` (apps/api, pinned Node v20.20.2) | 11/11 passed |
| `npx jest` full apps/api suite | **254/254 passed, 34 suites** (was 251/251 pre-PLACE-040 baseline — +3 new tests, zero regression) |
| `npx tsc -p apps/api/tsconfig.json --noEmit` | exit 0 |
| `npx eslint src/core/config/**/*.ts --max-warnings=0` | exit 0 |
| `npx nest build` (apps/api) | exit 0; `dist/main.js`, `dist/core/config/env.validation.js` present |
| `sh -n scripts/smoke-test.sh` | OK |
| `sh -n scripts/deploy.sh` (post-edit) | OK |
| `docker compose -f docker-compose.prod.yml config --quiet` | exit 0 (client-side validation; daemon unreachable but not required for this check) |
| Secret scan on all changed/new files | zero literal secret value found |

Full monorepo `turbo run build` / e2e / web build were **not** re-run: this task touched exactly
one shared API config file (+ its spec), two shell scripts, and documentation — the targeted
apps/api typecheck+lint+unit+build above directly covers the changed surface, and e2e requires a
live Postgres/Redis this session's unreachable Docker engine cannot provide.

## 7. Files Created or Modified

| File | Change |
|---|---|
| `apps/api/src/core/config/env.validation.ts` | Modified — `REDIS_URL` production-required |
| `apps/api/src/core/config/env.validation.spec.ts` | Modified — 3 new tests + fixture update |
| `scripts/smoke-test.sh` | New |
| `scripts/deploy.sh` | Modified — Step 11 now calls the new script |
| `docs/delivery/RELEASE-AND-ROLLBACK-CHECKLIST.md` | New |
| `docs/delivery/PRE-DEPLOYMENT-CHECKLIST.md` | Modified — REDIS_URL row + cross-link |
| `docs/delivery/tasks/PLACE-040.yaml` | New |
| `docs/delivery/reports/PLACE-040-production-configuration-inventory-report.md` | New (this file) |
| `docs/delivery/evidence/PLACE-040-production-configuration-inventory-evidence-index.md` | New |
| `docs/delivery/state.yaml` | Updated |
| `docs/delivery/workstreams/place.yaml` | Updated |

No `docker-compose.prod.yml`, `Dockerfile`, or `Caddyfile` touched — the audit found them already
correct.

## 8. Not Claimed

- No real Hostinger VPS, DNS record, Cloudflare R2 credential, or uptime-monitor account.
- No `migration:revert` rehearsal (Docker engine unreachable this session).
- `scripts/smoke-test.sh`/`deploy.sh`/`rollback.sh` not executed against any live stack — syntax-
  checked only.
- MinIO/object-storage integration, transactional email, and sitemap/robots.txt not implemented —
  all pre-existing, deliberately deferred, re-confirmed open, not newly closed.
- No PLACE-041 created or started.
