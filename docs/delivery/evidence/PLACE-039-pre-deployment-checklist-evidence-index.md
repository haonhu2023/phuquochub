# PLACE-039 — Evidence Index (Pre-Deployment Checklist, 2026-07-25)

Backs `docs/delivery/reports/PLACE-039-pre-deployment-checklist-report.md`. All commands run on
the D: checkout, PowerShell + Git Bash, this session.

## Repository truth (Phase 1)

| id | evidence | result |
|---|---|---|
| S-1 | `git branch --show-current` | `master` |
| S-2 | `git log -1 --format="%H %s"` | `13539a1... docs(delivery): PLACE-038 report, evidence index, state updates` |
| S-3 | `git status` | clean, nothing to commit |
| S-4 | `Glob **/*PLACE-037*`, `**/*PLACE-038*` | task/report/evidence files for both located and read in full |
| S-5 | `docs/delivery/state.yaml` (full read, 1295 lines, two passes) | `current.task: none`; `next_action.status: awaiting_task_authorization`; `completed_tasks` already lists PLACE-037 and PLACE-038 |
| S-6 | `docs/delivery/tasks/PLACE-037.yaml`, `PLACE-038.yaml` (full read) | both `status: completed`, `completed_at: 2026-07-25` |
| S-7 | `docs/delivery/workstreams/place.yaml` (read + `git show 13539a1 -- docs/delivery/workstreams/place.yaml`) | confirms PLACE-038 already appended `place_038_status`/`place_037_status` blocks; establishes the convention this task follows for `place_039_status` |
| S-8 | `docs/delivery/README.md` | confirms task lifecycle convention (`draft→ready→in_progress→validation→completed`) and evidence-citation discipline this task follows |

## PLACE-037 closure cross-check (Phase 2)

| id | evidence | result |
|---|---|---|
| X-1 | `docs/delivery/tasks/PLACE-038.yaml` `owner_approved_decisions` block | contains all 5 decisions the Owner restated this session, verbatim-equivalent |
| X-2 | `docs/architecture/deployment.md` lines 390–395 (`grep -n "staging\|MVP\|Hostinger\|preflight\|checklist"`) | `"DA CHOT: Hostinger KVM VPS ... buoc xac minh that tren dashboard Hostinger van con, xem PLACE-037 §31 ... Staging: khong can"` — confirms PLACE-038 already reconciled this doc; no drift found |
| X-3 | `docs/delivery/reports/PLACE-037-...md` §25 (Owner Decisions table, read in full) | Hostinger classified `unknown`, not assumed compatible; staging explicitly "No for the very first launch" — matches restated decision |

## Next-task determination (Phase 3)

| id | evidence | result |
|---|---|---|
| N-1 | `grep -rn "PLACE-039\|preflight\|checklist" docs/` | zero pre-existing Hostinger preflight or go-live checklist document found — genuine gap, not duplicate work |
| N-2 | `docs/delivery/reports/PLACE-038-...-evidence-index.md` §"Not claimed" | `NX-5`: migration:revert rehearsal "NOT performed — carried forward as an open item"; `NX-7`: PLACE-039 not started |
| N-3 | `docs/delivery/reports/PLACE-037-...md` §12 | "This is a genuine gap: recommend a migration-revert rehearsal be included in the future implementation task's rollback-rehearsal scope" |
| N-4 | `Glob scripts/*.sh` | `backup.sh`/`restore.sh`/`rollback.sh`/`deploy.sh`/`sync-offsite.sh` all already exist (PLACE-038) — confirms no duplicate script work needed |

## Docker-engine availability (Phase 4 — determines migration:revert disposition)

| id | evidence | result |
|---|---|---|
| D-1 | `docker version --format '{{.Server.Version}}'` | `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine: ... The system cannot find the file specified.` |
| D-2 | `docker compose version` | `Docker Compose version v5.3.1` (CLI present) |
| D-3 | `docker ps` | same npipe connection failure as D-1 |
| D-4 | PowerShell `Get-Process -Name "*Docker*"` | no matching process (empty result) |
| D-5 | PowerShell `Test-Path "C:\Program Files\Docker\Docker\Docker Desktop.exe"` | `False` |
| D-6 | PowerShell `Get-ChildItem "C:\Program Files\Docker" -Recurse -Filter *.exe` | exit code 1 — path does not exist in this session |

**Conclusion:** Docker engine is not available in this session. `migration:revert` rehearsal not
attempted; recorded as still open in `docs/delivery/PRE-DEPLOYMENT-CHECKLIST.md` §3 item 6.

## Secrets/environment inventory sourcing (Phase 4)

| id | evidence | result |
|---|---|---|
| E-1 | `Read .env.example` (full, 87 lines) | confirmed exact placeholder text/comments for every variable listed in the new checklist §2 |
| E-2 | `grep -n "REDIS_PASSWORD\|DB_PASSWORD\|JWT_\|R2_\|NEXT_PUBLIC_\|CORS_ALLOWED\|TRUST_PROXY\|build.args\|args:" docker-compose.prod.yml` | confirmed exact default values (`change-me-db-password`, `change-me-redis-password-min-16-chars`, `change-me-access-secret-min-16-chars`, `change-me-refresh-secret-min-16-chars`, empty `R2_*`, already-correct `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_MAP_TILE_URL`/`CORS_ALLOWED_ORIGINS`/`TRUST_PROXY_HOPS`) |
| E-3 | `Glob apps/api/src/core/database/migrations/*.ts` | 20 migration files confirmed present, matching state.yaml's "migrations=20" claim |
| E-4 | `grep -n '"migration' apps/api/package.json` | `migration:run`/`migration:revert`/`migration:generate` scripts confirmed to exist (unused this task — Docker unavailable) |

## Files written this task

| id | file | verification |
|---|---|---|
| F-1 | `docs/delivery/PRE-DEPLOYMENT-CHECKLIST.md` | manually re-read after writing; confirmed zero literal secret value (only variable names and the placeholder convention `change-me-...` already present in the repository are referenced) |
| F-2 | `docs/delivery/tasks/PLACE-039.yaml` | follows the exact schema fields used by `PLACE-038.yaml` |
| F-3 | `docs/delivery/reports/PLACE-039-pre-deployment-checklist-report.md` | this evidence index's parent report |
| F-4 | `docs/delivery/evidence/PLACE-039-pre-deployment-checklist-evidence-index.md` | this file |
| F-5 | `docs/delivery/state.yaml` | updated: PLACE-039 appended to `completed_tasks`, `next_action` refreshed |
| F-6 | `docs/delivery/workstreams/place.yaml` | updated: `place_039_status` appended |

## Not claimed

| id | item | disposition |
|---|---|---|
| NX-1 | Real Hostinger VPS provisioning/login/purchase | NOT performed |
| NX-2 | Real DNS record for `phuquochub.com` | NOT created |
| NX-3 | Real Cloudflare R2 bucket/credential | NOT created |
| NX-4 | Real uptime-monitor account | NOT created |
| NX-5 | `migration:revert` rehearsal | NOT performed — Docker engine unreachable this session (see D-1..D-6); carried forward |
| NX-6 | Real rollback rehearsal against actual infrastructure | NOT performed |
| NX-7 | Any application code / Dockerfile / Compose / script change | NOT made |
| NX-8 | PLACE-040 | NOT started, NOT created |
