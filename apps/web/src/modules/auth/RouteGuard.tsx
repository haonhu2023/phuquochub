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
      // Giữ cả query string: CTA "Đề xuất chỉnh sửa" mang place_id/place_slug trên URL; bỏ query
      // làm người dùng quay lại form rỗng ("Chưa chọn địa điểm") sau khi đăng nhập.
      // window.location.search đã được percent-encode sẵn: encode lại nguyên chuỗi sẽ thành
      // double-encode (%C3%BA → %25C3%25BA). Chuẩn hóa qua URLSearchParams rồi encode đúng MỘT lần.
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const query = new URLSearchParams(search).toString();
      const target = `${pathname || '/'}${query ? `?${query}` : ''}`;
      const next = encodeURIComponent(target);
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
