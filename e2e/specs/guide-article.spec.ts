import { test, expect } from '@playwright/test';
import { createContentOwnerSession, seedSession, type WebAuthSession } from '../helpers/auth';

// T1 — tạo bài viết bằng UI, xuất bản, xác nhận trên trang công khai (mục 4/6).
test.describe('Biên tập cẩm nang (guide articles)', () => {
  let session: WebAuthSession;

  test.beforeAll(async ({ request }) => {
    session = await createContentOwnerSession(request, 'guide-article');
  });

  test('tạo nháp → thêm khối đoạn văn → xuất bản → hiện đúng nội dung trên trang công khai', async ({ page }) => {
    await seedSession(page, session);

    const slug = `e2e-guide-${Date.now()}`;
    const title = `Bài viết E2E ${Date.now()}`;
    const paragraphText = 'Đoạn văn kiểm thử Playwright T1 — phải xuất hiện y hệt trên trang công khai.';

    await page.goto('/dashboard/editorial/guides/new');
    // Cấu trúc <label>Tiêu đề<input/></label> — không có htmlFor/id riêng, nên lọc theo text nhãn.
    await page.locator('label', { hasText: 'Tiêu đề' }).locator('input').fill(title);
    await page.locator('label', { hasText: 'Slug' }).locator('input').fill(slug);

    // Thêm một khối "Đoạn văn" (rich_text) — chọn loại khối rồi bấm "+ Thêm khối".
    await page.locator('select').last().selectOption({ label: 'Đoạn văn' });
    await page.getByRole('button', { name: '+ Thêm khối' }).click();
    await page.getByPlaceholder('Mỗi dòng là một đoạn văn').fill(paragraphText);

    await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
    await expect(page).toHaveURL(/\/dashboard\/editorial\/guides\/[0-9a-f-]+$/);
    await expect(page.getByText('Bản nháp', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Xuất bản' }).click();
    await expect(page.getByText('Đã xuất bản')).toBeVisible();

    const publicLink = page.getByRole('link', { name: /Xem trang công khai/ });
    const href = await publicLink.getAttribute('href');
    expect(href).toBe(`/vi/guide/${slug}`);

    const publicPage = await page.context().newPage();
    await publicPage.goto(href!);
    await expect(publicPage.getByRole('heading', { name: title })).toBeVisible();
    await expect(publicPage.getByText(paragraphText)).toBeVisible();
    await publicPage.close();

    // Gỡ công khai → biến mất khỏi trang công khai (no-store trên đường đọc guide — xem G-B).
    // handleUnpublish() dùng window.confirm() — Playwright TỰ ĐỘNG huỷ dialog không được xử lý,
    // khiến click này không có tác dụng gì nếu thiếu dòng dưới (đã xác nhận đúng nguyên nhân qua
    // accessibility snapshot lúc test rớt: trạng thái vẫn "Đã xuất bản", nút vẫn "Gỡ công khai").
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Gỡ công khai' }).click();
    await expect(page.getByText('Bản nháp', { exact: true })).toBeVisible();

    const publicPageAfter = await page.context().newPage();
    const res = await publicPageAfter.goto(href!);
    expect(res?.status()).toBe(404);
    await publicPageAfter.close();
  });
});
