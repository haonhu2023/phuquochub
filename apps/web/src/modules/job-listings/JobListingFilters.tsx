'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { JOB_LISTING_EMPLOYMENT_TYPES, jobListingEmploymentTypeLabel } from './types';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref } from '@/lib/locale';
import styles from '@/components/ui/ui.module.css';

const LABELS = {
  vi: { total: (n: number) => `${n} tin tuyển dụng`, category: 'Ngành nghề', ward: 'Khu vực', type: 'Hình thức', all: 'Tất cả' },
  en: { total: (n: number) => `${n} job listings`, category: 'Category', ward: 'Area', type: 'Employment type', all: 'All' },
};

interface Props {
  total: number;
}

// Cùng khuôn RestaurantFilters: đổi filter → điều hướng lại /jobs với query string mới, page reset
// về 1. job_category/ward là text tự do (không có danh mục cố định cho MVP, xem §13r) nên dùng
// input text, không select — khác employment_type (3 giá trị cố định, backend validate enum).
export function JobListingFilters({ total }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = LABELS[locale];

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    router.push(`${localizedHref(locale, '/jobs')}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className={styles.toolbar}>
      <p style={{ margin: 0, alignSelf: 'center' }}>{t.total(total)}</p>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="job-category">
          {t.category}
        </label>
        <input
          id="job-category"
          className={styles.select}
          type="text"
          defaultValue={searchParams.get('job_category') ?? ''}
          onBlur={(e) => updateParam('job_category', e.target.value.trim())}
          maxLength={80}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="job-ward">
          {t.ward}
        </label>
        <input
          id="job-ward"
          className={styles.select}
          type="text"
          defaultValue={searchParams.get('ward') ?? ''}
          onBlur={(e) => updateParam('ward', e.target.value.trim())}
          maxLength={80}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="job-employment-type">
          {t.type}
        </label>
        <select
          id="job-employment-type"
          className={styles.select}
          value={searchParams.get('employment_type') ?? ''}
          onChange={(e) => updateParam('employment_type', e.target.value)}
        >
          <option value="">{t.all}</option>
          {JOB_LISTING_EMPLOYMENT_TYPES.map((v) => (
            <option key={v} value={v}>
              {jobListingEmploymentTypeLabel(v, locale)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
