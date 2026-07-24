# PLACE-026 — Evidence Index (production deployment pipeline, 2026-07-24)

Backs `docs/delivery/reports/PLACE-026-deployment-pipeline-report.md`. All commands on the D:
checkout under pinned **Node v20.20.2 / npm 10.8.2**, Docker Desktop running throughout.

## Authority
| id | source | proves |
|---|---|---|
| S-1 | owner instruction 2026-07-24 — "execution of the first approved engineering task: PLACE-026" | activation authorized |
| S-2 | `decisions/OWNER-APPROVAL-SESSION-2026-07-24.md`, Eligible Candidate 1 | implements `OD2-2,3,4,5,7,8,9`, all Approved |
| S-3 | Precondition check (report §1) | all 6 preconditions satisfied, none missing |

## Investigation (pre-implementation)
| id | evidence | result |
|---|---|---|
| I-1 | `git remote -v` | empty — no remote configured; gates what can honestly be "verified" for OD2-7 |
| I-2 | `package.json` scripts (root, api, web) | `nest build`→`dist/main.js`; `next build`→`.next`; workspace build order (`shared-types`→`utils`→app) |
| I-3 | `apps/web/next.config.mjs` (before) | no `output` mode set — needed `standalone` for a lean Docker image |
| I-4 | `apps/*/tsconfig.json` | all three (shared-types, api, web) extend root `tsconfig.base.json` — must be copied into Docker build context |
| I-5 | `apps/api/package.json` | `bcrypt` (native addon) — Docker builder stage needs a C/C++ toolchain on alpine |
| I-6 | `packages/*` | only `shared-types`, `utils`, `config` have a `package.json`; `database`/`ui` are stub dirs, excluded from Docker COPY |
| I-7 | `apps/web/src/modules/map/MapView.tsx` (before) | hardcoded OSM tile URL, comment already noted "production should self-host/MapTiler" |
| I-8 | `docker-compose.yml` (existing) | only orchestrates dependencies (postgres/redis/minio) — confirmed no app services existed before this task |

## Implementation
| id | file | change |
|---|---|---|
| C-1 | `apps/api/Dockerfile` (new) | multi-stage build |
| C-2 | `apps/web/Dockerfile` (new) | multi-stage build, standalone output |
| C-3 | `apps/web/next.config.mjs` | `output: 'standalone'` added |
| C-4 | `.dockerignore` (new) | build-context exclusions |
| C-5 | `docker-compose.prod.yml` (new) | api+web+postgres+redis+minio, WAL flags |
| C-6 | `infrastructure/docker/postgres/postgresql.prod.conf` (new) | WAL/PITR policy documentation |
| C-7 | `infrastructure/docker/postgres/wal-archive.sh` (new) | archive_command target script |
| C-8 | `.github/workflows/ci.yml` | new `docker-build` job |
| C-9 | `apps/web/src/modules/map/MapView.tsx` | `NEXT_PUBLIC_MAP_TILE_URL` env-driven, default unchanged |
| C-10 | `docs/architecture/deployment.md` | implementation-status addendum |

## Real build verification (Docker)
| id | command | result |
|---|---|---|
| B-1 | `docker build -f apps/api/Dockerfile -t phuquochub-api:test .` | first attempt FAILED (`TS5083: Cannot read file '/repo/tsconfig.base.json'`) — fixed by adding the COPY; **second attempt succeeded** |
| B-2 | `docker build -f apps/web/Dockerfile -t phuquochub-web:test .` | succeeded (after the same tsconfig.base.json fix applied proactively) |

