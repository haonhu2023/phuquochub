import { hasSystemicFailure, parseIntArg } from './expire-overdue-verifications';

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
