import type { Metadata } from 'next';
import { listTours } from '@/modules/tours/api/tours.api';
import { TourCard } from '@/modules/tours/TourCard';
import { TourFilters } from '@/modules/tours/TourFilters';
import { Pagination } from '@/components/ui/Pagination';
import {
  TOUR_DIFFICULTY_VALUES,
  TOUR_SORT_VALUES,
  TOUR_TYPE_VALUES,
  type TourSort,
} from '@/modules/tours/types';
import { localizedHref, type Locale } from '@/lib/locale';
import { buildRouteAlternates } from '@/lib/seo';
import { getHubPageCopy } from '@/lib/hub-pages.copy';
import placesStyles from '@/modules/places/places.module.css';

const EMPTY_COPY: Record<Locale, { filteredTitle: string; filteredBody: string; emptyTitle: string; emptyBody: string }> = {
  vi: {
    filteredTitle: 'Không có tour phù hợp',
    filteredBody: 'Không tìm thấy tour khớp bộ lọc đã chọn. Thử bỏ bớt bộ lọc hoặc chọn tiêu chí khác.',
    emptyTitle: 'Chưa có tour nào',
    emptyBody: 'Dữ liệu tour đang được cập nhật. Vui lòng quay lại sau.',
  },
  en: {
    filteredTitle: 'No matching tours',
    filteredBody: 'No tours match the selected filters. Try clearing some filters or picking different criteria.',
    emptyTitle: 'No tours yet',
    emptyBody: 'Tour data is being added. Please check back soon.',
  },
};

const PAGE_SIZE = 20;
const PRICE_RANGE_VALUES = ['free', 'low', 'mid', 'high'];
// Chặn trên cho `max_duration_minutes` đọc từ URL: 43200 phút = 30 ngày, đủ rộng cho mọi tour có
// thật nhưng không để một con số vô lý đi thẳng xuống API.
const MAX_DURATION_MINUTES = 43200;

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string;
    type?: string;
    difficulty?: string;
    price_range?: string;
    max_duration_minutes?: string;
    departure_area?: string;
    sort?: string;
  }>;
}

// Không đặt canonical theo query string (?page/type/difficulty/…): các biến thể lọc/phân trang
// của cùng một danh sách không nên được index riêng (tránh duplicate content) — canonical luôn
// trỏ về /{locale}/tours, cùng quy ước /hotels và /restaurants. PR A: `generateMetadata` vì cần
// `params.locale`.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHubPageCopy(locale, 'tours');
  return {
    title: `${copy.title} | PhuQuocHub`,
    description: copy.description,
    alternates: buildRouteAlternates(locale, '/tours'),
    openGraph: { title: `${copy.title} | PhuQuocHub`, description: copy.description, type: 'website' },
  };
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function parseFromList(raw: string | undefined, allowed: readonly string[]): string | undefined {
  return raw && allowed.includes(raw) ? raw : undefined;
}

function parseMaxDuration(raw: string | undefined): number | undefined {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= MAX_DURATION_MINUTES ? n : undefined;
}

function parseDepartureArea(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

function parseSort(raw: string | undefined): TourSort | undefined {
  return (TOUR_SORT_VALUES as readonly string[]).includes(raw ?? '') ? (raw as TourSort) : undefined;
}

// Server Component: fetch danh sách tour (published) phía server theo bộ lọc trong URL. Lỗi API/
// mạng ném lên error.tsx (nút thử lại) — chỉ xử lý "0 kết quả" tại đây, không nuốt lỗi thật thành
// danh sách rỗng. Giá trị lọc lạ trong URL bị bỏ qua tại đây thay vì gửi xuống API (API sẽ trả
// 400 vì forbidNonWhitelisted, biến một URL bẩn thành trang lỗi).
export default async function ToursPage({ params, searchParams }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const type = parseFromList(sp.type, TOUR_TYPE_VALUES);
  const difficulty = parseFromList(sp.difficulty, TOUR_DIFFICULTY_VALUES);
  const priceRange = parseFromList(sp.price_range, PRICE_RANGE_VALUES);
  const maxDuration = parseMaxDuration(sp.max_duration_minutes);
  const departureArea = parseDepartureArea(sp.departure_area);
  const sort = parseSort(sp.sort);

  const { data: tours, meta } = await listTours({
    page,
    limit: PAGE_SIZE,
    type,
    difficulty,
    price_range: priceRange,
    max_duration_minutes: maxDuration,
    departure_area: departureArea,
    sort,
  });

  const baseQuery = new URLSearchParams();
  if (type) baseQuery.set('type', type);
  if (difficulty) baseQuery.set('difficulty', difficulty);
  if (priceRange) baseQuery.set('price_range', priceRange);
  if (maxDuration) baseQuery.set('max_duration_minutes', String(maxDuration));
  if (departureArea) baseQuery.set('departure_area', departureArea);
  if (sort) baseQuery.set('sort', sort);
  const hasFilter = Boolean(type || difficulty || priceRange || maxDuration || departureArea);
  const copy = getHubPageCopy(locale, 'tours');

  return (
    <section>
      <header className={placesStyles.pageHeader}>
        <h1 className={placesStyles.pageTitle}>{copy.h1}</h1>
        <p className={placesStyles.pageLede}>{copy.description}</p>
      </header>

      <TourFilters total={meta.total} />

      {tours.length === 0 ? (
        <div className={placesStyles.state}>
          <p className={placesStyles.stateTitle}>
            {hasFilter ? EMPTY_COPY[locale].filteredTitle : EMPTY_COPY[locale].emptyTitle}
          </p>
          <p>{hasFilter ? EMPTY_COPY[locale].filteredBody : EMPTY_COPY[locale].emptyBody}</p>
        </div>
      ) : (
        <>
          <div className={placesStyles.grid}>
            {tours.map((t) => (
              <TourCard key={t.id} tour={t} locale={locale} />
            ))}
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            basePath={localizedHref(locale, '/tours')}
            baseQuery={baseQuery.toString()}
            locale={locale}
          />
        </>
      )}
    </section>
  );
}
