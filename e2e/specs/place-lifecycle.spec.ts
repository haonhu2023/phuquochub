import { test, expect } from '@playwright/test';
import { createContentOwnerSession, seedSession, type WebAuthSession } from '../helpers/auth';

// T1 — vòng đời địa điểm tạo → publish → sửa → unpublish (mục 2/6).
test.describe('Vòng đời địa điểm', () => {
  let session: WebAuthSession;

  test.beforeAll(async ({ request }) => {
    session = await createContentOwnerSession(request, 'place-lifecycle');
  });

  test('tạo (tự vào draft) → xuất bản → hiện công khai → sửa → gỡ công khai → biến mất', async ({ page }) => {
    await seedSession(page, session);

    const placeName = `E2E Place ${Date.now()}`;
    await page.goto('/dashboard/places/new');
    await page.getByLabel(/Tên địa điểm/).fill(placeName);
    // Danh mục thật đầu tiên khác placeholder "Chọn danh mục" — categories tải từ API thật.
    const categorySelect = page.getByLabel(/Danh mục/);
    await expect
      .poll(async () => categorySelect.locator('option').count(), { timeout: 15_000 })
      .toBeGreaterThan(1); // > placeholder "Chọn danh mục" một khi categories thật đã tải xong
    await categorySelect.selectOption({ index: 1 });
    await page.getByLabel(/Vĩ độ/).fill('10.22');
    await page.getByLabel(/Kinh độ/).fill('103.96');
    await page.getByRole('button', { name: 'Tạo địa điểm' }).click();

    // content_owner giữ Place.Approve → tạo xong vào thẳng `draft`, chuyển thẳng trang Sửa (P1).
    await expect(page).toHaveURL(/\/dashboard\/places\/[0-9a-f-]+\/edit$/);
    await expect(page.getByText('Nháp')).toBeVisible();

    await page.getByRole('button', { name: 'Xuất bản' }).click();
    await expect(page.getByText('Đã duyệt')).toBeVisible();

    const publicLink = page.getByRole('link', { name: /Xem trang công khai/ });
    await expect(publicLink).toBeVisible();
    const publicHref = await publicLink.getAttribute('href');
    expect(publicHref).toBeTruthy();

    // Xác nhận THẬT trên trang công khai (không chỉ tin UI quản trị) — mở tab mới, không cần đăng nhập.
    const publicPage = await page.context().newPage();
    await publicPage.goto(publicHref!);
    await expect(publicPage.getByRole('heading', { name: placeName })).toBeVisible();
    await publicPage.close();

    // Sửa — đổi mô tả ngắn, lưu, xác nhận không mất trạng thái xuất bản.
    await page.getByLabel(/Mô tả ngắn/).fill('Cập nhật từ Playwright T1.');
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(page.getByText('Đã lưu thành công.')).toBeVisible();

    // Gỡ công khai — xác nhận native dialog.
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Gỡ công khai' }).click();
    await expect(page.getByText('Nháp')).toBeVisible();

    // Soft-404 SEO bug (2026-09-22) — TÌM và SỬA trong lượt này. Root cause: `places/loading.tsx`
    // (cấp cha, `/places`) VÀ `places/[slug]/loading.tsx` (cấp con) mỗi cái tự tạo một Suspense
    // boundary lồng nhau quanh route `[slug]` — Next.js stream sẵn shell với status 200 TRƯỚC KHI
    // `notFound()` (chạy sau một fetch async) kịp resolve, và status đã gửi thì không đổi lại được
    // nữa dù nội dung sau đó render đúng "Không tìm thấy địa điểm". Xác nhận bằng repro tối giản
    // (`notFound()` đồng bộ, không fetch, đặt dưới `places/`): VẪN 200 khi còn `places/loading.tsx`
    // cấp cha, hết bug khi xoá CẢ HAI cấp. `/guide/[slug]` không dính vì không có `loading.tsx` nào
    // — đúng khuôn mà 5 route này giờ theo. Đã xoá `loading.tsx` (cả hai cấp) cho cả 5 route dùng
    // chung khuôn "Place + satellite" (places/hotels/restaurants/tours/events); đổi lại là mất
    // skeleton loading UI trên các route đó — đánh đổi có chủ đích, đúng hướng ưu tiên status code
    // SEO chính xác hơn một tiện ích UX nhỏ. Xác nhận lại trên CẢ `next dev` LẪN `next build && next
    // start` thật (không chỉ dev).
    const publicPageAfter = await page.context().newPage();
    const res = await publicPageAfter.goto(publicHref!);
    expect(res?.status()).toBe(404);
    await expect(publicPageAfter.getByRole('alert').filter({ hasText: 'Không tìm thấy địa điểm' })).toBeVisible();
    await publicPageAfter.close();
  });
});
