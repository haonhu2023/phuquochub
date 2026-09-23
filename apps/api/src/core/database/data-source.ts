import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { join } from 'path';

// DataSource riêng cho TypeORM CLI (migration:run/revert/generate).
// KHÁC với TypeOrmModule (runtime Nest) nhưng cùng thông số kết nối.
loadEnv({ path: join(__dirname, '../../../../../.env') });
loadEnv(); // fallback: .env cạnh nơi chạy

// Sự cố 2026-09: thiếu DB_HOST khiến CLI fallback ngầm về `localhost:5432` (mặc định cũ bên
// dưới) và chạy migration nhầm vào DB dev trên máy thay vì đích thực sự định nhắm tới — không
// throw, không cảnh báo, vì configuration.ts/env.validation.ts (Joi, fail-fast) chỉ áp dụng cho
// app runtime, KHÔNG áp dụng cho DataSource CLI này. Từ nay: KHÔNG có default nào cho 5 biến kết
// nối — thiếu biến nào thì thoát ngay, liệt kê đúng TÊN biến thiếu (không bao giờ in giá trị,
// đặc biệt là DB_PASSWORD).
const REQUIRED_DB_VARS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;
const missing = REQUIRED_DB_VARS.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(
    `[data-source] Thiếu biến môi trường kết nối DB, từ chối chạy với giá trị mặc định ngầm: ${missing.join(', ')}. ` +
      'Khai báo đủ DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME trước khi chạy migration:run/revert/generate.',
  );
  process.exit(1);
}

const dbHost = process.env.DB_HOST!;
const dbPort = parseInt(process.env.DB_PORT!, 10);
const dbName = process.env.DB_NAME!;

// Xác nhận đích trước khi kết nối: người vận hành phải khai báo TƯỜNG MINH họ nghĩ họ đang nhắm
// vào DB nào (không suy ra từ chính DB_HOST/DB_PORT/DB_NAME — làm vậy sẽ luôn "khớp" một cách vô
// nghĩa). Bắt lỗi kiểu "shell đang có DB_HOST cũ còn sót lại từ phiên trước" — đúng kiểu sự cố đã
// xảy ra. Không giới hạn ở migration:run: generate/revert cũng chạm DB thật nên áp dụng như nhau.
const expectedTarget = process.env.MIGRATION_EXPECTED_TARGET?.trim();
if (!expectedTarget) {
  console.error(
    '[data-source] Thiếu MIGRATION_EXPECTED_TARGET. Đặt biến này thành "<db_name>@<host>:<port>" ' +
      'đúng với DB bạn ĐÃ XÁC MINH độc lập là đích định nhắm tới (vd. container throwaway vừa tạo), ' +
      'rồi chạy lại. Đây là bước xác nhận có chủ đích, không tự suy luận từ DB_HOST/DB_PORT/DB_NAME.',
  );
  process.exit(1);
}
const configuredTarget = `${dbName}@${dbHost}:${dbPort}`;
if (expectedTarget !== configuredTarget) {
  console.error(
    `[data-source] MIGRATION_EXPECTED_TARGET ("${expectedTarget}") không khớp cấu hình kết nối hiện tại ` +
      `("${configuredTarget}"). Dừng lại — đây thường là dấu hiệu biến môi trường cũ còn sót lại từ ` +
      'phiên trước hoặc gõ nhầm đích. Không tự động chạy tiếp.',
  );
  process.exit(1);
}

const dataSource = new DataSource({
  type: 'postgres',
  host: dbHost,
  port: dbPort,
  username: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: dbName,
  ssl: (process.env.DB_SSL ?? 'false') === 'true' ? { rejectUnauthorized: false } : false,
  // Entity nghiệp vụ bổ sung từ Sprint 1+.
  entities: [join(__dirname, '../../**/*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations/*.{ts,js}')],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: (process.env.DB_LOGGING ?? 'false') === 'true',
});

// Sau khi kết nối thật thành công, đối chiếu identity DO CHÍNH SERVER báo cáo (current_database(),
// cổng TCP thực) với những gì đã khai báo — bắt được cả trường hợp DB_HOST phân giải (DNS/SSH
// tunnel/port-forward) tới một nơi khác với những gì người vận hành tưởng, không chỉ trường hợp
// gõ sai chuỗi cấu hình. Không log password hay connection string đầy đủ, chỉ log
// host/port/tên DB (không phải bí mật).
const originalInitialize = dataSource.initialize.bind(dataSource);
dataSource.initialize = async () => {
  await originalInitialize();
  try {
    const [row] = (await dataSource.query(
      'SELECT current_database() AS db, inet_server_port() AS port',
    )) as Array<{ db: string; port: number | null }>;
    const liveDb = row?.db;
    const livePort = row?.port;
    const mismatch =
      liveDb !== dbName || (livePort !== null && livePort !== undefined && Number(livePort) !== dbPort);
    if (mismatch) {
      console.error(
        `[data-source] Identity DB thực tế từ server (db="${liveDb}", port=${livePort ?? 'unix-socket'}) ` +
          `không khớp cấu hình đã khai báo (db="${dbName}", port=${dbPort}). Đóng kết nối, dừng lại — ` +
          'không chạy migration/generate/revert trên một DB không đúng như xác nhận.',
      );
      await dataSource.destroy();
      process.exit(1);
    }
    console.error(`[data-source] Đã xác minh identity DB: db="${liveDb}" host="${dbHost}" port=${dbPort}.`);
  } catch (err) {
    console.error(
      '[data-source] Không xác minh được identity DB sau khi kết nối — dừng lại thay vì tiếp tục mù quáng.',
      err instanceof Error ? err.message : err,
    );
    await dataSource.destroy();
    process.exit(1);
  }
  return dataSource;
};

export default dataSource;
