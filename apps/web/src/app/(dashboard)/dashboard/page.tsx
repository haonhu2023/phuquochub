'use client';

// Trang bảng điều khiển tối thiểu — minh chứng phiên đăng nhập + route guard hoạt động.
// Nội dung tính năng dashboard đầy đủ thuộc các Sprint sau (ngoài phạm vi Sprint 1).
//
// Liên kết tới /dashboard/places (PLACE-041) và /dashboard/business-claims/new (PLACE-042):
// KHÔNG ẩn như liên kết tới /dashboard/moderation — đó ẩn vì FE session chưa lộ permission và
// Moderation.Queue.View chỉ một số role có; hai liên kết này thì khác, GET /places/mine và
// POST /business-claims đều mở cho MỌI người dùng đã đăng nhập (Business.Claim là permission nền
// mọi `member` có — xem SeedRbac1720000300000) nên không có rủi ro hiển thị liên kết mà phần lớn
// người dùng sẽ bị 403 khi bấm vào.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/modules/auth/AuthProvider';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    setBusy(true);
    await logout();
    router.replace('/login');
  }

  return (
    <main>
      <h1>Bảng điều khiển</h1>
      <p style={{ color: 'var(--muted)' }}>
        Xin chào, <strong style={{ color: 'var(--fg)' }}>{user?.displayName}</strong> ({user?.email})
      </p>
      <p style={{ marginTop: '1rem' }}>
        <Link href="/dashboard/places" style={{ color: 'var(--accent)' }}>
          Địa điểm của tôi →
        </Link>
      </p>
      <p style={{ marginTop: '0.5rem' }}>
        <Link href="/dashboard/business-claims/new" style={{ color: 'var(--accent)' }}>
          Yêu cầu xác nhận quyền quản lý →
        </Link>
      </p>
      <button
        type="button"
        onClick={onLogout}
        disabled={busy}
        style={{
          marginTop: '1rem',
          padding: '0.6rem 1.1rem',
          borderRadius: 8,
          border: '1px solid #1e293b',
          background: 'transparent',
          color: 'var(--fg)',
          cursor: 'pointer',
        }}
      >
        {busy ? 'Đang đăng xuất…' : 'Đăng xuất'}
      </button>
    </main>
  );
}
