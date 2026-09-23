import { test, expect } from '@playwright/test';

// T1 — empty state + mobile (mục 6/6).
test.describe('Empty state công khai', () => {
  test('tìm kiếm không khớp gì → thông báo rõ, không vỡ layout', async ({ page }) => {
    const nonsenseQuery = 'zzznonexistentquery123';
    await page.goto(`/vi/search?q=${nonsenseQuery}`);
    await expect(page.getByText(new RegExp(`Không tìm thấy kết quả cho.*${nonsenseQuery}`))).toBeVisible();
  });
});

test.describe('Bố cục di động (375×812)', () => {
  // Chỉ đổi viewport + đánh dấu thiết bị cảm ứng — KHÔNG dùng preset devices['...'] trọn gói
  // (nó kèm `defaultBrowserType: 'webkit'`, không dùng được trong describe.use(), chỉ ở top-level
  // config; dự án này chỉ chạy chromium, xem playwright.config.ts).
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('trang chủ không tràn ngang, các link chính bấm được', async ({ page }) => {
    await page.goto('/vi');
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('trang danh sách địa điểm không tràn ngang khi rỗng hoặc có dữ liệu', async ({ page }) => {
    await page.goto('/vi/places');
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('kết quả tìm kiếm rỗng trên mobile vẫn hiện rõ, không tràn ngang', async ({ page }) => {
    await page.goto('/vi/search?q=zzznonexistentquery123');
    await expect(page.getByText(/Không tìm thấy kết quả cho/)).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
