import type { OpeningHours, OpeningHoursRange } from '@phuquochub/shared-types';

/**
 * Đọc `opening_hours` (JSONB, SSOT docs/data/modules/places.md §4) thành thứ hiển thị được.
 *
 * VÌ SAO FILE NÀY TỒN TẠI: trang chi tiết trước đây duyệt `Object.entries(opening_hours)` rồi chỉ
 * GIỮ LẠI các giá trị `string | number` ở cấp cao nhất. Cấu trúc thật lại lồng nhau —
 * `regular` là object theo thứ, `exceptions` là mảng — nên bộ lọc đó vứt đúng phần dữ liệu duy
 * nhất có nghĩa và giữ lại `timezone`/`note`. Kết quả: một place khai báo đầy đủ giờ mở cửa vẫn
 * hiển thị ra "timezone: Asia/Ho_Chi_Minh" và không có giờ nào. Không place nào lộ ra lỗi này vì
 * cả 49 place đều đang có `opening_hours = null` — nó sẽ chỉ nổ đúng lúc bắt đầu nhập dữ liệu.
 *
 * NGUYÊN TẮC: dữ liệu không đọc được KHÔNG BAO GIỜ được biến thành khẳng định sai. Mọi đường
 * không hiểu được đều đổ về `unknown` ("chưa có thông tin"), không bao giờ về `closed` — nói
 * "đã đóng cửa" khi thực ra ta không biết là bịa thông tin, và người đọc sẽ không đến nơi.
 */

/**
 * Từ vựng thứ trong tuần dùng CHUNG cho cả đường đọc (file này) và đường ghi
 * (`place-management/openingHours.ts` — form sửa giờ của chủ cơ sở), khai báo đúng MỘT lần ở đây.
 *
 * Đặt ở module `places` chứ không phải `place-management` vì chiều phụ thuộc đã có sẵn là
 * place-management → places (xem `places/wards.ts` cũng được dùng lại y hệt), không bao giờ ngược
 * lại: trang công khai không được phụ thuộc vào module dashboard.
 */
export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: 'Thứ Hai',
  tue: 'Thứ Ba',
  wed: 'Thứ Tư',
  thu: 'Thứ Năm',
  fri: 'Thứ Sáu',
  sat: 'Thứ Bảy',
  sun: 'Chủ Nhật',
};

/** `Intl` trả nhãn thứ tiếng Anh viết tắt; đổi về khoá dữ liệu. */
const WEEKDAY_FROM_INTL: Record<string, WeekdayKey> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

/** Múi giờ mặc định khi dữ liệu không khai báo — toàn bộ nội dung của site nằm ở Việt Nam. */
const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type OpeningState = 'open' | 'closed' | 'unknown';

export interface OpeningToday {
  state: OpeningState;
  /** Nhãn ngắn để gắn badge: "Đang mở cửa" / "Đã đóng cửa" / "Chưa có thông tin giờ mở cửa". */
  label: string;
  /** Khung giờ của HÔM NAY, vd "08:00 – 22:00" (nhiều ca nối bằng ", "). `null` nếu không rõ. */
  hours: string | null;
  /** Ghi chú của ngày ngoại lệ (lễ/tết), nếu hôm nay trùng một `exceptions[]`. */
  note: string | null;
}

export interface OpeningWeekRow {
  key: WeekdayKey;
  label: string;
  /** "08:00 – 22:00" | "Đóng cửa" | "Cả ngày" | "Chưa có thông tin". */
  hours: string;
  isToday: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toMinutes(hhmm: unknown): number | null {
  if (typeof hhmm !== 'string' || !TIME_RE.test(hhmm)) return null;
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Khung giờ hợp lệ = có `open`/`close` đúng định dạng HH:MM. Khung hỏng bị loại, không ném lỗi.
 *
 * Export cho `lib/structured-data.ts` dùng lại (dựng `openingHoursSpecification` JSON-LD) — CÙNG
 * MỘT định nghĩa "khung giờ hợp lệ" cho cả hiển thị và structured data, không viết lại lần hai
 * (khác đi thì JSON-LD có thể phát một khung mà trang hiển thị coi là hỏng).
 */
export function validRanges(value: unknown): OpeningHoursRange[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r): r is OpeningHoursRange =>
      isPlainObject(r) && toMinutes(r.open) !== null && toMinutes(r.close) !== null,
  );
}

