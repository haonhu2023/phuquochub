import { resolveE2eDbName } from '../src/core/database/e2e-db-name';

// Chạy một lần trước mọi e2e suite (Jest globalSetup). Ghi DB_NAME đã chọn vào process.env để
// worker kế thừa, và để giá trị này thắng DB_NAME=phuquochub trong .env (ConfigModule không ghi đè
// biến đã có sẵn). Nếu tên không hợp lệ, hàm này ném lỗi và toàn bộ e2e dừng trước khi chạm DB.
export default function e2eGlobalSetup(): void {
  const dbName = resolveE2eDbName(process.env);
  process.env.DB_NAME = dbName;
  console.log(`[e2e] DB đích: ${dbName}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? '5432'}`);
}
