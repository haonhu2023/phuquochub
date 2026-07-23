import type { ReactNode } from 'react';
import { RouteGuard } from '@/modules/auth/RouteGuard';

// Nhóm route (dashboard): mọi trang bên trong yêu cầu đăng nhập (route guard client).
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <RouteGuard>{children}</RouteGuard>;
}
