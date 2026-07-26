'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { HOTEL_SORT_VALUES, type HotelSort } from './types';
import styles from './hotels.module.css';

const SORT_LABELS: Record<HotelSort, string> = {
  rating_desc: 'Đánh giá cao nhất',
  name_asc: 'Tên A → Z',
};

interface Props {
  total: number;
}

// Client Component: đổi sort/stars → điều hướng lại /hotels với query string mới (page reset về
// 1 vì bộ lọc thay đổi làm tổng số trang thay đổi). Danh sách thật được fetch ở Server Component
// cha (page.tsx) — component này chỉ đọc/ghi URL, không tự gọi API.
export function HotelFilters({ total }: Props) {
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
    router.push(`/hotels${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="hotel-sort">
          Sắp xếp
        </label>
        <select
          id="hotel-sort"
          className={styles.select}
          value={searchParams.get('sort') ?? 'rating_desc'}
          onChange={(e) => updateParam('sort', e.target.value)}
        >
          {HOTEL_SORT_VALUES.map((v) => (
            <option key={v} value={v}>
              {SORT_LABELS[v]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="hotel-stars">
          Hạng sao
        </label>
        <select
          id="hotel-stars"
          className={styles.select}
          value={searchParams.get('stars') ?? ''}
          onChange={(e) => updateParam('stars', e.target.value)}
        >
          <option value="">Tất cả</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} sao
            </option>
          ))}
        </select>
      </div>

      <span className={styles.resultCount}>{total} khách sạn</span>
    </div>
  );
}
