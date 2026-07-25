# PLACE-042 — Evidence Index (Migration Rollback Rehearsal and Recovery Verification, 2026-07-25)

Backs `docs/delivery/reports/PLACE-042-migration-rollback-rehearsal-report.md`. All commands on
the D: checkout, Git Bash + PowerShell, pinned Node v20.20.2/npm 10.8.2 for TypeORM CLI
invocations. Only the minimal, verifiable fragment of each command's output is quoted below — full
logs were reviewed live but are not reproduced in full here. No password or full connection string
appears anywhere in this file; only the dev-only username/database name (`phuquoc`/`phuquochub`,
already public in `.env.example` and `docker-compose.yml`) are named, never a password value.

## 1. Repository baseline

| ID | Command / method | Expected | Actual | Exit | Status | Artifact |
|---|---|---|---|---|---|---|
| R-1 | `git branch --show-current` | a branch name | `master` | 0 | PASS | — |
| R-2 | `git log -1 --format="%H %s"` | PLACE-041's own governance commit as HEAD | `8d6c5c7 ... docs(delivery): PLACE-041 task, report, evidence index, state updates` | 0 | PASS | — |
| R-3 | `git status` | clean | `nothing to commit, working tree clean` | 0 | PASS | — |
| R-4 | `grep -n "task: none\|status: awaiting" docs/delivery/state.yaml` | `current.task: none`, `awaiting_task_authorization` | both confirmed present | 0 | PASS | `docs/delivery/state.yaml` |
| R-5 | `ls docs/delivery/tasks/` sorted | PLACE-001..PLACE-041 present, PLACE-042 absent (pre-task) | confirmed (PLACE-033 pre-existing gap, unrelated) | 0 | PASS | — |

## 2. Docker and PostgreSQL

| ID | Command / method | Expected | Actual | Exit | Status | Artifact |
|---|---|---|---|---|---|---|
| D-1 | `docker version` | daemon reachable or a clear connection error | client 29.6.2 present; server: `npipe:////./pipe/dockerDesktopLinuxEngine ... system cannot find the file specified` | 1 (client no-server) | FAIL (diagnosed, not blocking) | — |
| D-2 | `docker context ls` | confirm active context is the standard Docker Desktop one, not misconfigured | `desktop-linux *` (starred/active) — the correct context | 0 | PASS | — |
| D-3 | `docker compose version` | CLI plugin present regardless of daemon state | `v5.3.1` | 0 | PASS | — |
| D-4 | PowerShell `Test-Path` + `where docker.exe` | locate an installed Docker Desktop executable | found: `C:\Users\MY TOM\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe` | 0 | PASS | — |
| D-5 | `Start-Process "Docker Desktop.exe"` | daemon starts (safe, reversible — no reinstall, no OS config change) | process launched (`com.docker.backend` x2, `Docker Desktop` PIDs observed) | — | PASS | — |
| D-6 | Poll `docker info` every 5s, up to 120s | daemon becomes reachable | reachable after **5s** | 0 | PASS | — |
| D-7 | `docker ps -a` | dev stack present and healthy | `phuquoc-postgres`/`phuquoc-redis`/`phuquoc-minio` — all `Up ... (healthy)` (auto-restarted via their own `restart: unless-stopped` policy) | 0 | PASS | — |
| D-8 | `pg_isready -U phuquoc -d phuquochub` (username/db name only — no password used or logged) | `accepting connections` | confirmed | 0 | PASS | — |
| D-9 | `redis-cli ping` | `PONG` | confirmed | 0 | PASS | — |
| D-10 | Confirm database identity | must be local dev, never production | `phuquoc-postgres` container, `docker-compose.yml` (dev file, not `docker-compose.prod.yml`), host `localhost:5432` — no VPS, no Hostinger, no production credential anywhere in this task | — | PASS | — |

**Redaction note:** no password or full `DATABASE_URL`/connection string is recorded anywhere in
this index or the report — only the dev-only username (`phuquoc`) and database name
(`phuquochub`), both already public in this repository's own `.env.example`.

## 3. Migration baseline

