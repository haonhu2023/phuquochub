import { test, expect } from '@playwright/test';
import { registerAccount } from '../helpers/auth';

// T1 — login/session (mục 1/6 trong danh sách luồng bắt buộc). Đăng ký một tài khoản THẬT qua API
// thật (setup), rồi lái đúng FORM đăng nhập HTML thật — spec này là nơi DUY NHẤT lái form đăng
// nhập; mọi spec khác bơm thẳng phiên vào localStorage qua helpers/auth.ts's seedSession() để
// không lặp lại luồng này ở từng file.
test.describe('Đăng nhập / phiên đăng nhập', () => {
  test('đăng nhập đúng email/mật khẩu → vào dashboard, thấy tên hiển thị', async ({ page, request }) => {
    const { user, password } = await registerAccount(request, 'auth-login');

    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Mật khẩu').fill(password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(user.displayName)).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test('sai mật khẩu → báo lỗi, KHÔNG vào được dashboard', async ({ page, request }) => {
    const { user } = await registerAccount(request, 'auth-badpass');

    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Mật khẩu').fill('SaiMatKhau999!');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('đăng xuất → xoá phiên, tài nguyên quản trị không còn truy cập được', async ({ page, request }) => {
    const { user, password } = await registerAccount(request, 'auth-logout');

    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Mật khẩu').fill(password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('button', { name: /Đăng xuất/ }).click();
    await expect(page).toHaveURL(/\/login/);

    // Phiên trước đã bị xoá — quay lại /dashboard trực tiếp phải bị RouteGuard đẩy về /login,
    // không được phục vụ dữ liệu quản trị đã cache trên trang trước đó (không dùng back-button
    // qua history — đây là điều hướng mới, đúng cách người dùng thật quay lại sau khi đăng xuất).
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
