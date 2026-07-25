# PLACE-038 — Evidence Index (Production readiness implementation, 2026-07-25)

Backs `docs/delivery/reports/PLACE-038-production-readiness-implementation-report.md`. All commands on the D: checkout under pinned **Node v20.20.2 / npm 10.8.2**, Docker Desktop running throughout. All verification local-only; zero real infrastructure touched.

## Preflight
| id | evidence | result |
|---|---|---|
| S-1 | `git status --short`, `git log --oneline -3`, `git remote -v` | clean, HEAD `c93963c`, no remotes |
| S-2 | `docs/delivery/state.yaml` `current.task` | `none` at start |

## Defect 1 investigation and fix — NEXT_PUBLIC_* build-time baking
| id | evidence | result |
|---|---|---|
| D1-1 | `docker run --rm phuquochub-web:place036-stabilization ... grep -o 'localhost:4000' apps/web/.next/static/chunks/*.js` | found hardcoded, despite `docker-compose.prod.yml`'s runtime `environment:` override |
| D1-2 | `apps/web/Dockerfile` inspection | confirmed no `ARG`/`ENV` existed before the `next build` step |
| D1-3 | `apps/web/src/lib/api.ts` / `MapView.tsx` inspection | confirmed both `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_MAP_TILE_URL` affected |
| D1-4 | `apps/web/Dockerfile` edited: `ARG`/`ENV` added before `RUN npm run build --workspace=@phuquochub/web` | applied |
| D1-5 | `docker build -f apps/web/Dockerfile -t phuquochub-web:place038-argtest . --build-arg NEXT_PUBLIC_API_URL=https://phuquochub.com/api ...` | succeeded |
| D1-6 | `grep -o 'phuquochub.com/api\|localhost:4000/api' apps/web/.next/static/chunks/*.js apps/web/.next/server/chunks/ssr/*.js` on the arg-test image | `phuquochub.com/api` present throughout both client and server bundles, zero `localhost:4000/api` |
| D1-7 | `docker rmi phuquochub-web:place038-argtest` | cleanup |

## Defect 2 investigation and fix — postgres command word-splitting
| id | evidence | result |
|---|---|---|
| D2-1 | First full-stack boot attempt (`docker compose up -d`) | `phuquoc-postgres-prod Error dependency postgres failed to start` |
| D2-2 | `docker logs phuquoc-postgres-prod` | `postgres: invalid argument: "/opt/wal-archive.sh"`, repeated crash-loop |
| D2-3 | Root-cause analysis: YAML folded-scalar `command: >` + Compose's shell-word-splitting of the resulting string | confirmed via direct reading of the original `command:` block |
| D2-4 | `docker-compose.prod.yml` edited: `command:` converted to YAML list form | applied |
| D2-5 | `docker compose down -v` (clean slate), retry `docker compose up -d` | `postgres` reports `Healthy`, no crash |

## Dockerfile / Compose changes
| id | evidence | result |
|---|---|---|
| C-1 | `apps/api/Dockerfile`, `apps/web/Dockerfile` edited: `HEALTHCHECK` added to both | applied |
| C-2 | `apps/api/Dockerfile` edited: `--chown=node:node` added to runtime COPY lines | applied (defensive consistency, PLACE-036 precedent) |
| C-3 | `docker-compose.prod.yml` rewritten: `name: phuquochub-prod`; host-port publishing removed for postgres/redis/minio/api/web; `logging:` blocks added to every service; Redis `--requirepass`; `REDIS_URL` password-embedded; `CORS_ALLOWED_ORIGINS`/`TRUST_PROXY_HOPS` defaults updated; `NEXT_PUBLIC_*` moved to `build.args`; new `caddy` service; new `migrate` service; image tags parameterized | applied |
| C-4 | `docker compose -f docker-compose.prod.yml config --quiet` | valid |
| C-5 | `docker compose -f docker-compose.prod.yml config \| grep -A2 "image:\|ports:"` | confirmed only `caddy` has a `ports:` block |

## Caddyfile
| id | evidence | result |
|---|---|---|
| K-1 | `infrastructure/caddy/Caddyfile` written: `phuquochub.com, :8080` shared site block, `/api/*`→api, else→web | applied |
| K-2 | `docker exec phuquoc-caddy-prod caddy validate --config /etc/caddy/Caddyfile` | `Valid configuration` |
| K-3 | `docker exec phuquoc-caddy-prod wget -O /dev/null -S http://127.0.0.1:8080/` | `200 OK` |
| K-4 | `docker exec phuquoc-caddy-prod wget -qO- http://127.0.0.1:8080/api/health` | `200`, correct JSON body |

## Full local stack build and boot
| id | command | result |
|---|---|---|
| B-1 | `docker compose -f docker-compose.prod.yml build` | succeeded, `api`+`web` built |
| B-2 | `REDIS_PASSWORD=... docker compose -f docker-compose.prod.yml up -d --no-build` (post-fixes) | all 6 containers created and started |
| B-3 | `docker ps --filter "name=phuquoc-.*-prod"` | `postgres`/`redis`/`minio`/`api`/`web` all `healthy`; `caddy` running (no native healthcheck) |

