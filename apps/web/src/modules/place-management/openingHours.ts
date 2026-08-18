import type { OpeningHours, OpeningHoursRange } from '@phuquochub/shared-types';

// Chuyển đổi thuần giữa OpeningHours (hợp đồng dây, khớp apps/api/src/common/opening-hours.ts
// IsOpeningHours) và form state của PlaceForm. Tách khỏi React để test trực tiếp, không cần render.
//
// PHẠM VI UI (Business Dashboard MVP — Opening Hours task): form chỉnh `regular` (7 ngày, nhiều
// khung/ngày, mảng rỗng = đóng cửa), `is_24h`, `note`. `timezone`/`exceptions`/khoá lạ KHÔNG có UI
// chỉnh sửa ở form này — formStateToOpeningHours() GIỮ NGUYÊN các trường đó từ dữ liệu gốc
// (spread `...original` trước khi ghi đè), không phát minh ngữ nghĩa mới, không âm thầm xoá dữ
// liệu mà form không hiển thị.

// Từ vựng thứ trong tuần khai MỘT lần ở `modules/places/openingHours.ts` (đường đọc) và dùng lại
// ở đây (đường ghi) — cùng chiều phụ thuộc place-management → places đã có với `places/wards.ts`.
// Hai bản sao của cùng bộ nhãn tiếng Việt chắc chắn sẽ lệch nhau; giữ đúng một bản.
//
// Tên `WEEKDAYS`/`Weekday` GIỮ NGUYÊN (re-export có đổi tên) để mọi import sẵn có của form —
// PlaceForm.tsx và test của nó — không phải sửa gì.
import {
  WEEKDAY_KEYS as WEEKDAYS,
  WEEKDAY_LABELS,
  type WeekdayKey as Weekday,
} from '@/modules/places/openingHours';

export { WEEKDAYS, WEEKDAY_LABELS };
export type { Weekday };

export type OpeningHoursRegularForm = Record<Weekday, OpeningHoursRange[]>;

export interface OpeningHoursFormState {
  is24h: boolean;
  note: string;
  regular: OpeningHoursRegularForm;
}

export function emptyOpeningHoursFormState(): OpeningHoursFormState {
  return {
    is24h: false,
    note: '',
    regular: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
  };
}

/** Đọc opening_hours hiện có (có thể null — địa điểm chưa từng đặt giờ) thành form state. */
export function openingHoursToFormState(oh: OpeningHours | null | undefined): OpeningHoursFormState {
  const base = emptyOpeningHoursFormState();
  if (!oh) return base;
  base.is24h = oh.is_24h === true;
  base.note = oh.note ?? '';
  for (const day of WEEKDAYS) {
    base.regular[day] = (oh.regular?.[day] ?? []).map((r) => ({ open: r.open, close: r.close }));
  }
  return base;
}

export interface OpeningHoursRangeError {
  day: Weekday;
  index: number;
}

/**
 * Khung giờ thiếu open hoặc close (input time để trống) — CHẶN submit. Định dạng HH:MM đã do
 * chính `<input type="time">` đảm bảo (trình duyệt không cho gõ giá trị sai định dạng), và
 * backend CỐ Ý không kiểm open<close (khung qua đêm 22:00→02:00 hợp lệ — common/opening-hours.ts)
 * nên KHÔNG kiểm thêm ở đây, tránh chặt hơn backend.
 */
export function validateOpeningHoursForm(state: OpeningHoursFormState): OpeningHoursRangeError[] {
  const errors: OpeningHoursRangeError[] = [];
  for (const day of WEEKDAYS) {
    state.regular[day].forEach((range, index) => {
      if (!range.open || !range.close) {
        errors.push({ day, index });
      }
    });
  }
  return errors;
}

/**
 * Gộp form state vào opening_hours GỐC — giữ nguyên timezone/exceptions/khoá lạ mà form không có
 * UI chỉnh sửa. Luôn trả về một object hợp lệ (KHÔNG null — UpdatePlaceDto.opening_hours không
 * nullable, `{}` mới là "trống" hợp lệ theo IsOpeningHours, không phải null).
 */
export function formStateToOpeningHours(
  state: OpeningHoursFormState,
  original: OpeningHours | null | undefined,
): OpeningHours {
  const result: OpeningHours = { ...(original ?? {}) };
  result.is_24h = state.is24h;
  const trimmedNote = state.note.trim();
  if (trimmedNote) {
    result.note = trimmedNote;
  } else {
    delete result.note;
  }
  const regular: NonNullable<OpeningHours['regular']> = {};
  for (const day of WEEKDAYS) {
    regular[day] = state.regular[day].map((r) => ({ open: r.open, close: r.close }));
  }
  result.regular = regular;
  return result;
}
