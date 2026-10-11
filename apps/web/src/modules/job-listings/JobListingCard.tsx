import Link from 'next/link';
import type { JobListingPublicView } from './types';
import { jobListingEmploymentTypeLabel } from './types';
import { formatSalary } from './salary';
import { localizedHref, type Locale } from '@/lib/locale';
import placesStyles from '@/modules/places/places.module.css';

export function JobListingCard({ job, locale = 'vi' }: { job: JobListingPublicView; locale?: Locale }) {
  return (
    <Link href={localizedHref(locale, `/jobs/${job.id}`)} className={placesStyles.card}>
      <div className={placesStyles.cardBody}>
        <h2 className={placesStyles.cardTitle}>{job.title}</h2>
        <p className={placesStyles.cardDesc}>
          {job.employer_name}
          {job.ward ? ` · ${job.ward}` : ''}
        </p>
        <div className={placesStyles.cardMeta}>
          <span className={placesStyles.badge}>{job.job_category}</span>
          <span className={placesStyles.badge}>{jobListingEmploymentTypeLabel(job.employment_type, locale)}</span>
          <span className={placesStyles.price}>{formatSalary(job, locale)}</span>
        </div>
      </div>
    </Link>
  );
}