## Migration verification
| id | command | result |
|---|---|---|
| M-1 | `DB_PASSWORD=phuquoc docker compose -f docker-compose.prod.yml run --rm migrate` | exit 0, all 20 migrations applied to the fresh empty database |
| M-2 | `docker exec phuquoc-postgres-prod psql ... SELECT count(*) FROM migrations` | `20` |
| M-3 | `docker exec phuquoc-postgres-prod psql ... SELECT count(*) FROM places` | `49` |
| M-4 | `docker logs phuquoc-api-prod \| grep -i error` (post-migration) | zero matches |

## Redis authentication
| id | command | result |
|---|---|---|
| R-1 | `docker exec phuquoc-redis-prod redis-cli ping` (unauthenticated) | `NOAUTH Authentication required.` |
| R-2 | `docker exec phuquoc-redis-prod redis-cli -a <password> --no-auth-warning ping` | `PONG` |
| R-3 | `docker exec phuquoc-api-prod ... GET /api/health` | `redis: {"status":"up","response":"PONG"}` |

## Web→API end-to-end data-fetching verification
| id | evidence | result |
|---|---|---|
| W-1 | First attempt: web built with `NEXT_PUBLIC_API_URL=http://localhost:8080/api` | **test-setup mistake caught**: `localhost` inside the web container is its own loopback, not Caddy — `docker logs phuquoc-web-prod` showed `ECONNREFUSED`; `/places/dinh-cau` rendered the fallback title, not real data |
| W-2 | Corrected: rebuilt web with `NEXT_PUBLIC_API_URL=http://api:4000/api` (direct internal service name) | `docker compose up -d --no-build web`, container recreated, `healthy` |
| W-3 | `docker exec phuquoc-caddy-prod wget -qO- http://127.0.0.1:8080/places/dinh-cau \| grep title` | `<title>Dinh Cậu · PhuQuocHub</title>` — real seeded data |
| W-4 | `docker logs phuquoc-web-prod` (post-fix) | clean, zero fetch errors |

## Script verification
| id | command | result |
|---|---|---|
| P-1 | `sh -n scripts/*.sh` (all 5 scripts) | all pass syntax check |
| P-2 | `sh scripts/backup.sh` (against live local stack) | produced `backups/phuquochub-<timestamp>.sql.gz`, 20K |
| P-3 | `gunzip -t backups/phuquochub-*.sql.gz` + content inspection | valid gzip, real `pg_dump` SQL content (34 INSERT/COPY statements) |
| P-4 | `printf 'yes\n' \| sh scripts/restore.sh backups/phuquochub-*.sql.gz` (destructive, against disposable local data) | DROP/CREATE/restore all succeeded |
| P-5 | Post-restore row counts | `places`=49, `migrations`=20 — identical to pre-restore |
| P-6 | `docker tag ... place038-test-v1`; `sh scripts/rollback.sh place038-test-v1 both` | image swap succeeded, both containers recreated, health-verified |
| P-7 | `scripts/sync-offsite.sh` | **not executed against a real endpoint** — no R2 credentials configured in this session; only its documented safe-exit path is asserted, not run |

## Full regression (post-change)
| id | command | result |
|---|---|---|
| V-1 | `turbo run lint typecheck test --force` | 14/14 tasks successful |
| V-2 | web unit tests | 17/17, 3 suites |
| V-3 | api unit tests | 251/251, 34 suites |
| V-4 | `npm run test:e2e --workspace=apps/api` | 59/59, 10 suites |

## Cleanup
| id | evidence | result |
|---|---|---|
| U-1 | `docker compose -f docker-compose.prod.yml down -v` | all containers/volumes/network removed |
| U-2 | `docker rmi` (all disposable local/test-tagged images incl. `phuquochub-prod-migrate`) | removed |
| U-3 | `rm -rf backups/` | local test dump removed |
| U-4 | `.gitignore` updated with `backups/` | applied — real backups must never enter Git |
| U-5 | `docker ps` (dev stack) | `phuquoc-postgres`/`-redis`/`-minio` unaffected, healthy throughout |

## Not claimed
| id | item | disposition |
|---|---|---|
| NX-1 | Any real Hostinger/VPS provisioning | NOT performed |
| NX-2 | Any real DNS record for `phuquochub.com` | NOT created |
| NX-3 | Any real Cloudflare R2 connection or upload | NOT performed — `sync-offsite.sh` only exercised its safe no-credential exit path |
| NX-4 | `scripts/deploy.sh` run end-to-end against a real environment | NOT performed — its constituent mechanisms verified individually against the local stack instead |
| NX-5 | A `migration:revert` rehearsal | NOT performed — carried forward as an open item |
| NX-6 | Any application source (feature/UI/business-logic/schema) change | NOT made |
| NX-7 | PLACE-039 | NOT started, NOT created |
