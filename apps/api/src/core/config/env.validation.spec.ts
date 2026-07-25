import { envValidationSchema } from './env.validation';

// PLACE-029: pins the DB-credential fail-fast behavior (mirrors the JWT-secret/CORS-origin
// precedent already enforced by this schema) directly against the Joi schema, without booting Nest.
describe('envValidationSchema — DB credential fail-fast (PLACE-029)', () => {
  const baseProdEnv = {
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'a'.repeat(16),
    JWT_REFRESH_SECRET: 'b'.repeat(16),
    CORS_ALLOWED_ORIGINS: 'https://example.test',
    DB_HOST: 'db.example.test',
    DB_USER: 'prod_user',
    DB_PASSWORD: 'a-real-secret',
    DB_NAME: 'phuquochub_prod',
    // PLACE-040: REDIS_URL is now also production-required (see the dedicated describe block
    // below) -- included here so this pre-existing DB-focused suite is unaffected by that change.
    REDIS_URL: 'redis://:a-real-redis-secret@redis.example.test:6379',
  };

  const validate = (env: Record<string, unknown>) =>
    envValidationSchema.validate(env, { abortEarly: false });

  it('passes in production when all DB credentials are explicitly set', () => {
    const { error } = validate(baseProdEnv);
    expect(error).toBeUndefined();
  });

  it.each(['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'])(
    'fails fast in production when %s is missing',
    (key) => {
      const env = { ...baseProdEnv };
      delete (env as Record<string, unknown>)[key];
      const { error } = validate(env);
      expect(error).toBeDefined();
      expect(error?.message).toContain(key);
    },
  );

  it('fails fast in production when DB_PASSWORD is an empty string', () => {
    const { error } = validate({ ...baseProdEnv, DB_PASSWORD: '' });
    expect(error).toBeDefined();
    expect(error?.message).toContain('DB_PASSWORD');
  });

  it('does not fail in development when DB credentials are unset (dev defaults apply)', () => {
    const { error, value } = validate({
      NODE_ENV: 'development',
      JWT_ACCESS_SECRET: 'a'.repeat(16),
      JWT_REFRESH_SECRET: 'b'.repeat(16),
    });
    expect(error).toBeUndefined();
    expect(value.DB_HOST).toBe('localhost');
    expect(value.DB_USER).toBe('phuquoc');
    expect(value.DB_PASSWORD).toBe('phuquoc');
    expect(value.DB_NAME).toBe('phuquochub');
  });

  it('still requires JWT secrets regardless of NODE_ENV (pre-existing behavior, unchanged)', () => {
    const { error } = validate({ NODE_ENV: 'development' });
    expect(error).toBeDefined();
    expect(error?.message).toContain('JWT_ACCESS_SECRET');
  });
});

// PLACE-040: pins the REDIS_URL fail-fast fix found by the production-configuration audit --
// mirrors the exact DB-credential precedent above (PLACE-029), since RedisService reads only
// `redis.url` and previously had no production-required rule for it.
describe('envValidationSchema — REDIS_URL fail-fast (PLACE-040)', () => {
  const baseProdEnv = {
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'a'.repeat(16),
    JWT_REFRESH_SECRET: 'b'.repeat(16),
    CORS_ALLOWED_ORIGINS: 'https://example.test',
    DB_HOST: 'db.example.test',
    DB_USER: 'prod_user',
    DB_PASSWORD: 'a-real-secret',
    DB_NAME: 'phuquochub_prod',
    REDIS_URL: 'redis://:a-real-redis-secret@redis.example.test:6379',
  };

  const validate = (env: Record<string, unknown>) =>
    envValidationSchema.validate(env, { abortEarly: false });

  it('passes in production when REDIS_URL is explicitly set', () => {
    const { error } = validate(baseProdEnv);
    expect(error).toBeUndefined();
  });

  it('fails fast in production when REDIS_URL is missing', () => {
    const env = { ...baseProdEnv } as Record<string, unknown>;
    delete env.REDIS_URL;
    const { error } = validate(env);
    expect(error).toBeDefined();
    expect(error?.message).toContain('REDIS_URL');
  });

  it('does not fail in development when REDIS_URL is unset (dev default applies)', () => {
    const { error, value } = validate({
      NODE_ENV: 'development',
      JWT_ACCESS_SECRET: 'a'.repeat(16),
      JWT_REFRESH_SECRET: 'b'.repeat(16),
    });
    expect(error).toBeUndefined();
    expect(value.REDIS_URL).toBe('redis://localhost:6379');
  });
});
