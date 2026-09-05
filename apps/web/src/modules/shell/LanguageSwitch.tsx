'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { SUPPORTED_LOCALES, type Locale } from '@/lib/locale';
import styles from './shell.module.css';

/**
 * Chuyển ngôn ngữ GIỮ NGUYÊN trang hiện tại (Phase 4: "correct locale preservation") — đổi ĐÚNG
 * segment `[locale]` đầu path, giữ nguyên phần còn lại của path VÀ query string (vd đang ở
 * `/vi/restaurants?price_range=high` bấm "EN" phải tới `/en/restaurants?price_range=high`, không
 * phải rơi về `/en`).
 *
 * Client Component (cần `usePathname()`) — đây là "đảo" tương tác DUY NHẤT trong header, phần còn
 * lại của layout công khai vẫn là Server Component thuần.
 */
export function LanguageSwitch({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? `/${locale}`;
  const searchParams = useSearchParams();
  const query = searchParams?.toString();
  const segments = pathname.split('/');

  return (
    <div className={styles.langSwitch} role="group" aria-label="Language / Ngôn ngữ">
      {SUPPORTED_LOCALES.map((target) => {
        const targetSegments = [...segments];
        // segments[0] luôn là '' (path bắt đầu bằng '/'); locale thật nằm ở segments[1].
        targetSegments[1] = target;
        const targetPath = targetSegments.join('/') || `/${target}`;
        const href = query ? `${targetPath}?${query}` : targetPath;
        const isActive = target === locale;
        return (
          <Link
            key={target}
            href={href}
            className={`${styles.langLink} ${isActive ? styles.langLinkActive : ''}`}
            aria-current={isActive ? 'true' : undefined}
            lang={target}
            hrefLang={target}
          >
            {target.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}