/**
 * Thời điểm hiện tại QUY VỀ múi giờ của địa điểm.
 *
 * Bắt buộc phải quy đổi: trang này là Server Component chạy trên máy chủ (thường UTC). Dùng thẳng
 * `now.getDay()` thì lúc 23:30 UTC thứ Ba — đã là 06:30 thứ Tư ở Việt Nam — trang sẽ đọc lịch của
 * thứ Ba và báo sai cả "hôm nay" lẫn mở/đóng.
 *
 * `hourCycle: 'h23'` chứ không phải `hour12: false`: với `hour12: false` một số bản ICU trả "24"
 * cho 0 giờ, làm phép tính phút lệch nguyên một ngày.
 */
function zonedNow(
  timezone: string,
  now: Date,
): { weekday: WeekdayKey; minutes: number; date: string } | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    // `timezone` là dữ liệu người dùng nhập — chuỗi rác sẽ làm Intl ném RangeError. Không có múi
    // giờ đọc được thì không kết luận gì về giờ giấc.
    return null;
  }

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  const weekday = WEEKDAY_FROM_INTL[get('weekday')];
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const date = `${get('year')}-${get('month')}-${get('day')}`;

  if (!weekday || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { weekday, minutes: hour * 60 + minute, date };
}

/** Khung giờ có bao trùm thời điểm `minutes` không (hỗ trợ khung QUA ĐÊM 22:00–02:00). */
function covers(range: OpeningHoursRange, minutes: number): boolean {
  const open = toMinutes(range.open);
  const close = toMinutes(range.close);
  if (open === null || close === null) return false;
  if (open === close) return false; // khung rỗng — không coi là mở suốt ngày
  return close > open ? minutes >= open && minutes < close : minutes >= open || minutes < close;
}

function formatRanges(ranges: OpeningHoursRange[]): string {
  return ranges.map((r) => `${r.open} – ${r.close}`).join(', ');
}

/** Export cho `lib/structured-data.ts` — cùng lý do `validRanges`. */
export function regularOf(oh: OpeningHours): Record<string, unknown> | null {
  return isPlainObject(oh.regular) ? oh.regular : null;
}

/**
 * Có đủ dữ liệu để hiển thị KHỐI giờ mở cửa không.
 *
 * `{}` và `{ timezone: '…' }` đều là payload HỢP LỆ theo validator (mọi trường đều tuỳ chọn) nhưng
 * không nói gì về giờ giấc — trả `false` để trang không dựng một khối trống.
 */
export function hasOpeningHours(oh: OpeningHours | null | undefined): boolean {
  if (!isPlainObject(oh)) return false;
  if (oh.is_24h === true) return true;

  const regular = regularOf(oh);
  if (regular && WEEKDAY_KEYS.some((d) => validRanges(regular[d]).length > 0)) return true;
  // Mảng rỗng có nghĩa: "thứ này đóng cửa" cũng là thông tin đáng hiển thị.
  if (regular && WEEKDAY_KEYS.some((d) => Array.isArray(regular[d]))) return true;

  return Array.isArray(oh.exceptions) && oh.exceptions.length > 0;
}

/** Ngoại lệ (lễ/tết) áp cho đúng ngày `date` (YYYY-MM-DD), nếu có. */
function exceptionFor(oh: OpeningHours, date: string): Record<string, unknown> | null {
  if (!Array.isArray(oh.exceptions)) return null;
  const hit = oh.exceptions.find((e) => isPlainObject(e) && e.date === date);
  return isPlainObject(hit) ? hit : null;
}

/**
 * Trạng thái + khung giờ của HÔM NAY, theo múi giờ của địa điểm.
 *
 * `now` tiêm được để test tất định. Trang chi tiết fetch với `cache: 'no-store'` nên Server
 * Component chạy lại mỗi request — kết quả không bị đóng băng theo cache.
 */
