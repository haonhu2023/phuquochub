import type { Metadata } from 'next';
import Link from 'next/link';
import { searchPlaces } from '@/modules/search/api/search.api';
import { listCategories } from '@/modules/categories/api/categories.api';
import { SearchBox } from '@/modules/search/SearchBox';
import { SearchFilters } from '@/modules/search/SearchFilters';
import { Pagination } from '@/components/ui/Pagination';
import placesStyles from '@/modules/places/places.module.css';
import searchStyles from '@/modules/search/search.module.css';

const TITLE = 'Tìm kiếm';
const DESCRIPTION = 'Tìm kiếm địa điểm ở Phú Quốc — lọc theo danh mục, khu vực và mức giá.';
const PAGE_SIZE = 20;
const PRICE_RANGE_VALUES = ['free', 'low', 'mid', 'high'];

// Không đặt canonical theo query string (?q/category/ward/price_range/page): mỗi truy vấn tìm
// kiếm là một biến thể khác nhau của cùng một trang, không nên index riêng từng biến thể —
// cùng quy ước /hotels, /restaurants, /tours, /attractions.
export const metadata: Metadata = {
  title: `${TITLE} · PhuQuocHub`,
  description: DESCRIPTION,
  alternates: { canonical: '/search' },
  robots: { index: false }, // trang kết quả tìm kiếm không nên vào chỉ mục (chuẩn SEO phổ biến)
};

interface Props {
  searchParams: Promise<{
    q?: string;
    category?: string;
    ward?: string;
    price_range?: string;
    page?: string;
  }>;
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
export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const page = parsePage(sp.page);
  const category = parseCategory(sp.category);
  const ward = parseWard(sp.ward);
  const priceRange = parsePriceRange(sp.price_range);

  const categories = await listCategories();

  if (!q) {
    return (
      <section>
        <header className={placesStyles.pageHeader}>
          <h1 className={placesStyles.pageTitle}>{TITLE}</h1>
          <p className={placesStyles.pageLede}>{DESCRIPTION}</p>
        </header>
        <SearchBox q="" category={category} ward={ward} price_range={priceRange} />
        <div className={placesStyles.state}>
          <p className={placesStyles.stateTitle}>Nhập từ khoá để bắt đầu tìm kiếm</p>
          <p>Ví dụ: “bai sao”, “dinh cau” — tìm kiếm không phân biệt dấu.</p>
        </div>
      </section>
    );
  }

  const { data: results, meta } = await searchPlaces({
    q,
    page,
    limit: PAGE_SIZE,
    category,
    ward,
    price_range: priceRange,
  });

  const baseQuery = new URLSearchParams();
  baseQuery.set('q', q);
  if (category) baseQuery.set('category', category);
  if (ward) baseQuery.set('ward', ward);
  if (priceRange) baseQuery.set('price_range', priceRange);
  const hasFilter = Boolean(category || ward || priceRange);

  return (
    <section>
      <header className={placesStyles.pageHeader}>
        <h1 className={placesStyles.pageTitle}>{TITLE}</h1>
        <p className={placesStyles.pageLede}>{DESCRIPTION}</p>
      </header>

      <SearchBox q={q} category={category} ward={ward} price_range={priceRange} />
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
                <Link href={`/places/${r.slug}`} className={searchStyles.resultTitle}>
                  {r.title}
                </Link>
                {r.snippet && <p className={searchStyles.resultSnippet}>{r.snippet}</p>}
              </li>
            ))}
          </ul>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            basePath="/search"
            baseQuery={baseQuery.toString()}
          />
        </>
      )}
    </section>
  );
}
