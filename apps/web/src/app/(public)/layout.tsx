import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteFooter } from '@/modules/legal/SiteFooter';
import { BetaBanner } from '@/modules/legal/BetaBanner';

// Layout công khai (Places · Map · Search) — nav tối giản, không cần đăng nhập.
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <BetaBanner />
      <header
        style={{
          display: 'flex',
          gap: 16,
          padding: '12px 20px',
          borderBottom: '1px solid #e5e7eb',
          alignItems: 'center',
        }}
      >
        <Link href="/" style={{ fontWeight: 700 }}>
          PhuQuocHub
        </Link>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link href="/places">Địa điểm</Link>
          <Link href="/map">Bản đồ</Link>
          <Link href="/search">Tìm kiếm</Link>
          <Link href="/explore">Khám phá</Link>
          <Link href="/events">Sự kiện</Link>
        </nav>
      </header>
      <main style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>{children}</main>
      <SiteFooter />
    </div>
  );
}
