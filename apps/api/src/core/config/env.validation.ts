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
}).unknown(true);
