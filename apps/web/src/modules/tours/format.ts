import type { TourDifficulty, TourType } from './types';

// Nhãn hiển thị tiếng Việt cho enum ĐÓNG của Tour (khớp migration InitTour). Record ép exhaustive:
// thêm/bớt giá trị trong TOUR_TYPE_VALUES/TOUR_DIFFICULTY_VALUES sẽ báo lỗi type nếu quên map.
const TOUR_TYPE_LABELS: Record<TourType, string> = {
  diving: 'Lặn biển',
  fishing: 'Câu cá',
  trekking: 'Trekking',
  sightseeing: 'Tham quan',
  cruise: 'Du thuyền',
  other: 'Khác',
};

const TOUR_DIFFICULTY_LABELS: Record<TourDifficulty, string> = {
  easy: 'Dễ',
  moderate: 'Trung bình',
  hard: 'Khó',
};

/** Giá trị ngoài whitelist → trả nguyên chuỗi (không nuốt dữ liệu), null/rỗng → null. */
export function formatTourType(value: string | null | undefined): string | null {
  if (!value) return null;
  return TOUR_TYPE_LABELS[value as TourType] ?? value;
}

export function formatDifficulty(value: string | null | undefined): string | null {
  if (!value) return null;
  return TOUR_DIFFICULTY_LABELS[value as TourDifficulty] ?? value;
}

/**
 * Thời lượng phút → nhãn tiếng Việt ("90 phút", "4 giờ", "4 giờ 30 phút"). KHÔNG quy đổi sang
 * "ngày": một tour 480 phút là tour trong ngày, không phải "nửa ngày lưu trú" — dữ liệu chỉ nói
 * số phút, không nói qua đêm hay không.
 */
export function formatDuration(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  if (hours === 0) return `${mins} phút`;
  return mins === 0 ? `${hours} giờ` : `${hours} giờ ${mins} phút`;
}
