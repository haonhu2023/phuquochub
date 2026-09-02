'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Category } from '@/modules/categories/api/categories.api';
import { PHU_QUOC_WARDS } from '@/modules/places/wards';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref } from '@/lib/locale';
import styles from '@/components/ui/ui.module.css';

const PRICE_RANGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'free', label: 'Miễn phí' },
  { value: 'low', label: 'Bình dân' },
  { value: 'mid', label: 'Tầm trung' },
  { value: 'high', label: 'Cao cấp' },
];

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
          Danh mục
        </label>
        <select
          id="search-category"
          className={styles.select}
          value={searchParams.get('category') ?? ''}
          onChange={(e) => updateParam('category', e.target.value)}
        >
          <option value="">Tất cả</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name_vi}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="search-ward">
          Khu vực
        </label>
        <select
          id="search-ward"
          className={styles.select}
          value={searchParams.get('ward') ?? ''}
          onChange={(e) => updateParam('ward', e.target.value)}
        >
          <option value="">Tất cả</option>
          {PHU_QUOC_WARDS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="search-price-range">
          Mức giá
        </label>
        <select
          id="search-price-range"
          className={styles.select}
          value={searchParams.get('price_range') ?? ''}
          onChange={(e) => updateParam('price_range', e.target.value)}
        >
          <option value="">Tất cả</option>
          {PRICE_RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <span className={styles.resultCount}>{total} kết quả</span>
    </div>
  );
}
