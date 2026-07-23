import { AppLoggerService } from './app-logger.service';

describe('AppLoggerService.redact', () => {
  const logger = new AppLoggerService();

  it('che các khóa nhạy cảm ở cấp trên cùng', () => {
    const out = logger.redact({ email: 'a@b.c', password: 'secret', accessToken: 'x' });
    expect(out).toEqual({ email: 'a@b.c', password: '[REDACTED]', accessToken: '[REDACTED]' });
  });

  it('che khóa nhạy cảm lồng nhau', () => {
    const out = logger.redact({ user: { id: '1', passwordHash: 'h' }, refreshToken: 'r' });
    expect(out).toEqual({
      user: { id: '1', passwordHash: '[REDACTED]' },
      refreshToken: '[REDACTED]',
    });
  });

  it('giữ nguyên dữ liệu không nhạy cảm', () => {
    const input = { id: '1', name: 'Bãi Sao', tags: ['beach'] };
    expect(logger.redact(input)).toEqual(input);
  });
});
