import type { ReactNode } from 'react';
import { SiteFooter } from '@/modules/legal/SiteFooter';

// Nhóm route (auth): trang đăng nhập/đăng ký — căn giữa, không cần route guard.
// Footer pháp lý được thêm ở đây (không chỉ ở layout công khai) vì trang đăng ký là nơi người dùng
// lần đầu giao dữ liệu cá nhân: Điều khoản và Chính sách bảo mật phải với tới được ngay tại chỗ.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <main style={{ paddingTop: '3rem' }}>{children}</main>
      <SiteFooter />
    </>
  );
}