| ID | Command / method | Expected | Actual | Exit | Status | Artifact |
|---|---|---|---|---|---|---|
| M-1 | `ls apps/api/src/core/database/migrations/*.ts \| wc -l` | matches the live `migrations` table count | 20 files | 0 | PASS | `apps/api/src/core/database/migrations/` |
| M-2 | `SELECT count(*) FROM migrations` | 20 | 20 | 0 | PASS | — |
| M-3 | `npx typeorm-ts-node-commonjs migration:show -d src/core/database/data-source.ts` (pre-rehearsal) | all 20 `[X]`, zero `[ ]` | all 20 `[X]` confirmed | 0 | PASS | — |
| M-4 | `SELECT name FROM migrations ORDER BY id DESC LIMIT 1` | a name string | `AddPlacesStatusPartialIndex1720001900000` | 0 | PASS | — |
| M-5 | `Read AddPlacesStatusPartialIndex1720001900000.ts` in full | justify rehearsal-suitability | `up()`: one `CREATE INDEX`; `down()`: one `DROP INDEX IF EXISTS`, no dependency on any other migration, zero data mutation — the safest available candidate (all 20 migrations confirmed additive, no destructive `down()` exists in this repository) | — | PASS | `apps/api/src/core/database/migrations/1720001900000-AddPlacesStatusPartialIndex.ts` |
| M-6 | `\d places` (pg_indexes section) | `idx_places_status_active` present with the exact expected definition | `CREATE INDEX idx_places_status_active ON public.places USING btree (status) WHERE (deleted_at IS NULL)` | 0 | PASS | — |

## 4. Controlled test data / schema assertions

| ID | Command / method | Expected | Actual | Exit | Status | Artifact |
|---|---|---|---|---|---|---|
| T-1 | `SELECT count(*) FROM places WHERE slug LIKE 'place-042%'` (pre-insert) | 0 (no leftover from any prior attempt) | 0 | 0 | PASS | — |
| T-2 | `INSERT INTO places (...) VALUES (...), (...)` — 2 rows, category_id = an existing seeded `beach` category, no real personal data | `INSERT 0 2` | `INSERT 0 2` | 0 | PASS | — |
| T-3 | Post-insert verification query | 2 rows: `place-042-rehearsal-active` (`deleted_at` NULL), `place-042-rehearsal-deleted` (`deleted_at` set) | both rows confirmed with the expected `is_deleted` flag | 0 | PASS | — |
| T-4 | `SELECT count(*) FROM places` (post-insert) | 51 (49 baseline + 2 markers) | 51 | 0 | PASS | — |
| T-5 | `SELECT count(*) FROM places WHERE deleted_at IS NULL` (pre-revert) | 50 (49 baseline + 1 active marker; the soft-deleted marker excluded) | 50 | 0 | PASS | — |
| T-6 | Post-revert data check | both marker rows still present, unchanged | confirmed present, `is_deleted` flags unchanged | 0 | PASS | — |
| T-7 | Post-re-apply data check | both marker rows still present, unchanged | confirmed present, `is_deleted` flags unchanged; total 51 | 0 | PASS | — |
| T-8 | Cleanup: `DELETE FROM places WHERE slug IN ('place-042-rehearsal-active','place-042-rehearsal-deleted')` | `DELETE 2` | `DELETE 2` | 0 | PASS | — |
| T-9 | Post-cleanup verification | 0 markers, 49 total places (exact original baseline) | confirmed: 0 markers, 49 places | 0 | PASS | — |

## 5. Revert

| ID | Command / method | Expected | Actual | Exit | Status | Artifact |
|---|---|---|---|---|---|---|
| V-1 | `npx typeorm-ts-node-commonjs migration:revert -d src/core/database/data-source.ts` (official command, manual first run) | reverts `AddPlacesStatusPartialIndex1720001900000`, exit 0 | log confirms `"Migration AddPlacesStatusPartialIndex1720001900000 has been reverted successfully."`; `DROP INDEX IF EXISTS "idx_places_status_active"` executed inside `START TRANSACTION ... COMMIT` | 0 | PASS | — |
| V-2 | `SELECT count(*) FROM migrations` (post-revert) | 19 | 19 | 0 | PASS | — |
| V-3 | `SELECT name FROM migrations ORDER BY id DESC LIMIT 1` (post-revert) | `SeedSourcePermissions1720001800000` | confirmed | 0 | PASS | — |
| V-4 | `SELECT indexname FROM pg_indexes WHERE ... indexname='idx_places_status_active'` (post-revert) | 0 rows (index gone) | 0 rows | 0 | PASS | — |
| V-5 | Data-integrity check (see T-6) | both markers intact | confirmed | 0 | PASS | — |

