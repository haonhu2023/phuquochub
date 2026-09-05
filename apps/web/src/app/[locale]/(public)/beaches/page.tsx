import type { Metadata } from 'next';
import { listBeaches } from '@/modules/beaches/api/beaches.api';
import { BeachCard } from '@/modules/beaches/BeachCard';
import { BeachFilters } from '@/modules/beaches/BeachFilters';
import { Pagination } from '@/components/ui/Pagination';
import { BEACH_SORT_VALUES, type BeachSort } from '@/modules/beaches/types';
import { localizedHref, type Locale } from '@/lib/locale';
import { buildRouteAlternates } from '@/lib/seo';
import { getHubPageCopy } from '@/lib/hub-pages.copy';
import placesStyles from '@/modules/places/places.module.css';

// Copy (`hub-pages.copy.ts`) chỉ nói đúng những gì trang này làm được: liệt kê và lọc. KHÔNG hứa
// hẹn về điều kiện tắm biển, cứu hộ, tiện ích hay thời điểm đẹp nhất — schema không có dữ liệu nào
// cho những điều đó.
const PAGE_SIZE = 20;
const PRICE_RANGE_VALUES = ['free', 'low', 'mid', 'high'];

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; ward?: string; price_range?: string; sort?: string }>;
}

// Không đặt canonical theo query string (?page/ward/price_range/sort): các biến thể lọc/phân
// trang của cùng một danh sách không nên được index riêng (tránh duplicate content) — canonical
// luôn trỏ về /{locale}/beaches, cùng quy ước /hotels, /restaurants, /tours và /attractions. PR A:
// `generateMetadata` vì cần `params.locale`.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHubPageCopy(locale, 'beaches');
  return {
    title: `${copy.title} | PhuQuocHub`,
    description: copy.description,
    alternates: buildRouteAlternates(locale, '/beaches'),
    openGraph: { title: `${copy.title} | PhuQuocHub`, description: copy.description, type: 'website' },
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

function parseSort(raw: string | undefined): BeachSort | undefined {
  return (BEACH_SORT_VALUES as readonly string[]).includes(raw ?? '') ? (raw as BeachSort) : undefined;
}

// Server Component: fetch danh sách bãi biển (published) phía server theo page/ward/price_range/
// sort trong URL. Lỗi API/mạng ném lên error.tsx (nút thử lại) — chỉ xử lý "0 kết quả" tại đây,
// không nuốt lỗi thật thành danh sách rỗng. Giá trị lọc lạ trong URL bị bỏ qua thay vì gửi xuống
// API (API sẽ trả 400 vì forbidNonWhitelisted → biến một URL bẩn thành trang lỗi).
export default async function BeachesPage({ params, searchParams }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const ward = parseWard(sp.ward);
  const priceRange = parsePriceRange(sp.price_range);
  const sort = parseSort(sp.sort);

  const { data: beaches, meta } = await listBeaches({
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
  const copy = getHubPageCopy(locale, 'beaches');

  return (
    <section>
      <header className={placesStyles.pageHeader}>
        <h1 className={placesStyles.pageTitle}>{copy.h1}</h1>
        <p className={placesStyles.pageLede}>{copy.description}</p>
      </header>

      <BeachFilters total={meta.total} />

      {beaches.length === 0 ? (
        <div className={placesStyles.state}>
          <p className={placesStyles.stateTitle}>
            {hasFilter ? 'Không có bãi biển phù hợp' : 'Chưa có bãi biển nào'}
          </p>
          <p>
            {hasFilter
              ? 'Không tìm thấy bãi biển khớp bộ lọc đã chọn. Thử bỏ bớt bộ lọc hoặc chọn tiêu chí khác.'
              : 'Dữ liệu bãi biển đang được cập nhật. Vui lòng quay lại sau.'}
          </p>
        </div>
      ) : (
        <>
          <div className={placesStyles.grid}>
            {beaches.map((b) => (
              <BeachCard key={b.id} beach={b} locale={locale} />
            ))}
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            basePath={localizedHref(locale, '/beaches')}
            baseQuery={baseQuery.toString()}
          />
        </>
      )}
    </section>
  );
}
