// Nạp và cấu trúc hóa biến môi trường thành object cấu hình có kiểu.
// Validate ở env.validation.ts (Joi) — đảm bảo fail-fast khi thiếu biến.

export interface AppConfig {
  nodeEnv: string;
  // `publicUrl` — origin (scheme+host[+port], no trailing slash, no path) at which THIS API is
  // reachable by a browser. Distinct from `port`/`globalPrefix`, which describe how the process
  // binds locally. Needed because MediaUrlService now hands clients absolute `<img src>` URLs
  // pointing back at this API (Secure Private Media, 2026-08-10) — a relative path would break
  // local dev, where web (:3000) and api (:4000) are different origins.
  api: { port: number; globalPrefix: string; publicUrl: string };
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
  s3: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    forcePathStyle: boolean;
    publicUrl: string;
    presignGetTtlSeconds: number;
  };
  verificationExpiry: {
    scheduleEnabled: boolean;
    cron: string;
    batchSize: number;
    maxBatches: number;
    maxExecutionMs: number;
  };
}

// Media Upload Foundation — bucket isolation (design review, 2026-07-30): S3_BUCKET is the ONLY
// production override (server config, never client input). Left unset, dev/test each get a safe,
// distinct default so e2e tests can never silently write into the dev bucket.
function defaultS3Bucket(nodeEnv: string): string {
  return nodeEnv === 'test' ? 'phuquochub-test' : 'phuquochub-dev';
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  api: {
    port: parseInt(process.env.API_PORT ?? '4000', 10),
    globalPrefix: process.env.API_GLOBAL_PREFIX ?? 'api',
    // Trailing slashes stripped here (once) so every consumer can concatenate without re-checking.
    // Production MUST set API_PUBLIC_URL (e.g. https://phuquochub.com) — the localhost default is
    // only correct for local dev/test.
    publicUrl: (process.env.API_PUBLIC_URL?.trim() || 'http://localhost:4000').replace(/\/+$/, ''),
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
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
    bucket: process.env.S3_BUCKET?.trim() || defaultS3Bucket(process.env.NODE_ENV ?? 'development'),
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    // RETAINED BUT NO LONGER USED FOR MEDIA URLs (Secure Private Media, 2026-08-10). Previously fed
    // `StorageService.getPublicUrl()`, which handed clients a DIRECT, unauthenticated object-storage
    // URL — that method is deleted, because serving it required a bucket-wide anonymous-read policy
    // that also exposed pending/hidden/rejected objects (see docs/data/modules/media.md §13).
    // Clients now receive an API URL (MediaUrlService) that 302s to a short-lived SIGNED URL, so no
    // code path depends on this origin being anonymously readable. Kept only so a future CDN/custom
    // -domain setup has a home; safe to leave unset.
    publicUrl: process.env.S3_PUBLIC_URL?.trim() || process.env.S3_ENDPOINT || 'http://localhost:9000',
    // Lifetime of a presigned GET URL. Deliberately SHORT — it is the only credential standing
    // between a leaked URL and the object bytes. Long enough to survive a slow image load plus
    // clock skew, short enough that a URL copied out of devtools/logs dies quickly.
    presignGetTtlSeconds: parseInt(process.env.S3_PRESIGN_GET_TTL ?? '300', 10),
  },
  // VERIFICATION SCHEDULER — Operational Enablement (2026-08-06, ADR-008). Mặc định TẮT
  // (`scheduleEnabled=false`) ở MỌI môi trường, kể cả production — bật lịch chạy là một hành vi
  // vận hành MỚI (job hệ thống ghi DB định kỳ), không suy luận ngầm từ `NODE_ENV=production` (yêu
  // cầu tường minh: "Do not hard-code production-only assumptions"). Vận hành PHẢI đặt
  // `VERIFICATION_EXPIRY_SCHEDULE_ENABLED=true` có chủ đích để kích hoạt. Cadence mặc định 15
  // phút — bảo thủ, phù hợp việc hết hạn xác minh (không nhạy cảm theo giây; badge cũ tồn tại
  // thêm vài phút không gây hại, chạy quá dày mới tốn tài nguyên vô ích). Batch/execution-budget
  // mặc định CÙNG con số `MediaCleanupService` đã dùng (100 dòng/lô, 50 lô, 5 phút).
  verificationExpiry: {
    scheduleEnabled: (process.env.VERIFICATION_EXPIRY_SCHEDULE_ENABLED ?? 'false') === 'true',
    cron: process.env.VERIFICATION_EXPIRY_CRON ?? '0 */15 * * * *',
    batchSize: parseInt(process.env.VERIFICATION_EXPIRY_BATCH_SIZE ?? '100', 10),
    maxBatches: parseInt(process.env.VERIFICATION_EXPIRY_MAX_BATCHES ?? '50', 10),
    maxExecutionMs: parseInt(process.env.VERIFICATION_EXPIRY_MAX_EXECUTION_MS ?? '300000', 10),
  },
});
