'use client';

// Route guard phía client (deny-by-default cho UI): chưa đăng nhập → chuyển /login.
// Bảo mật thực thi vẫn ở API (PermissionGuard) — guard này chỉ cải thiện UX điều hướng.

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';

export function RouteGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, initializing, sessionExpired } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (initializing) return; // chờ hydrate xong mới quyết định
    if (!isAuthenticated) {
      // Giữ đích quay lại sau khi đăng nhập. `reason=expired` chỉ có khi AuthProvider vừa đóng
      // phiên do refresh token hỏng/hết hạn (KHÁC "chưa đăng nhập bao giờ") — trang login đọc cờ
      // này để không hiện nhầm "không có quyền" cho một token đơn giản là đã hết hạn.
      const next = encodeURIComponent(pathname || '/');
      const reason = sessionExpired ? '&reason=expired' : '';
      router.replace(`/login?next=${next}${reason}`);
    }
  }, [initializing, isAuthenticated, sessionExpired, pathname, router]);

  // Chưa xác định phiên hoặc chưa đăng nhập → không render nội dung bảo vệ.
  if (initializing || !isAuthenticated) {
    return (
      <main aria-busy="true">
        <p style={{ color: 'var(--muted)' }}>Đang kiểm tra phiên đăng nhập…</p>
      </main>
    );
  }
  return <>{children}</>;
}
