# PLACE-040 — Evidence Index (Production Configuration Inventory, 2026-07-25)

Backs `docs/delivery/reports/PLACE-040-production-configuration-inventory-report.md`. All commands
on the D: checkout, Git Bash, pinned Node v20.20.2/npm 10.8.2 for lint/typecheck/test/build.

## Phase 1 — Active authority

| id | evidence | result |
|---|---|---|
| S-1 | `git branch --show-current` | `master` |
| S-2 | `git log -1 --format="%H %s"` | `15dac59... docs(delivery): PLACE-039 task, report, evidence index, state updates` |
| S-3 | `git status` | clean |
| S-4 | `grep -n "task: none\|status: awaiting\|^current:\|^next_action:\|task_id:" docs/delivery/state.yaml` | `current.task: none`, `next_action.status: awaiting_task_authorization` |
| S-5 | `docker version` / `docker ps` | `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine` — same unreachable state as PLACE-039's session |

## Phase 2 — Configuration inventory sourcing

| id | evidence | result |
|---|---|---|
| E-1 | `Read apps/api/src/modules/health/health.controller.ts` | `GET /api/health`, `@Public()+@SkipThrottle()`, checks `TypeOrmHealthIndicator`+`RedisHealthIndicator` |
| E-2 | `Read apps/api/src/core/config/env.validation.ts` (pre-change) | `DB_*`/`CORS_ALLOWED_ORIGINS`/`JWT_*` production-required; `REDIS_URL` had only a bare `.default(...)`, no `.when(NODE_ENV...)` rule — the gap |
| E-3 | `Read apps/api/src/core/redis/redis.service.ts` | confirms `RedisService` reads `config.get('redis.url')` exclusively, with its own `?? 'redis://localhost:6379'` fallback — the silent-misconfiguration path this task closes at the validation layer |
| E-4 | `Read apps/api/src/core/config/configuration.ts` | confirms `ConfigModule` wiring (`config.module.ts:13 validationSchema: envValidationSchema`) actually gates bootstrap |
| E-5 | `grep -rn "nodemailer\|smtp\|SMTP\|sendMail\|EmailService\|MailerModule" apps/api/src` | no files — no email provider exists |
| E-6 | `grep -rn "forgot-password\|reset-password\|resetPassword\|forgotPassword" apps/api/src` | no files — no feature depends on email |
| E-7 | `grep -rn "cookie\|Cookie\|res\.cookie\|@Res(" apps/api/src/modules/auth` | no files — bearer-token-only auth confirmed |
| E-8 | `grep -n "enableCors\|CORS_ALLOWED_ORIGINS\|credentials:" apps/api/src` + `Read main.ts` | CORS enabled with allow-list + explicit credentials flag, required in production |
| E-9 | `grep -rn "ThrottlerModule\|RATE_LIMIT\|@Throttle" apps/api/src` | `rate-limit.module.ts`, `env.validation.ts`, `auth.controller.ts` — rate limiting confirmed wired |
| E-10 | `grep -rn "S3_\|MinIO\|minio\|@aws-sdk" apps/api/src` | no files — object storage confirmed unused by application code |
| E-11 | `grep -n "HEALTHCHECK" apps/api/Dockerfile apps/web/Dockerfile` | both present, `--interval=10s --timeout=5s ... --retries=5` |
| E-12 | `grep -n "ports:" -A2 docker-compose.prod.yml` | only `caddy` (lines 240-242) publishes `80`/`443` |
| E-13 | `grep -n "logging:" -A4 docker-compose.prod.yml` | 6 services each have `json-file`, `max-size: 10m`, `max-file: 5` |
| E-14 | `Read infrastructure/docker/postgres/wal-archive.sh` | unchanged since PLACE-026, local-copy `archive_command` target |
| E-15 | `Read scripts/sync-offsite.sh` | confirms the R2 offsite-sync logic (originally scoped for wal-archive.sh itself in PLACE-038's task file) actually landed here instead — a legitimate implementation-detail difference, not a gap; covers both pg_dump backups and the WAL archive directory, gated safely on 4 R2 env vars |
| E-16 | `Read scripts/rollback.sh`, `scripts/backup.sh` | both reviewed in full; confirmed already correct, unmodified this task |
| E-17 | `grep -n "minio" -A3 docker-compose.prod.yml` | `image: minio/minio:latest` — confirmed unpinned tag (minor hygiene note, not fixed — MinIO itself is unused/deferred) |
| E-18 | `ls apps/web/public`, `find apps/web/src/app -iname "*sitemap*" -o -iname "*robots*"` | both empty — no static SEO assets, matches PLACE-036's already-recorded open item |
| E-19 | `grep -n '"outputs"' -A3 turbo.json` | `dist/**`, `.next/**` (`!.next/cache/**`), `coverage/**` — build-artifact config confirmed correct |
| E-20 | `Test-Path .dockerignore` equivalent (`ls -la .dockerignore`) | exists |
| E-21 | `grep -n "NODE_ENV" apps/api/Dockerfile apps/web/Dockerfile docker-compose.prod.yml` | `NODE_ENV=production` set consistently in both Dockerfiles and both compose service blocks |
| E-22 | `Read apps/api/src/main.ts` | `app.enableShutdownHooks()` present (line 61) — shutdown-verification basis |

## Phase 4 — Implementation

| id | evidence | result |
|---|---|---|
| I-1 | `apps/api/src/core/config/env.validation.ts` edited | `REDIS_URL` now `.when('NODE_ENV', {is:'production', then: Joi.required(), ...})` |
| I-2 | `apps/api/src/core/config/env.validation.spec.ts` edited | new `describe('envValidationSchema — REDIS_URL fail-fast (PLACE-040)')` block, 3 tests; existing PLACE-029 `baseProdEnv` fixture gains `REDIS_URL` |
| I-3 | `scripts/smoke-test.sh` written | new, 70 lines |
| I-4 | `scripts/deploy.sh` Step 11 edited | now calls `"$SCRIPT_DIR/smoke-test.sh"`, halts + prints rollback instruction on failure |
| I-5 | `docs/delivery/RELEASE-AND-ROLLBACK-CHECKLIST.md` written | new |
| I-6 | `docs/delivery/PRE-DEPLOYMENT-CHECKLIST.md` edited | REDIS_URL row + cross-link added |

## Phase 5 — Validation

| id | command | result |
|---|---|---|
| V-1 | `npx jest env.validation --silent` (apps/api) | initial run: 1 failed (pre-existing PLACE-029 `baseProdEnv` fixture lacked `REDIS_URL`) — caught, fixed (I-2), re-run: **11/11 passed** |
| V-2 | `npx tsc -p apps/api/tsconfig.json --noEmit` | exit 0, no output |
| V-3 | `npx eslint src/core/config/**/*.ts --max-warnings=0` (apps/api) | exit 0 |
| V-4 | `npx jest --silent` full apps/api suite | **254/254 passed, 34 suites** (baseline was 251/251 — +3 new PLACE-040 tests, zero regression, zero test removed/weakened) |
| V-5 | `npx nest build` (apps/api) | exit 0; `dist/main.js` + `dist/core/config/env.validation.js` confirmed present |
| V-6 | `sh -n scripts/smoke-test.sh` | OK |
| V-7 | `sh -n scripts/deploy.sh` (pre-edit baseline, then post-edit) | OK both times |
| V-8 | `docker compose -f docker-compose.prod.yml config --quiet` | exit 0 (confirms zero drift; this task did not touch the compose file) |
| V-9 | `git diff --stat` (final) | 4 files modified, 71 insertions / 3 deletions, scoped exactly to §7 of the report |
| V-10 | Secret scan (`git diff` grep for password/secret/key literal assignments + AKIA/BEGIN PRIVATE patterns) across all new/changed files | zero matches |

## Not claimed

| id | item | disposition |
|---|---|---|
| NX-1 | Real Hostinger/VPS/DNS/R2/uptime-monitor-account action | NOT performed |
| NX-2 | `migration:revert` rehearsal | NOT performed — Docker engine unreachable this session |
| NX-3 | `scripts/smoke-test.sh` / `deploy.sh` / `rollback.sh` executed against a live stack | NOT performed — syntax-checked only |
| NX-4 | MinIO/object-storage integration, transactional email, sitemap/robots.txt | NOT implemented — pre-existing deferred items, re-confirmed open |
| NX-5 | `docker-compose.prod.yml` / Dockerfiles / Caddyfile changed | NOT changed — audit found them already correct |
| NX-6 | PLACE-041 | NOT started, NOT created |
