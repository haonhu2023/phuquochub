# PLACE-042 — Database Migration Rollback Rehearsal and Recovery Verification Report (2026-07-25)

## 1. Executive Summary

Continuing from PLACE-041 (completed, HEAD `8d6c5c7` at task start, clean tree, no authorized
`current.task`). The Owner issued explicit written authorization to create and execute PLACE-042,
a rollback rehearsal repeatedly flagged as an open gap since PLACE-037 §12 but never attempted
across PLACE-039/040/041 because this session's Docker engine was unreachable each time.

**This time, Docker was successfully restored** (diagnosed via safe commands, then the
already-installed Docker Desktop application was launched directly — no reinstall, no risky OS
change), which unblocked a **real, live rehearsal**, not a documentation-only exercise.

**Result: the rehearsal succeeded on every required point.** The current-head migration
(`AddPlacesStatusPartialIndex1720001900000`) was reverted via the official `migration:revert`
command (exit 0), verified via direct SQL query that its schema effect was removed and 2 designed
test rows survived unchanged, re-applied via `migration:run` (exit 0), and verified the exact
original migration head was restored with zero duplicate/inconsistent state. A safe failure-mode
test (a nonexistent local database name) confirmed `migration:revert` fails loudly and safely
without touching the real database. A new, safety-guarded, reusable script
(`scripts/migration-rollback-rehearsal.sh`) wraps this exact sequence and was itself run live,
end-to-end, exit code 0. A new runbook (`DATABASE-ROLLBACK-RECOVERY-RUNBOOK.md`) answers every
required recovery question.

### Quick-reference answers (Phase 11 required questions)

| Question | Answer | Section |
|---|---|---|
| Migration nào đã được rehearsal | `AddPlacesStatusPartialIndex1720001900000` (the current head) | §4 |
| Tại sao migration đó được chọn | Zero dependency on any other migration for its own revert; purely structural (one index, no data mutation); the only migration in the repository with a clean, isolated `down()` — all 20 migrations are additive, so this was the best available, not a cherry-picked easy case | §4 |
| Database bắt đầu ở trạng thái nào | Local dev Postgres, 20/20 migrations applied, head = `AddPlacesStatusPartialIndex1720001900000`, 49 pre-existing dev places rows, zero pending | §5 |
| Revert đã thay đổi gì | Dropped `idx_places_status_active`; `migrations` table 20→19 rows, head moved back one step; zero data-row change | §7 |
| Dữ liệu nào phải tồn tại hoặc thay đổi | 2 designed marker rows (§6) — both required to exist unchanged after revert and after re-apply; both did | §6, §7, §8 |
| Re-apply đã khôi phục gì | The index (byte-identical definition) and the migration head (byte-identical name), `migrations` table back to 20 rows | §8 |
| Migration head cuối cùng là gì | `AddPlacesStatusPartialIndex1720001900000` — identical to the pre-rehearsal head | §8, §9 |
| Safety guard hoạt động ra sao | Both of `scripts/migration-rollback-rehearsal.sh`'s guards were tripped on purpose and correctly refused (`NODE_ENV=production` → exit 1; non-local `DB_HOST` → exit 1), then the script ran clean end-to-end (exit 0) with neither guard triggered | §11 |
| Failure/recovery verification đã kiểm tra thực tế đến đâu | One real, executed, safe failure test (invalid local `DB_NAME`) — not merely reviewed in the abstract; exit 1, real database independently confirmed unaffected afterward | §10 |
| Backup/restore có được thực hành thật hay chỉ được review | **Backup/restore procedure reviewed but not operationally rehearsed in PLACE-042** — it was actually executed for real in the separate, prior PLACE-038 task; not repeated here | §10 |
| Những gì PLACE-042 đã chứng minh | The `migration:revert`/`migration:run` mechanism, the migration-tracking table, and the safety-guarded rehearsal script all work correctly, live, on the local dev database, for a representative additive migration | §16 |
| Những gì PLACE-042 chưa chứng minh cho production | Nothing about a real production database, a destructive (non-additive) migration's `down()`, or any Hostinger/DNS/production-credential action — see §16 for the explicit list | §16 |

