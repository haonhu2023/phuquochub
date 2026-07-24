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
