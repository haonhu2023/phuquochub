import { defineConfig, devices } from '@playwright/test';

// T1 (launch-readiness pass, 2026-09-22) — standing Playwright gate, chạy cùng dev stack LOCAL
// (`npm run db:up` + `.claude/launch.json`'s `web`/`api` configs). KHÔNG dùng cho staging/production
// — xem global-setup.ts's guard, chặn cứng bất kỳ baseURL nào không phải localhost/127.0.0.1.
//
// KHÔNG phải một bộ e2e thứ hai cho API (apps/api đã có `test:e2e` riêng, Jest+Supertest, không
// chạm trình duyệt) — bộ này lái trình duyệt THẬT qua UI thật, đúng khoảng trống §16 yêu cầu
// ("đi trình duyệt để nghiệm thu" + "Playwright làm gate thường trực", cả hai đều đã chọn).
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false, // các spec dùng chung dữ liệu place/guide thật trên MỘT DB dev — tránh đua nhau
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  globalSetup: require.resolve('./global-setup.ts'),
  // 90s (không phải mặc định 30s) — `createContentOwnerSession()` chạy `npm run operator:bootstrap`
  // (helpers/auth.ts), một lần boot NestJS ts-node ĐẦY ĐỦ mỗi lần gọi (không có cơ chế nhanh hơn —
  // cố ý tái dùng đúng script vận hành thật, không viết đường tắt cấp quyền riêng cho test). Từng
  // đo thực tế mất 15-40s+ tuỳ tải máy, có lúc vượt 30s mặc định và làm rớt `beforeAll` một cách
  // GIẢ (không phải lỗi thật) — xem lịch sử chạy T1.
  timeout: 90_000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
