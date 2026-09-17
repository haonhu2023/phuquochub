import Link from 'next/link';
import { countPublishedPlaces } from '@/modules/places/api/places.api';
import { localizedHref, type Locale } from '@/lib/locale';
import { getHomeCopy } from './home.copy';
import styles from './home.module.css';

function MapPreview({ locale }: { locale: Locale }) {
  return (
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
  );
}

/**
 * Lối vào bản đồ. CHỈ một liên kết tới `/map` — KHÔNG nhúng MapLibre vào trang chủ: bundle bản đồ
 * là thứ nặng nhất trong ứng dụng và phần lớn khách vào trang chủ để tìm kiếm/duyệt, không phải để
 * xem bản đồ ngay. Trang `/map` đã có sẵn toàn bộ trải nghiệm đó.
 *
 * `.mapPreview` (map/home upgrade) là một minh hoạ CSS thuần — dải màu + vài chấm định vị tĩnh gợi
 * hình bản đồ — KHÔNG phải bản đồ thật, để khối này không còn là một dòng chữ trơn mà vẫn không hề
 * tải MapLibre hay bất kỳ ảnh nặng nào trên trang chủ.
 *
 * `async` (2026-09-17, real-data pass): thêm dòng "N địa điểm đã có trên bản đồ" — tín hiệu
 * freshness THẬT, không phải một con số minh hoạ. `countPublishedPlaces()` gọi thẳng `GET
 * /places?limit=1` lấy `meta.total` (CÙNG endpoint `DiscoverPlaces` đã dùng, không phải API mới).
 * Lỗi hoặc tổng ≤ 0 → bỏ qua dòng đó thay vì hiện "0 địa điểm" hay một câu lỗi: đây là tín hiệu
 * tin cậy phụ, một khẳng định sai còn tệ hơn im lặng bỏ qua. Nơi gọi (`page.tsx`) bọc
 * `<Suspense fallback={<MapCtaSkeleton />}>` — CÙNG khuôn `DiscoverPlaces`/`DiscoverPlacesSkeleton`
 * (xem chú thích ở đó, và cách test file này gọi `await MapCta(...)` trực tiếp thay vì render qua
 * cây React đồng bộ — component async chỉ render được qua đường đó dưới Jest/RTL).
 */
export async function MapCta({ locale }: { locale: Locale }) {
  const copy = getHomeCopy(locale);
  let count: number | null = null;
  try {
    count = await countPublishedPlaces();
  } catch {
    count = null;
  }
  return (
    <section className={styles.section} aria-labelledby="home-map-title">
      <div className={styles.mapCta}>
        <MapPreview locale={locale} />
        <div className={styles.ctaText}>
          <p className={styles.ctaEyebrow}>{copy.mapEyebrow}</p>
          <h2 id="home-map-title" className={styles.ctaTitle}>
            {copy.mapTitle}
          </h2>
          <p className={styles.ctaDesc}>{copy.mapDesc}</p>
          {count !== null && count > 0 && <p className={styles.mapCount}>{copy.mapCountLabel(count)}</p>}
          <Link href={localizedHref(locale, '/map')} className={styles.ctaLink}>
            {copy.mapLink}
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Khung chờ tĩnh — CÙNG bố cục thật, chỉ bỏ dòng đếm (đang chờ `countPublishedPlaces()`). */
export function MapCtaSkeleton({ locale }: { locale: Locale }) {
  const copy = getHomeCopy(locale);
  return (
    <section className={styles.section} aria-labelledby="home-map-title">
      <div className={styles.mapCta}>
        <MapPreview locale={locale} />
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
