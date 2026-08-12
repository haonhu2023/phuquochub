# PhuQuocHub — Backup, Restore & Media Recovery Runbook

**Created:** 2026-08-12 (Backup/Restore Hardening). Supersedes the scattered backup notes in
[`PRE-DEPLOYMENT-CHECKLIST.md`](PRE-DEPLOYMENT-CHECKLIST.md) §2 and
[`deployment.md`](../architecture/deployment.md) §11 as the operational reference for backups.
Related: [`DATABASE-ROLLBACK-RECOVERY-RUNBOOK.md`](DATABASE-ROLLBACK-RECOVERY-RUNBOOK.md) (migration
rollback), [`INCIDENT-RESPONSE-RUNBOOK.md`](INCIDENT-RESPONSE-RUNBOOK.md).

**No credential value appears in this document.** Where a secret is required, only the environment
variable name is named.

---

## 0. Status at a glance (2026-08-12)

Read this table before trusting any capability below. "Verified" means a human ran it against real
production infrastructure and recorded the result.

| Capability | Status | Evidence |
|---|---|---|
| PostgreSQL logical backup on production | **VERIFIED** | Manual run produced `phuquochub-20260812T081643Z.sql.gz`, `GZIP_OK=YES`, SHA256 `3888d7a9…7864` |
| PostgreSQL restore into an isolated database | **VERIFIED** | 52 tables, 42 migrations, key row counts all matched production; production stayed healthy |
| `immutable_unaccent` restore portability | **FIXED, NOT YET DEPLOYED** | Root-caused and fixed by migration `1720004400000`; proven locally, **not yet run on production** |
| MinIO object backup | **VERIFIED (manual)** | Source/backup SHA256 identical: `5a902415…c967` |
| MinIO restore into an isolated bucket | **VERIFIED (manual)** | Restored SHA256 identical; `MINIO_RESTORE_TEST=PASS`; test bucket deleted |
| MinIO backup automation (`backup-media.sh`) | **IMPLEMENTED, NOT PRODUCTION-DEPLOYED** | Written and tested in-repo; never yet run on the VPS |
| DB backup cron | **ACTIVE on production** | `0 2 * * *`, cron service active, manual run succeeded |
| Media backup cron | **NOT CONFIGURED** | Script exists; cron entry not yet added |
| WAL archiving | **ACTIVE** | `archive_mode=on`, `archive_timeout=300`, `pg_stat_archiver` shows current successes |
| Point-in-time recovery (PITR) | **NOT PROVEN** | Archiving being active is *not* the same as a rehearsed PITR. Never been performed. |
| Offsite copy to Cloudflare R2 | **NOT CONFIGURED** | `rclone` not installed on production; no R2 credentials exist. Script safely no-ops. |
| Bucket versioning / Object Lock | **NOT ENABLED** | Bucket is un-versioned; see §6.3 for what that costs us |

---

## 1. What runs, and in what order

Three scripts, run in sequence. Each is safe to run by hand at any time.

| # | Script | Purpose | Destructive? |
|---|---|---|---|
| 1 | `scripts/backup.sh` | PostgreSQL logical dump → `backups/phuquochub-<ts>.sql.gz` + `.sha256` | No |
| 2 | `scripts/backup-media.sh` | MinIO bucket → `backups/media/media-<ts>/` + `SHA256SUMS` | No (read-only against MinIO) |
| 3 | `scripts/sync-offsite.sh` | Copies both trees (+ WAL) to R2 | No (never deletes remotely) |

Restore and rehearsal are **manual only**, never scheduled:

| Script | Purpose | Destructive? |
|---|---|---|
| `scripts/restore.sh` | Restore a DB backup | **YES — drops and recreates the target database** |
| `scripts/restore-media-rehearsal.sh` | Verify a media snapshot restores byte-identically | No (refuses the production bucket) |

### 1.1 Recommended cron

Do not schedule these simultaneously — the dump and the mirror both compete for disk and CPU.
Offsite runs last so it only ever uploads artifacts that already verified locally.

