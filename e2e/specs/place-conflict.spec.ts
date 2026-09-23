import { test, expect } from '@playwright/test';
import { createContentOwnerSession, seedSession, type WebAuthSession } from '../helpers/auth';
import { createPlace } from '../helpers/places';
import { API_BASE_URL } from '../helpers/auth';

// T1 — conflict 409 không mất dữ liệu (mục 5/6). Hai TAB (cùng BrowserContext → cùng phiên đăng
// nhập qua localStorage) cùng mở trang Sửa của MỘT địa điểm — mô phỏng đúng kịch bản plan mô tả:
// "hai phiên sửa cùng lúc một khối nội dung", không phải hai tài khoản khác nhau.
test.describe('Xung đột CAS khi sửa địa điểm', () => {
  let session: WebAuthSession;
  let placeId: string;
  let editUrl: string;

  test.beforeAll(async ({ request }) => {
    session = await createContentOwnerSession(request, 'place-conflict');
    const place = await createPlace(request, session.accessToken, { name: `E2E Conflict ${Date.now()}` });
    placeId = place.id;
    editUrl = `/dashboard/places/${place.id}/edit`;
  });

  test('phiên cũ bị 409, dữ liệu đang gõ KHÔNG mất, phiên thắng không bị ghi đè', async ({ browser }) => {
    const context = await browser.newContext();
    const tabA = await context.newPage();
    await seedSession(tabA, session);
    await tabA.goto(editUrl);
    await expect(tabA.getByLabel(/Tên địa điểm/)).toBeVisible();

    // Tab B mở CÙNG trang (cùng context → cùng localStorage, không cần seedSession lại) TRƯỚC khi
    // A lưu — cả hai đang giữ content_version=1 trong state của mình.
    const tabB = await context.newPage();
    await tabB.goto(editUrl);
    await expect(tabB.getByLabel(/Tên địa điểm/)).toBeVisible();

    // A lưu trước — thành công, content_version trên server tăng lên 2.
    const winningName = 'Tên thắng cuộc (tab A)';
    await tabA.getByLabel(/Tên địa điểm/).fill(winningName);
    await tabA.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(tabA.getByText('Đã lưu thành công.')).toBeVisible();

    // B vẫn cầm content_version=1 (cũ) — sửa một trường KHÁC rồi lưu → phải bị 409.
    const loserDraftText = 'Mô tả tab B đang gõ dở — không được mất khi 409';
    await tabB.getByLabel(/Mô tả ngắn/).fill(loserDraftText);
    await tabB.getByRole('button', { name: 'Lưu thay đổi' }).click();

    // `getByRole('alert')` cũng khớp Next.js's `#__next-route-announcer__` (role=alert luôn có mặt
    // trong DOM, rỗng) — lọc theo nội dung văn bản hiển thị, không phải accessible-name.
    await expect(tabB.getByRole('alert').filter({ hasText: 'vừa được sửa bởi người khác' })).toBeVisible();
    // Dữ liệu B đang gõ vẫn còn nguyên trên form — KHÔNG bị xoá/ghi đè khi submit lỗi.
    await expect(tabB.getByLabel(/Mô tả ngắn/)).toHaveValue(loserDraftText);
    await expect(tabB.getByLabel(/Tên địa điểm/)).not.toHaveValue(winningName);

    // Bản thắng (A) trên server không bị B ghi đè — xác nhận qua API thật, không chỉ tin UI.
    const check = await context.request.get(`${API_BASE_URL}/places/${placeId}/preview`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const body = await check.json();
    expect(body.data.name).toBe(winningName);

    await context.close();
  });
});
