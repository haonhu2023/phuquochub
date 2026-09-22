import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { BackupStatusService } from './backup-status.service';
import type { AppConfig } from '../../core/config/configuration';

function fakeConfig(backupStatus: AppConfig['backupStatus']): ConfigService {
  return { get: () => backupStatus } as unknown as ConfigService;
}

describe('BackupStatusService (BK1, 2026-09-22)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'phuquochub-backup-status-test-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports configured: false for both trees when the env vars are unset (dir: null)', () => {
    const service = new BackupStatusService(fakeConfig({ dbDir: null, mediaDir: null }));
    const status = service.getStatus();

    expect(status.database).toEqual({ configured: false, count: 0, latest: null, oldest: null });
    expect(status.media).toEqual({ configured: false, count: 0, latest: null, oldest: null });
  });

  it('reports configured: true, count: 0 (not "not configured") when the dir exists but is empty', () => {
    const dbDir = join(root, 'backups');
    mkdirSync(dbDir);
    const service = new BackupStatusService(fakeConfig({ dbDir, mediaDir: null }));

    expect(service.getStatus().database).toEqual({ configured: true, count: 0, latest: null, oldest: null });
  });

  it('reports configured: true, count: 0 when the configured dir does not exist on disk yet', () => {
    const service = new BackupStatusService(
      fakeConfig({ dbDir: join(root, 'does-not-exist'), mediaDir: null }),
    );

    expect(service.getStatus().database).toEqual({ configured: true, count: 0, latest: null, oldest: null });
  });

  it('parses real phuquochub-*.sql.gz backups, reports latest/oldest and sha256 sidecar presence', () => {
    const dbDir = join(root, 'backups');
    mkdirSync(dbDir);
    writeFileSync(join(dbDir, 'phuquochub-20260920T020000Z.sql.gz'), Buffer.alloc(1000));
    writeFileSync(join(dbDir, 'phuquochub-20260920T020000Z.sql.gz.sha256'), 'deadbeef  phuquochub-20260920T020000Z.sql.gz\n');
    writeFileSync(join(dbDir, 'phuquochub-20260921T020000Z.sql.gz'), Buffer.alloc(2000));
    // No sidecar for this one — must be reported as missing, not silently assumed present.
    // Staging/partial files must NEVER be counted as a backup (mirrors backup.sh's own guarantee).
    writeFileSync(join(dbDir, '.phuquochub-20260922T020000Z.sql.gz.partial'), Buffer.alloc(10));

    const service = new BackupStatusService(fakeConfig({ dbDir, mediaDir: null }));
    const status = service.getStatus().database;

    expect(status.configured).toBe(true);
    expect(status.count).toBe(2);
    expect(status.oldest?.name).toBe('phuquochub-20260920T020000Z.sql.gz');
    expect(status.oldest?.hasChecksumSidecar).toBe(true);
    expect(status.oldest?.timestampUtc).toBe('2026-09-20T02:00:00.000Z');
    expect(status.oldest?.sizeBytes).toBe(1000);
    expect(status.latest?.name).toBe('phuquochub-20260921T020000Z.sql.gz');
    expect(status.latest?.hasChecksumSidecar).toBe(false);
  });

  it('computes plausible age in hours from the timestamp embedded in the filename', () => {
    const dbDir = join(root, 'backups');
    mkdirSync(dbDir);
    const oneDayAgo = new Date(Date.now() - 24 * 3_600_000);
    const ts = oneDayAgo
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
    writeFileSync(join(dbDir, `phuquochub-${ts}.sql.gz`), Buffer.alloc(1));

    const service = new BackupStatusService(fakeConfig({ dbDir, mediaDir: null }));
    const latest = service.getStatus().database.latest!;

    expect(latest.ageHours).toBeGreaterThan(23.9);
    expect(latest.ageHours).toBeLessThan(24.1);
  });

  it('parses real media-<timestamp> snapshot directories, summing directory size recursively', () => {
    const mediaDir = join(root, 'media-backups');
    mkdirSync(mediaDir);
    const snapshotDir = join(mediaDir, 'media-20260920T023000Z');
    mkdirSync(snapshotDir);
    mkdirSync(join(snapshotDir, 'nested'));
    writeFileSync(join(snapshotDir, 'a.jpg'), Buffer.alloc(500));
    writeFileSync(join(snapshotDir, 'nested', 'b.jpg'), Buffer.alloc(300));
    // Staging dir (leading dot) must never be counted as a snapshot.
    mkdirSync(join(mediaDir, '.media-20260921T023000Z'));

    const service = new BackupStatusService(fakeConfig({ dbDir: null, mediaDir }));
    const status = service.getStatus().media;

    expect(status.configured).toBe(true);
    expect(status.count).toBe(1);
    expect(status.latest?.name).toBe('media-20260920T023000Z');
    expect(status.latest?.sizeBytes).toBe(800);
    // backup-media.sh writes no per-snapshot checksum sidecar (unlike backup.sh).
    expect(status.latest?.hasChecksumSidecar).toBe(false);
  });

  it('ignores files/directories that do not match the backup naming convention', () => {
    const dbDir = join(root, 'backups');
    mkdirSync(dbDir);
    writeFileSync(join(dbDir, 'README.txt'), 'not a backup');
    writeFileSync(join(dbDir, 'phuquochub-not-a-timestamp.sql.gz'), Buffer.alloc(1));

    const service = new BackupStatusService(fakeConfig({ dbDir, mediaDir: null }));

    expect(service.getStatus().database).toEqual({ configured: true, count: 0, latest: null, oldest: null });
  });
});
