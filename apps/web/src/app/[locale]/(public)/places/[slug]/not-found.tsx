'use client';

import Link from 'next/link';
import styles from '@/modules/places/places.module.css';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref } from '@/lib/locale';

// Hiển thị khi API xác nhận địa điểm không tồn tại (getPlace → 404 → notFound()).
// PR A: `not-found.tsx` KHÔNG nhận `params` từ Next.js (khác `page.tsx`/`layout.tsx`) — chuyển
// Client Component để đọc locale qua `useLocale()` (Context từ `[locale]/layout.tsx`), thay vì
// hardcode `DEFAULT_LOCALE` và có thể sai locale khi người dùng đang ở `/en/...`.
export default function PlaceNotFound() {
  const locale = useLocale();
  return (
    <div className={styles.state} role="alert">
      <p className={styles.stateTitle}>Không tìm thấy địa điểm</p>
      <p>Địa điểm bạn tìm không tồn tại hoặc đã bị gỡ.</p>
      <Link href={localizedHref(locale, '/places')} className={styles.btn}>
        ← Về danh sách địa điểm
      </Link>
    </div>
  );
}
