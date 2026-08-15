# PhuQuocHub — Database Migration Rollback & Recovery Runbook

**Created:** 2026-07-25 (PLACE-042). Records the evidence and procedure for TypeORM migration
rollback, proven by a real, live rehearsal against the local dev database (not a documentation-
only exercise — see [PLACE-042's evidence index](evidence/PLACE-042-migration-rollback-rehearsal-evidence-index.md)
for every command and result).

See also: [`RELEASE-AND-ROLLBACK-CHECKLIST.md`](RELEASE-AND-ROLLBACK-CHECKLIST.md) (container-level
release/rollback) and [`INCIDENT-RESPONSE-RUNBOOK.md`](INCIDENT-RESPONSE-RUNBOOK.md) (general
incident triage).

## 1. What this rehearsal proved

Against the local dev database (`phuquoc-postgres`, 20 migrations, real seeded dev data):

1. `npx typeorm-ts-node-commonjs migration:revert -d src/core/database/data-source.ts` (run from
   `apps/api/`) successfully reverted the head migration
   (`AddPlacesStatusPartialIndex1720001900000`), exit code 0.
2. The migration's schema effect (`idx_places_status_active`) was correctly removed; the
   `migrations` tracking table correctly dropped to 19 rows with the new head one step back.
3. `npx typeorm-ts-node-commonjs migration:run -d src/core/database/data-source.ts` successfully
   re-applied it, exit code 0, restoring the index and the 20-row migration head.
4. Two designed test rows (`place-042-rehearsal-active`, `place-042-rehearsal-deleted` — one
   with `deleted_at IS NULL`, one soft-deleted) survived the full revert→re-apply cycle
   unchanged, proving no data loss.
5. Post-cycle: no duplicate migration names, no duplicate index definitions, migration history
   internally consistent (`migration:show` reports all 20 as `[X]`, zero pending).
6. A reusable script, `scripts/migration-rollback-rehearsal.sh`, wraps this exact sequence with
   safety guards (refuses on `NODE_ENV=production` or a non-local `DB_HOST`) and was itself run
   live end-to-end, exit code 0.
7. A safe failure-mode test (an intentionally nonexistent `DB_NAME`) confirmed `migration:revert`
   fails loudly (non-zero exit, clear Postgres error) at the *connection* stage, before any
   transaction opens — the real database was verified completely untouched afterward.

**Scope of this proof:** one migration (`AddPlacesStatusPartialIndex1720001900000`), selected
because it is the current head, has no dependency on any other migration for its own revert (its
`down()` only drops the one index its own `up()` created), and is purely additive/structural (no
data mutation) — the safest and most representative migration available for a first rehearsal.
This proves the **mechanism** (the `migration:revert`/`migration:run` cycle, the tracking table,
and the safety-guarded script) works correctly end-to-end. It does **not** by itself prove every
past or future migration's `down()` is equally safe — see §2.

## 2. What this rehearsal did NOT prove

- It did not rehearse a migration whose `down()` drops a column, table, or constraint with real
  data in it — no such migration exists in this repository today (all 20 are additive, confirmed
  across PLACE-037/038's own review), so there was nothing riskier to rehearse against safely.
  **Before the first migration that is NOT purely additive is ever deployed, re-run this
  rehearsal against that specific migration** using the same procedure (§4) — do not assume the
  mechanism being sound generalizes to a destructive `down()` being sound.
- It did not rehearse against a real production database, VPS, or any real user data.
- It did not test reverting more than one migration at a time (TypeORM's `migration:revert`
  only ever reverts the single current head; a multi-step rollback would be N sequential
  invocations, each independently subject to this same procedure).

## 3. Decision tree — what to do when a migration step fails during a real release

| Situation | Action | Who decides |
|---|---|---|
| `migration:run` fails during a real deploy (see `scripts/deploy.sh` Step 7) | `deploy.sh` already halts automatically — the previous application version is still running untouched. Fix the migration, re-run `deploy.sh` from Step 7. **Do not** attempt `migration:revert` here — nothing was committed to revert. | Operator (no escalation needed — this is deploy.sh's own designed halt behavior) |
| `migration:revert` itself fails (non-zero exit) | Per §1 item 7: a connection-stage failure touches nothing — fix the connection parameter and retry. If it fails *after* `START TRANSACTION` (visible in its logged output), the transaction was rolled back automatically by Postgres (TypeORM wraps each migration in one transaction) — confirm via `migration:show` that the migration in question still shows `[X]` (not reverted) before deciding anything else. **Stop the release** if this happens against a real database; do not attempt a second revert without understanding why the first failed. | **Stop and escalate to the Owner** before any further database action |
| Revert succeeds but re-apply (`migration:run`) then fails | The database is now missing that migration's schema object. Check `migration:show` — the previous migration's head is what's actually live. If the application code assumes the reverted schema object exists (e.g., a column the newly-deployed app code reads), this is a **schema/application incompatibility** — see next row. If not, the database is in a valid, consistent (older) state; fix the migration and re-run `migration:run` alone. | Operator can retry `migration:run`; escalate to Owner if the root cause isn't obvious within a few minutes |
| Application code and schema are incompatible (app expects a column/index/table that isn't there) | This is the highest-severity case. **Stop the release immediately.** Either roll the application container back too (`scripts/rollback.sh`, matching image tag to schema) or re-apply the migration if it's safe to do so. Never leave the app running against a schema it doesn't expect. | **Owner decides** whether to roll back the app, retry the migration, or restore from backup |
| A migration's `down()` is confirmed destructive (drops a column/table with real data) and revert is still required | Do **not** rely on `down()` alone. Restore from the most recent pre-migration backup instead (`scripts/restore.sh`) — see `RELEASE-AND-ROLLBACK-CHECKLIST.md` §6. | **Owner decides** — this is the one scenario this runbook explicitly says requires backup restore, not `migration:revert` |
| Uncertain which of the above applies | Default to the most conservative action: stop the release, do not run further migration commands, capture `migration:show` output + container logs, and escalate. | **Owner** |

## 4. How to confirm migration head after any recovery action

```
cd apps/api
npx typeorm-ts-node-commonjs migration:show -d src/core/database/data-source.ts
```

Every migration expected to be applied must show `[X]`; anything after the intended head must
show `[ ]` (pending) and nothing else. A mix that doesn't match a clean prefix of `[X]`s followed
by `[ ]`s (e.g., a `[X]` after a `[ ]`) would indicate real inconsistency — this was never observed
in this rehearsal and would itself be a stop-and-escalate condition if it ever occurred.

## 5. Keeping evidence during a real incident

- Capture the full terminal output of every `migration:revert`/`migration:run`/`migration:show`
  invocation — TypeORM logs every SQL statement it runs, which is exactly the evidence needed to
  reconstruct what happened.
- Capture `docker compose logs postgres --tail=200` around the same window.
- Do not delete the Postgres volume or any backup file until the incident is fully understood and
  resolved — this runbook's own rehearsal (§1) deliberately never removed the database volume for
  the same reason (PLACE-042's own instruction: doing so would prevent proving the rollback
  actually worked).
- Record what happened somewhere durable (a dated note, or a future PLACE task if a real defect
  is found) — same discipline as `INCIDENT-RESPONSE-RUNBOOK.md` §6.

## 6. Who decides

Per §3's table: routine, halted-automatically failures (deploy.sh's own Step 7 halt) need no
escalation — fix and retry. Anything that reaches an actual `migration:revert`/`migration:run`
failure against a real database, or any application/schema incompatibility, requires the **Owner**
to decide whether to retry, roll back the application, or restore from backup. This project has a
single operator today (no team, no on-call rotation, per `INCIDENT-RESPONSE-RUNBOOK.md` §7) — the
Owner and the operator making this decision are expected to be the same person; this section
exists to make the decision authority explicit for when that changes.

## 7. Fresh cluster bootstrap (empty PostgreSQL volume)

Added 2026-08-15, when the long-running `postgres` service was decoupled from the application
credential. **Read this before any recovery that starts from an empty data volume.**

### What changed, and why an empty volume now refuses to start

`docker-compose.prod.yml`'s `postgres` service no longer declares `POSTGRES_PASSWORD`. It used to
be `POSTGRES_PASSWORD: ${DB_PASSWORD:-…}`, which tied the database container's Compose config hash
to the *application's* runtime credential: every application password rotation changed the postgres
service hash, so a bare `docker compose up -d` planned a **recreate of the production database**.
A credential rotation must never be able to schedule database downtime.

This is safe because `POSTGRES_PASSWORD` is an *initialization-only* variable. In this exact image
(`postgis/postgis:16-3.4`), `/usr/local/bin/docker-entrypoint.sh` calls `docker_verify_minimum_env`
— the only thing that requires it — exclusively inside `if [ -z "$DATABASE_ALREADY_EXISTS" ]`, and
that flag is set from `[ -s "$PGDATA/PG_VERSION" ]`. `initdb --pwfile`, `docker_setup_db` and
`pg_setup_hba_conf` all live in the same branch.

**Consequences you must internalize:**

- **Normal startup on an existing volume needs no `POSTGRES_PASSWORD`.** The entrypoint prints
  `Skipping initialization`, leaves `pg_hba.conf` and the cluster `system_identifier` untouched,
  and does not rerun `/docker-entrypoint-initdb.d`.
- **An empty volume now fails closed.** The entrypoint exits 1 with *"Database is uninitialized and
  superuser password is not specified"* and writes nothing. This is deliberate: initializing a
  production cluster must be a witnessed act, never a side effect of `up -d`.
- **`DB_PASSWORD` does NOT initialize a fresh production volume any more.** Do not assume it will.
- **Never** set `POSTGRES_HOST_AUTH_METHOD=trust` to get past the refusal, and never re-add
  `POSTGRES_PASSWORD` to `docker-compose.prod.yml`.

### The explicit bootstrap procedure

Use the committed, bootstrap-only overlay `docker-compose.bootstrap.yml`. It supplies
`POSTGRES_PASSWORD: ${POSTGRES_BOOTSTRAP_PASSWORD}` with **no default**, so a mistyped bootstrap
fails rather than silently initializing.

1. Generate a bootstrap secret on the host, into a protected file — never an inline shell word
   (that would land in shell history and process argv):

   ```
   umask 077; mkdir -p /run/pg-bootstrap
   printf 'POSTGRES_BOOTSTRAP_PASSWORD=%s\n' \
     "$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 64)" > /run/pg-bootstrap/env
   ```

2. Initialize, overlay applied, postgres only:

   ```
   set -a; . /run/pg-bootstrap/env; set +a
   docker compose -f docker-compose.prod.yml -f docker-compose.bootstrap.yml up -d --no-deps postgres
   ```

3. Restore the data. This runbook's restore path (`scripts/restore.sh`) and
   `BACKUP-RESTORE-RUNBOOK.md` operate on the **existing/recreated cluster** over the container's
   unix socket (`local all all trust` in the image's generated `pg_hba.conf`), so they need neither
   the bootstrap secret nor `DB_PASSWORD`.

4. Set the *application* role's password to the value already in `.env`'s `DB_PASSWORD`. This is a
   separate concern from the bootstrap secret — the bootstrap secret only ever existed to satisfy
   `initdb`. Use a SCRAM verifier computed on the host so the plaintext never crosses the wire or
   reaches a server log.

5. Drop the overlay back out by recreating postgres from the plain production file alone, so the
   service hash returns to its decoupled form:

   ```
   docker compose -f docker-compose.prod.yml up -d --no-deps postgres
   ```

6. Destroy the bootstrap secret (`rm -f /run/pg-bootstrap/env`). It has no further purpose and must
   not be stored, committed, or copied into `.env`.

### Verifying the invariant afterwards

A bare `docker compose up -d --dry-run` must report every service `Running`, with no `Recreate` and
no `migrate`. Anything else means the coupling has returned or new drift exists. The static
regression suite for this is `scripts/tests/postgres-init-decoupling.test.sh`.
