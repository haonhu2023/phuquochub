'use client';

// Route guard phía client (deny-by-default cho UI): chưa đăng nhập → chuyển /login.
// Bảo mật thực thi vẫn ở API (PermissionGuard) — guard này chỉ cải thiện UX điều hướng.

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthProvider';

export function RouteGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, initializing } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (initializing) return; // chờ hydrate xong mới quyết định
    if (!isAuthenticated) {
      // Giữ đích quay lại sau khi đăng nhập.
      const next = encodeURIComponent(pathname || '/');
      router.replace(`/login?next=${next}`);
    }
  }, [initializing, isAuthenticated, pathname, router]);

  // Chưa xác định phiên hoặc chưa đăng nhập → không render nội dung bảo vệ.
  if (initializing || !isAuthenticated) {
    return (
      <main>
        <p style={{ color: 'var(--muted)' }}>Đang kiểm tra phiên đăng nhập…</p>
      </main>
    );
  }
  return <>{children}</>;
}
