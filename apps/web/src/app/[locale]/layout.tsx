import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { AuthProvider } from '@/modules/auth/AuthProvider';
import { LocaleProvider } from '@/lib/LocaleContext';
import { isSupportedLocale } from '@/lib/locale';
import { DEFAULT_METADATA } from '@/lib/default-metadata';
import '../../styles/globals.css';

export const metadata = DEFAULT_METADATA;

interface Props {
  children: ReactNode;
  params: Promise<{ locale: string }>;
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
