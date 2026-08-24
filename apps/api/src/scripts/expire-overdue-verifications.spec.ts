// CI IMPORT-ISOLATION GUARD (2026-08-24) — xem chú thích cùng tên ở
// `backfill-administrative-data.spec.ts`. Factory `jest.mock` là LAZY nên cờ này phân biệt chính
// xác import tĩnh (eager) với import động trong `main()` (lazy). Dùng `globalThis` vì `jest.mock`
// được hoist lên trên các `import`, biến `const` sẽ còn trong TDZ khi factory chạy.
const MOCK_FLAG = '__expireAppModuleEvaluated';
jest.mock('../app.module', () => {
  (globalThis as Record<string, unknown>)[MOCK_FLAG] = true;
  return { AppModule: class MockAppModule {} };
});
jest.mock('../modules/verifications/verifications.service', () => ({
  VerificationsService: class MockVerificationsService {},
}));

import { hasSystemicFailure, parseIntArg, loadRuntime } from './expire-overdue-verifications';

// Chụp NGAY sau khi import script — độc lập thứ tự chạy test bên dưới.
const appModuleEvaluatedAtImportTime = (globalThis as Record<string, unknown>)[MOCK_FLAG];

describe('expire-overdue-verifications runner — pure helpers (manual runner exit behavior)', () => {
  describe('hasSystemicFailure', () => {
    it('errors=0 -> false (exit 0)', () => {
      expect(hasSystemicFailure({ errors: 0 })).toBe(false);
    });

    it('errors>0 -> true (exit 1) — hệ thống, khác conflicts (race bình thường, không ảnh hưởng exit code)', () => {
      expect(hasSystemicFailure({ errors: 1 })).toBe(true);
      expect(hasSystemicFailure({ errors: 5 })).toBe(true);
    });
  });

  describe('parseIntArg', () => {
    it('không có flag -> undefined', () => {
      expect(parseIntArg(['--dry-run'], '--batch-size')).toBeUndefined();
    });

    it('có flag=N hợp lệ -> N', () => {
      expect(parseIntArg(['--batch-size=25'], '--batch-size')).toBe(25);
    });

    it('flag=không phải số -> undefined (KHÔNG NaN rò rỉ ra ngoài)', () => {
      expect(parseIntArg(['--batch-size=abc'], '--batch-size')).toBeUndefined();
    });

    it('nhiều flag cùng lúc -> lấy đúng flag được hỏi', () => {
      const args = ['--dry-run', '--batch-size=10', '--max-batches=3'];
      expect(parseIntArg(args, '--batch-size')).toBe(10);
      expect(parseIntArg(args, '--max-batches')).toBe(3);
      expect(parseIntArg(args, '--max-execution-ms')).toBeUndefined();
    });
  });
});

// Regression cho CI failure 2026-08-24 (run 32743206699) — cùng root cause với
// `backfill-administrative-data.spec.ts`.
describe('CLI import isolation (không nạp AppModule khi chỉ import để test)', () => {
  const JWT_KEYS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(JWT_KEYS.map((k) => [k, process.env[k]]));
  });

  afterEach(() => {
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
        require('./expire-overdue-verifications');
      });
    }).not.toThrow();
  });

  it('luồng chạy thật VẪN nạp AppModule khi main() gọi loadRuntime()', async () => {
    const runtime = await loadRuntime();

    expect(runtime.AppModule).toBeDefined();
    expect(runtime.VerificationsService).toBeDefined();
    expect((globalThis as Record<string, unknown>)[MOCK_FLAG]).toBe(true);
  });
});