export function getOpeningToday(oh: OpeningHours | null | undefined, now: Date = new Date()): OpeningToday {
  const unknown: OpeningToday = {
    state: 'unknown',
    label: 'Chưa có thông tin giờ mở cửa',
    hours: null,
    note: null,
  };
  if (!isPlainObject(oh) || !hasOpeningHours(oh)) return unknown;

  const timezone = typeof oh.timezone === 'string' && oh.timezone ? oh.timezone : DEFAULT_TIMEZONE;
  const zoned = zonedNow(timezone, now);
  if (!zoned) return unknown;

  const exception = exceptionFor(oh, zoned.date);
  const note = exception && typeof exception.note === 'string' ? exception.note : null;

  // Ngoại lệ THẮNG lịch thường — đó là toàn bộ lý do nó tồn tại (nghỉ lễ, giờ đặc biệt).
  if (exception?.closed === true) {
    return { state: 'closed', label: 'Đã đóng cửa', hours: 'Đóng cửa', note };
  }

  if (oh.is_24h === true && !exception) {
    return { state: 'open', label: 'Đang mở cửa', hours: 'Cả ngày', note: null };
  }

  const regular = regularOf(oh);
  const raw = exception?.hours !== undefined ? exception.hours : regular?.[zoned.weekday];

  // Khoá thứ VẮNG MẶT ≠ mảng RỖNG: vắng mặt là "không khai" (unknown), rỗng là "đóng cửa hôm nay"
  // (places.md §4). Gộp hai cái làm một sẽ biến dữ liệu thiếu thành lời khẳng định đã đóng cửa.
  if (!Array.isArray(raw)) return { ...unknown, note };

  const ranges = validRanges(raw);
  if (ranges.length === 0) {
    // Mảng RỖNG = "đóng cửa hôm nay" (places.md §4) — một lời khai có chủ ý.
    // Mảng CÓ phần tử nhưng không đọc được khung nào (giờ sai định dạng, thiếu `close`…) là dữ
    // liệu HỎNG, không phải lời khai đóng cửa. Trả 'closed' ở đây là bịa ra một khẳng định từ
    // rác — và là khẳng định khiến người đọc không đến nơi.
    return raw.length === 0
      ? { state: 'closed', label: 'Đã đóng cửa', hours: 'Đóng cửa', note }
      : { ...unknown, note };
  }

  const open = ranges.some((r) => covers(r, zoned.minutes));
  return {
    state: open ? 'open' : 'closed',
    label: open ? 'Đang mở cửa' : 'Đã đóng cửa',
    hours: formatRanges(ranges),
    note,
  };
}

/**
 * Lịch TUẦN (giờ thường). Ngoại lệ theo ngày cố ý KHÔNG trộn vào đây — chúng thuộc về một ngày cụ
 * thể, còn bảng này mô tả tuần điển hình; trộn vào sẽ khiến người đọc tưởng lịch tuần đã đổi.
 */
export function getOpeningWeek(
  oh: OpeningHours | null | undefined,
  now: Date = new Date(),
): OpeningWeekRow[] {
  if (!isPlainObject(oh) || !hasOpeningHours(oh)) return [];

  const timezone = typeof oh.timezone === 'string' && oh.timezone ? oh.timezone : DEFAULT_TIMEZONE;
  const today = zonedNow(timezone, now)?.weekday ?? null;
  const regular = regularOf(oh);
  const allDay = oh.is_24h === true;

  return WEEKDAY_KEYS.map((key) => {
    let hours: string;
    if (allDay) {
      hours = 'Cả ngày';
    } else {
      const raw = regular?.[key];
      if (!Array.isArray(raw)) {
        hours = 'Chưa có thông tin';
      } else {
        const ranges = validRanges(raw);
        // Cùng phân biệt như `getOpeningToday`: rỗng = đóng cửa (lời khai), không đọc được = chưa
        // có thông tin (dữ liệu hỏng). Không gộp.
        if (ranges.length > 0) hours = formatRanges(ranges);
        else hours = raw.length === 0 ? 'Đóng cửa' : 'Chưa có thông tin';
      }
    }
    return { key, label: WEEKDAY_LABELS[key], hours, isToday: key === today };
  });
}
