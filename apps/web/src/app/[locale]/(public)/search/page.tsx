import type { Metadata } from 'next';
import Link from 'next/link';
import { searchPlaces } from '@/modules/search/api/search.api';
import { listCategories } from '@/modules/categories/api/categories.api';
import { SearchBox } from '@/modules/search/SearchBox';
import { SearchFilters } from '@/modules/search/SearchFilters';
import { Pagination } from '@/components/ui/Pagination';
import { localizedHref, type Locale } from '@/lib/locale';
import { buildRouteAlternates, NOINDEX_FOLLOW } from '@/lib/seo';
import placesStyles from '@/modules/places/places.module.css';
import searchStyles from '@/modules/search/search.module.css';

const SEARCH_COPY = {
  vi: {
    title: 'Tìm kiếm',
    description: 'Tìm kiếm địa điểm ở Phú Quốc — lọc theo danh mục, khu vực và mức giá.',
    emptyPrompt: 'Nhập từ khoá để bắt đầu tìm kiếm',
    emptyHint: 'Ví dụ: "bai sao", "dinh cau" — tìm kiếm không phân biệt dấu.',
  },
  en: {
    title: 'Search',
    description: 'Search places in Phú Quốc — filter by category, area and price.',
    emptyPrompt: 'Enter a keyword to start searching',
    emptyHint: 'Example: "bai sao", "dinh cau" — search ignores Vietnamese diacritics.',
  },
} as const;

const PAGE_SIZE = 20;
const PRICE_RANGE_VALUES = ['free', 'low', 'mid', 'high'];

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    category?: string;
    ward?: string;
    price_range?: string;
    page?: string;
  }>;
}

// Không đặt canonical theo query string (?q/category/ward/price_range/page): mỗi truy vấn tìm
// kiếm là một biến thể khác nhau của cùng một trang, không nên index riêng từng biến thể —
// cùng quy ước /hotels, /restaurants, /tours, /attractions. PR A: `generateMetadata` vì cần
// `params.locale`.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = SEARCH_COPY[locale];
  return {
    title: `${copy.title} | PhuQuocHub`,
    description: copy.description,
    alternates: buildRouteAlternates(locale, '/search'),
    // Phase 3/27: `noindex` PHẢI vẫn crawlable (KHÔNG chặn trong robots.txt) để crawler đọc được
    // chính chỉ thị này — trang kết quả tìm kiếm nội bộ không nên trở thành một bề mặt index lớn,
    // nhưng vẫn cần `follow` để crawler tiếp tục đi theo liên kết thật (/places/{slug}) bên trong.
    robots: NOINDEX_FOLLOW,
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

function parseCategory(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

// Server Component: fetch kết quả FTS phía server theo q/category/ward/price_range/page trong
// URL — cùng kiến trúc /hotels /restaurants /tours /attractions /beaches (Decision A1). Khác các
// trang đó ở một điểm: `q` là bắt buộc phía backend (SearchQueryDto.q, MinLength(1)) nên khi `q`
// rỗng/vắng mặt, trang này KHÔNG gọi API (tránh 400 vô ích) và chỉ hiện trạng thái "nhập từ khoá".
export default async function SearchPage({ params, searchParams }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const page = parsePage(sp.page);
  const category = parseCategory(sp.category);
  const ward = parseWard(sp.ward);
  const priceRange = parsePriceRange(sp.price_range);
  const copy = SEARCH_COPY[locale];

  if (!q) {
    return (
      <section>
        <header className={placesStyles.pageHeader}>
          <h1 className={placesStyles.pageTitle}>{copy.title}</h1>
          <p className={placesStyles.pageLede}>{copy.description}</p>
        </header>
        <SearchBox q="" category={category} ward={ward} price_range={priceRange} locale={locale} />
        <div className={placesStyles.state}>
          <p className={placesStyles.stateTitle}>{copy.emptyPrompt}</p>
          <p>{copy.emptyHint}</p>
        </div>
      </section>
    );
  }

  // listCategories() chỉ cần khi thực sự render SearchFilters (nhánh này) — gọi song song với
  // searchPlaces() bằng Promise.all thay vì tuần tự, tránh round-trip thừa khi q rỗng (nhánh
  // trên) VÀ tránh waterfall không cần thiết khi có q.
  const [{ data: results, meta }, categories] = await Promise.all([
    searchPlaces({ q, page, limit: PAGE_SIZE, category, ward, price_range: priceRange }),
    listCategories(),
  ]);

  const baseQuery = new URLSearchParams();
  baseQuery.set('q', q);
  if (category) baseQuery.set('category', category);
  if (ward) baseQuery.set('ward', ward);
  if (priceRange) baseQuery.set('price_range', priceRange);
  const hasFilter = Boolean(category || ward || priceRange);

  return (
    <section>
      <header className={placesStyles.pageHeader}>
        <h1 className={placesStyles.pageTitle}>{copy.title}</h1>
        <p className={placesStyles.pageLede}>{copy.description}</p>
      </header>

      <SearchBox q={q} category={category} ward={ward} price_range={priceRange} locale={locale} />
      <SearchFilters total={meta.total} categories={categories} />

      {results.length === 0 ? (
        <div className={placesStyles.state}>
          <p className={placesStyles.stateTitle}>
            {hasFilter ? 'Không có kết quả phù hợp' : 'Không có kết quả'}
          </p>
          <p>
            {hasFilter
              ? `Không tìm thấy kết quả khớp “${q}” với bộ lọc đã chọn. Thử bỏ bớt bộ lọc hoặc đổi từ khoá.`
              : `Không tìm thấy kết quả cho “${q}”.`}
          </p>
        </div>
      ) : (
        <>
          <ul className={searchStyles.resultList}>
            {results.map((r) => (
              <li key={r.id} className={searchStyles.resultItem}>
                <Link href={localizedHref(locale, `/places/${r.slug}`)} className={searchStyles.resultTitle}>
                  {r.title}
                </Link>
                {r.snippet && <p className={searchStyles.resultSnippet}>{r.snippet}</p>}
              </li>
            ))}
          </ul>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            basePath={localizedHref(locale, '/search')}
            baseQuery={baseQuery.toString()}
          />
        </>
      )}
    </section>
  );
}
