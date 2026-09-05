'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { BEACH_SORT_VALUES, type BeachSort } from './types';
import { PHU_QUOC_WARDS } from '@/modules/places/wards';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref, type Locale } from '@/lib/locale';
import { COMMON_SORT_LABELS, PRICE_RANGE_LABELS, getFilterChrome, type PriceRangeValue } from '@/lib/filters.copy';
import styles from '@/components/ui/ui.module.css';

const SORT_LABELS: Record<Locale, Record<BeachSort, string>> = {
  vi: COMMON_SORT_LABELS.vi,
  en: COMMON_SORT_LABELS.en,
};

// Đúng 4 giá trị enum `price_range` của DB. Với dữ liệu hiện tại, bãi biển chỉ có `free` hoặc
// NULL nên ba lựa chọn còn lại trả về 0 kết quả — đó là kết quả THẬT của bộ lọc, không phải lỗi;
// giữ đủ enum để trang này không nói dối về tập giá trị mà backend chấp nhận.
const PRICE_RANGE_VALUES: PriceRangeValue[] = ['free', 'low', 'mid', 'high'];

const RESULT_UNIT: Record<Locale, string> = { vi: 'bãi biển', en: 'beaches' };

interface Props {
  total: number;
}

// Client Component: đổi sort/ward/price_range → điều hướng lại /beaches với query string mới
// (page reset về 1 vì bộ lọc thay đổi làm tổng số trang thay đổi). Danh sách thật được fetch ở
// Server Component cha (page.tsx) — component này chỉ đọc/ghi URL, không gọi API.
export function BeachFilters({ total }: Props) {
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
    router.push(`${localizedHref(locale, '/beaches')}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="beach-sort">
          {chrome.sortLabel}
        </label>
        <select
          id="beach-sort"
          className={styles.select}
          value={searchParams.get('sort') ?? 'rating_desc'}
          onChange={(e) => updateParam('sort', e.target.value)}
        >
          {BEACH_SORT_VALUES.map((v) => (
            <option key={v} value={v}>
              {SORT_LABELS[locale][v]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="beach-ward">
          {chrome.areaLabel}
        </label>
        <select
          id="beach-ward"
          className={styles.select}
          value={searchParams.get('ward') ?? ''}
          onChange={(e) => updateParam('ward', e.target.value)}
        >
          <option value="">{chrome.allOption}</option>
          {PHU_QUOC_WARDS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="beach-price-range">
          {chrome.priceLabel}
        </label>
        <select
          id="beach-price-range"
          className={styles.select}
          value={searchParams.get('price_range') ?? ''}
          onChange={(e) => updateParam('price_range', e.target.value)}
        >
          <option value="">{chrome.allOption}</option>
          {PRICE_RANGE_VALUES.map((v) => (
            <option key={v} value={v}>
              {PRICE_RANGE_LABELS[locale][v]}
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
