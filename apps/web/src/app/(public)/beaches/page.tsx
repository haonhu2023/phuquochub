import type { Metadata } from 'next';
import { listBeaches } from '@/modules/beaches/api/beaches.api';
import { BeachCard } from '@/modules/beaches/BeachCard';
import { BeachFilters } from '@/modules/beaches/BeachFilters';
import { Pagination } from '@/components/ui/Pagination';
import { BEACH_SORT_VALUES, type BeachSort } from '@/modules/beaches/types';
import placesStyles from '@/modules/places/places.module.css';

const TITLE = 'Bãi biển Phú Quốc';
// Mô tả chỉ nói đúng những gì trang này làm được: liệt kê và lọc. KHÔNG hứa hẹn về điều kiện
// tắm biển, cứu hộ, tiện ích hay thời điểm đẹp nhất — schema không có dữ liệu nào cho những điều đó.
const DESCRIPTION = 'Danh sách bãi biển ở Phú Quốc — lọc theo khu vực và mức giá, sắp xếp theo đánh giá.';
const PAGE_SIZE = 20;
const PRICE_RANGE_VALUES = ['free', 'low', 'mid', 'high'];

// Không đặt canonical theo query string (?page/ward/price_range/sort): các biến thể lọc/phân
// trang của cùng một danh sách không nên được index riêng (tránh duplicate content) — canonical
// luôn trỏ về /beaches, cùng quy ước /hotels, /restaurants, /tours và /attractions.
export const metadata: Metadata = {
  title: `${TITLE} · PhuQuocHub`,
  description: DESCRIPTION,
  alternates: { canonical: '/beaches' },
  openGraph: { title: `${TITLE} · PhuQuocHub`, description: DESCRIPTION, type: 'website' },
};

interface Props {
  searchParams: Promise<{ page?: string; ward?: string; price_range?: string; sort?: string }>;
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
export default async function BeachesPage({ searchParams }: Props) {
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

  return (
    <section>
      <header className={placesStyles.pageHeader}>
        <h1 className={placesStyles.pageTitle}>{TITLE}</h1>
        <p className={placesStyles.pageLede}>{DESCRIPTION}</p>
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
              <BeachCard key={b.id} beach={b} />
            ))}
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            basePath="/beaches"
            baseQuery={baseQuery.toString()}
          />
        </>
      )}
    </section>
  );
}
