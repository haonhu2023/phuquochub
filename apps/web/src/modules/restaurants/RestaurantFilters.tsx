'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { RESTAURANT_SORT_VALUES, type RestaurantSort } from './types';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref, type Locale } from '@/lib/locale';
import { COMMON_SORT_LABELS, PRICE_RANGE_LABELS, getFilterChrome, type PriceRangeValue } from '@/lib/filters.copy';
import styles from '@/components/ui/ui.module.css';

const SORT_LABELS: Record<Locale, Record<RestaurantSort, string>> = {
  vi: { rating_desc: COMMON_SORT_LABELS.vi.rating_desc, name_asc: COMMON_SORT_LABELS.vi.name_asc },
  en: { rating_desc: COMMON_SORT_LABELS.en.rating_desc, name_asc: COMMON_SORT_LABELS.en.name_asc },
};

const PRICE_RANGE_VALUES: PriceRangeValue[] = ['free', 'low', 'mid', 'high'];

// Danh sách ẩm thực THAM CHIẾU MỞ (bảng `cuisines`, xem InitRestaurant migration) — không có
// endpoint tra cứu danh mục nào tồn tại để lấy động, nên khoá tạm theo đúng 5 giá trị đã seed.
// Thêm cuisine mới ở migration/seed sau này cần cập nhật danh sách này (backend KHÔNG whitelist
// — một code mới vẫn lọc đúng, chỉ dropdown FE chưa hiển thị được lựa chọn đó).
const CUISINE_OPTIONS: Record<Locale, Array<{ value: string; label: string }>> = {
  vi: [
    { value: 'seafood', label: 'Hải sản' },
    { value: 'vietnamese', label: 'Món Việt' },
    { value: 'bbq', label: 'Nướng' },
    { value: 'vegetarian', label: 'Chay' },
    { value: 'street_food', label: 'Ăn vặt' },
  ],
  en: [
    { value: 'seafood', label: 'Seafood' },
    { value: 'vietnamese', label: 'Vietnamese' },
    { value: 'bbq', label: 'BBQ / grilled' },
    { value: 'vegetarian', label: 'Vegetarian' },
    { value: 'street_food', label: 'Street food' },
  ],
};

const RESULT_UNIT: Record<Locale, string> = { vi: 'nhà hàng', en: 'restaurants' };
const CUISINE_FIELD_LABEL: Record<Locale, string> = { vi: 'Ẩm thực', en: 'Cuisine' };

interface Props {
  total: number;
}

// Client Component: đổi sort/price_range/cuisine → điều hướng lại /restaurants với query string
// mới (page reset về 1 vì bộ lọc thay đổi làm tổng số trang thay đổi). Danh sách thật được fetch
// ở Server Component cha (page.tsx) — component này chỉ đọc/ghi URL, không tự gọi API.
export function RestaurantFilters({ total }: Props) {
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
    router.push(`${localizedHref(locale, '/restaurants')}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="restaurant-sort">
          {chrome.sortLabel}
        </label>
        <select
          id="restaurant-sort"
          className={styles.select}
          value={searchParams.get('sort') ?? 'rating_desc'}
          onChange={(e) => updateParam('sort', e.target.value)}
        >
          {RESTAURANT_SORT_VALUES.map((v) => (
            <option key={v} value={v}>
              {SORT_LABELS[locale][v]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="restaurant-price-range">
          {chrome.priceLabel}
        </label>
        <select
          id="restaurant-price-range"
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

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="restaurant-cuisine">
          {CUISINE_FIELD_LABEL[locale]}
        </label>
        <select
          id="restaurant-cuisine"
          className={styles.select}
          value={searchParams.get('cuisine') ?? ''}
          onChange={(e) => updateParam('cuisine', e.target.value)}
        >
          <option value="">{chrome.allOption}</option>
          {CUISINE_OPTIONS[locale].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
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
