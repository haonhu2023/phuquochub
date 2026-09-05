import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { AuthProvider } from '@/modules/auth/AuthProvider';
import { LocaleProvider } from '@/lib/LocaleContext';
import { isSupportedLocale, type Locale } from '@/lib/locale';
import { DEFAULT_METADATA } from '@/lib/default-metadata';
import '../../styles/globals.css';

interface Props {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

// SEO v2 (Phase 16): title/description mặc định của TOÀN BỘ cây route công khai giờ đổi theo
// locale — trước đây `export const metadata = DEFAULT_METADATA` tĩnh nghĩa là MỌI trang `/en`
// không tự ghi đè metadata riêng (vd trang lỗi, trang chưa có `generateMetadata`) đều lộ ra tiêu
// đề/mô tả tiếng Việt. Vẫn spread `DEFAULT_METADATA` để giữ `metadataBase` DÙNG CHUNG với
// `(auth)`/`(dashboard)` (root-layouts.spec.ts khoá bất biến này) — chỉ `title`/`description` đổi
// theo locale. Trang con nào cần tiêu đề/canonical riêng vẫn tự khai `generateMetadata` của nó,
// Next.js ưu tiên metadata gần route nhất.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  if (!isSupportedLocale(localeParam)) return DEFAULT_METADATA;
  const locale = localeParam as Locale;
  if (locale === 'en') {
    return {
      ...DEFAULT_METADATA,
      title: 'PhuQuocHub — Phú Quốc Travel Guide & Local Discovery',
      description:
        'Discover places, restaurants, beaches, hotels, tours and local experiences across Phú Quốc with maps and source-backed information.',
    };
  }
  return DEFAULT_METADATA;
}

// Root layout #1 của 3 ("multiple root layouts" — Next.js App Router routing fundamentals): xoá
// `app/layout.tsx` chung là ĐIỀU KIỆN để layout này tự khai `<html lang>` ĐỘNG theo `params.locale`
// — một root layout duy nhất không nhận được `params.locale` cho request KHÔNG đi qua segment đó
// (`/dashboard`, `/login`...), nên không thể dùng chung 1 file cho cả public lẫn auth/dashboard.
// `notFound()` ở đây là lớp phòng thủ THỨ HAI (middleware đã chặn phần lớn ở edge) cho bất kỳ
// đường nào lọt qua với `locale` không thuộc SUPPORTED_LOCALES.
export default async function LocaleRootLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }

  return (
    <html lang={locale}>
      <body>
        <AuthProvider>
          <LocaleProvider locale={locale}>{children}</LocaleProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
