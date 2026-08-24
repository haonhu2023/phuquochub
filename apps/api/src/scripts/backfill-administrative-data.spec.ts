// CI IMPORT-ISOLATION GUARD (2026-08-24). `AppModule` được mock bằng factory GHI DẤU thời điểm nó
// thực sự bị nạp. Factory của `jest.mock` là LAZY — chỉ chạy khi module được require thật — nên cờ
// dưới đây phân biệt chính xác "import tĩnh (eager)" với "import động trong main() (lazy)".
// Dùng `globalThis` chứ không dùng biến module: `jest.mock` được hoist LÊN TRÊN các `import`, biến
// `const` sẽ còn trong TDZ khi factory chạy.
const MOCK_FLAG = '__backfillAppModuleEvaluated';
jest.mock('../app.module', () => {
  (globalThis as Record<string, unknown>)[MOCK_FLAG] = true;
  return { AppModule: class MockAppModule {} };
});
jest.mock('../modules/admin-data/administrative-backfill.service', () => ({
  AdministrativeBackfillService: class MockAdministrativeBackfillService {},
}));

import { assertNotProduction, loadRuntime } from './backfill-administrative-data';

// Chụp NGAY sau khi import script — độc lập thứ tự chạy test bên dưới.
const appModuleEvaluatedAtImportTime = (globalThis as Record<string, unknown>)[MOCK_FLAG];

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

// Regression cho CI failure 2026-08-24 (run 32743206699): suite này crash TRƯỚC khi chạy test nào
// vì `import './backfill-administrative-data'` kéo theo AppModule → ConfigModule.forRoot() →
// validate env → thiếu JWT_ACCESS_SECRET/JWT_REFRESH_SECRET (CI không có `.env`) → worker chết.
describe('CLI import isolation (không nạp AppModule khi chỉ import để test)', () => {
  const JWT_KEYS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(JWT_KEYS.map((k) => [k, process.env[k]]));
  });

  afterEach(() => {
    // Khôi phục nguyên trạng — không làm ô nhiễm suite khác.
    for (const k of JWT_KEYS) {
      if (saved[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = saved[k];
      }
    }
  });

  it('import script KHÔNG nạp AppModule (nếu quay lại import tĩnh, test này đỏ)', () => {
    expect(appModuleEvaluatedAtImportTime).toBeUndefined();
  });

  it('thiếu JWT_ACCESS_SECRET/JWT_REFRESH_SECRET vẫn import được, không throw config validation', () => {
    for (const k of JWT_KEYS) {
      delete process.env[k];
    }

    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- cần registry sạch để tái hiện lần nạp đầu
        require('./backfill-administrative-data');
      });
    }).not.toThrow();
  });

  it('luồng chạy thật VẪN nạp AppModule khi main() gọi loadRuntime()', async () => {
    const runtime = await loadRuntime();

    expect(runtime.AppModule).toBeDefined();
    expect(runtime.AdministrativeBackfillService).toBeDefined();
    // Sau khi loadRuntime() chạy, AppModule mới được đánh dấu là đã nạp.
    expect((globalThis as Record<string, unknown>)[MOCK_FLAG]).toBe(true);
  });
});
