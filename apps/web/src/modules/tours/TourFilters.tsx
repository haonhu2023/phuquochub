'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { TOUR_SORT_VALUES, type TourSort } from './types';
import { PHU_QUOC_WARDS } from '@/modules/places/wards';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref, type Locale } from '@/lib/locale';
import { COMMON_SORT_LABELS, PRICE_RANGE_LABELS, getFilterChrome, type PriceRangeValue } from '@/lib/filters.copy';
import styles from '@/components/ui/ui.module.css';

const SORT_LABELS: Record<Locale, Record<TourSort, string>> = {
  vi: { ...COMMON_SORT_LABELS.vi, duration_asc: 'Thời lượng ngắn nhất' },
  en: { ...COMMON_SORT_LABELS.en, duration_asc: 'Shortest duration' },
};

// Enum ĐÓNG ở DB (migration InitTour) — an toàn để liệt kê cứng, thêm giá trị mới bắt buộc phải
// qua migration nên không thể lệch âm thầm.
const TYPE_OPTIONS: Record<Locale, Array<{ value: string; label: string }>> = {
  vi: [
    { value: 'diving', label: 'Lặn biển' },
    { value: 'fishing', label: 'Câu cá' },
    { value: 'trekking', label: 'Trekking' },
    { value: 'sightseeing', label: 'Tham quan' },
    { value: 'cruise', label: 'Du thuyền' },
    { value: 'other', label: 'Khác' },
  ],
  en: [
    { value: 'diving', label: 'Diving' },
    { value: 'fishing', label: 'Fishing' },
    { value: 'trekking', label: 'Trekking' },
    { value: 'sightseeing', label: 'Sightseeing' },
    { value: 'cruise', label: 'Cruise' },
    { value: 'other', label: 'Other' },
  ],
};

const DIFFICULTY_OPTIONS: Record<Locale, Array<{ value: string; label: string }>> = {
  vi: [
    { value: 'easy', label: 'Dễ' },
    { value: 'moderate', label: 'Trung bình' },
    { value: 'hard', label: 'Khó' },
  ],
  en: [
    { value: 'easy', label: 'Easy' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'hard', label: 'Hard' },
  ],
};

const PRICE_RANGE_VALUES: PriceRangeValue[] = ['free', 'low', 'mid', 'high'];

// Backend nhận `max_duration_minutes` là SỐ PHÚT bất kỳ (≥1); các mốc dưới đây chỉ là lựa chọn
// nhanh của UI cho tour trong ngày, không phải enum phía server.
const DURATION_OPTIONS: Record<Locale, Array<{ value: string; label: string }>> = {
  vi: [
    { value: '120', label: 'Tối đa 2 giờ' },
    { value: '240', label: 'Tối đa 4 giờ' },
    { value: '480', label: 'Tối đa 8 giờ' },
  ],
  en: [
    { value: '120', label: 'Up to 2 hours' },
    { value: '240', label: 'Up to 4 hours' },
    { value: '480', label: 'Up to 8 hours' },
  ],
};

// Khu vực khởi hành = `places.ward` — dùng chung danh sách ward với Attractions/Beaches
// (modules/places/wards.ts), nơi ghi rõ vì sao danh sách này là tĩnh.

const RESULT_UNIT: Record<Locale, string> = { vi: 'tour', en: 'tours' };
const TYPE_FIELD_LABEL: Record<Locale, string> = { vi: 'Loại tour', en: 'Tour type' };
const DIFFICULTY_FIELD_LABEL: Record<Locale, string> = { vi: 'Độ khó', en: 'Difficulty' };
const DURATION_FIELD_LABEL: Record<Locale, string> = { vi: 'Thời lượng', en: 'Duration' };
const DEPARTURE_AREA_FIELD_LABEL: Record<Locale, string> = { vi: 'Khu vực khởi hành', en: 'Departure area' };

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
  const chrome = getFilterChrome(locale);

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
          {chrome.sortLabel}
        </label>
        <select
          id="tour-sort"
          className={styles.select}
          value={searchParams.get('sort') ?? 'rating_desc'}
          onChange={(e) => updateParam('sort', e.target.value)}
        >
          {TOUR_SORT_VALUES.map((v) => (
            <option key={v} value={v}>
              {SORT_LABELS[locale][v]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tour-type">
          {TYPE_FIELD_LABEL[locale]}
        </label>
        <select
          id="tour-type"
          className={styles.select}
          value={searchParams.get('type') ?? ''}
          onChange={(e) => updateParam('type', e.target.value)}
        >
          <option value="">{chrome.allOption}</option>
          {TYPE_OPTIONS[locale].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tour-difficulty">
          {DIFFICULTY_FIELD_LABEL[locale]}
        </label>
        <select
          id="tour-difficulty"
          className={styles.select}
          value={searchParams.get('difficulty') ?? ''}
          onChange={(e) => updateParam('difficulty', e.target.value)}
        >
          <option value="">{chrome.allOption}</option>
          {DIFFICULTY_OPTIONS[locale].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tour-duration">
          {DURATION_FIELD_LABEL[locale]}
        </label>
        <select
          id="tour-duration"
          className={styles.select}
          value={searchParams.get('max_duration_minutes') ?? ''}
          onChange={(e) => updateParam('max_duration_minutes', e.target.value)}
        >
          <option value="">{chrome.allOption}</option>
          {DURATION_OPTIONS[locale].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tour-price-range">
          {chrome.priceLabel}
        </label>
        <select
          id="tour-price-range"
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
        <label className={styles.fieldLabel} htmlFor="tour-departure-area">
          {DEPARTURE_AREA_FIELD_LABEL[locale]}
        </label>
        <select
          id="tour-departure-area"
          className={styles.select}
          value={searchParams.get('departure_area') ?? ''}
          onChange={(e) => updateParam('departure_area', e.target.value)}
        >
          <option value="">{chrome.allOption}</option>
          {PHU_QUOC_WARDS.map((w) => (
            <option key={w} value={w}>
              {w}
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
