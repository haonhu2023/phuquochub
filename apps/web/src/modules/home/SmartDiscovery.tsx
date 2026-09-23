import { getHomeCopy } from './home.copy';
import { NearbyDiscovery } from './NearbyDiscovery';
import type { Locale } from '@/lib/locale';
import styles from './home.module.css';

/**
 * "Địa điểm gần bạn" — trước đây (Phase 6, "Khám phá theo nhu cầu" V2) khối này còn có thêm một
 * hàng lối tắt cố định (Ăn uống/Bãi biển/Vui chơi/Tour/Bản đồ) đứng cạnh widget vị trí thật. Bỏ đi
 * (2026-09, rà UI mobile theo ảnh owner gửi): hàng lối tắt đó trỏ ĐÚNG những route mà lưới danh mục
 * "Bạn đang tìm gì?" (CategoryLinks, phía trên) và chip "Gợi ý nhanh" trong hero đã có — 3 bề mặt
 * cùng trỏ 1 tập route trên một trang là dư thừa thật, không phải cảm nhận. Giữ nguyên phần còn lại
 * (không đổi function/logic): widget vị trí thật vẫn là NearbyDiscovery bên dưới.
 *
 * Trusted Nearby + Opening State v0 (Phase 2): `NearbyDiscovery` bên dưới hiển thị trạng thái Đang
 * mở cửa / Đã đóng cửa / Chưa có thông tin giờ mở cửa cho từng địa điểm TRUSTED trả về từ
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