## Real runtime verification (Docker, against the actual dev Postgres/Redis)
| id | check | result |
|---|---|---|
| R-1 | `docker run` api image on `phuquochub_default` network, pointed at `phuquoc-postgres`/`phuquoc-redis` | container `Up`; `/api/health` → **200**, `{"status":"ok","database":{"status":"up"},"redis":{"status":"up","response":"PONG"}}` |
| R-2 | container logs | `Nest application successfully started`, `Redis connected`, `GET /api/health → 200` |
| R-3 | `docker run` web image | container `Up`; `GET /` → **200** |
| R-4 | static asset check | a real `/_next/static/chunks/*.js` URL extracted from the served HTML → **200** (standalone-mode static-asset pitfall explicitly ruled out) |
| R-5 | test containers cleaned up | `docker rm -f phuquochub-api-test phuquochub-web-test`; confirmed absent afterward |

## WAL archiving verification (OD2-4, real, not simulated)
| id | check | result |
|---|---|---|
| W-1 | isolated postgres container, same `-c` flags + `wal-archive.sh` mount as `docker-compose.prod.yml` | booted; `show archive_mode` → **on**; `show wal_level` → **replica** |
| W-2 | `select pg_switch_wal();` (forces a WAL segment switch) | no archive_command errors in subsequent logs |
| W-3 | `ls /var/lib/postgresql/wal_archive/` inside the container | **4 real WAL segment files** present, sizes 16MB each — genuine archival, not a claim |
| W-4 | test container removed | `docker rm -f phuquoc-postgres-wal-test` |

## Incident during verification — recorded and corrected (see report §7)
| id | event | resolution |
|---|---|---|
| N-1 | `docker compose -f docker-compose.prod.yml up -d postgres` (no `-p` flag) removed the running dev `phuquoc-postgres` container (shared default project name with the existing `docker-compose.yml`) | volume `phuquochub_pg_data` untouched; dev container recreated via `docker compose -f docker-compose.yml up -d postgres`; data verified intact (migrations=20, places=49, 6 extensions) immediately after |
| N-2 | all further prod-compose testing | used explicit `-p phuquochub-prod-verify` to guarantee project isolation; confirmed via `docker ps`/`docker volume ls` that no dev-stack resource was touched again |

## Verification ladder (full, post-implementation)
| id | command | result |
|---|---|---|
| V-1 | `eslint` (api full `src/**`) | exit 0 |
| V-2 | `tsc --noEmit` (api) | exit 0 |
| V-3 | `tsc --noEmit` (web) | exit 0 |
| V-4 | `next lint` (web) | "No ESLint warnings or errors" |
| V-5 | `jest` (full unit) | **221/221**, 30 suites — identical to PLACE-025 |
| V-6 | `jest --config test/jest-e2e.json` (full e2e) | **44/44**, 8 suites — identical to PLACE-025 |
| V-7 | `turbo run build --force` (tsbuildinfo purged) | 4/4, 0 cached |
| V-8 | artifacts | main.js/app.module.js/core; **153==153**; `web/.next/standalone` present |
| V-9 | CI YAML parse | `js-yaml` load succeeds |
| V-10 | `docker compose -f docker-compose.prod.yml config` | succeeds (syntax valid) |
| V-11 | source-level boot (`node dist/main.js` + `next start`, NOT Docker) | `/api/health` 200, web `/` 200, `/map` 200 — proves `output:'standalone'` didn't break the traditional boot path |
| V-12 | terminate + ports | PIDs killed; 4000/3000 FREE |

## Scope-boundary honesty (what is explicitly NOT claimed)
| id | item | disposition |
|---|---|---|
| NX-1 | Real VPS provisioned | NOT done — no credentials exist |
| NX-2 | Real Cloudflare R2 bucket | NOT done — MinIO is the local stand-in |
| NX-3 | Real offsite backup target | NOT done — `WAL_ARCHIVE_DIR` defaults to local, env-configurable |
| NX-4 | Real MapTiler account/key | NOT done — `NEXT_PUBLIC_MAP_TILE_URL` env-configurable, default unchanged |
| NX-5 | Live GHCR push confirmed by an actual Actions run | NOT verified — no git remote exists in this session |
| NX-6 | Blue-green deployment | NOT built — `OD2-9`'s recommendation was maintenance-window-first |
| NX-7 | Eligible Candidates 2/3, PLACE-027 | NOT started |
