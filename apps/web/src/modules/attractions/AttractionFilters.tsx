'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ATTRACTION_SORT_VALUES, type AttractionSort } from './types';
import styles from '@/components/ui/ui.module.css';

const SORT_LABELS: Record<AttractionSort, string> = {
  rating_desc: 'Đánh giá cao nhất',
  name_asc: 'Tên A → Z',
  newest: 'Mới thêm gần đây',
};

const PRICE_RANGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'free', label: 'Miễn phí' },
  { value: 'low', label: 'Bình dân' },
  { value: 'mid', label: 'Tầm trung' },
  { value: 'high', label: 'Cao cấp' },
];

// `places.ward` là varchar tự do, KHÔNG có endpoint tra cứu danh sách phường/xã (xây một cái
// nằm ngoài phạm vi trang browse). Khoá tạm theo đúng tập ward đã seed trong
// SeedInitialPlaces/SeedPlacesExpansion; ward mới ở seed sau này cần cập nhật danh sách này
// (backend KHÔNG whitelist — ward lạ vẫn lọc đúng, chỉ dropdown chưa có lựa chọn đó).
// TourFilters.tsx đang giữ một danh sách tương tự; mới hai nơi nên CHƯA tách dùng chung —
// đủ ba nơi và ổn định thì mới đáng trích ra một module tham chiếu.
const WARD_OPTIONS: string[] = [
  'An Thới',
  'Bãi Thơm',
  'Cửa Cạn',
  'Cửa Dương',
  'Dương Đông',
  'Dương Tơ',
  'Gành Dầu',
  'Hàm Ninh',
];

interface Props {
  total: number;
}

// Client Component: đổi sort/ward/price_range → điều hướng lại /attractions với query string
// mới (page reset về 1 vì bộ lọc thay đổi làm tổng số trang thay đổi). Danh sách thật được
// fetch ở Server Component cha (page.tsx) — component này chỉ đọc/ghi URL, không gọi API.
export function AttractionFilters({ total }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    router.push(`/attractions${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="attraction-sort">
          Sắp xếp
        </label>
        <select
          id="attraction-sort"
          className={styles.select}
          value={searchParams.get('sort') ?? 'rating_desc'}
          onChange={(e) => updateParam('sort', e.target.value)}
        >
          {ATTRACTION_SORT_VALUES.map((v) => (
            <option key={v} value={v}>
              {SORT_LABELS[v]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="attraction-ward">
          Khu vực
        </label>
        <select
          id="attraction-ward"
          className={styles.select}
          value={searchParams.get('ward') ?? ''}
          onChange={(e) => updateParam('ward', e.target.value)}
        >
          <option value="">Tất cả</option>
          {WARD_OPTIONS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="attraction-price-range">
          Mức giá
        </label>
        <select
          id="attraction-price-range"
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

      <span className={styles.resultCount}>{total} điểm tham quan</span>
    </div>
  );
}
