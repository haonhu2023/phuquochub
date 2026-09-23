import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createContentOwnerSession, seedSession, type WebAuthSession } from '../helpers/auth';
import { createPlace } from '../helpers/places';

const REAL_JPEG = path.resolve(__dirname, '../fixtures/test-photo.jpg');

// T1 — upload ảnh + 2 nhánh lỗi chính (mục 3/6). Hai nhánh lỗi kiểm tra tiền kiểm PHÍA CLIENT
// (`validateImageFile`, apps/web/src/modules/media/uploadPipeline.ts) — nhanh, xác định, không
// cần đợi round-trip MinIO thật; nhánh thành công dùng file JPEG THẬT + MinIO dev thật đang chạy
// (không mock presign/PUT/register).
test.describe('Tải ảnh lên địa điểm', () => {
  let session: WebAuthSession;
  let photosUrl: string;

  test.beforeAll(async ({ request }) => {
    session = await createContentOwnerSession(request, 'photo-upload');
    const place = await createPlace(request, session.accessToken, { name: `E2E Photo ${Date.now()}` });
    photosUrl = `/dashboard/places/${place.id}/photos`;
  });

  test('sai định dạng file → báo lỗi rõ, không gọi mạng', async ({ page }) => {
    await seedSession(page, session);
    await page.goto(photosUrl);

    const fileInput = page.getByLabel('Chọn ảnh để tải lên');
    await fileInput.setInputFiles({
      name: 'not-an-image.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('không phải ảnh'),
    });

    // `getByRole('alert')` cũng khớp Next.js's `#__next-route-announcer__` (role=alert luôn có mặt
    // trong DOM, rỗng) — lọc theo NỘI DUNG VĂN BẢN hiển thị (`.filter({hasText})`), không phải
    // accessible-name (`{name}` của getByRole không khớp <p role="alert"> không có aria-label,
    // xác nhận thực nghiệm — nội dung đúng có mặt trong DOM nhưng {name} vẫn báo not found).
    await expect(page.getByRole('alert').filter({ hasText: 'Chỉ hỗ trợ ảnh JPEG' })).toBeVisible();
  });

  test('file quá 10MB → báo lỗi dung lượng, không gọi mạng', async ({ page }) => {
    await seedSession(page, session);
    await page.goto(photosUrl);

    const oversized = Buffer.alloc(11 * 1024 * 1024, 1); // 11MB, vượt ngưỡng 10MB
    await page.getByLabel('Chọn ảnh để tải lên').setInputFiles({
      name: 'oversized.jpg',
      mimeType: 'image/jpeg',
      buffer: oversized,
    });

    await expect(page.getByRole('alert').filter({ hasText: 'vượt quá dung lượng tối đa 10MB' })).toBeVisible();
  });

  test('ảnh hợp lệ → tải lên thành công thật (MinIO dev thật), hiện trong danh sách chờ duyệt', async ({ page }) => {
    await seedSession(page, session);
    await page.goto(photosUrl);

    await page.getByLabel('Chọn ảnh để tải lên').setInputFiles(REAL_JPEG);

    await expect(page.getByText(/Đã gửi ảnh\. Ảnh sẽ hiển thị công khai sau khi được kiểm duyệt viên duyệt\./)).toBeVisible({
      timeout: 15_000,
    });
  });
});
