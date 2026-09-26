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
});
