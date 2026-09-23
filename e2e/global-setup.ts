import type { FullConfig } from '@playwright/test';

// Guard chặn cứng — KHÔNG BAO GIỜ chạy bộ Playwright này nhắm vào production hay bất kỳ host nào
// không phải máy local (đúng quy tắc "Never use fixture/seed data against production" của đợt
// launch-readiness này). Danh sách trắng CHỈ localhost/127.0.0.1 — không đoán/thử liệt kê domain
// production để loại trừ (an toàn hơn: mặc định TỪ CHỐI, chỉ CHO PHÉP host đã biết chắc là local).
const ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) {
    throw new Error('[e2e guard] Không xác định được baseURL — từ chối chạy để an toàn.');
  }
  const hostname = new URL(baseURL).hostname;
  if (!ALLOWED_HOSTNAMES.has(hostname)) {
    throw new Error(
      `[e2e guard] baseURL "${baseURL}" không phải localhost/127.0.0.1 — bộ Playwright này CHỈ ` +
        'được chạy nhắm vào dev stack local, không bao giờ nhắm vào staging/production. Từ chối chạy.',
    );
  }
}
