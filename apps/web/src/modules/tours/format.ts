import type { Locale } from '@/lib/locale';
import type { TourDifficulty, TourType } from './types';

// Nhãn hiển thị cho enum ĐÓNG của Tour (khớp migration InitTour). Record ép exhaustive:
// thêm/bớt giá trị trong TOUR_TYPE_VALUES/TOUR_DIFFICULTY_VALUES sẽ báo lỗi type nếu quên map.
const TOUR_TYPE_LABELS: Record<Locale, Record<TourType, string>> = {
  vi: {
    diving: 'Lặn biển',
    fishing: 'Câu cá',
    trekking: 'Trekking',
    sightseeing: 'Tham quan',
    cruise: 'Du thuyền',
    other: 'Khác',
  },
  en: {
    diving: 'Diving',
    fishing: 'Fishing',
    trekking: 'Trekking',
    sightseeing: 'Sightseeing',
    cruise: 'Cruise',
    other: 'Other',
  },
};

const TOUR_DIFFICULTY_LABELS: Record<Locale, Record<TourDifficulty, string>> = {
  vi: { easy: 'Dễ', moderate: 'Trung bình', hard: 'Khó' },
  en: { easy: 'Easy', moderate: 'Moderate', hard: 'Hard' },
};

/** Giá trị ngoài whitelist → trả nguyên chuỗi (không nuốt dữ liệu), null/rỗng → null. */
export function formatTourType(value: string | null | undefined, locale: Locale = 'vi'): string | null {
  if (!value) return null;
  return TOUR_TYPE_LABELS[locale][value as TourType] ?? value;
}

export function formatDifficulty(value: string | null | undefined, locale: Locale = 'vi'): string | null {
  if (!value) return null;
  return TOUR_DIFFICULTY_LABELS[locale][value as TourDifficulty] ?? value;
}

/**
 * Thời lượng phút → nhãn ("90 phút"/"90 min", "4 giờ"/"4h", "4 giờ 30 phút"/"4h 30min"). KHÔNG quy
 * đổi sang "ngày": một tour 480 phút là tour trong ngày, không phải "nửa ngày lưu trú" — dữ liệu
 * chỉ nói số phút, không nói qua đêm hay không.
 */
export function formatDuration(minutes: number | null | undefined, locale: Locale = 'vi'): string | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  if (locale === 'en') {
    if (hours === 0) return `${mins} min`;
    return mins === 0 ? `${hours}h` : `${hours}h ${mins}min`;
  }
  if (hours === 0) return `${mins} phút`;
  return mins === 0 ? `${hours} giờ` : `${hours} giờ ${mins} phút`;
}
