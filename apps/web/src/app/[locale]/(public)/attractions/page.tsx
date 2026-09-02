import type { Metadata } from 'next';
import { listAttractions } from '@/modules/attractions/api/attractions.api';
import { AttractionCard } from '@/modules/attractions/AttractionCard';
import { AttractionFilters } from '@/modules/attractions/AttractionFilters';
import { Pagination } from '@/components/ui/Pagination';
import { ATTRACTION_SORT_VALUES, type AttractionSort } from '@/modules/attractions/types';
import { localizedHref, type Locale } from '@/lib/locale';
import placesStyles from '@/modules/places/places.module.css';

const TITLE = 'Điểm tham quan Phú Quốc';
const DESCRIPTION =
  'Danh sách điểm tham quan ở Phú Quốc — lọc theo khu vực và mức giá, sắp xếp theo đánh giá.';
const PAGE_SIZE = 20;
const PRICE_RANGE_VALUES = ['free', 'low', 'mid', 'high'];

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; ward?: string; price_range?: string; sort?: string }>;
}

// Không đặt canonical theo query string (?page/ward/price_range/sort): các biến thể lọc/phân
// trang của cùng một danh sách không nên được index riêng (tránh duplicate content) — canonical
// luôn trỏ về /{locale}/attractions, cùng quy ước /hotels, /restaurants và /tours. PR A:
// `generateMetadata` vì cần `params.locale`.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  return {
    title: `${TITLE} · PhuQuocHub`,
    description: DESCRIPTION,
    alternates: { canonical: localizedHref(locale, '/attractions') },
    openGraph: { title: `${TITLE} · PhuQuocHub`, description: DESCRIPTION, type: 'website' },
  };
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function parseWard(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

function parsePriceRange(raw: string | undefined): string | undefined {
  return raw && PRICE_RANGE_VALUES.includes(raw) ? raw : undefined;
}

function parseSort(raw: string | undefined): AttractionSort | undefined {
  return (ATTRACTION_SORT_VALUES as readonly string[]).includes(raw ?? '')
    ? (raw as AttractionSort)
    : undefined;
}

// Server Component: fetch danh sách điểm tham quan (published) phía server theo page/ward/
// price_range/sort trong URL. Lỗi API/mạng ném lên error.tsx (nút thử lại) — chỉ xử lý
// "0 kết quả" tại đây, không nuốt lỗi thật thành danh sách rỗng. Giá trị lọc lạ trong URL bị bỏ
// qua thay vì gửi xuống API (API sẽ trả 400 vì forbidNonWhitelisted → biến URL bẩn thành trang lỗi).
export default async function AttractionsPage({ params, searchParams }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const ward = parseWard(sp.ward);
  const priceRange = parsePriceRange(sp.price_range);
  const sort = parseSort(sp.sort);

  const { data: attractions, meta } = await listAttractions({
    page,
    limit: PAGE_SIZE,
    ward,
    price_range: priceRange,
    sort,
  });

  const baseQuery = new URLSearchParams();
  if (ward) baseQuery.set('ward', ward);
  if (priceRange) baseQuery.set('price_range', priceRange);
  if (sort) baseQuery.set('sort', sort);
  const hasFilter = Boolean(ward || priceRange);

  return (
    <section>
      <header className={placesStyles.pageHeader}>
        <h1 className={placesStyles.pageTitle}>{TITLE}</h1>
        <p className={placesStyles.pageLede}>{DESCRIPTION}</p>
      </header>

      <AttractionFilters total={meta.total} />

      {attractions.length === 0 ? (
        <div className={placesStyles.state}>
          <p className={placesStyles.stateTitle}>
            {hasFilter ? 'Không có điểm tham quan phù hợp' : 'Chưa có điểm tham quan nào'}
          </p>
          <p>
            {hasFilter
              ? 'Không tìm thấy điểm tham quan khớp bộ lọc đã chọn. Thử bỏ bớt bộ lọc hoặc chọn tiêu chí khác.'
              : 'Dữ liệu điểm tham quan đang được cập nhật. Vui lòng quay lại sau.'}
          </p>
        </div>
      ) : (
        <>
          <div className={placesStyles.grid}>
            {attractions.map((a) => (
              <AttractionCard key={a.id} attraction={a} locale={locale} />
            ))}
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            basePath={localizedHref(locale, '/attractions')}
            baseQuery={baseQuery.toString()}
          />
        </>
      )}
    </section>
  );
}
