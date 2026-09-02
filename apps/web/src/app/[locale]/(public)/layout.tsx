import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteFooter } from '@/modules/legal/SiteFooter';
import { BetaBanner } from '@/modules/legal/BetaBanner';
import { localizedHref, type Locale } from '@/lib/locale';

interface Props {
  children: ReactNode;
  // `string`, không phải `Locale`: type do Next.js tự sinh cho segment `[locale]` (`.next/types/
  // validator.ts`) luôn là `string` — khai `Locale` trực tiếp ở đây làm build thất bại vì
  // signature export không còn nhận được mọi giá trị Next.js có thể truyền vào. `locale` được
  // narrow xuống `Locale` ngay dưới; an toàn vì `[locale]/layout.tsx` (root layout bọc ngoài) đã
  // gọi `notFound()` cho mọi locale không hợp lệ trước khi layout này có cơ hội render.
  params: Promise<{ locale: string }>;
}

// Layout công khai (Places · Map · Search) — nav tối giản, không cần đăng nhập.
// PR A: mọi href nội bộ đi qua `localizedHref(locale, path)` — đây là điểm chèn nav DUY NHẤT dùng
// chung cho toàn bộ route public (Phase 1 audit), nên chỉ cần sửa đúng 1 chỗ này là nav luôn giữ
// đúng locale hiện tại khi điều hướng.
export default async function PublicLayout({ children, params }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
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
        <Link href={localizedHref(locale, '/')} style={{ fontWeight: 700 }}>
          PhuQuocHub
        </Link>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link href={localizedHref(locale, '/places')}>Địa điểm</Link>
          <Link href={localizedHref(locale, '/map')}>Bản đồ</Link>
          <Link href={localizedHref(locale, '/search')}>Tìm kiếm</Link>
          <Link href={localizedHref(locale, '/explore')}>Khám phá</Link>
          <Link href={localizedHref(locale, '/events')}>Sự kiện</Link>
        </nav>
      </header>
      <main style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>{children}</main>
      <SiteFooter locale={locale} />
    </div>
  );
}