```cron
# PostgreSQL logical backup — 02:00 UTC daily (ALREADY ACTIVE on production)
0 2 * * * cd /home/deploy/apps/PhuQuocHub && ./scripts/backup.sh /home/deploy/apps/PhuQuocHub >> /home/deploy/logs/phuquochub-db-backup.log 2>&1

# MinIO media backup — 02:30 UTC daily (NOT YET CONFIGURED)
30 2 * * * cd /home/deploy/apps/PhuQuocHub && ./scripts/backup-media.sh /home/deploy/apps/PhuQuocHub >> /home/deploy/logs/phuquochub-media-backup.log 2>&1

# Offsite copy — 03:00 UTC daily, once both backups have finished (NO-OP until R2 is configured)
0 3 * * * cd /home/deploy/apps/PhuQuocHub && ./scripts/sync-offsite.sh /home/deploy/apps/PhuQuocHub >> /home/deploy/logs/phuquochub-offsite.log 2>&1

# Media restore rehearsal — 04:00 UTC on the 1st of each month (OPTIONAL)
0 4 1 * * cd /home/deploy/apps/PhuQuocHub && ./scripts/restore-media-rehearsal.sh "$(ls -1dt backups/media/media-* | head -1)" >> /home/deploy/logs/phuquochub-media-rehearsal.log 2>&1
```

**Cron safety:** every script resolves its own directory and takes the project directory as
`$1`, so it does not depend on cron's minimal `PATH` or working directory. All exit non-zero on
failure, so a wrapper or monitor can detect breakage. Logs go to `/home/deploy/logs/`.

### 1.2 Failure behaviour

Every script fails **loudly and early**, and none leaves a half-finished artifact that a later step
could mistake for a good backup:

- `backup.sh` writes to a dotted `.partial` staging name that deliberately does not match the
  `phuquochub-*.sql.gz` glob, and only renames it after gzip, size, and completion-marker checks
  pass. A failed run leaves nothing behind.
- `backup-media.sh` mirrors into a dotted `.partial` staging directory and only promotes it after
  its `SHA256SUMS` manifest verifies.
- `restore.sh` verifies the archive **before** dropping anything.

---

## 2. Daily verification

### 2.1 Find the newest valid backup

```bash
ls -1t backups/phuquochub-*.sql.gz | head -1
```

### 2.2 Verify its integrity

```bash
cd backups && sha256sum -c phuquochub-<timestamp>.sql.gz.sha256
gzip -t backups/phuquochub-<timestamp>.sql.gz && echo GZIP_OK
gzip -dc backups/phuquochub-<timestamp>.sql.gz | tail -1   # expect the pg_dump completion marker
```

A backup that fails any of these must not be used. Pick the next-newest and investigate.

### 2.3 Verify a media snapshot

```bash
cd backups/media/media-<timestamp> && sha256sum -c SHA256SUMS
```

---

## 3. Restoring PostgreSQL

> **`scripts/restore.sh` DROPS the target database.** There is no undo.

### 3.1 Rehearsal — the safe path, and the only one to use for testing

**Never rehearse against production.** Point the script at a scratch database:

```bash
RESTORE_TARGET_DB=phuquochub_restore_test \
  ./scripts/restore.sh backups/phuquochub-<timestamp>.sql.gz
```

This creates and loads `phuquochub_restore_test` and never touches `phuquochub`. The script
verifies the result itself — table count, migration count, both FTS indexes, and that
`immutable_unaccent('Phú Quốc')` returns `Phu Quoc` — and exits non-zero if any check fails.

Compare against production:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U phuquoc -d phuquochub_restore_test -c "SELECT count(*) FROM places;"
```

Then drop it:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U phuquoc -d postgres -c 'DROP DATABASE "phuquochub_restore_test";'
```

### 3.2 Real disaster recovery

Same command without `RESTORE_TARGET_DB`. The script prints a production warning and requires a
typed `yes`.

```bash
./scripts/restore.sh backups/phuquochub-<timestamp>.sql.gz
```

### 3.3 Restoring an older `.sql.gz`

All existing backups remain restorable. Backups taken **before** migration `1720004400000` contain
the unqualified `immutable_unaccent` body and would fail while building `idx_events_fts`;
`restore.sh` detects that pattern and schema-qualifies it in-stream, announcing that it has done so.
The substitution is semantically identical (verified across 251 real values, 0 differences).

Backups taken before 2026-08-12 also have no `.sha256` sidecar. The script notes this and proceeds
with gzip and completion-marker checks only.

### 3.4 Point-in-time recovery

