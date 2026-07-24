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

  // PLACE-030: wire contract thực tế dùng snake_case (openapi.yaml) — phải che đúng các khóa này.
  it('che các khóa snake_case khớp wire contract (access_token/refresh_token/password_hash)', () => {
    const out = logger.redact({
      access_token: 'a',
      refresh_token: 'b',
      password_hash: 'c',
      email: 'kept@example.test',
    });
    expect(out).toEqual({
      access_token: '[REDACTED]',
      refresh_token: '[REDACTED]',
      password_hash: '[REDACTED]',
      email: 'kept@example.test',
    });
  });

  it('che cookie và thông tin đăng nhập DB/Redis', () => {
    const out = logger.redact({
      cookie: 'session=abc',
      db_password: 'pg-secret',
      redisPassword: 'redis-secret',
      connection_string: 'postgres://user:pass@host/db',
    });
    expect(out).toEqual({
      cookie: '[REDACTED]',
      db_password: '[REDACTED]',
      redisPassword: '[REDACTED]',
      connection_string: '[REDACTED]',
    });
  });

  it('so khớp khóa nhạy cảm không phân biệt hoa/thường', () => {
    const out = logger.redact({ Authorization: 'Bearer xyz', PASSWORD: 'p' });
    expect(out).toEqual({ Authorization: '[REDACTED]', PASSWORD: '[REDACTED]' });
  });

  it('che khóa Authorization lồng trong object header điển hình', () => {
    const out = logger.redact({
      headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
    });
    expect(out).toEqual({
      headers: { authorization: '[REDACTED]', 'content-type': 'application/json' },
    });
  });
});
