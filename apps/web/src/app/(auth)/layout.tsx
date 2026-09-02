import type { ReactNode } from 'react';
import { AuthProvider } from '@/modules/auth/AuthProvider';
import { SiteFooter } from '@/modules/legal/SiteFooter';
import { DEFAULT_METADATA } from '@/lib/default-metadata';
import '../../styles/globals.css';

export const metadata = DEFAULT_METADATA;

// Root layout #2 của 3 (xem `[locale]/layout.tsx`). `/login`/`/register` KHÔNG có locale prefix
// (quyết định owner) nên không nhận `params.locale` — `<html lang="vi">` TĨNH, đúng hành vi 100%
// của `app/layout.tsx` cũ trước PR A (mọi UI hôm nay là tiếng Việt). `SiteFooter` không nhận prop
// `locale` ở đây → tự dùng mặc định `vi` (xem SiteFooter.tsx).
//
// Nhóm route (auth): trang đăng nhập/đăng ký — căn giữa, không cần route guard.
// Footer pháp lý được thêm ở đây (không chỉ ở layout công khai) vì trang đăng ký là nơi người dùng
// lần đầu giao dữ liệu cá nhân: Điều khoản và Chính sách bảo mật phải với tới được ngay tại chỗ.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          <main style={{ paddingTop: '3rem' }}>{children}</main>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
