'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Category } from '@/modules/categories/api/categories.api';
import { PHU_QUOC_WARDS } from '@/modules/places/wards';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref, type Locale } from '@/lib/locale';
import { PRICE_RANGE_LABELS, getFilterChrome, type PriceRangeValue } from '@/lib/filters.copy';
import styles from '@/components/ui/ui.module.css';

const PRICE_RANGE_VALUES: PriceRangeValue[] = ['free', 'low', 'mid', 'high'];

const CATEGORY_FIELD_LABEL: Record<Locale, string> = { vi: 'Danh mục', en: 'Category' };
const RESULT_UNIT: Record<Locale, string> = { vi: 'kết quả', en: 'results' };

// `category.name_en` là field THẬT của API `/categories` (không phải bịa) — danh mục là taxonomy
// nhỏ, cố định, KHÁC với nội dung place/hotel/restaurant/tour (chưa có bản dịch được duyệt).
// Vẫn fallback về `name_vi` nếu một danh mục cụ thể chưa có `name_en` (API cho phép null).
function categoryLabel(c: Category, locale: Locale): string {
  return (locale === 'en' && c.name_en) || c.name_vi;
}

interface Props {
  total: number;
  categories: Category[];
}

// Client Component: đổi category/ward/price_range → điều hướng lại /search với query string mới,
// GIỮ NGUYÊN `q` (đã có sẵn trong searchParams hiện tại, không bị xoá vì ta chỉ set/delete đúng
// key đang đổi) và reset `page` về 1 vì bộ lọc thay đổi làm tổng số trang thay đổi. Cùng convention
// AttractionFilters/HotelFilters/TourFilters — component này chỉ đọc/ghi URL, không tự gọi API.
export function SearchFilters({ total, categories }: Props) {
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
    router.push(`${localizedHref(locale, '/search')}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="search-category">
          {CATEGORY_FIELD_LABEL[locale]}
        </label>
        <select
          id="search-category"
          className={styles.select}
          value={searchParams.get('category') ?? ''}
          onChange={(e) => updateParam('category', e.target.value)}
        >
          <option value="">{chrome.allOption}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryLabel(c, locale)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="search-ward">
          {chrome.areaLabel}
        </label>
        <select
          id="search-ward"
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
        <label className={styles.fieldLabel} htmlFor="search-price-range">
          {chrome.priceLabel}
        </label>
        <select
          id="search-price-range"
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
