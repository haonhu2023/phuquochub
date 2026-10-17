import type { Metadata } from 'next';
import { listRealEstateListings } from '@/modules/real-estate-listings/api/real-estate-listings.api';
import { RealEstateListingCard } from '@/modules/real-estate-listings/RealEstateListingCard';
import { RealEstateFilters } from '@/modules/real-estate-listings/RealEstateFilters';
import type { RealEstatePropertyType, RealEstateTransactionType } from '@/modules/real-estate-listings/types';
import { REAL_ESTATE_PROPERTY_TYPES, REAL_ESTATE_TRANSACTION_TYPES } from '@/modules/real-estate-listings/types';
import { Pagination } from '@/components/ui/Pagination';
import { localizedHref, type Locale } from '@/lib/locale';
import { buildRouteAlternates } from '@/lib/seo';
import { getHubPageCopy } from '@/lib/hub-pages.copy';
import placesStyles from '@/modules/places/places.module.css';

const PAGE_SIZE = 20;

const EMPTY_COPY: Record<Locale, { filteredTitle: string; filteredBody: string; emptyTitle: string; emptyBody: string }> = {
  vi: {
    filteredTitle: 'Không có tin phù hợp',
    filteredBody: 'Không tìm thấy tin bất động sản khớp bộ lọc đã chọn. Thử bỏ bớt bộ lọc.',
    emptyTitle: 'Chưa có tin bất động sản nào',
    emptyBody: 'Hiện chưa có tin cho thuê/mua bán nào được công khai. Vui lòng quay lại sau.',
  },
  en: {
    filteredTitle: 'No matching listings',
    filteredBody: 'No real estate listings match the selected filters. Try clearing some filters.',
    emptyTitle: 'No real estate listings yet',
    emptyBody: 'No rental or sale listings are published yet. Please check back soon.',
  },
};

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; transaction_type?: string; property_type?: string; ward?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHubPageCopy(locale, 'real-estate');
  return {
    title: `${copy.title} | PhuQuocHub`,
    description: copy.description,
    alternates: buildRouteAlternates(locale, '/real-estate'),
    openGraph: { title: `${copy.title} | PhuQuocHub`, description: copy.description, type: 'website' },
  };
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function parseText(raw: string | undefined, maxLen: number): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed.slice(0, maxLen) : undefined;
}

function parseTransactionType(raw: string | undefined): RealEstateTransactionType | undefined {
  return (REAL_ESTATE_TRANSACTION_TYPES as readonly string[]).includes(raw ?? '')
    ? (raw as RealEstateTransactionType)
    : undefined;
}

function parsePropertyType(raw: string | undefined): RealEstatePropertyType | undefined {
  return (REAL_ESTATE_PROPERTY_TYPES as readonly string[]).includes(raw ?? '') ? (raw as RealEstatePropertyType) : undefined;
}

// Server Component: danh sách bất động sản công khai (chỉ published + deal_status=available,
// chưa hết hạn — lọc ở server, xem RealEstateListingsRepository.publicQuery()).
export default async function RealEstateListingsPage({ params, searchParams }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const transactionType = parseTransactionType(sp.transaction_type);
  const propertyType = parsePropertyType(sp.property_type);
  const ward = parseText(sp.ward, 80);

  const { data: listings, meta } = await listRealEstateListings({
    page,
    limit: PAGE_SIZE,
    transaction_type: transactionType,
    property_type: propertyType,
    ward,
    locale,
  });

  const baseQuery = new URLSearchParams();
  if (transactionType) baseQuery.set('transaction_type', transactionType);
  if (propertyType) baseQuery.set('property_type', propertyType);
  if (ward) baseQuery.set('ward', ward);
  const hasFilter = Boolean(transactionType || propertyType || ward);
  const copy = getHubPageCopy(locale, 'real-estate');

  return (
    <section>
      <header className={placesStyles.pageHeader}>
        <h1 className={placesStyles.pageTitle}>{copy.h1}</h1>
        <p className={placesStyles.pageLede}>{copy.description}</p>
      </header>

      <RealEstateFilters total={meta.total} />

      {listings.length === 0 ? (
        <div className={placesStyles.state}>
          <p className={placesStyles.stateTitle}>
            {hasFilter ? EMPTY_COPY[locale].filteredTitle : EMPTY_COPY[locale].emptyTitle}
          </p>
          <p>{hasFilter ? EMPTY_COPY[locale].filteredBody : EMPTY_COPY[locale].emptyBody}</p>
        </div>
      ) : (
        <>
          <div className={placesStyles.grid}>
            {listings.map((l) => (
              <RealEstateListingCard key={l.id} listing={l} locale={locale} />
            ))}
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            basePath={localizedHref(locale, '/real-estate')}
            baseQuery={baseQuery.toString()}
            locale={locale}
          />
        </>
      )}
    </section>
  );
}