**PLACE-042 status: COMPLETED** — see §14 for the explicit evidence against every completion
condition.

## 2. Phase 1 — Repository Truth (verified before any file/DB action)

| Fact | Value |
|---|---|
| Branch | `master` |
| HEAD at task start | `8d6c5c7` — "docs(delivery): PLACE-041 task, report, evidence index, state updates" |
| `git status` | clean |
| `current.task` (state.yaml) | `none`, `status: awaiting_task_authorization` |
| PLACE-037/038/039/040/041 | all `status: completed` in their task files |
| Existing PLACE task files | PLACE-001 through PLACE-041 (no PLACE-033 gap-filled retroactively, pre-existing and unrelated to this task) |

## 3. Docker and Database Availability (Phase 4)

| Step | Command | Result |
|---|---|---|
| 1 | `docker version` | Client 29.6.2 present; server unreachable — `npipe:////./pipe/dockerDesktopLinuxEngine`, "The system cannot find the file specified" (identical to PLACE-039/040/041's sessions) |
| 2 | `docker context ls` | `desktop-linux *` (starred, active) is the correct, standard Docker Desktop context — **ruled out** as a misconfigured-context problem |
| 3 | `docker compose version` | `v5.3.1` — CLI plugin present regardless of daemon state |
| 4 | Searched for the Docker Desktop installation | Found at the per-user path `C:\Users\MY TOM\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe` (confirmed via `where docker.exe` resolving to a sibling `resources\bin\` directory) — no process running (`Get-Process -Name "*Docker*"` empty) |
| 5 | Launched `Docker Desktop.exe` directly | A safe, fully reversible action — equivalent to a user double-clicking the app icon. **Not** a reinstall, **not** an OS configuration change |
| 6 | Polled `docker info` every 5s | Daemon reachable within **5 seconds** |
| 7 | `docker ps -a` | The pre-existing dev stack (`phuquoc-postgres`, `phuquoc-redis`, `phuquoc-minio`) auto-restarted (their compose `restart: unless-stopped` policy) and reported **healthy** within 18 seconds of the daemon coming up |

**No Docker reinstallation, no OS configuration change, no simulated result.** The daemon was
genuinely restored and independently confirmed via `docker ps`/`docker info` before any rehearsal
step began.

## 4. Migration Selected for Rehearsal (Phase 3)

**Selected: `AddPlacesStatusPartialIndex1720001900000`** (the current head; authored PLACE-003).

| Question | Answer, with evidence |
|---|---|
| `up()` content | `CREATE INDEX "idx_places_status_active" ON "places" ("status") WHERE "deleted_at" IS NULL` — a single partial index, nothing else |
| `down()` content | `DROP INDEX IF EXISTS "idx_places_status_active"` — drops exactly and only the one index its own `up()` created |
| Objects affected | One index on the `places` table. No table, column, constraint, or row is created/dropped/altered |
| Destructive data operation? | **None.** Index creation/removal never touches row data |
| Could `down()` fail to restore original state? | No — `down()` is the exact structural inverse of `up()`; both are idempotent-safe (`IF NOT EXISTS`/`IF EXISTS` semantics implicit in `CREATE INDEX`/`DROP INDEX IF EXISTS`) |
| Dependency on another migration for its own revert? | **None** — it does not reference any column/table introduced by a later migration (it is itself the latest), and its `down()` only names its own index |

This is the safest and most representative migration available in this repository for a first
rehearsal: **all 20 migrations are additive** (confirmed across PLACE-037/038's own review, and
independently re-confirmed by this task reading every migration's `down()` — no destructive
`down()` exists to rehearse against instead). No historical migration was modified to make this
rehearsal pass — the migration ran exactly as authored.

## 5. Pre-Rehearsal Baseline (Phase 5)

| Check | Result | Evidence |
|---|---|---|
| Timestamp | `2026-07-25T13:06:20Z` | `date -u` |
| Container status | `phuquoc-postgres`, `phuquoc-redis`, `phuquoc-minio` all `Up ... (healthy)` | `docker ps -a` |
| Connect with local credential | `phuquoc`/`phuquoc`@`phuquochub` (dev-only, matches `data-source.ts`'s own defaults — **not** a production credential) | direct `psql` connection succeeded |
| Migrations applied | 20 (`migration:show`: all `[X]`, zero pending) | `SELECT count(*) FROM migrations` → 20; `migration:show` |
| Migration head | `AddPlacesStatusPartialIndex1720001900000` | `SELECT name FROM migrations ORDER BY id DESC LIMIT 1` |
| Relevant index | `idx_places_status_active`, `CREATE INDEX ... USING btree (status) WHERE (deleted_at IS NULL)` | `pg_indexes` query |
| Places row count | 49 (pre-existing dev seed data, unrelated to this task) | `SELECT count(*) FROM places` |
| Pre-existing PLACE-042 marker | 0 (none — confirmed no leftover from any prior attempt) | `SELECT count(*) FROM places WHERE slug LIKE 'place-042%'` |

No production or personal data was used anywhere in this baseline.

## 6. Controlled Test Data (Phase 6)

Inserted 2 minimal rows into the local dev `places` table via a single parameterized `INSERT`:

| Row | slug | status | deleted_at | Purpose |
|---|---|---|---|---|
| A | `place-042-rehearsal-active` | `published` | `NULL` | Should be counted by the partial index's `WHERE deleted_at IS NULL` predicate |
| B | `place-042-rehearsal-deleted` | `published` | `now()` (soft-deleted) | Should be **excluded** by the same predicate — tests the index's semantic boundary, not just its existence |

Both rows use an obviously-fake name (`"PLACE-042 Rehearsal Marker (...)"`), a valid existing
`category_id` (an already-seeded `beach` category), and a placeholder coordinate — zero real
personal data. Expectation: both rows must exist, byte-identical, after revert and after
re-apply (this migration never touches row data) — deleted only by this task's own explicit
cleanup step at the end, never by the rehearsal itself.

## 7. Rollback Result (Phase 7B)

```
$ npx typeorm-ts-node-commonjs migration:revert -d src/core/database/data-source.ts
...
AddPlacesStatusPartialIndex1720001900000 is the last executed migration.
Now reverting it...
query: START TRANSACTION
query: DROP INDEX IF EXISTS "idx_places_status_active"
query: DELETE FROM "migrations" WHERE ...
Migration AddPlacesStatusPartialIndex1720001900000 has been reverted successfully.
query: COMMIT
EXIT CODE: 0
```

Independently verified afterward (not just trusting the command's own log output):
- `migrations` table: **19** rows, new head = `SeedSourcePermissions1720001800000` ✅
- `idx_places_status_active`: **0 rows** in `pg_indexes` — confirmed gone ✅
- Both PLACE-042 marker rows: **present, unchanged** (51 places total, as expected: 49 + 2) ✅

## 8. Re-Apply Result (Phase 7C)

```
$ npx typeorm-ts-node-commonjs migration:run -d src/core/database/data-source.ts
...
1 migrations are new migrations must be executed.
query: START TRANSACTION
query: CREATE INDEX "idx_places_status_active" ON "places" ("status") WHERE "deleted_at" IS NULL
query: INSERT INTO "migrations"("timestamp", "name") VALUES ...
Migration AddPlacesStatusPartialIndex1720001900000 has been executed successfully.
query: COMMIT
EXIT CODE: 0
```

Independently verified afterward:
- `migrations` table: **20** rows, head restored to `AddPlacesStatusPartialIndex1720001900000` ✅
- `idx_places_status_active`: recreated with the **byte-identical** definition as before revert ✅
- Both marker rows: **still present, unchanged** ✅

## 9. Data and Schema Integrity (Phase 7D)

| Check | Result |
|---|---|
| Duplicate migration names | `SELECT name, count(*) FROM migrations GROUP BY name HAVING count(*) > 1` → **0 rows** |
| Duplicate index named `idx_places_status_active` | `SELECT count(*) FROM pg_indexes WHERE indexname=...` → exactly **1** |
| `migration:show` after re-apply | All 20 migrations `[X]`, **zero pending** |
| Database health | `pg_isready -U phuquoc -d phuquochub` → `accepting connections`; `redis-cli ping` → `PONG` (both halves of `/api/health`'s own check confirmed healthy independently) |
| A cosmetic note, not a defect | The `migrations` table's own auto-increment `id` column shows a gap (19 → 21, later 21 → 22 after the automation run in §11) after each revert+re-apply cycle — this is normal Postgres `SERIAL`/`IDENTITY` behavior following a `DELETE`+`INSERT` and carries **no** significance for migration identity, which TypeORM tracks by `(timestamp, name)`, not `id`. Explicitly verified this does NOT indicate any inconsistency: `migration:show` correctly reported all 20 migrations by name, all `[X]`, in the correct order, every time. |

## 10. Recovery Verification (Phase 8)

**Safe failure-mode test performed** (not merely reviewed): ran `migration:revert` with
`DB_NAME=nonexistent_db_place042_safety_test` (a local-only, intentionally invalid parameter).

```
error: database "nonexistent_db_place042_safety_test" does not exist
...
EXIT CODE: 1
```

This fails at the **connection stage**, before any transaction opens against a real database —
independently confirmed the real `phuquochub` database was completely unaffected afterward (20
migrations, correct head, both marker rows still present, re-checked via direct SQL).

The new `DATABASE-ROLLBACK-RECOVERY-RUNBOOK.md` explicitly answers, with a decision table: what to
do if `migration:revert` fails; what to do if revert succeeds but re-apply fails; what to do if
application and schema become incompatible; when to stop a release; when to restore from backup
instead of relying on `down()`; how to confirm migration head after any recovery action; how to
keep logs/evidence; and who has authority to decide (the Owner, for anything beyond deploy.sh's
own automatic halt).

**Backup/restore procedure reviewed but not operationally rehearsed in PLACE-042.**
`scripts/backup.sh`/`scripts/restore.sh` were actually executed for real, live, against
disposable data in the separate, prior PLACE-038 task (a real gzip `pg_dump` produced, a
destructive restore performed, row counts confirmed identical afterward) — PLACE-042 does not
repeat that cycle and does not claim to. This task's own recovery-verification method was the
safe, non-destructive connection-failure test (F-1/F-2 in the evidence index), one of Phase 8's
explicitly listed acceptable methods for a task scoped to migration rollback specifically, not
backup/restore.

## 11. Automated Regression Coverage (Phase 9)

New `scripts/migration-rollback-rehearsal.sh`: wraps `migration:show` → `migration:revert` →
`migration:show` → `migration:run` → `migration:show` with two safety guards (refuses under
`NODE_ENV=production`; refuses unless `DB_HOST` resolves to `localhost`/`127.0.0.1`), `set -eu` so
any non-zero exit stops the script immediately, no machine-specific absolute paths (resolves
`apps/api` relative to its own location, matching every other `scripts/*.sh` convention), and no
new dependency (pure `sh` + the existing `npx typeorm-ts-node-commonjs` invocations).

**Both safety guards were tested directly** (not just reviewed): `NODE_ENV=production` → refused,
exit 1; `DB_HOST=some-real-vps.example.com` → refused, exit 1. **The script was then run for real,
end-to-end**, against the local dev database — exit code 0, all 20 migrations `[X]` before and
after. Deliberately does **not** attempt a generic, automated data-integrity assertion (per this
task's own instruction: automating that for arbitrary future migrations would need per-migration
customization, which risks over-engineering for hypothetical shapes) — data integrity for *this*
specific migration was verified by hand (§7–9), and the runbook (§2) states explicitly that this
must be repeated by hand for the first non-additive migration.

## 12. Cleanup

Both PLACE-042 marker rows deleted (`DELETE FROM places WHERE slug IN (...)`) after the rehearsal
and its automation run completed. Final state independently re-verified: **49 places** (exact
original baseline), 20 migrations, correct index, both containers still healthy.

## 13. Validation Results (Phase 11)

| Check | Result |
|---|---|
| `sh -n scripts/migration-rollback-rehearsal.sh` | OK |
| Safety guard test 1 (`NODE_ENV=production`) | refused, exit 1 |
| Safety guard test 2 (`DB_HOST=some-real-vps.example.com`) | refused, exit 1 |
| Live end-to-end script run | exit 0 |
| `npx jest migrations` (apps/api, the 3 migration-related spec suites) | 11/11 passed — unaffected, these are static content assertions, not live-DB tests |
| `docker compose -f docker-compose.yml config --quiet` | exit 0 |
| `docker compose -f docker-compose.prod.yml config --quiet` | exit 0 (neither compose file was touched this task) |
| YAML validation (`js-yaml`) on `state.yaml`/`PLACE-042.yaml`/`place.yaml` | all OK |
| Secret scan (all new/modified files) | zero matches |
| `git diff` review | scoped exactly to the files in §15 |

Full apps/api unit suite and monorepo build were **not** re-run in full — this task touched no
TypeScript source, only a new shell script and documentation; the targeted migration-spec re-run
above directly covers the only source-adjacent area (migration file content assertions) this task
could plausibly have affected, and it did not.

## 14. Completion Conditions (Phase 12) — explicit evidence against every requirement

| # | Condition | Evidence |
|---|---|---|
| 1 | Docker/PostgreSQL local hoạt động | §3 — daemon restored, `docker ps` healthy |
| 2 | Database bắt đầu ở migration head | §5 — 20/20, head confirmed before any action |
| 3 | Ít nhất một migration hợp lệ đã được revert bằng command chính thức | §7 — `migration:revert`, exit 0 |
| 4 | Schema sau revert được kiểm tra | §7 — index confirmed dropped via `pg_indexes` |
| 5 | Migration đã được áp dụng lại | §8 — `migration:run`, exit 0 |
| 6 | Database trở lại đúng migration head | §8 — head confirmed restored |
| 7 | Migration history nhất quán | §9 — zero duplicates, `migration:show` clean, `id`-gap explicitly explained as cosmetic |
| 8 | Test data/schema assertions đạt kỳ vọng | §6–9 — both marker rows survived every step unchanged |
| 9 | Runbook recovery đã được cập nhật | `DATABASE-ROLLBACK-RECOVERY-RUNBOOK.md`, §10 |
| 10 | Working tree được xử lý đúng quy tắc commit | §15/§16 — clean start, scoped commits, clean finish |

**All 10 conditions met with direct evidence. PLACE-042 status: COMPLETED**, not "rehearsed
successfully" used loosely — every claim above is backed by an independently-verified command
result, not the rehearsal script's own self-report alone.

## 15. Files Created or Modified

| File | Change |
|---|---|
| `scripts/migration-rollback-rehearsal.sh` | New |
| `docs/delivery/DATABASE-ROLLBACK-RECOVERY-RUNBOOK.md` | New |
| `docs/delivery/RELEASE-AND-ROLLBACK-CHECKLIST.md` | Modified — cross-link added to §6 |
| `docs/delivery/tasks/PLACE-042.yaml` | New |
| `docs/delivery/reports/PLACE-042-migration-rollback-rehearsal-report.md` | New (this file) |
| `docs/delivery/evidence/PLACE-042-migration-rollback-rehearsal-evidence-index.md` | New |
| `docs/delivery/state.yaml` | Updated |
| `docs/delivery/workstreams/place.yaml` | Updated |

No application source file, Dockerfile, or Compose file was touched. No new npm dependency added.

## 16. Not Claimed

- No production deployment, Hostinger access, DNS change, or production credential used.
- No new product feature.
- No destructive (non-additive) migration was rehearsed — none exists in this repository; the
  runbook requires this exact procedure be repeated against the first one that is ever authored,
  before it is deployed for real.
- No new backup/restore cycle performed (already proven in PLACE-038).
- No PLACE-043 created or started.
