import Link from 'next/link';
import { getHomeCopy } from './home.copy';
import { NearbyDiscovery } from './NearbyDiscovery';
import { localizedHref, type Locale } from '@/lib/locale';
import styles from './home.module.css';

/**
 * "Khám phá theo nhu cầu" V2 (Phase 6) — V1 chỉ có "gần bạn" (đủ THẬT nhưng chưa đủ đa dạng để
 * cảm giác "thông minh"). V2 thêm một hàng lối tắt CỐ ĐỊNH/xác định (route CÓ THẬT, không cần
 * JavaScript) đứng CẠNH widget vị trí thật — không phải danh sách "gợi ý AI", chỉ là điều hướng
 * theo nhu cầu phổ biến, trình bày ở một khối riêng thay vì trộn vào `CategoryLinks` phía trên.
 *
 * CỐ Ý KHÔNG có "Đang mở cửa": `opening_hours` trên phần lớn 49 địa điểm hôm nay chưa đủ tin cậy
 * để suy ra trạng thái mở/đóng ngay bây giờ mà không suy diễn (Phase 32: "OPEN_NOW requires
 * reliable hours; do not infer").
 */
export function SmartDiscovery({ locale }: { locale: Locale }) {
  const copy = getHomeCopy(locale);
  return (
    <section className={styles.section} aria-labelledby="home-smart-title">
      <div className={styles.sectionHead}>
        <h2 id="home-smart-title" className={styles.sectionTitle}>
          {copy.smartTitle}
        </h2>
      </div>
      <p className={styles.smartSubtitle}>{copy.smartSubtitle}</p>

      <div className={styles.smartQuickRow}>
        {copy.smartQuickLinks.map((link) => (
          <Link key={link.href} href={localizedHref(locale, link.href)} className={styles.smartQuickLink}>
            {link.label}
          </Link>
        ))}
      </div>

      <NearbyDiscovery
        locale={locale}
        copy={{
          cta: copy.nearbyCta,
          loading: copy.nearbyLoading,
          denied: copy.nearbyDenied,
          error: copy.nearbyError,
          empty: copy.nearbyEmpty,
          privacyNote: copy.nearbyPrivacyNote,
        }}
      />
    </section>
  );
}
