import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Kiểm tra cấu trúc `opening_hours` (JSONB) theo SSOT docs/data/modules/places.md §4.
 *
 * Hình dạng tài liệu quy định:
 *   {
 *     "timezone": "Asia/Ho_Chi_Minh",
 *     "regular": { "mon": [{ "open": "08:00", "close": "22:00" }], ..., "sun": [] },
 *     "is_24h": false,
 *     "exceptions": [
 *       { "date": "2026-01-01", "closed": true, "note": "..." },
 *       { "date": "2026-02-17", "hours": [{ "open": "10:00", "close": "20:00" }] }
 *     ],
 *     "note": "..."
 *   }
 *
 * Ba quyết định có chủ ý, ghi lại để người sau không "sửa nhầm":
 *
 *  1. **Khoá lạ ở cấp cao nhất được CHẤP NHẬN.** openapi.yaml:1777 khai báo opening_hours là
 *     `object` với `additionalProperties: true`, nên từ chối khoá lạ sẽ chặt hơn SSOT. Ta chỉ
 *     kiểm hình dạng của các trường ĐÃ BIẾT; trường lạ đi qua nguyên vẹn.
 *  2. **KHÔNG kiểm `open < close`.** Khung qua đêm (22:00–02:00) là hợp lệ với quán bar/hàng
 *     đêm; ép open < close sẽ loại bỏ dữ liệu thật. Chỉ kiểm định dạng HH:MM.
 *  3. **Mọi trường đều TÙY CHỌN.** places.md §4 không đánh dấu trường nào bắt buộc, nên `{}`
 *     là hợp lệ. Từ chối một payload mà SSOT không cấm sẽ là bước lùi, không phải cải thiện.
 *     Ràng buộc ở đây là: nếu CÓ mặt thì phải đúng kiểu.
 */

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** HH:MM 24 giờ, có số 0 đứng đầu (00:00–23:59). */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** YYYY-MM-DD (kiểm định dạng; tính hợp lệ của ngày do tầng trên quyết định). */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Một khung giờ { open, close } — cả hai bắt buộc khi khung tồn tại. */
function timeRangeErrors(range: unknown, path: string): string[] {
  if (!isPlainObject(range)) {
    return [`${path} phải là object { open, close }`];
  }
  const errors: string[] = [];
  for (const key of ['open', 'close'] as const) {
    const value = range[key];
    if (typeof value !== 'string' || !TIME_RE.test(value)) {
      errors.push(`${path}.${key} phải là giờ HH:MM (24h)`);
    }
  }
  return errors;
}

function timeRangeListErrors(list: unknown, path: string): string[] {
  if (!Array.isArray(list)) {
    return [`${path} phải là mảng khung giờ (mảng rỗng = đóng cửa)`];
  }
  return list.flatMap((range, i) => timeRangeErrors(range, `${path}[${i}]`));
}

function regularErrors(regular: unknown): string[] {
  if (!isPlainObject(regular)) {
    return ['opening_hours.regular phải là object theo thứ trong tuần'];
  }
  const errors: string[] = [];
  for (const [day, value] of Object.entries(regular)) {
    if (!(WEEKDAYS as readonly string[]).includes(day)) {
      errors.push(`opening_hours.regular.${day} không phải thứ hợp lệ (${WEEKDAYS.join(', ')})`);
      continue;
    }
    errors.push(...timeRangeListErrors(value, `opening_hours.regular.${day}`));
  }
  return errors;
}

function exceptionErrors(exception: unknown, index: number): string[] {
  const path = `opening_hours.exceptions[${index}]`;
  if (!isPlainObject(exception)) {
    return [`${path} phải là object`];
  }
  const errors: string[] = [];
  if (typeof exception.date !== 'string' || !DATE_RE.test(exception.date)) {
    errors.push(`${path}.date phải là ngày YYYY-MM-DD`);
  }
  if (exception.closed !== undefined && typeof exception.closed !== 'boolean') {
    errors.push(`${path}.closed phải là boolean`);
  }
  if (exception.hours !== undefined) {
    errors.push(...timeRangeListErrors(exception.hours, `${path}.hours`));
  }
  if (exception.note !== undefined && typeof exception.note !== 'string') {
    errors.push(`${path}.note phải là chuỗi`);
  }
  return errors;
}

/**
 * Trả về danh sách lỗi cấu trúc (rỗng = hợp lệ). Tách khỏi decorator để test trực tiếp
 * và để tái dùng nếu sau này cần kiểm ở tầng khác.
 */
export function openingHoursErrors(value: unknown): string[] {
  if (!isPlainObject(value)) {
    return ['opening_hours phải là object'];
  }
  const errors: string[] = [];

  if (value.timezone !== undefined && typeof value.timezone !== 'string') {
    errors.push('opening_hours.timezone phải là chuỗi');
  }
  if (value.is_24h !== undefined && typeof value.is_24h !== 'boolean') {
    errors.push('opening_hours.is_24h phải là boolean');
  }
  if (value.note !== undefined && typeof value.note !== 'string') {
    errors.push('opening_hours.note phải là chuỗi');
  }
  if (value.regular !== undefined) {
    errors.push(...regularErrors(value.regular));
  }
  if (value.exceptions !== undefined) {
    if (!Array.isArray(value.exceptions)) {
      errors.push('opening_hours.exceptions phải là mảng');
    } else {
      errors.push(...value.exceptions.flatMap(exceptionErrors));
    }
  }
  return errors;
}

export function isValidOpeningHours(value: unknown): boolean {
  return openingHoursErrors(value).length === 0;
}

/**
 * Decorator class-validator: `opening_hours` phải đúng cấu trúc places.md §4.
 * Dùng **cùng** `@IsObject()` (defense-in-depth) — không thay thế.
 */
export function IsOpeningHours(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isOpeningHours',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return isValidOpeningHours(value);
        },
        defaultMessage(args: ValidationArguments): string {
          const errors = openingHoursErrors(args.value);
          return `${args.property} sai cấu trúc (places.md §4): ${errors.join('; ')}`;
        },
      },
    });
  };
}
