# PLACE-020 — Evidence Index (post-certification state reconciliation, 2026-07-24)

Backs `docs/delivery/reports/PLACE-020-state-reconciliation-report.md`.

All commands run on the authoritative D: checkout (`D:\Projects\PhuQuocHub`) under the pinned
repository runtime **Node v20.20.2 / npm 10.8.2** (`.nvmrc=20`, CI `node-version: 20`). The
portable v24.18.0 extract was NOT used for any certification command.

## Authority
| id | source | result | proves |
|---|---|---|---|
| S-1 | owner instruction 2026-07-24 — "re-establish the authoritative delivery state … execute exactly one valid next delivery task" | explicit, scoped | authorization for this governance operation (EEF authority hierarchy #1) |
| S-2 | `state.yaml` before | `current.task: none`, `awaiting_task_authorization` | no active engineering task displaced |
| S-3 | `decisions/ADR-DELIVERY-001.md` | state.yaml is the execution gate | a task record (PLACE-020) is created + closed in-turn, same pattern as PLACE-019 |
| S-4 | `tasks/` listing | PLACE-020 is the next unused id | identifier not derived from arithmetic alone |
| S-5 | 19 task files | PLACE-001..PLACE-019 all `completed` | no completed task reopened or modified |

## F-2 — Docker / DB-backed validation (RESOLVED)
| id | command | result |
|---|---|---|
| D-1 | `docker inspect --format '{{.State.Health.Status}}' phuquoc-postgres redis minio` | **healthy / healthy / healthy** (postgis/postgis:16-3.4, redis:7-alpine, minio/minio:latest) |
| D-2 | `docker exec phuquoc-redis redis-cli ping` | **PONG** |
| D-3 | `docker exec phuquoc-postgres pg_isready -U phuquoc -d phuquochub` | **accepting connections** |
| D-4 | `psql -tAc "select count(*) from migrations;"` | **20** (schema already migrated; volumes not recreated) |
| D-5 | `jest --config ./test/jest-e2e.json --runInBand` | **exit 0 — 5 suites / 22 tests** (auth, authz-enforcement, places, wave2, health) against real Postgres/PostGIS + Redis |
| D-6 | container provenance | started via Docker Desktop `restart: unless-stopped` on **existing** `pg_data`/`redis_data` volumes — **not recreated** |

## F-3 — Version control / rollback point (RESOLVED)
| id | command | result |
|---|---|---|
| V-1 | `git rev-parse --abbrev-ref HEAD` | `master` |
| V-2 | `git log --oneline -3` | `0ca958f` ← `c661912` ← `889d01f` |
| V-3 | `git status --short` (pre-task) | clean |
| V-4 | `git remote -v` | **none** — no remote configured, nothing pushed |
| V-5 | rollback point | exists (commits + clean tree ⇒ diff-verifiable scope) |

## Runtime verification (production build)
| id | command | result |
|---|---|---|
| R-1 | `turbo run build --force` (caches purged) | **4/4 tasks, 0 cached** |
| R-2 | API artifacts | `dist/main.js` (1424 B), `dist/app.module.js` (3398 B), `dist/core/` (33 js); **153 non-spec .ts == 153 .js**; no `*.spec.js` in dist |
| R-3 | `apps/web/.next` | present (52 MB, BUILD_ID emitted) |
| R-4 | `node dist/main.js` then `GET /api/health` | **HTTP 200** — `{success:true, data:{status:"ok", info:{database:{status:"up"}, redis:{status:"up",response:"PONG"}}}}` |
| R-5 | `next start -p 3000` then `GET /` | **HTTP 200** |
| R-6 | teardown | both PIDs (+ child trees) terminated; ports 4000 & 3000 **FREE** |

## Environment reconciliation
| id | check | before (state.yaml) | after (certified D:) |
|---|---|---|---|
| E-1 | volume / FS | F: FAT32 | **D: NTFS** (`df -T` → ntfs) |
| E-2 | `@phuquochub/{shared-types,utils}` | FAT32 copies (stale-risk) | **real symlinks** (`ls -la` → `-> …/packages/…`) |
| E-3 | node runtime | v24.18.0 portable | **v20.20.2 / npm 10.8.2** pinned + used |
| E-4 | docker | not_installed | **installed_and_running** |
| E-5 | can_run_e2e | false | **true** (D-5) |
| E-6 | production_startup | NOT VERIFIED | **verified** (R-4/R-5) |

## Governance edits (documentation-only)
| id | file | change |
|---|---|---|
| G-1 | `state.yaml` | repository identity F:→D:; `verification_environment` reconciled; gate COMMENTS refreshed (values unchanged); `current` + `completed_tasks` (PLACE-020) + `next_action` updated |
| G-2 | `project-registry.yaml` | `repository.vcs: none → git` (+ branch/head/remote) |
| G-3 | `workstreams/place.yaml` | `known_risks` refresh (3 marked RESOLVED, retained as history); `place_020_status`; `next_task` note |
| G-4 | `tasks/PLACE-020.yaml`, report, this index | new records |

## Non-regression + scope proof
| id | command | result |
|---|---|---|
| N-1 | `eslint 'src/**/*.ts' --max-warnings=0` | **exit 0** |
| N-2 | `tsc -p tsconfig.json --noEmit` | **exit 0** |
| N-3 | `jest` (full unit) | **210/210, 29 suites** — UNCHANGED |
| N-4 | `jest --config test/jest-e2e.json` | **22/22, 5 suites** — UNCHANGED |
| N-5 | all `docs/delivery/**/*.yaml` parse | **PASS** |
| N-6 | `git diff --name-only` | **only `docs/delivery/**`** — zero application source/test/schema/contract files |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | READY_FOR_BUILD | **NOT asserted** |
| NX-2 | workstream complete | **NOT asserted** — remains INCOMPLETE |
| NX-3 | any gate VALUE advanced | **none** — comments only (PLACE-019 precedent) |
| NX-4 | GAP-05/10, F-24, F-34, SearchResult.score, authoritative bbox | **OPEN** — owner product decisions, not made here |
| NX-5 | EXPLAIN proof for idx_places_status_active (GAP-06/F-15) | **NOT RUN** — executable now (Docker up) but non-blocking; not this task |

## Findings
| id | result | disposition |
|---|---|---|
| **F-2** | Docker running; e2e 22/22 on real DB; API health db=up/redis=up | **RESOLVED** |
| **F-3** | git work tree, commits on master, clean tree, rollback point | **RESOLVED** |
| **GAP-05/10** | openapi list params vs implementation | **OPEN** — sole outstanding release blocker (owner adjudication) |
