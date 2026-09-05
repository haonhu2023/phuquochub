'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ATTRACTION_SORT_VALUES, type AttractionSort } from './types';
import { PHU_QUOC_WARDS } from '@/modules/places/wards';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref, type Locale } from '@/lib/locale';
import { COMMON_SORT_LABELS, PRICE_RANGE_LABELS, getFilterChrome, type PriceRangeValue } from '@/lib/filters.copy';
import styles from '@/components/ui/ui.module.css';

const SORT_LABELS: Record<Locale, Record<AttractionSort, string>> = {
  vi: COMMON_SORT_LABELS.vi,
  en: COMMON_SORT_LABELS.en,
};

const PRICE_RANGE_VALUES: PriceRangeValue[] = ['free', 'low', 'mid', 'high'];

const RESULT_UNIT: Record<Locale, string> = { vi: 'điểm tham quan', en: 'attractions' };

interface Props {
  total: number;
}

// Client Component: đổi sort/ward/price_range → điều hướng lại /attractions với query string
// mới (page reset về 1 vì bộ lọc thay đổi làm tổng số trang thay đổi). Danh sách thật được
// fetch ở Server Component cha (page.tsx) — component này chỉ đọc/ghi URL, không gọi API.
export function AttractionFilters({ total }: Props) {
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
    router.push(`${localizedHref(locale, '/attractions')}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="attraction-sort">
          {chrome.sortLabel}
        </label>
        <select
          id="attraction-sort"
          className={styles.select}
          value={searchParams.get('sort') ?? 'rating_desc'}
          onChange={(e) => updateParam('sort', e.target.value)}
        >
          {ATTRACTION_SORT_VALUES.map((v) => (
            <option key={v} value={v}>
              {SORT_LABELS[locale][v]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="attraction-ward">
          {chrome.areaLabel}
        </label>
        <select
          id="attraction-ward"
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
        <label className={styles.fieldLabel} htmlFor="attraction-price-range">
          {chrome.priceLabel}
        </label>
        <select
          id="attraction-price-range"
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
