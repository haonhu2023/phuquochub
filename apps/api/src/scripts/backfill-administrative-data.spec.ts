import { assertNotProduction } from './backfill-administrative-data';

// Section 13/15 "Security" test — refuses production. Pure function, không cần boot NestFactory
// (cùng lý do `expire-overdue-verifications.spec.ts` test `hasSystemicFailure`/`parseIntArg` tách
// khỏi `main()`).
describe('assertNotProduction', () => {
  it('NODE_ENV=development, DB rehearsal local → an toàn', () => {
    const result = assertNotProduction({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://rehearsal:rehearsal@127.0.0.1:5434/rehearsal_pqh',
      DB_HOST: '127.0.0.1',
      DB_NAME: 'rehearsal_pqh',
    });
    expect(result.isSafe).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('NODE_ENV=production → ABORT', () => {
    const result = assertNotProduction({ NODE_ENV: 'production' });
    expect(result.isSafe).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([expect.stringContaining('NODE_ENV=production')]));
  });

  it('NODE_ENV=development NHƯNG DATABASE_URL chứa "prod" → vẫn ABORT (lớp phòng vệ thứ hai)', () => {
    const result = assertNotProduction({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://user:pass@db-prod.internal:5432/phuquochub',
    });
    expect(result.isSafe).toBe(false);
    expect(result.reasons.some((r) => r.includes('DATABASE_URL'))).toBe(true);
  });

  it('DB_HOST chứa "prod" (kể cả NODE_ENV an toàn) → ABORT', () => {
    const result = assertNotProduction({ NODE_ENV: 'development', DB_HOST: 'phuquochub-prod-db' });
    expect(result.isSafe).toBe(false);
  });

  it('DB_NAME chứa "prod" → ABORT', () => {
    const result = assertNotProduction({ NODE_ENV: 'test', DB_NAME: 'phuquochub_production' });
    expect(result.isSafe).toBe(false);
  });

  it('không có biến môi trường nào set (undefined) → an toàn, không ném lỗi', () => {
    const result = assertNotProduction({});
    expect(result.isSafe).toBe(true);
  });

  it('nhiều dấu hiệu cùng lúc → liệt kê ĐỦ mọi lý do, không dừng ở lý do đầu tiên', () => {
    const result = assertNotProduction({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://prod-host/db',
      DB_HOST: 'prod-host',
    });
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