**Not automated, and not yet proven.** WAL archiving is on and archiving successfully, which means
the raw material for PITR is being collected — it does **not** mean PITR works. Nobody has rehearsed
one. Treat a PITR as an unrehearsed procedure: follow PostgreSQL's `recovery_target_time`
documentation, use the WAL segments in the `wal_archive_prod` volume, and expect it to take
judgment. Proving PITR is tracked as an open item in §7.

---

## 4. Restoring MinIO media

### 4.1 Rehearsal (safe, automated)

```bash
./scripts/restore-media-rehearsal.sh backups/media/media-<timestamp>
```

Creates a throwaway bucket, restores the snapshot into it, reads every object back, re-verifies the
original checksums, prints `MINIO_RESTORE_TEST=PASS`, then deletes the bucket. It **refuses** to
target the production bucket, and never reads from or writes to it. Pass `KEEP_TEST_BUCKET=1` to
inspect the result manually.

### 4.2 Real media recovery

There is deliberately no "restore to production" script — restoring objects over live media is a
judgment call about which objects to overwrite. Do it explicitly:

```bash
# Restore ONE object
mc cp backups/media/media-<ts>/media/<object>.jpg phuquoc-prod/phuquochub-prod/media/<object>.jpg

# Restore everything missing, WITHOUT overwriting anything currently present
mc mirror backups/media/media-<ts> phuquoc-prod/phuquochub-prod
```

Never pass `--remove` to `mc mirror` against production: it deletes objects absent from the source.

---

## 5. Offsite (Cloudflare R2)

**Not configured.** `rclone` is not installed on production and no R2 credentials exist.
`sync-offsite.sh` detects this and exits 0 without acting — the intended steady state until the
Owner provisions R2. Required variables (names only): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and optionally `WAL_ARCHIVE_HOST_PATH`.

### 5.1 Why `copy` and not `sync`

`rclone sync` makes the destination match the source, **deleting remote files that no longer exist
locally**. Combined with local retention (daily 7 / weekly 4 / monthly 6), that would have made the
offsite copy actively harmful: every night, retention prunes local backups, and the next sync would
delete those same backups from R2. The offsite archive could never have held more history than the
local disk — and a local `rm -rf` or ransomware event would have propagated straight to the offsite
copy on the next run.

The script uses `rclone copy --checksum --immutable`, which only ever adds. Offsite retention is
therefore an R2 **bucket lifecycle rule** (Owner/console configuration), not something a nightly
script decides. `--immutable` additionally makes rclone fail loudly if a file that already exists
remotely has changed locally — for a write-once archive that signals corruption or tampering, and
should be investigated rather than silently uploaded over.

---

## 6. Retention

### 6.1 Policy

Daily 7 / weekly 4 / monthly 6 (Owner-approved, PLACE-037 §11), applied identically to database
backups and media snapshots by `scripts/lib/retention.sh`:

1. the newest **7** backups are kept unconditionally;
2. beyond those, the newest backup of each distinct ISO week, for up to **4** weeks;
3. beyond those, the newest backup of each distinct calendar month, for up to **6** months;
4. everything else is deleted.

Ceiling: 17 artifacts per tree. Only files matching the tree's own glob are ever considered or
removed — unrelated files in the backup directory are untouched, and a pruned backup's `.sha256`
sidecar is removed with it.

### 6.2 This was previously broken

Before 2026-08-12 the inline retention logic in `backup.sh` was **inverted**: it kept a file when a
*newer* file shared its week or month, so it preserved older duplicates and deleted precisely the
newest-per-week and newest-per-month files the policy exists to protect. It also enforced no 4-week
or 6-month caps. Replayed against 20 dated fixtures it destroyed **every** weekly and monthly
backup, leaving a ~10-day recovery window in place of the intended ~6 months. Anyone who assumed
they had six months of history did not. Pinned by `scripts/tests/retention.test.sh`.

### 6.3 Media versioning limitation

The production bucket is **un-versioned** with Object Lock disabled. Snapshots are point-in-time
copies only: an object deleted or overwritten in production is recoverable **only** from a snapshot
taken before the change — at worst you lose up to 24 hours of media changes, and there is no
in-bucket version history to fall back on. Enabling versioning is an Owner decision with storage-cost
implications (§7).

---

## 7. Open items (Owner / VPS actions)

None of these can be performed from the repository.

