'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { TOUR_SORT_VALUES, type TourSort } from './types';
import { PHU_QUOC_WARDS } from '@/modules/places/wards';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref } from '@/lib/locale';
import styles from '@/components/ui/ui.module.css';

const SORT_LABELS: Record<TourSort, string> = {
  rating_desc: 'Đánh giá cao nhất',
  name_asc: 'Tên A → Z',
  duration_asc: 'Thời lượng ngắn nhất',
};

// Enum ĐÓNG ở DB (migration InitTour) — an toàn để liệt kê cứng, thêm giá trị mới bắt buộc phải
// qua migration nên không thể lệch âm thầm.
const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'diving', label: 'Lặn biển' },
  { value: 'fishing', label: 'Câu cá' },
  { value: 'trekking', label: 'Trekking' },
  { value: 'sightseeing', label: 'Tham quan' },
  { value: 'cruise', label: 'Du thuyền' },
  { value: 'other', label: 'Khác' },
];

const DIFFICULTY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'easy', label: 'Dễ' },
  { value: 'moderate', label: 'Trung bình' },
  { value: 'hard', label: 'Khó' },
];

const PRICE_RANGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'free', label: 'Miễn phí' },
  { value: 'low', label: 'Bình dân' },
  { value: 'mid', label: 'Tầm trung' },
  { value: 'high', label: 'Cao cấp' },
];

// Backend nhận `max_duration_minutes` là SỐ PHÚT bất kỳ (≥1); các mốc dưới đây chỉ là lựa chọn
// nhanh của UI cho tour trong ngày, không phải enum phía server.
const DURATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '120', label: 'Tối đa 2 giờ' },
  { value: '240', label: 'Tối đa 4 giờ' },
  { value: '480', label: 'Tối đa 8 giờ' },
];

// Khu vực khởi hành = `places.ward` — dùng chung danh sách ward với Attractions/Beaches
// (modules/places/wards.ts), nơi ghi rõ vì sao danh sách này là tĩnh.

interface Props {
  total: number;
}

// Client Component: đổi bộ lọc/sort → điều hướng lại /tours với query string mới (page reset về 1
// vì bộ lọc thay đổi làm tổng số trang thay đổi). Danh sách thật được fetch ở Server Component
// cha (page.tsx) — component này chỉ đọc/ghi URL, không tự gọi API.
export function TourFilters({ total }: Props) {
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
    router.push(`${localizedHref(locale, '/tours')}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tour-sort">
          Sắp xếp
        </label>
        <select
          id="tour-sort"
          className={styles.select}
          value={searchParams.get('sort') ?? 'rating_desc'}
          onChange={(e) => updateParam('sort', e.target.value)}
        >
          {TOUR_SORT_VALUES.map((v) => (
            <option key={v} value={v}>
              {SORT_LABELS[v]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tour-type">
          Loại tour
        </label>
        <select
          id="tour-type"
          className={styles.select}
          value={searchParams.get('type') ?? ''}
          onChange={(e) => updateParam('type', e.target.value)}
        >
          <option value="">Tất cả</option>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tour-difficulty">
          Độ khó
        </label>
        <select
          id="tour-difficulty"
          className={styles.select}
          value={searchParams.get('difficulty') ?? ''}
          onChange={(e) => updateParam('difficulty', e.target.value)}
        >
          <option value="">Tất cả</option>
          {DIFFICULTY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tour-duration">
          Thời lượng
        </label>
        <select
          id="tour-duration"
          className={styles.select}
          value={searchParams.get('max_duration_minutes') ?? ''}
          onChange={(e) => updateParam('max_duration_minutes', e.target.value)}
        >
          <option value="">Tất cả</option>
          {DURATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tour-price-range">
          Mức giá
        </label>
        <select
          id="tour-price-range"
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
        <label className={styles.fieldLabel} htmlFor="tour-departure-area">
          Khu vực khởi hành
        </label>
        <select
          id="tour-departure-area"
          className={styles.select}
          value={searchParams.get('departure_area') ?? ''}
          onChange={(e) => updateParam('departure_area', e.target.value)}
        >
          <option value="">Tất cả</option>
          {PHU_QUOC_WARDS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>

      <span className={styles.resultCount}>{total} tour</span>
    </div>
  );
}
