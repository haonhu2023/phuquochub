import * as Joi from 'joi';

// Schema validate biến môi trường. Nếu thiếu/không hợp lệ → app fail-fast khi khởi động.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),

  API_PORT: Joi.number().port().default(4000),
  API_GLOBAL_PREFIX: Joi.string().default('api'),

  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().default('phuquoc'),
  DB_PASSWORD: Joi.string().allow('').default('phuquoc'),
  DB_NAME: Joi.string().default('phuquochub'),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_SYNCHRONIZE: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_LOGGING: Joi.boolean().truthy('true').falsy('false').default(false),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),

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
}).unknown(true);
