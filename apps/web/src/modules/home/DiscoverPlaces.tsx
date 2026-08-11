import Link from 'next/link';
import { listPlaces } from '@/modules/places/api/places.api';
import { PlaceCard } from '@/modules/places/PlaceCard';
import type { PlaceCard as PlaceCardType } from '@/modules/places/types';
import placeStyles from '@/modules/places/places.module.css';
import styles from './home.module.css';

/** Số thẻ hiển thị — truy vấn CÓ CHẶN TRÊN, trang chủ không bao giờ kéo cả danh sách. */
export const DISCOVER_LIMIT = 8;

/**
 * Khối khám phá địa điểm — lời gọi API DUY NHẤT của trang chủ.
 *
 * QUY TẮC CHỌN (không có khái niệm "featured" nào ở backend, và cố ý KHÔNG bịa ra một thuật toán
 * xếp hạng): đây đúng là trang đầu tiên của `GET /places` với `limit=8`. Endpoint đó chỉ trả place
 * đã `published` và sắp xếp CỐ ĐỊNH `rating_avg DESC NULLS LAST, created_at DESC, id ASC`
 * (PlacesRepository.list) — nghĩa là "địa điểm được đánh giá cao nhất trước, mới hơn thắng khi
 * bằng điểm". Thứ tự này xác định (khoá phụ `id` chốt cuối) nên kết quả ổn định giữa các lần tải,
 * và mọi dữ liệu hiển thị đều là dữ liệu thật — không có địa điểm giả, không có xếp hạng bịa.
 *
 * Thất bại được NUỐT TẠI ĐÂY (try/catch) thay vì để nổi lên `error.tsx`: hero, danh mục và các CTA
 * là nội dung tĩnh luôn dùng được, nên một sự cố API chỉ được phép thu nhỏ ĐÚNG khối này lại chứ
 * không được làm hỏng cả trang chủ.
 */
export async function DiscoverPlaces() {
  let places: PlaceCardType[];
  try {
    places = await listPlaces({ limit: DISCOVER_LIMIT });
  } catch {
    return (
      <Section>
        <p className={styles.sectionError} role="status">
          Hiện chưa tải được danh sách địa điểm. Bạn vẫn có thể tìm kiếm hoặc duyệt theo danh mục ở
          trên.
        </p>
      </Section>
    );
  }

  if (places.length === 0) {
    return (
      <Section>
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Chưa có địa điểm nào</p>
          <p>Nội dung đang được cập nhật. Vui lòng quay lại sau.</p>
        </div>
      </Section>
    );
  }

  return (
    <Section>
      <div className={placeStyles.grid}>
        {places.map((place) => (
          // titleAs="h3": tiêu đề khối là <h2>, nên tên địa điểm phải nằm DƯỚI nó một bậc.
          <PlaceCard key={place.id} place={place} titleAs="h3" />
        ))}
      </div>
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby="home-discover-title">
      <div className={styles.sectionHead}>
        <h2 id="home-discover-title" className={styles.sectionTitle}>
          Địa điểm nổi bật
        </h2>
        <Link href="/places" className={styles.sectionLink}>
          Xem thêm →
        </Link>
      </div>
      {children}
    </section>
  );
}

/** Khung chờ bám sát bố cục thật (lưới thẻ) để hạn chế layout shift khi khối này stream vào. */
export function DiscoverPlacesSkeleton() {
  return (
    <section className={styles.section} aria-busy="true" aria-label="Đang tải địa điểm nổi bật">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Địa điểm nổi bật</h2>
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
