// Chọn DB cho e2e test. Mặc định KHÔNG bao giờ là DB dev (DB_NAME trong .env, thường là `phuquochub`),
// vì các e2e spec ghi dữ liệu thật (INSERT places/users...) và không dọn sạch hết.
//
// - CI (GITHUB Actions đặt CI=true): job tự cấp Postgres dùng-một-lần, dùng DB_NAME của job.
// - Local: luôn dùng E2E_DB_NAME (mặc định `phuquochub_e2e`), và bắt buộc tên kết thúc bằng `_e2e`
//   hoặc `_test`. Việc ghi đè này là cần thiết vì ConfigModule đọc .env nhưng KHÔNG ghi đè biến đã có
//   trong process.env, nên giá trị ta set ở globalSetup sẽ thắng DB_NAME từ .env.

export const DEFAULT_LOCAL_E2E_DB_NAME = 'phuquochub_e2e';

const TEST_DB_NAME_PATTERN = /_(e2e|test)$/;

export function resolveE2eDbName(env: NodeJS.ProcessEnv): string {
  if (env.CI === 'true') {
    const ciDb = env.DB_NAME?.trim();
    if (!ciDb) {
      throw new Error('e2e: CI=true nhưng DB_NAME trống — job CI phải khai báo DB_NAME.');
    }
    return ciDb;
  }

  const requested = env.E2E_DB_NAME?.trim() || DEFAULT_LOCAL_E2E_DB_NAME;
  if (!TEST_DB_NAME_PATTERN.test(requested)) {
    throw new Error(
      `e2e: từ chối chạy trên DB "${requested}" vì tên không kết thúc bằng "_e2e" hoặc "_test". ` +
        `E2E không được ghi vào DB dev/prod. Đặt E2E_DB_NAME=phuquochub_e2e (hoặc tên tương tự).`,
    );
  }
  return requested;
}
