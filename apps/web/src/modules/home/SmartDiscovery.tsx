import { getHomeCopy } from './home.copy';
import { NearbyDiscovery } from './NearbyDiscovery';
import type { Locale } from '@/lib/locale';
import styles from './home.module.css';

/**
 * "Khám phá theo nhu cầu" (Phase 9) — khối duy nhất trên trang chủ dùng dữ liệu THỜI GIAN THỰC của
 * chính người dùng (vị trí, sau khi đồng ý). KHÔNG có "Đang mở cửa": schema `opening_hours` hiện
 * có trên phần lớn 49 địa điểm chưa đủ tin cậy để suy ra trạng thái mở/đóng ngay bây giờ mà không
 * suy diễn — đúng nguyên tắc Phase 32 ("OPEN_NOW requires reliable hours; do not infer").
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
