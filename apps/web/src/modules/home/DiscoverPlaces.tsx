import Link from 'next/link';
import { listPlaces, getPlace } from '@/modules/places/api/places.api';
import { PlaceCard } from '@/modules/places/PlaceCard';
import type { PlaceCard as PlaceCardType } from '@/modules/places/types';
import { listCategories } from '@/modules/categories/api/categories.api';
import { categoryNameLookup } from '@/modules/categories/categoryName';
import { getHomeContent } from '@/modules/site-content/api/site-content.api';
import { localizedHref, type Locale } from '@/lib/locale';
import { getHomeCopy } from './home.copy';
import placeStyles from '@/modules/places/places.module.css';
import styles from './home.module.css';

/** Số thẻ hiển thị — truy vấn CÓ CHẶN TRÊN, trang chủ không bao giờ kéo cả danh sách. */
export const DISCOVER_LIMIT = 8;

/**
 * Khối khám phá địa điểm — khối DUY NHẤT của trang chủ chạm vào dữ liệu place thật (`MapCta` gọi
 * thêm một tổng số riêng, xem HomeCtas.tsx).
 *
 * QUY TẮC CHỌN MẶC ĐỊNH (không có thuật toán xếp hạng bịa ra): trang đầu tiên của `GET /places`
 * với `limit=8`, sắp xếp CỐ ĐỊNH `rating_avg DESC NULLS LAST, created_at DESC, id ASC`
 * (PlacesRepository.list) — "địa điểm được đánh giá cao nhất trước, mới hơn thắng khi bằng điểm".
 *
 * ĐỊA ĐIỂM NỔI BẬT DO OWNER CHỌN TAY (S1, 2026-09-22): nếu `site_content.home_featured` có
 * `placeSlugs`, danh sách đó THAY THẾ truy vấn mặc định — mỗi slug được resolve qua
 * `GET /places/:slug` công khai đã có sẵn (không thêm mặt truy vấn "theo danh sách id" nào ở
 * backend). Đây KHÔNG phải một thuật toán xếp hạng bịa ra — là một người biên tập chọn tay từ
 * địa điểm THẬT đã xuất bản, giống "biên tập viên chọn" trên báo, và nếu MỘT slug lỗi/đã gỡ công
 * khai thì slug đó bị bỏ qua lặng lẽ (không làm hỏng cả khối); nếu SAU KHI lọc, danh sách còn lại
 * rỗng, khối này rơi về truy vấn mặc định — không bao giờ hiển thị rỗng chỉ vì một slug đã cũ.
 *
 * `categoryName` (2026-09-17, real-data pass): `PlaceCard`/`GET /places` chỉ mang `category_id`
 * (UUID) — tra tên qua `GET /categories` (công khai, không phân trang) song song với truy vấn
 * places. Lỗi tra tên KHÔNG chặn khối này render (`.catch(() => [])`): thiếu tên danh mục chỉ ẩn
 * một dòng nhãn nhỏ trên thẻ, không phải lý do để coi cả khối là lỗi.
 *
 * Thất bại tải PLACES (không phải categories/site-content) được NUỐT TẠI ĐÂY (try/catch) thay vì
 * để nổi lên `error.tsx`: hero, danh mục và các CTA là nội dung tĩnh luôn dùng được, nên một sự cố
 * API chỉ được phép thu nhỏ ĐÚNG khối này lại chứ không được làm hỏng cả trang chủ.
 */
export async function DiscoverPlaces({ locale }: { locale: Locale }) {
  const copy = getHomeCopy(locale);
  let places: PlaceCardType[];
  let categoryName: (categoryId: string) => string | null;
  try {
    const [placesResult, categories, homeContent] = await Promise.all([
      listPlaces({ limit: DISCOVER_LIMIT }),
      // Tên danh mục là phần trình bày thêm, không phải điều kiện để khối này render — lỗi ở đây
      // không được kéo cả khối "Địa điểm nổi bật" xuống trạng thái lỗi (`.catch(() => [])`).
      listCategories().catch(() => []),
      // site-content lỗi cũng KHÔNG chặn khối này — rơi về danh sách mặc định ở trên.
      getHomeContent(locale).catch(() => null),
    ]);
    places = placesResult;
    categoryName = categoryNameLookup(categories, locale);

    const featuredSlugs = homeContent?.featuredPlaceSlugs ?? [];
    if (featuredSlugs.length > 0) {
      const resolved = await Promise.all(
        featuredSlugs.map((slug) => getPlace(slug, locale).catch(() => null)),
      );
      const curated = resolved.filter((p): p is NonNullable<typeof p> => p !== null);
      if (curated.length > 0) places = curated;
    }
  } catch {
    return (
      <Section locale={locale}>
        <p className={styles.sectionError} role="status">
          {copy.discoverError}
        </p>
      </Section>
    );
  }

  if (places.length === 0) {
    return (
      <Section locale={locale}>
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>{copy.discoverEmptyTitle}</p>
          <p>{copy.discoverEmptyBody}</p>
        </div>
      </Section>
    );
  }

  return (
    <Section locale={locale}>
      <div className={placeStyles.grid}>
        {places.map((place) => (
          // titleAs="h3": tiêu đề khối là <h2>, nên tên địa điểm phải nằm DƯỚI nó một bậc.
          <PlaceCard
            key={place.id}
            place={place}
            titleAs="h3"
            locale={locale}
            categoryName={categoryName(place.category_id)}
          />
        ))}
      </div>
    </Section>
  );
}

function Section({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  const copy = getHomeCopy(locale);
  return (
    <section className={styles.section} aria-labelledby="home-discover-title">
      <div className={styles.sectionHead}>
        <h2 id="home-discover-title" className={styles.sectionTitle}>
          {copy.discoverTitle}
        </h2>
        <Link href={localizedHref(locale, '/places')} className={styles.sectionLink}>
          {copy.discoverMoreLink}
        </Link>
      </div>
      {children}
    </section>
  );
}

/** Khung chờ bám sát bố cục thật (lưới thẻ) để hạn chế layout shift khi khối này stream vào. */
export function DiscoverPlacesSkeleton({ locale }: { locale: Locale }) {
  const copy = getHomeCopy(locale);
  return (
    <section className={styles.section} aria-busy="true" aria-label={copy.discoverLoadingLabel}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{copy.discoverTitle}</h2>
      </div>
      <div className={placeStyles.grid}>
        {Array.from({ length: DISCOVER_LIMIT }).map((_, i) => (
          <div key={i} className={placeStyles.card}>
            <div className={`${placeStyles.skeleton} ${placeStyles.skelThumb}`} />
            <div className={placeStyles.cardBody}>
              <div
                className={`${placeStyles.skeleton} ${placeStyles.skelLine}`}
                style={{ margin: 0, height: '1.1rem' }}
              />
              <div
                className={`${placeStyles.skeleton} ${placeStyles.skelLine} ${placeStyles.skelLineShort}`}
                style={{ marginLeft: 0 }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
