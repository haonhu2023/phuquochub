import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';
import { OwnerDashboardController, OwnerDashboardQuery } from './owner-dashboard.controller';
import { OwnerDashboardService, OWNER_AUDIT_SQL, OWNER_DASHBOARD_SQL } from './owner-dashboard.service';

describe('Owner operational dashboard', () => {
  it('requires its own operational read permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, OwnerDashboardController.prototype.read))
      .toEqual(['Ops.Dashboard.View']);
  });
  it.each(['0', '-1', '1.5', '100001', '1;DROP TABLE places'])('rejects invalid page %s', async page => {
    expect((await validate(plainToInstance(OwnerDashboardQuery, { page }))).length).toBeGreaterThan(0);
  });
  it('defaults to page 1', async () => {
    const query = plainToInstance(OwnerDashboardQuery, {});
    expect(query.page).toBe(1);
    expect(await validate(query)).toEqual([]);
  });
  it('reads a consistent, time-bounded snapshot and binds pagination', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ snapshot: { total: 0, records: [], completeness: null } }])
      .mockResolvedValueOnce([]);
    const transaction = jest.fn(async (_isolation, cb) => cb({ query }));
    const service = new OwnerDashboardService({ transaction } as unknown as DataSource);
    expect(await service.read(2)).toMatchObject({ page: 2, total: 0, records: [], completeness: null, audit: [] });
    expect(query.mock.calls[0][0]).toBe('SET TRANSACTION READ ONLY');
    expect(query).toHaveBeenCalledWith(OWNER_DASHBOARD_SQL, [25]);
    expect(query).toHaveBeenCalledWith(OWNER_AUDIT_SQL);
  });
  it('does not silently return zero counters when storage fails', async () => {
    const transaction = jest.fn().mockRejectedValue(new Error('database unavailable'));
    await expect(new OwnerDashboardService({ transaction } as unknown as DataSource).read(1)).rejects.toThrow();
  });

  describe('api_revision', () => {
    const ORIGINAL_APP_REVISION = process.env.APP_REVISION;
    afterEach(() => {
      if (ORIGINAL_APP_REVISION === undefined) delete process.env.APP_REVISION;
      else process.env.APP_REVISION = ORIGINAL_APP_REVISION;
    });

    async function readWithRevision(revision: string | undefined) {
      if (revision === undefined) delete process.env.APP_REVISION;
      else process.env.APP_REVISION = revision;
      const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ snapshot: { total: 0, records: [], completeness: null } }])
        .mockResolvedValueOnce([]);
      const transaction = jest.fn(async (_isolation, cb) => cb({ query }));
      const service = new OwnerDashboardService({ transaction } as unknown as DataSource);
      return (await service.read(1)).api_revision;
    }

    // scripts/deploy.sh has tagged real releases with BOTH forms (see release-tag-governance):
    // a short 7-char git SHA (`0a636dd`, the historical/manual-cutover convention) and a full
    // 40-char SHA (`d91f68691a4bd37878d6bc0710ae0c251312f07e`, produced by the newer
    // create-release-archive.sh + release_manifest_verify gated flow). Both must surface, or the
    // dashboard silently shows "unknown" for a real, known release.
    it('accepts a short 7-char git SHA', async () => {
      expect(await readWithRevision('0a636dd')).toBe('0a636dd');
    });
    it('accepts a full 40-char git SHA', async () => {
      const full = 'd91f68691a4bd37878d6bc0710ae0c251312f07e';
      expect(await readWithRevision(full)).toBe(full);
    });
    it('rejects the unset/absent case as null, not a fabricated value', async () => {
      expect(await readWithRevision(undefined)).toBeNull();
    });
    it('rejects an empty string', async () => {
      expect(await readWithRevision('')).toBeNull();
    });
    it('rejects a non-hex placeholder like "unknown" (the Dockerfile ARG default)', async () => {
      expect(await readWithRevision('unknown')).toBeNull();
    });
    it('rejects a SHA shorter than a git short-SHA (6 hex chars)', async () => {
      expect(await readWithRevision('abc123')).toBeNull();
    });
    it('rejects a value with injected non-hex characters', async () => {
      expect(await readWithRevision('0a636dd; rm -rf /')).toBeNull();
    });
  });
});