## 6. Re-apply

| ID | Command / method | Expected | Actual | Exit | Status | Artifact |
|---|---|---|---|---|---|---|
| A-1 | `npx typeorm-ts-node-commonjs migration:run -d src/core/database/data-source.ts` (official command, manual first run) | re-applies `AddPlacesStatusPartialIndex1720001900000`, exit 0 | log confirms `"Migration AddPlacesStatusPartialIndex1720001900000 has been executed successfully."`; `CREATE INDEX ...` executed inside `START TRANSACTION ... COMMIT` | 0 | PASS | — |
| A-2 | `SELECT count(*) FROM migrations` (post-re-apply) | 20 | 20 | 0 | PASS | — |
| A-3 | `SELECT name FROM migrations ORDER BY id DESC LIMIT 1` (post-re-apply) | `AddPlacesStatusPartialIndex1720001900000` (original head restored) | confirmed | 0 | PASS | — |
| A-4 | `npx typeorm-ts-node-commonjs migration:show` (post-re-apply) | all 20 `[X]`, zero pending | confirmed | 0 | PASS | — |
| A-5 | `SELECT indexname, indexdef FROM pg_indexes WHERE indexname='idx_places_status_active'` | definition byte-identical to M-6 | `CREATE INDEX idx_places_status_active ON public.places USING btree (status) WHERE (deleted_at IS NULL)` — identical | 0 | PASS | — |
| A-6 | `SELECT name, count(*) FROM migrations GROUP BY name HAVING count(*) > 1` | 0 rows (no duplicate migration names) | 0 rows | 0 | PASS | — |
| A-7 | `SELECT count(*) FROM pg_indexes WHERE indexname='idx_places_status_active'` | exactly 1 (no duplicate index) | 1 | 0 | PASS | — |
| A-8 | Data-integrity check (see T-7) | both markers intact | confirmed | 0 | PASS | — |
| A-9 | Note on `migrations.id` gap (19→21, later →22) | not a defect | confirmed cosmetic: Postgres `SERIAL`/`IDENTITY` auto-increment behavior after `DELETE`+`INSERT`; TypeORM tracks migration identity by `(timestamp, name)`, not `id` — `migration:show`'s own name-based output was correct and consistent at every check | — | PASS (explained, not a FAIL) | report §9 |

## 7. Recovery / failure verification

