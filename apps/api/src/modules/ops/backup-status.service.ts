import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import type { AppConfig } from '../../core/config/configuration';

// BK1 (launch-readiness pass, 2026-09-22) — read-only owner-facing view of what
// scripts/backup.sh / scripts/backup-media.sh have actually produced on disk. This service does
// NOT run backups, does NOT touch the database, and does NOT delete anything — it only lists and
// parses filenames already written by those scripts, exactly like `scripts/lib/retention.sh`'s own
// globs do. See configuration.ts's `backupStatus` field comment for why `dir: null` (not a guessed
// path) is the "not configured" signal this service must preserve end to end.

// Matches backup.sh's own $BASENAME exactly: `phuquochub-<UTC timestamp>.sql.gz`. The leading-dot
// `.phuquochub-*.sql.gz.partial` staging name used during an in-progress dump does NOT match this
// (no leading `phuquochub-` after the dot) — same "never treat an interrupted run as a backup"
// property backup.sh's own comment relies on for retention/offsite.
const DB_BACKUP_RE = /^phuquochub-(\d{8}T\d{6}Z)\.sql\.gz$/;

// Matches backup-media.sh's own $SNAPSHOT_NAME exactly: `media-<UTC timestamp>`, a DIRECTORY (not
// a file). The staging name `.media-<timestamp>` (leading dot, see backup-media.sh) does not match.
const MEDIA_BACKUP_RE = /^media-(\d{8}T\d{6}Z)$/;

export interface BackupSnapshotSummary {
  name: string;
  /** ISO 8601, parsed from the backup's own UTC timestamp in its filename — not a filesystem mtime. */
  timestampUtc: string;
  ageHours: number;
  sizeBytes: number;
  /** DB snapshots only (backup.sh writes a `.sha256` sidecar per dump); always false for media. */
  hasChecksumSidecar: boolean;
}

export interface BackupTreeStatus {
  /** false when the corresponding BACKUP_STATUS_*_DIR env var is unset — distinct from "configured
   *  but zero snapshots found", which `configured: true, count: 0` reports instead. */
  configured: boolean;
  count: number;
  latest: BackupSnapshotSummary | null;
  oldest: BackupSnapshotSummary | null;
}

export interface BackupStatusSummary {
  database: BackupTreeStatus;
  media: BackupTreeStatus;
  checkedAtUtc: string;
}

function parseBackupTimestamp(raw: string): Date | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
}

function directorySizeBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? directorySizeBytes(p) : statSync(p).size;
  }
  return total;
}

@Injectable()
export class BackupStatusService {
  private readonly dbDir: string | null;
  private readonly mediaDir: string | null;

  constructor(config: ConfigService) {
    const backupStatus = config.get<AppConfig['backupStatus']>('backupStatus')!;
    this.dbDir = backupStatus.dbDir;
    this.mediaDir = backupStatus.mediaDir;
  }

  getStatus(): BackupStatusSummary {
    const now = new Date();
    return {
      database: this.scanDbDir(now),
      media: this.scanMediaDir(now),
      checkedAtUtc: now.toISOString(),
    };
  }

  private scanDbDir(now: Date): BackupTreeStatus {
    if (!this.dbDir) return { configured: false, count: 0, latest: null, oldest: null };
    if (!existsSync(this.dbDir)) return { configured: true, count: 0, latest: null, oldest: null };

    const dir = this.dbDir;
    const snapshots = readdirSync(dir)
      .map((name) => {
        const match = name.match(DB_BACKUP_RE);
        if (!match) return null;
        const timestamp = parseBackupTimestamp(match[1]);
        if (!timestamp) return null;
        const filePath = path.join(dir, name);
        return {
          name,
          timestampUtc: timestamp.toISOString(),
          ageHours: (now.getTime() - timestamp.getTime()) / 3_600_000,
          sizeBytes: statSync(filePath).size,
          hasChecksumSidecar: existsSync(`${filePath}.sha256`),
        } satisfies BackupSnapshotSummary;
      })
      .filter((s): s is BackupSnapshotSummary => s !== null)
      .sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc));

    return {
      configured: true,
      count: snapshots.length,
      oldest: snapshots[0] ?? null,
      latest: snapshots[snapshots.length - 1] ?? null,
    };
  }

  private scanMediaDir(now: Date): BackupTreeStatus {
    if (!this.mediaDir) return { configured: false, count: 0, latest: null, oldest: null };
    if (!existsSync(this.mediaDir)) return { configured: true, count: 0, latest: null, oldest: null };

    const dir = this.mediaDir;
    const snapshots = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry): BackupSnapshotSummary | null => {
        const match = entry.name.match(MEDIA_BACKUP_RE);
        if (!match) return null;
        const timestamp = parseBackupTimestamp(match[1]);
        if (!timestamp) return null;
        const snapshotPath = path.join(dir, entry.name);
        return {
          name: entry.name,
          timestampUtc: timestamp.toISOString(),
          ageHours: (now.getTime() - timestamp.getTime()) / 3_600_000,
          sizeBytes: directorySizeBytes(snapshotPath),
          // backup-media.sh writes no per-snapshot checksum sidecar (unlike backup.sh) — a media
          // snapshot's integrity evidence is the directory transfer itself, not a hash file.
          hasChecksumSidecar: false,
        };
      })
      .filter((s): s is BackupSnapshotSummary => s !== null)
      .sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc));

    return {
      configured: true,
      count: snapshots.length,
      oldest: snapshots[0] ?? null,
      latest: snapshots[snapshots.length - 1] ?? null,
    };
  }
}
