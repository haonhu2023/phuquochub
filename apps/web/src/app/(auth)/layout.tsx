import type { ReactNode } from 'react';

// Nhóm route (auth): trang đăng nhập/đăng ký — căn giữa, không cần route guard.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main style={{ paddingTop: '3rem' }}>{children}</main>;
}
