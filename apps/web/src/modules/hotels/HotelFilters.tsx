'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { HOTEL_SORT_VALUES, type HotelSort } from './types';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref, type Locale } from '@/lib/locale';
import { COMMON_SORT_LABELS, getFilterChrome } from '@/lib/filters.copy';
import styles from '@/components/ui/ui.module.css';

const SORT_LABELS: Record<Locale, Record<HotelSort, string>> = {
  vi: { rating_desc: COMMON_SORT_LABELS.vi.rating_desc, name_asc: COMMON_SORT_LABELS.vi.name_asc },
  en: { rating_desc: COMMON_SORT_LABELS.en.rating_desc, name_asc: COMMON_SORT_LABELS.en.name_asc },
};

const RESULT_UNIT: Record<Locale, string> = { vi: 'khách sạn', en: 'hotels' };
const STARS_UNIT: Record<Locale, string> = { vi: 'sao', en: 'stars' };
const STARS_FIELD_LABEL: Record<Locale, string> = { vi: 'Hạng sao', en: 'Star rating' };

interface Props {
  total: number;
}

// Client Component: đổi sort/stars → điều hướng lại /hotels với query string mới (page reset về
// 1 vì bộ lọc thay đổi làm tổng số trang thay đổi). Danh sách thật được fetch ở Server Component
// cha (page.tsx) — component này chỉ đọc/ghi URL, không tự gọi API.
export function HotelFilters({ total }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const chrome = getFilterChrome(locale);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    router.push(`${localizedHref(locale, '/hotels')}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="hotel-sort">
          {chrome.sortLabel}
        </label>
        <select
          id="hotel-sort"
          className={styles.select}
          value={searchParams.get('sort') ?? 'rating_desc'}
          onChange={(e) => updateParam('sort', e.target.value)}
        >
          {HOTEL_SORT_VALUES.map((v) => (
            <option key={v} value={v}>
              {SORT_LABELS[locale][v]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="hotel-stars">
          {STARS_FIELD_LABEL[locale]}
        </label>
        <select
          id="hotel-stars"
          className={styles.select}
          value={searchParams.get('stars') ?? ''}
          onChange={(e) => updateParam('stars', e.target.value)}
        >
          <option value="">{chrome.allOption}</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} {STARS_UNIT[locale]}
            </option>
          ))}
        </select>
      </div>

      <span className={styles.resultCount}>
        {total} {RESULT_UNIT[locale]}
      </span>
    </div>
  );
}
