import { notFound } from 'next/navigation';
import { getJobListing } from '@/modules/job-listings/api/job-listings.api';
import { jobListingEmploymentTypeLabel } from '@/modules/job-listings/types';
import { formatSalary } from '@/modules/job-listings/salary';
import { ApiError } from '@/lib/http';
import { localizedHref, type Locale } from '@/lib/locale';
import { SaveButton } from '@/modules/saved-items/SaveButton';
import { ReportButton } from '@/modules/listing-reports/ReportButton';
import placesStyles from '@/modules/places/places.module.css';

interface Params {
  params: Promise<{ id: string; locale: string }>;
}

export async function generateMetadata({ params }: Params) {
  const { id, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  try {
    const job = await getJobListing(id);
    return {
      title: `${job.title} · ${job.employer_name} · Tuyển dụng · PhuQuocHub`,
      description: job.description ?? undefined,
      alternates: { canonical: localizedHref(locale, `/jobs/${job.id}`) },
    };
  } catch {
    return { title: 'Tuyển dụng · PhuQuocHub' };
  }
}

// Chi tiết tin tuyển dụng công khai — 404 đồng nhất "không tồn tại" và "chưa/không còn công khai"
// (API cố tình không phân biệt, xem JobListingsService.getPublicById()'s comment). Không có nút
// "Ứng tuyển" gửi qua hệ thống — người tìm việc liên hệ TRỰC TIẾP qua contact_method/contact_value,
// đúng phạm vi MVP đã chốt (§13r: không xây luồng nộp hồ sơ nào cho đợt này).
export default async function JobListingDetailPage({ params }: Params) {
  const { id, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  let job;
  try {
    job = await getJobListing(id);
  } catch (err) {
    if (err instanceof ApiError && err.isNotFound) {
      notFound();
    }
    throw err;
  }

  return (
    <article>
      <header className={placesStyles.pageHeader}>
        <h1 className={placesStyles.pageTitle}>{job.title}</h1>
        <p className={placesStyles.pageLede}>
          {job.employer_name}
          {job.employer_role ? ` · ${job.employer_role}` : ''}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <SaveButton targetType="job_listing" targetId={job.id} locale={locale} />
          <ReportButton targetType="job_listing" targetId={job.id} />
        </div>
      </header>

      <dl>
        <div className={placesStyles.infoItem}>
          <dt>{locale === 'en' ? 'Location' : 'Nơi làm việc'}</dt>
          <dd>
            {job.work_location}
            {job.ward ? ` (${job.ward})` : ''}
          </dd>
        </div>
        <div className={placesStyles.infoItem}>
          <dt>{locale === 'en' ? 'Employment type' : 'Hình thức'}</dt>
          <dd>{jobListingEmploymentTypeLabel(job.employment_type, locale)}</dd>
        </div>
        <div className={placesStyles.infoItem}>
          <dt>{locale === 'en' ? 'Salary' : 'Mức lương'}</dt>
          <dd>{formatSalary(job, locale)}</dd>
        </div>
        {job.shift_info && (
          <div className={placesStyles.infoItem}>
            <dt>{locale === 'en' ? 'Shift' : 'Ca làm việc'}</dt>
            <dd>{job.shift_info}</dd>
          </div>
        )}
      </dl>

      {job.description && (
        <section>
          <h2>{locale === 'en' ? 'Description' : 'Mô tả công việc'}</h2>
          <p>{job.description}</p>
        </section>
      )}
      {job.requirements && (
        <section>
          <h2>{locale === 'en' ? 'Requirements' : 'Yêu cầu'}</h2>
          <p>{job.requirements}</p>
        </section>
      )}
      {job.benefits && (
        <section>
          <h2>{locale === 'en' ? 'Benefits' : 'Quyền lợi'}</h2>
          <p>{job.benefits}</p>
        </section>
      )}

      <section className={placesStyles.state}>
        <p className={placesStyles.stateTitle}>{locale === 'en' ? 'Contact' : 'Liên hệ'}</p>
        <p>
          {job.contact_method}: <strong>{job.contact_value}</strong>
        </p>
      </section>
    </article>
  );
}
