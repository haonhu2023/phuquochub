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
 * Trusted Nearby + Opening State v0 (Phase 2): `NearbyDiscovery` bên dưới nay hiển thị trạng thái
 * Đang mở cửa / Đã đóng cửa / Chưa có thông tin giờ mở cửa cho từng địa điểm TRUSTED trả về từ
 * `GET /geo/nearby-trusted`, đọc trung thực qua `getOpeningToday()` — không suy diễn khi thiếu dữ
 * liệu (Phase 32: "OPEN_NOW requires reliable hours; do not infer" vẫn đúng, chỉ là giờ đã có một
 * đường hiển thị an toàn thay vì bị chặn hoàn toàn).
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
          openNow: copy.nearbyOpenNow,
          closedNow: copy.nearbyClosedNow,
          hoursUnknown: copy.nearbyHoursUnknown,
        }}
      />
    </section>
  );
}
