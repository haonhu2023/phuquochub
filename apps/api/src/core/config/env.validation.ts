import * as Joi from 'joi';

// Schema validate biến môi trường. Nếu thiếu/không hợp lệ → app fail-fast khi khởi động.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),

  API_PORT: Joi.number().port().default(4000),
  API_GLOBAL_PREFIX: Joi.string().default('api'),

  // PLACE-029: DB credentials required in production — fail fast rather than silently
  // connecting with known dev defaults (mirrors the JWT-secret/CORS-origin precedent above).
  DB_HOST: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('localhost'),
  }),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('phuquoc'),
  }),
  DB_PASSWORD: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().allow('').default('phuquoc'),
  }),
  DB_NAME: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('phuquochub'),
  }),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_SYNCHRONIZE: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_LOGGING: Joi.boolean().truthy('true').falsy('false').default(false),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  // PLACE-040: found via production-configuration audit -- unlike DB_HOST/CORS_ALLOWED_ORIGINS
  // above, REDIS_URL had no production-required rule, so a misconfigured deploy would silently
  // fall back to the unauthenticated `redis://localhost:6379` dev default instead of failing
  // fast (RedisService reads only `redis.url`, mirrors the DB-credential precedent exactly).
  REDIS_URL: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('redis://localhost:6379'),
  }),

  // Sprint 1: bắt buộc secret cho JWT (production nên đặt chuỗi mạnh).
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.number().default(900),
  JWT_REFRESH_TTL: Joi.number().default(1209600),

  // PLACE-028: rate limiting (OD2-12).
  RATE_LIMIT_TTL: Joi.number().positive().default(60),
  RATE_LIMIT_LIMIT: Joi.number().positive().default(100),
  RATE_LIMIT_AUTH_TTL: Joi.number().positive().default(60),
  RATE_LIMIT_AUTH_LIMIT: Joi.number().positive().default(10),

  // PLACE-028: CORS allow-list (OD2-13). Required in production — fail fast if unset.
  CORS_ALLOWED_ORIGINS: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('http://localhost:3000'),
  }),
  CORS_CREDENTIALS: Joi.boolean().truthy('true').falsy('false').default(false),

  // PLACE-028: number of reverse-proxy hops to trust for client-IP resolution (rate limiting).
  // Default 0 — no reverse proxy is deployed yet; forwarded headers are untrusted until one exists.
  TRUST_PROXY_HOPS: Joi.number().min(0).default(0),

  // Media Upload Foundation (design review, 2026-07-30): S3-compatible object storage. No
  // production-required rule here by design — wiring real production R2 credentials is
  // explicitly out of scope for this milestone (dev/test MinIO only); a future task adds that
  // fail-fast rule once production storage is actually configured.
  S3_ENDPOINT: Joi.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: Joi.string().default('minioadmin'),
  S3_SECRET_KEY: Joi.string().default('minioadmin'),
  // Intentionally no .default() — code-level default is environment-aware (dev vs test), which
  // Joi's static default cannot express; see configuration.ts's defaultS3Bucket().
  S3_BUCKET: Joi.string().allow('').optional(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_FORCE_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(true),
  // Public read origin for media URLs served back to clients (e.g. https://media.phuquochub.com
  // in production). Intentionally no static default — code-level default falls back to
  // S3_ENDPOINT (see configuration.ts), which Joi's static default cannot express.
  S3_PUBLIC_URL: Joi.string().allow('').optional(),

  // VERIFICATION SCHEDULER — Operational Enablement (2026-08-06, ADR-008). Intentionally NO
  // production-required rule and NO NODE_ENV-conditional default — see configuration.ts's
  // comment: enabling the schedule must always be an explicit opt-in, in every environment.
  VERIFICATION_EXPIRY_SCHEDULE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  VERIFICATION_EXPIRY_CRON: Joi.string().default('0 */15 * * * *'),
  VERIFICATION_EXPIRY_BATCH_SIZE: Joi.number().positive().default(100),
  VERIFICATION_EXPIRY_MAX_BATCHES: Joi.number().positive().default(50),
  VERIFICATION_EXPIRY_MAX_EXECUTION_MS: Joi.number().positive().default(300000),
}).unknown(true);
