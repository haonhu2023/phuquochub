'use client';

// Trang bảng điều khiển tối thiểu — minh chứng phiên đăng nhập + route guard hoạt động.
// Nội dung tính năng dashboard đầy đủ thuộc các Sprint sau (ngoài phạm vi Sprint 1).

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
