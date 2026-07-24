# PLACE-029 — Evidence Index (Critical dependency hardening, 2026-07-24)

Backs `docs/delivery/reports/PLACE-029-critical-dependency-hardening-report.md`. All commands on the D: checkout under pinned **Node v20.20.2 / npm 10.8.2**, Docker Desktop running throughout.

## Authority
| id | source | proves |
|---|---|---|
| S-1 | Owner instruction 2026-07-24 — "Owner authorizes execution of the selected engineering task... Candidate A" | activation authorized |
| S-2 | `docs/delivery/reports/PLACE-029-CANDIDATE-SELECTION-2026-07-24.md`, Candidate A | scope + acceptance criteria basis |
| S-3 | Precondition check (report §Preconditions) | all six preconditions satisfied |

## Investigation (Phase 1, fresh, not memory)
| id | evidence | result |
|---|---|---|
| I-1 | `npm ls bcrypt --all -w apps/api` (before) | `bcrypt@5.1.1 -> @mapbox/node-pre-gyp@1.0.11 -> tar@6.2.1` |
| I-2 | `npm view bcrypt@6.0.0 dependencies engines` | `{ node-addon-api: ^8.3.0, node-gyp-build: ^4.8.4 }`, `node >= 18` — zero node-pre-gyp/tar |
| I-3 | bcrypt CHANGELOG (fetched fresh) | 6.0.0 removes `node-pre-gyp` for `prebuildify`; no public-API breaking change; drops Node<=16 |
| I-4 | `grep -rn "bcrypt\." apps/api/src` | only `bcrypt.hash`/`bcrypt.compare` in `auth.service.ts`, both stable across 5->6 |
| I-5 | `apps/api/Dockerfile:9-10` | `apk add python3 make g++` already present as a musl compile fallback |
| I-6 | `apps/api/src/core/config/env.validation.ts` (before) | `DB_HOST`/`DB_USER`/`DB_NAME` `.default(...)`; `DB_PASSWORD` `.allow('').default('phuquoc')` — none required anywhere |
| I-7 | `grep -rn "DATABASE_URL" apps/api/src` | no hits — no single connection-string variable exists; malformed-connection-string is not an applicable surface |
| I-8 | `docker-compose.prod.yml:100-104` | `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` already set explicitly for its local verification stack — unaffected by a stricter schema |

## Implementation (Phase 3)
| id | evidence | result |
|---|---|---|
| M-1 | `git diff apps/api/package.json` | `"bcrypt": "^5.1.1"` -> `"bcrypt": "^6.0.0"`, one line |
| M-2 | `npm install` output | `added 1 package, removed 31 packages, changed 2 packages` |
| M-3 | `git diff --stat package-lock.json` | 33 insertions, 369 deletions |
| M-4 | `npm ls bcrypt --all -w apps/api` (after) | `bcrypt@6.0.0` |
| M-5 | `npm ls tar --all` / `npm ls @mapbox/node-pre-gyp --all` (after) | both **empty** — gone tree-wide, not just from bcrypt's branch |
| M-6 | `git status --short` (full task diff) | scoped to: `apps/api/package.json`, `package-lock.json`, `apps/api/src/core/config/env.validation.ts`, `apps/api/src/core/config/env.validation.spec.ts` (new), plus delivery-evidence files — no unrelated file |
| M-7 | `apps/api/src/core/config/env.validation.ts` (after) | `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` each wrapped in `Joi.string().when('NODE_ENV',{is:'production',then:Joi.required(),otherwise:...})`, identical shape to the existing `CORS_ALLOWED_ORIGINS` pattern |

## Tests (Phase 3b)
| id | file | result |
|---|---|---|
| T-1 | `apps/api/src/core/config/env.validation.spec.ts` | **8/8** — prod-all-set passes; each of DB_HOST/DB_USER/DB_PASSWORD/DB_NAME missing individually fails naming that var; DB_PASSWORD='' fails; dev-unset still applies original defaults; JWT-required behavior unaffected |

