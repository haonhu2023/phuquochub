import Link from 'next/link';
import styles from './home.module.css';

/**
 * Lối vào bản đồ. CHỈ một liên kết tới `/map` — KHÔNG nhúng MapLibre vào trang chủ: bundle bản đồ
 * là thứ nặng nhất trong ứng dụng và phần lớn khách vào trang chủ để tìm kiếm/duyệt, không phải để
 * xem bản đồ ngay. Trang `/map` đã có sẵn toàn bộ trải nghiệm đó.
 */
export function MapCta() {
  return (
    <section className={styles.section} aria-labelledby="home-map-title">
      <div className={styles.cta}>
        <div className={styles.ctaText}>
          <h2 id="home-map-title" className={styles.ctaTitle}>
            Xem trên bản đồ
          </h2>
          <p className={styles.ctaDesc}>
            Duyệt địa điểm theo vị trí trên bản đồ Phú Quốc.
          </p>
        </div>
        <Link href="/map" className={styles.ctaLink}>
          Mở bản đồ
        </Link>
      </div>
    </section>
  );
}

/**
 * CTA chủ cơ sở — mục PHỤ, đặt cuối trang: đây là trang dành cho khách tham quan, không phải trang
 * bán hàng cho doanh nghiệp. Trỏ vào luồng xác nhận quyền quản lý CÓ THẬT
 * (`/dashboard/business-claims/new`); luồng này giờ đã đủ đầu-cuối (gửi → kiểm duyệt viên duyệt →
 * chủ cơ sở quản lý được địa điểm).
 */
export function OwnerCta() {
  return (
    <section className={styles.section} aria-labelledby="home-owner-title">
      <div className={`${styles.cta} ${styles.ctaSecondary}`}>
        <div className={styles.ctaText}>
          <h2 id="home-owner-title" className={styles.ctaTitle}>
            Bạn là chủ cơ sở?
          </h2>
          <p className={styles.ctaDesc}>
            Xác nhận quyền quản lý để cập nhật thông tin, giờ mở cửa và liên hệ của cơ sở.
          </p>
        </div>
        <Link href="/dashboard/business-claims/new" className={styles.ctaLink}>
          Xác nhận quyền quản lý
        </Link>
      </div>
    </section>
  );
}
