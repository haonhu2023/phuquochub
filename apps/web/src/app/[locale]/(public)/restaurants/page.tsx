import type { Metadata } from 'next';
import { listRestaurants } from '@/modules/restaurants/api/restaurants.api';
import { RestaurantCard } from '@/modules/restaurants/RestaurantCard';
import { RestaurantFilters } from '@/modules/restaurants/RestaurantFilters';
import { Pagination } from '@/components/ui/Pagination';
import { RESTAURANT_SORT_VALUES, type RestaurantSort } from '@/modules/restaurants/types';
import { localizedHref, type Locale } from '@/lib/locale';
import placesStyles from '@/modules/places/places.module.css';

const TITLE = 'Nhà hàng Phú Quốc';
const DESCRIPTION =
  'Danh sách nhà hàng, quán ăn ở Phú Quốc — lọc theo mức giá, ẩm thực, sắp xếp theo đánh giá.';
const PAGE_SIZE = 20;
const PRICE_RANGE_VALUES = ['free', 'low', 'mid', 'high'];

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; price_range?: string; cuisine?: string; sort?: string }>;
}

// Không đặt canonical theo query string (?page/price_range/cuisine/sort): các biến thể lọc/phân
// trang của cùng một danh sách không nên được index riêng (tránh duplicate content) — canonical
// luôn trỏ về /{locale}/restaurants, cùng quy ước /hotels. PR A: `generateMetadata` vì cần
// `params.locale`.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  return {
    title: `${TITLE} · PhuQuocHub`,
    description: DESCRIPTION,
    alternates: { canonical: localizedHref(locale, '/restaurants') },
    openGraph: { title: `${TITLE} · PhuQuocHub`, description: DESCRIPTION, type: 'website' },
  };
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function parsePriceRange(raw: string | undefined): string | undefined {
  return raw && PRICE_RANGE_VALUES.includes(raw) ? raw : undefined;
}

function parseCuisine(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed.slice(0, 60) : undefined;
}

function parseSort(raw: string | undefined): RestaurantSort | undefined {
  return (RESTAURANT_SORT_VALUES as readonly string[]).includes(raw ?? '') ? (raw as RestaurantSort) : undefined;
}

// Server Component: fetch danh sách nhà hàng (published) phía server theo page/price_range/
// cuisine/sort trong URL. Lỗi API/mạng ném lên error.tsx (nút thử lại) — chỉ xử lý "0 kết quả"
// tại đây, không nuốt lỗi thật thành danh sách rỗng.
export default async function RestaurantsPage({ params, searchParams }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const priceRange = parsePriceRange(sp.price_range);
  const cuisine = parseCuisine(sp.cuisine);
  const sort = parseSort(sp.sort);

  const { data: restaurants, meta } = await listRestaurants({
    page,
    limit: PAGE_SIZE,
    price_range: priceRange,
    cuisine,
    sort,
  });

  const baseQuery = new URLSearchParams();
  if (priceRange) baseQuery.set('price_range', priceRange);
  if (cuisine) baseQuery.set('cuisine', cuisine);
  if (sort) baseQuery.set('sort', sort);
  const hasFilter = Boolean(priceRange || cuisine);

  return (
    <section>
      <header className={placesStyles.pageHeader}>
        <h1 className={placesStyles.pageTitle}>{TITLE}</h1>
        <p className={placesStyles.pageLede}>{DESCRIPTION}</p>
      </header>

      <RestaurantFilters total={meta.total} />

      {restaurants.length === 0 ? (
        <div className={placesStyles.state}>
          <p className={placesStyles.stateTitle}>
            {hasFilter ? 'Không có nhà hàng phù hợp' : 'Chưa có nhà hàng nào'}
          </p>
          <p>
            {hasFilter
              ? 'Không tìm thấy nhà hàng khớp bộ lọc đã chọn. Thử bỏ bớt bộ lọc hoặc chọn tiêu chí khác.'
              : 'Dữ liệu nhà hàng đang được cập nhật. Vui lòng quay lại sau.'}
          </p>
        </div>
      ) : (
        <>
          <div className={placesStyles.grid}>
            {restaurants.map((r) => (
              <RestaurantCard key={r.id} restaurant={r} locale={locale} />
            ))}
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            basePath={localizedHref(locale, '/restaurants')}
            baseQuery={baseQuery.toString()}
          />
        </>
      )}
    </section>
  );
}
