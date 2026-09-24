import Link from 'next/link';
import type { Locale } from '@/lib/locale';
import styles from '@/modules/business-claims/business-claims.module.css';

interface Props {
  placeId: string;
  placeName: string;
  placeSlug: string;
  locale: Locale;
}

const TEXT: Record<Locale, { prompt: string; cta: string }> = {
  vi: { prompt: 'Thấy thông tin cần cập nhật?', cta: 'Đề xuất chỉnh sửa' },
  en: { prompt: 'Noticed something that needs an update?', cta: 'Suggest an edit' },
};

// CTA "Đề xuất chỉnh sửa" trên trang chi tiết Place công khai — cùng khuôn ClaimCta/ReportPlaceCta,
// PHÂN BIỆT rõ với ReportPlaceCta (mục đích khác: đề xuất giá trị mới có thể duyệt/áp dụng, không
// chỉ gắn cờ có vấn đề). Trang chi tiết CHỈ render Place đã `published` → hiển thị CTA không điều
// kiện là an toàn; route đích nằm trong (dashboard) — RouteGuard ở đó tự chuyển hướng người chưa
// đăng nhập sang /login?next=... `(dashboard)` không có locale prefix (quyết định owner, xem
// app/(dashboard)/layout.tsx) nên href không qua localizedHref — CTA ở ĐÂY vẫn song ngữ vì nó nằm
// trên trang [locale] công khai, form phía sau giữ tiếng Việt như mọi màn hình dashboard khác.
export function ProposeEditCta({ placeId, placeName, placeSlug, locale }: Props) {
  const href = `/dashboard/places/edit-proposals?place_id=${encodeURIComponent(placeId)}&place_name=${encodeURIComponent(placeName)}&place_slug=${encodeURIComponent(placeSlug)}`;
  const t = TEXT[locale];
  return (
    <div className={styles.claimBanner}>
      <p className={styles.claimBannerText}>{t.prompt}</p>
      <Link href={href} className={styles.claimBannerLink}>
        {t.cta}
      </Link>
    </div>
  );
}