| ID | Command / method | Expected | Actual | Exit | Status | Artifact |
|---|---|---|---|---|---|---|
| F-1 | `DB_NAME=nonexistent_db_place042_safety_test npx typeorm-ts-node-commonjs migration:revert ...` (safe, non-destructive failure method: an invalid local-only parameter, per Phase 8's own listed acceptable method) | connection-stage failure, non-zero exit, real database untouched | `error: database "nonexistent_db_place042_safety_test" does not exist` | 1 | PASS | — |
| F-2 | Post-failure-test verification: `SELECT count(*) FROM migrations`, head, marker count on the REAL `phuquochub` database | unchanged: 20 migrations, correct head, 2 markers still present at that point in the sequence | confirmed unchanged | 0 | PASS | — |
| F-3 | `DATABASE-ROLLBACK-RECOVERY-RUNBOOK.md` review/authoring | answers: revert fails / re-apply fails / app-schema incompatible / when to stop / when to restore backup / how to confirm head / how to keep evidence / who decides | all 8 present as an explicit decision table (§3) | — | PASS | `docs/delivery/DATABASE-ROLLBACK-RECOVERY-RUNBOOK.md` |
| F-4 | Backup/restore claim check | must NOT claim a new operational rehearsal in this task | **`Backup/restore procedure reviewed but not operationally rehearsed in PLACE-042`** — `scripts/backup.sh`/`restore.sh` were actually executed in PLACE-038 (separate, prior task); this task's own recovery-verification method was F-1/F-2 only | — | PASS (accurately scoped) | report §10 |

## 8. Automation

| ID | Command / method | Expected | Actual | Exit | Status | Artifact |
|---|---|---|---|---|---|---|
| G-1 | `sh -n scripts/migration-rollback-rehearsal.sh` | syntax OK | `syntax OK` | 0 | PASS | `scripts/migration-rollback-rehearsal.sh` |
| G-2 | `NODE_ENV=production sh scripts/migration-rollback-rehearsal.sh` (guard test 1) | refuses immediately, no DB action | `REFUSING to run: NODE_ENV=production ...` | 1 | PASS | — |
| G-3 | `DB_HOST=some-real-vps.example.com sh scripts/migration-rollback-rehearsal.sh` (guard test 2) | refuses immediately, no DB action | `REFUSING to run: DB_HOST='some-real-vps.example.com' is not localhost/127.0.0.1 ...` | 1 | PASS | — |
| G-4 | `sh scripts/migration-rollback-rehearsal.sh` (live, no guard tripped — real local DB) | full revert→status→re-apply→status cycle, exit 0 | ran to completion; Step 1/5 both showed all 20 `[X]` (head correctly restored); Steps 2/4 (`migration:revert`/`migration:run`) each exited 0 internally | 0 | PASS | — |
| G-5 | Secret scan on the script | no password/token/secret literal | 0 matches | — | PASS | — |
| G-6 | Machine-specific path check | no absolute, user-specific path | script resolves `apps/api` relative to its own `$0` location (`CDPATH= cd -- "$(dirname -- "$0")"`), matching every existing `scripts/*.sh` — 0 hardcoded absolute paths found | — | PASS | — |
| G-7 | New-dependency check | none added | `package.json` diff: none (script uses only `sh` + the pre-existing `npx typeorm-ts-node-commonjs`) | — | PASS | — |

## 9. Validation (final)

| ID | Command / method | Expected | Actual | Exit | Status | Artifact |
|---|---|---|---|---|---|---|
| N-1 | `node -e "yaml.load(...)"` on `state.yaml`, `PLACE-042.yaml`, `place.yaml` | all parse cleanly | all 3 `OK` | 0 | PASS | — |
| N-2 | Markdown path/link review (`RELEASE-AND-ROLLBACK-CHECKLIST.md` §6 new cross-link, `DATABASE-ROLLBACK-RECOVERY-RUNBOOK.md`'s own internal links) | every referenced path exists in the repo | `INCIDENT-RESPONSE-RUNBOOK.md`, `RELEASE-AND-ROLLBACK-CHECKLIST.md`, `scripts/migration-rollback-rehearsal.sh`, `scripts/restore.sh` all confirmed to exist at the referenced paths | — | PASS | — |
| N-3 | `npx jest migrations` (apps/api, the 3 migration-content spec suites) | unaffected (no source touched) | 11/11 passed, 3 suites | 0 | PASS | — |
| N-4 | `docker compose -f docker-compose.yml config --quiet` | exit 0 | exit 0 | 0 | PASS | — |
| N-5 | `docker compose -f docker-compose.prod.yml config --quiet` | exit 0 (untouched this task) | exit 0 | 0 | PASS | — |
| N-6 | Final `migration:show` | all 20 `[X]`, zero pending | confirmed (re-checked at the start of this continuation turn, no re-run needed) | 0 | PASS | — |
| N-7 | Final `pg_isready` + `redis-cli ping` | both healthy | both confirmed | 0 | PASS | — |
| N-8 | Secret scan across full `git diff` + every new PLACE-042 file | zero password/secret/token/key literal | 0 matches | — | PASS | — |
| N-9 | `git diff` full review | scoped exactly to the files in the report's Files-Modified section | confirmed — no `.env`, no dump, no log, no credential, no private key, no machine-specific path, no leftover test-marker reference committed anywhere | — | PASS | — |
| N-10 | Final marker-cleanup re-check | 0 markers in the live database | confirmed 0 (see T-9, re-verified again at the start of this continuation turn) | 0 | PASS | — |

## Not claimed

| ID | Item | Disposition |
|---|---|---|
| NX-1 | Production rollback proven | **NOT claimed** — only the local rollback/re-apply mechanism is proven (report §16) |
| NX-2 | Backup/restore operationally rehearsed in PLACE-042 | **NOT claimed** — `Backup/restore procedure reviewed but not operationally rehearsed in PLACE-042` (already executed for real in the separate, prior PLACE-038 task) |
| NX-3 | A destructive (non-additive) migration rehearsed | **NOT performed** — none exists in this repository; runbook requires this be repeated against the first one authored |
| NX-4 | Any production/Hostinger/DNS/credential action | **NOT performed** |
| NX-5 | PLACE-043 | **NOT created, NOT started** |
