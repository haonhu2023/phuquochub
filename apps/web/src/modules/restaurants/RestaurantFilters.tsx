'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { RESTAURANT_SORT_VALUES, type RestaurantSort } from './types';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref } from '@/lib/locale';
import styles from '@/components/ui/ui.module.css';

const SORT_LABELS: Record<RestaurantSort, string> = {
  rating_desc: 'Đánh giá cao nhất',
  name_asc: 'Tên A → Z',
};

const PRICE_RANGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'free', label: 'Miễn phí' },
  { value: 'low', label: 'Bình dân' },
  { value: 'mid', label: 'Tầm trung' },
  { value: 'high', label: 'Cao cấp' },
];

// Danh sách ẩm thực THAM CHIẾU MỞ (bảng `cuisines`, xem InitRestaurant migration) — không có
// endpoint tra cứu danh mục nào tồn tại để lấy động, nên khoá tạm theo đúng 5 giá trị đã seed.
// Thêm cuisine mới ở migration/seed sau này cần cập nhật danh sách này (backend KHÔNG whitelist
// — một code mới vẫn lọc đúng, chỉ dropdown FE chưa hiển thị được lựa chọn đó).
const CUISINE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'seafood', label: 'Hải sản' },
  { value: 'vietnamese', label: 'Món Việt' },
  { value: 'bbq', label: 'Nướng' },
  { value: 'vegetarian', label: 'Chay' },
  { value: 'street_food', label: 'Ăn vặt' },
];

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
          Sắp xếp
        </label>
        <select
          id="restaurant-sort"
          className={styles.select}
          value={searchParams.get('sort') ?? 'rating_desc'}
          onChange={(e) => updateParam('sort', e.target.value)}
        >
          {RESTAURANT_SORT_VALUES.map((v) => (
            <option key={v} value={v}>
              {SORT_LABELS[v]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="restaurant-price-range">
          Mức giá
        </label>
        <select
          id="restaurant-price-range"
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

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="restaurant-cuisine">
          Ẩm thực
        </label>
        <select
          id="restaurant-cuisine"
          className={styles.select}
          value={searchParams.get('cuisine') ?? ''}
          onChange={(e) => updateParam('cuisine', e.target.value)}
        >
          <option value="">Tất cả</option>
          {CUISINE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <span className={styles.resultCount}>{total} nhà hàng</span>
    </div>
  );
}
