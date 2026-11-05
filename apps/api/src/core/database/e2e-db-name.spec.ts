import { DEFAULT_LOCAL_E2E_DB_NAME, resolveE2eDbName } from './e2e-db-name';

describe('resolveE2eDbName', () => {
  it('local: mặc định là phuquochub_e2e, KHÔNG phải DB dev từ .env', () => {
    expect(resolveE2eDbName({ DB_NAME: 'phuquochub' })).toBe(DEFAULT_LOCAL_E2E_DB_NAME);
    expect(DEFAULT_LOCAL_E2E_DB_NAME).toBe('phuquochub_e2e');
  });

  it('local: chấp nhận E2E_DB_NAME kết thúc bằng _e2e hoặc _test', () => {
    expect(resolveE2eDbName({ E2E_DB_NAME: 'scratch_test' })).toBe('scratch_test');
    expect(resolveE2eDbName({ E2E_DB_NAME: 'phuquochub_e2e' })).toBe('phuquochub_e2e');
  });

  it('local: từ chối tên DB dev hoặc prod', () => {
    expect(() => resolveE2eDbName({ E2E_DB_NAME: 'phuquochub' })).toThrow(/từ chối/);
    expect(() => resolveE2eDbName({ E2E_DB_NAME: 'phuquochub_prod' })).toThrow(/từ chối/);
  });

  it('CI: dùng DB_NAME của job (DB dùng-một-lần)', () => {
    expect(resolveE2eDbName({ CI: 'true', DB_NAME: 'phuquochub' })).toBe('phuquochub');
  });

  it('CI: thiếu DB_NAME thì dừng ngay', () => {
    expect(() => resolveE2eDbName({ CI: 'true' })).toThrow(/DB_NAME trống/);
  });
});
