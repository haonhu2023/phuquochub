import type { ReactNode } from 'react';
import { AuthProvider } from '@/modules/auth/AuthProvider';
import { RouteGuard } from '@/modules/auth/RouteGuard';
import { DEFAULT_METADATA } from '@/lib/default-metadata';
import '../../styles/globals.css';

export const metadata = DEFAULT_METADATA;

// Root layout #3 của 3 (xem `[locale]/layout.tsx`). `/dashboard/*` KHÔNG có locale prefix (quyết
// định owner) → `<html lang="vi">` TĨNH, đúng hành vi 100% của `app/layout.tsx` cũ.
//
// Nhóm route (dashboard): mọi trang bên trong yêu cầu đăng nhập (route guard client).
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          <RouteGuard>{children}</RouteGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
