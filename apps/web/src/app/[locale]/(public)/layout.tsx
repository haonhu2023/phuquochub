import type { ReactNode } from 'react';
import { SiteFooter } from '@/modules/legal/SiteFooter';
import { BetaBanner } from '@/modules/legal/BetaBanner';
import { Header } from '@/modules/shell/Header';
import { getNavCopy } from '@/modules/shell/nav.copy';
import { type Locale } from '@/lib/locale';
import shellStyles from '@/modules/shell/shell.module.css';

interface Props {
  children: ReactNode;
  // `string`, không phải `Locale`: type do Next.js tự sinh cho segment `[locale]` (`.next/types/
  // validator.ts`) luôn là `string` — khai `Locale` trực tiếp ở đây làm build thất bại vì
  // signature export không còn nhận được mọi giá trị Next.js có thể truyền vào. `locale` được
  // narrow xuống `Locale` ngay dưới; an toàn vì `[locale]/layout.tsx` (root layout bọc ngoài) đã
  // gọi `notFound()` cho mọi locale không hợp lệ trước khi layout này có cơ hội render.
  params: Promise<{ locale: string }>;
}

// Layout công khai V2 (Phase 4) — thay header nội tuyến 5 liên kết tiếng Việt cứng bằng `Header`
// (component riêng, locale-aware, có menu di động + công tắc ngôn ngữ nhìn thấy được). Skip link
// (Phase 31) đứng NGAY ĐẦU body — ẩn cho tới khi nhận focus bàn phím (Tab đầu tiên), nhảy thẳng
// tới `#main-content`, bỏ qua toàn bộ banner/header cho người dùng bàn phím/trình đọc màn hình.
export default async function PublicLayout({ children, params }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const nav = getNavCopy(locale);
  return (
    <div>
      <a href="#main-content" className={shellStyles.skipLink}>
        {nav.skipToContentLabel}
      </a>
      <BetaBanner locale={locale} />
      <Header locale={locale} />
      <main id="main-content" style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
        {children}
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
