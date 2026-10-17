import type { Metadata } from 'next';
import { listJobListings } from '@/modules/job-listings/api/job-listings.api';
import { JobListingCard } from '@/modules/job-listings/JobListingCard';
import { JobListingFilters } from '@/modules/job-listings/JobListingFilters';
import type { JobListingEmploymentType } from '@/modules/job-listings/types';
import { JOB_LISTING_EMPLOYMENT_TYPES } from '@/modules/job-listings/types';
import { Pagination } from '@/components/ui/Pagination';
import { localizedHref, type Locale } from '@/lib/locale';
import { buildRouteAlternates } from '@/lib/seo';
import { getHubPageCopy } from '@/lib/hub-pages.copy';
import placesStyles from '@/modules/places/places.module.css';

const PAGE_SIZE = 20;

const EMPTY_COPY: Record<Locale, { filteredTitle: string; filteredBody: string; emptyTitle: string; emptyBody: string }> = {
  vi: {
    filteredTitle: 'Không có tin phù hợp',
    filteredBody: 'Không tìm thấy tin tuyển dụng khớp bộ lọc đã chọn. Thử bỏ bớt bộ lọc.',
    emptyTitle: 'Chưa có tin tuyển dụng nào',
    emptyBody: 'Hiện chưa có tin tuyển dụng được công khai. Vui lòng quay lại sau.',
  },
  en: {
    filteredTitle: 'No matching listings',
    filteredBody: 'No job listings match the selected filters. Try clearing some filters.',
    emptyTitle: 'No job listings yet',
    emptyBody: 'No job listings are published yet. Please check back soon.',
  },
};

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; job_category?: string; ward?: string; employment_type?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHubPageCopy(locale, 'jobs');
  return {
    title: `${copy.title} | PhuQuocHub`,
    description: copy.description,
    alternates: buildRouteAlternates(locale, '/jobs'),
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

function parseEmploymentType(raw: string | undefined): JobListingEmploymentType | undefined {
  return (JOB_LISTING_EMPLOYMENT_TYPES as readonly string[]).includes(raw ?? '')
    ? (raw as JobListingEmploymentType)
    : undefined;
}

// Server Component: danh sách tin tuyển dụng công khai (chỉ published, chưa hết hạn — lọc ở
// server, xem JobListingsRepository.publicQuery()). Lỗi API ném lên error.tsx (nút thử lại) —
// cùng quy ước /restaurants, /hotels; chỉ "0 kết quả" xử lý tại đây.
export default async function JobListingsPage({ params, searchParams }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const jobCategory = parseText(sp.job_category, 80);
  const ward = parseText(sp.ward, 80);
  const employmentType = parseEmploymentType(sp.employment_type);

  const { data: jobs, meta } = await listJobListings({
    page,
    limit: PAGE_SIZE,
    job_category: jobCategory,
    ward,
    employment_type: employmentType,
    locale,
  });

  const baseQuery = new URLSearchParams();
  if (jobCategory) baseQuery.set('job_category', jobCategory);
  if (ward) baseQuery.set('ward', ward);
  if (employmentType) baseQuery.set('employment_type', employmentType);
  const hasFilter = Boolean(jobCategory || ward || employmentType);
  const copy = getHubPageCopy(locale, 'jobs');

  return (
    <section>
      <header className={placesStyles.pageHeader}>
        <h1 className={placesStyles.pageTitle}>{copy.h1}</h1>
        <p className={placesStyles.pageLede}>{copy.description}</p>
      </header>

      <JobListingFilters total={meta.total} />

      {jobs.length === 0 ? (
        <div className={placesStyles.state}>
          <p className={placesStyles.stateTitle}>
            {hasFilter ? EMPTY_COPY[locale].filteredTitle : EMPTY_COPY[locale].emptyTitle}
          </p>
          <p>{hasFilter ? EMPTY_COPY[locale].filteredBody : EMPTY_COPY[locale].emptyBody}</p>
        </div>
      ) : (
        <>
          <div className={placesStyles.grid}>
            {jobs.map((j) => (
              <JobListingCard key={j.id} job={j} locale={locale} />
            ))}
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            basePath={localizedHref(locale, '/jobs')}
            baseQuery={baseQuery.toString()}
            locale={locale}
          />
        </>
      )}
    </section>
  );
}
