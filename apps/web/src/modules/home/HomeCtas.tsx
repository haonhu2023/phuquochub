import Link from 'next/link';
import { localizedHref, type Locale } from '@/lib/locale';
import { getHomeCopy } from './home.copy';
import styles from './home.module.css';

/**
 * Lối vào bản đồ. CHỈ một liên kết tới `/map` — KHÔNG nhúng MapLibre vào trang chủ: bundle bản đồ
 * là thứ nặng nhất trong ứng dụng và phần lớn khách vào trang chủ để tìm kiếm/duyệt, không phải để
 * xem bản đồ ngay. Trang `/map` đã có sẵn toàn bộ trải nghiệm đó.
 *
 * `.mapPreview` (map/home upgrade) là một minh hoạ CSS thuần — dải màu + vài chấm định vị tĩnh gợi
 * hình bản đồ — KHÔNG phải bản đồ thật, để khối này không còn là một dòng chữ trơn mà vẫn không hề
 * tải MapLibre hay bất kỳ ảnh nặng nào trên trang chủ.
 */
export function MapCta({ locale }: { locale: Locale }) {
  const copy = getHomeCopy(locale);
  return (
    <section className={styles.section} aria-labelledby="home-map-title">
      <div className={styles.mapCta}>
        <div className={styles.mapPreview} aria-hidden="true">
          <span className={`${styles.mapPin} ${styles.mapPinA}`} />
          <span className={`${styles.mapPin} ${styles.mapPinB}`} />
          <span className={`${styles.mapPin} ${styles.mapPinC}`} />
          <span className={`${styles.mapPin} ${styles.mapPinD}`} />
          <span className={`${styles.mapPin} ${styles.mapPinE}`} />
          <div className={styles.mapPreviewChips}>
            <span className={styles.mapPreviewChip}>{locale === 'en' ? 'Beach' : 'Bãi biển'}</span>
            <span className={styles.mapPreviewChip}>{locale === 'en' ? 'Food' : 'Ăn uống'}</span>
          </div>
        </div>
        <div className={styles.ctaText}>
          <p className={styles.ctaEyebrow}>{copy.mapEyebrow}</p>
          <h2 id="home-map-title" className={styles.ctaTitle}>
            {copy.mapTitle}
          </h2>
          <p className={styles.ctaDesc}>{copy.mapDesc}</p>
          <Link href={localizedHref(locale, '/map')} className={styles.ctaLink}>
            {copy.mapLink}
          </Link>
        </div>
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
export function OwnerCta({ locale }: { locale: Locale }) {
  const copy = getHomeCopy(locale);
  return (
    <section className={styles.section} aria-labelledby="home-owner-title">
      <div className={`${styles.cta} ${styles.ctaSecondary}`}>
        <div className={styles.ctaText}>
          <h2 id="home-owner-title" className={styles.ctaTitle}>
            {copy.ownerTitle}
          </h2>
          <p className={styles.ctaDesc}>{copy.ownerDesc}</p>
        </div>
        {/* KHÔNG qua localizedHref: (dashboard) nằm NGOÀI segment [locale] (app/(dashboard)/dashboard/…),
            không có prefix /vi hoặc /en — bọc localizedHref ở đây sẽ tạo liên kết chết. */}
        <Link href="/dashboard/business-claims/new" className={styles.ctaLink}>
          {copy.ownerLink}
        </Link>
      </div>
    </section>
  );
}