| # | Item | Owner action |
|---|---|---|
| 1 | Deploy migration `1720004400000` to production | Runs with the next release; until then production still has the unportable function and a fresh restore needs `restore.sh`'s legacy path |
| 2 | Add the media backup cron entry (§1.1) | VPS crontab |
| 3 | Install `mc` and configure a **read-only** MinIO service account | VPS |
| 4 | Provision Cloudflare R2 + credentials; install `rclone` | Owner (Cloudflare), then VPS |
| 5 | Configure an R2 lifecycle rule for offsite retention | Cloudflare console |
| 6 | Rehearse a real PITR and record the result | Operator |
| 7 | Decide on MinIO bucket versioning | Owner (cost trade-off) |
| 8 | Add monitoring/alerting on backup cron failure | Operator |

---

## 8. Recorded production evidence — 2026-08-12

Performed by production operators on the live VPS. Recorded here as the durable record of what was
actually proven, as distinct from what is merely implemented.

### 8.1 PostgreSQL — VERIFIED

- Custom-format `pg_dump` produced and restore-tested successfully.
- Latest verified plain-SQL gzip backup: `phuquochub-20260812T081643Z.sql.gz`, `GZIP_OK=YES`,
  SHA256 `3888d7a9b9fa56517c7379c0fd00d5a6877e0871b62ff30c7861350acb5a7864`.
- Dump content confirmed to include `pg_trgm`, `pgcrypto`, `postgis`, `unaccent`, `uuid-ossp`,
  `immutable_unaccent`, the `places` table, `idx_events_fts`, and `idx_places_fts`.
- Restore into a clean temporary database **initially FAILED**:
  `ERROR: function unaccent(unknown, text) does not exist` while creating `idx_events_fts`.
- It succeeded after creating the extensions, restoring pre-data, replacing the **test** database's
  wrapper with a schema-qualified implementation, then restoring data and post-data.
- Post-restore comparison: **52 tables** matched, key row counts matched
  (`places=49`, `media=1`, `users=1`, `categories=9`, `moderation_cases=0`, `bookings=0`),
  **42 migrations** matched, `idx_events_fts` present.
- The temporary restore database was removed. **Production remained healthy throughout.**

### 8.2 MinIO — VERIFIED

- Bucket `phuquochub-prod`: private, un-versioned, Object Lock disabled, 1 object
  (`media/43ac8a28-a2ed-4076-995c-8536f365f13e.jpg`, ~140 KiB).
- Object-level backup via `mc mirror`. Backup SHA256
  `5a9024156566e4273b09f6baf8a7f30a770d40a86e1800cfed6691c6d211c967`, **identical to source**.
- Restored into a separate temporary bucket; restored SHA256 **matched exactly**.
  `MINIO_RESTORE_TEST=PASS`.
- Test bucket deleted. Production bucket unchanged at 1 object / 140 KiB. API remained healthy.

### 8.3 WAL — ACTIVE, PITR NOT PROVEN

`archive_mode=on`, `archive_command=sh /opt/wal-archive.sh %p %f`, `archive_timeout=300`,
`wal_level=replica`; WAL archive volume exists; `pg_stat_archiver` shows current archiving
succeeding. A historical `failed_count` exists but the latest archives succeed.
**No PITR has been performed.** Active archiving is not evidence of a working PITR.

### 8.4 Automation and offsite — PARTIAL / NOT CONFIGURED

- DB backup cron **active** (`0 2 * * *`); cron service active; manual run succeeded.
- MinIO backup automation **not deployed**.
- R2 offsite **not configured**: `rclone` not installed; `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `WAL_ARCHIVE_HOST_PATH` all unset. No credentials supplied.

### 8.5 What this repository change adds — IMPLEMENTED, NOT PRODUCTION-DEPLOYED

Root-caused the restore failure to `immutable_unaccent`'s unqualified body and fixed it at source
(migration `1720004400000`), so the sectioned workaround the rehearsal needed is no longer required.
Hardened `backup.sh` (pipefail, atomic publish, integrity gates, SHA256 sidecars, corrected
retention, fixed health check), rewrote `restore.sh` (pre-drop verification, `ON_ERROR_STOP=1`,
`--single-transaction`, extension pre-creation, legacy support, post-restore verification, isolated
rehearsal target), added `backup-media.sh` and `restore-media-rehearsal.sh`, and corrected
`sync-offsite.sh` from `sync` to `copy`. **None of this has run on production.**