## Verification ladder (Phase 4)
| id | command | result |
|---|---|---|
| V-1 | `npm audit --omit=dev --json` (after) | 15 total (0 critical, 5 high, 10 moderate, 0 low) |
| V-2 | `npm audit --json` (after, incl. dev) | 30 total (0 critical, 11 high, 16 moderate, 3 low) |
| V-3 | `eslint "src/**/*.ts" --max-warnings=0` (api) | exit 0 |
| V-4 | `tsc -p tsconfig.json --noEmit` (api) | exit 0 |
| V-5 | `tsc --noEmit` (web) | exit 0 |
| V-6 | `jest` (full unit) | **231/231**, 32 suites (baseline 223/31 + 8 new) |
| V-7 | `jest --config test/jest-e2e.json` (full e2e) | **51/51**, 9 suites — identical to PLACE-028 baseline |
| V-8 | `rm apps/api/tsconfig.build.tsbuildinfo` + `turbo run build --force` | 4/4 tasks, 0 cached; real artifacts confirmed (`dist/main.js`+`app.module.js`, `.next/BUILD_ID`+`standalone/`, both shared packages' `dist/index.js`) |
| V-9 | `docker build --no-cache --progress=plain -f apps/api/Dockerfile -t phuquochub-api:place029-verify .` (full log captured) | succeeded; `npm ci` log contains **no** `node-gyp`/`prebuild-install` compile step — prebuilt musl binary loaded directly; `added 984 packages` |
| V-10 | `docker build -f apps/web/Dockerfile -t phuquochub-web:place029-verify .` | succeeded |
| V-11 | `docker run` (api, network `phuquochub_default`, `NODE_ENV=production`, real `DB_HOST=phuquoc-postgres`/`REDIS_HOST=phuquoc-redis`, real credentials) | booted clean: `Nest application successfully started`, `Redis connected` |
| V-12 | `curl /api/health` | `{"status":"ok","database":{"status":"up"},"redis":{"status":"up","response":"PONG"}}` |
| V-13 | `curl -X POST /api/auth/register` (real email/password) | `success:true`, real `access_token`/`refresh_token` returned — bcrypt.hash executed |
| V-14 | `curl -X POST /api/auth/login` (correct password) | `HTTP 200` — bcrypt.compare correctly accepts |
| V-15 | `curl -X POST /api/auth/login` (wrong password) | `HTTP 401` — bcrypt.compare correctly rejects |
| V-16 | `docker run` (api, `NODE_ENV=production`, `DB_PASSWORD` **unset**) | crashed immediately: `Config validation error: "DB_PASSWORD" is required` |
| V-17 | `docker run` (api, `NODE_ENV=production`, `DB_PASSWORD=""`) | crashed immediately: `Config validation error: "DB_PASSWORD" is not allowed to be empty` |
| V-18 | `docker exec phuquoc-postgres psql ... DELETE FROM users WHERE email='place029-verify@example.test'` | `DELETE 1` — test user removed |
| V-19 | `docker run` (web) ; `curl /` | `HTTP 200`; logs show `Next.js 14.2.35`, `Ready in 197ms` |
| V-20 | `docker ps` (before/during/after all verification) | `phuquoc-postgres`/`-redis`/`-minio` healthy and unchanged throughout |
| V-21 | `psql SELECT count(*) FROM migrations` | `20` — unchanged |
| V-22 | `psql SELECT count(*) FROM places` | `49` — unchanged |
| V-23 | `psql SELECT count(*) FROM users WHERE email LIKE '%place029%'` | `0` — verification test data fully cleaned up |
| V-24 | `docker rm -f phuquochub-api-place029 phuquochub-web-place029` ; `docker rmi phuquochub-api:place029-verify phuquochub-web:place029-verify` | verification containers + images removed |

## Security comparison (Phase 5)
| id | evidence | result |
|---|---|---|
| SEC-1 | `docs/delivery/reports/PRODUCTION-READINESS-REASSESSMENT-V2-2026-07-24.md` Phase 4 (same-day baseline immediately preceding this task) | before: prod 18 total (1 critical/7 high/10 moderate/0 low), incl.-dev 33 total |
| SEC-2 | V-1/V-2 above (this task, fresh) | after: prod 15 total (0 critical/5 high/10 moderate/0 low), incl.-dev 30 total |
| SEC-3 | per-package audit diff | removed: `tar` (critical), `@mapbox/node-pre-gyp` (high), `bcrypt` (high, flagged for its now-removed dependency) — exactly 3, matching 18-15=3 |
| SEC-4 | dev-only reconciliation | 30-15=15 after, identical to 33-18=15 before — confirms zero devDependency touched |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | NestJS/Next.js major-version migration | NOT performed — remains Owner decision, PLACE-029 Candidate Selection report Phase 5 |
| NX-2 | Remaining 15 production dependency findings | NOT closed — all require one of the above migrations |
| NX-3 | Any code change to auth.service.ts | NOT made — bcrypt.hash/bcrypt.compare call sites unchanged |
| NX-4 | PLACE-030 | NOT started, NOT created |
