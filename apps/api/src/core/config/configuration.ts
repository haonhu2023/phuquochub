// Nạp và cấu trúc hóa biến môi trường thành object cấu hình có kiểu.
// Validate ở env.validation.ts (Joi) — đảm bảo fail-fast khi thiếu biến.

export interface AppConfig {
  nodeEnv: string;
  api: { port: number; globalPrefix: string };
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
    ssl: boolean;
    synchronize: boolean;
    logging: boolean;
  };
  redis: { host: string; port: number; url: string };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
  };
  rateLimit: {
    ttl: number;
    limit: number;
    authTtl: number;
    authLimit: number;
  };
  cors: {
    allowedOrigins: string[];
    credentials: boolean;
  };
  trustProxyHops: number;
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  api: {
    port: parseInt(process.env.API_PORT ?? '4000', 10),
    globalPrefix: process.env.API_GLOBAL_PREFIX ?? 'api',
  },
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USER ?? 'phuquoc',
    password: process.env.DB_PASSWORD ?? 'phuquoc',
    name: process.env.DB_NAME ?? 'phuquochub',
    ssl: (process.env.DB_SSL ?? 'false') === 'true',
    synchronize: (process.env.DB_SYNCHRONIZE ?? 'false') === 'true',
    logging: (process.env.DB_LOGGING ?? 'false') === 'true',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '1209600', 10),
  },
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10),
    limit: parseInt(process.env.RATE_LIMIT_LIMIT ?? '100', 10),
    authTtl: parseInt(process.env.RATE_LIMIT_AUTH_TTL ?? '60', 10),
    authLimit: parseInt(process.env.RATE_LIMIT_AUTH_LIMIT ?? '10', 10),
  },
  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    credentials: (process.env.CORS_CREDENTIALS ?? 'false') === 'true',
  },
  trustProxyHops: parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10),
});
