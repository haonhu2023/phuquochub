import type { Metadata } from 'next';
import { listHotels } from '@/modules/hotels/api/hotels.api';
import { HotelCard } from '@/modules/hotels/HotelCard';
import { HotelFilters } from '@/modules/hotels/HotelFilters';
import { Pagination } from '@/components/ui/Pagination';
import { HOTEL_SORT_VALUES, type HotelSort } from '@/modules/hotels/types';
import placesStyles from '@/modules/places/places.module.css';

const TITLE = 'Khách sạn Phú Quốc';
const DESCRIPTION =
  'Danh sách khách sạn, resort, homestay và villa ở Phú Quốc — lọc theo hạng sao, sắp xếp theo đánh giá.';
const PAGE_SIZE = 20;

// Không đặt canonical theo query string (?page/stars/sort): các biến thể lọc/phân trang của
// cùng một danh sách không nên được index riêng (tránh duplicate content) — canonical luôn trỏ
// về /hotels, đúng khuyến nghị SEO chuẩn cho trang danh mục có filter.
export const metadata: Metadata = {
  title: `${TITLE} · PhuQuocHub`,
  description: DESCRIPTION,
  alternates: { canonical: '/hotels' },
  openGraph: { title: `${TITLE} · PhuQuocHub`, description: DESCRIPTION, type: 'website' },
};

interface Props {
  searchParams: Promise<{ page?: string; stars?: string; sort?: string }>;
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function parseStars(raw: string | undefined): number | undefined {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
}

function parseSort(raw: string | undefined): HotelSort | undefined {
  return (HOTEL_SORT_VALUES as readonly string[]).includes(raw ?? '') ? (raw as HotelSort) : undefined;
}

// Server Component: fetch danh sách khách sạn (published) phía server theo page/stars/sort trong
// URL. Lỗi API/mạng ném lên error.tsx (nút thử lại) — chỉ xử lý "0 kết quả" tại đây, không nuốt
// lỗi thật thành danh sách rỗng (khác với việc thực sự không có khách sạn nào khớp bộ lọc).
export default async function HotelsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const stars = parseStars(sp.stars);
  const sort = parseSort(sp.sort);

  const { data: hotels, meta } = await listHotels({ page, limit: PAGE_SIZE, stars, sort });

  const baseQuery = new URLSearchParams();
  if (stars) baseQuery.set('stars', String(stars));
  if (sort) baseQuery.set('sort', sort);

  return (
    <section>
      <header className={placesStyles.pageHeader}>
        <h1 className={placesStyles.pageTitle}>{TITLE}</h1>
        <p className={placesStyles.pageLede}>{DESCRIPTION}</p>
      </header>

      <HotelFilters total={meta.total} />

      {hotels.length === 0 ? (
        <div className={placesStyles.state}>
          <p className={placesStyles.stateTitle}>
            {stars ? 'Không có khách sạn phù hợp' : 'Chưa có khách sạn nào'}
          </p>
          <p>
            {stars
              ? 'Không tìm thấy khách sạn khớp hạng sao đã chọn. Thử bỏ bộ lọc hoặc chọn hạng khác.'
              : 'Dữ liệu khách sạn đang được cập nhật. Vui lòng quay lại sau.'}
          </p>
        </div>
      ) : (
        <>
          <div className={placesStyles.grid}>
            {hotels.map((h) => (
              <HotelCard key={h.id} hotel={h} />
            ))}
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            basePath="/hotels"
            baseQuery={baseQuery.toString()}
          />
        </>
      )}
    </section>
  );
}
