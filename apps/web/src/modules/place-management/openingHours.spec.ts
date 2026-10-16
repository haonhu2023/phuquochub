import {
  emptyOpeningHoursFormState,
  formStateToOpeningHours,
  isValidTimeOfDay,
  normalizeTimeOfDay,
  openingHoursToFormState,
  validateOpeningHoursForm,
  WEEKDAYS,
} from './openingHours';
import type { OpeningHours } from '@phuquochub/shared-types';

describe('openingHoursToFormState', () => {
  it('null/undefined -> state rỗng, cả 7 ngày mảng rỗng, is24h=false, note=""', () => {
    expect(openingHoursToFormState(null)).toEqual(emptyOpeningHoursFormState());
    expect(openingHoursToFormState(undefined)).toEqual(emptyOpeningHoursFormState());
  });

  it('đọc đúng regular/is_24h/note đã có', () => {
    const oh: OpeningHours = {
      is_24h: true,
      note: 'Ghi chú',
      regular: { mon: [{ open: '08:00', close: '22:00' }], wed: [] },
    };
    const state = openingHoursToFormState(oh);
    expect(state.is24h).toBe(true);
    expect(state.note).toBe('Ghi chú');
    expect(state.regular.mon).toEqual([{ open: '08:00', close: '22:00' }]);
    expect(state.regular.wed).toEqual([]);
    // Ngày không có trong `regular` gốc -> mảng rỗng (đóng cửa), không undefined.
    expect(state.regular.tue).toEqual([]);
  });

  it('không copy tham chiếu mảng gốc (tránh mutate dữ liệu gốc qua form state)', () => {
    const original = { open: '08:00', close: '22:00' };
    const oh: OpeningHours = { regular: { mon: [original] } };
    const state = openingHoursToFormState(oh);
    state.regular.mon[0].open = '09:00';
    expect(original.open).toBe('08:00');
  });
});

// SỬA UX nhập giờ 16/10/2026 (owner báo lỗi thật: `<input type="time">` hiện đồng hồ 12 giờ AM/PM,
// không gõ trực tiếp được 18:00 rõ ràng) — ô text thay thế tự kiểm định dạng, hai hàm dưới đây là
// nguồn chân lý duy nhất cho việc đó (TimeOfDayField.tsx và validateOpeningHoursForm đều gọi lại).
describe('normalizeTimeOfDay', () => {
  it('đã đúng "HH:mm" hai chữ số -> giữ nguyên', () => {
    expect(normalizeTimeOfDay('06:00')).toBe('06:00');
    expect(normalizeTimeOfDay('18:00')).toBe('18:00');
    expect(normalizeTimeOfDay('23:59')).toBe('23:59');
    expect(normalizeTimeOfDay('00:00')).toBe('00:00');
  });

  it('giờ một chữ số có dấu ":" -> thêm số 0', () => {
    expect(normalizeTimeOfDay('6:00')).toBe('06:00');
    expect(normalizeTimeOfDay('9:05')).toBe('09:05');
  });

  it('gõ liền không dấu ":" (3-4 chữ số) -> chuẩn hoá đúng', () => {
    expect(normalizeTimeOfDay('600')).toBe('06:00');
    expect(normalizeTimeOfDay('1800')).toBe('18:00');
    expect(normalizeTimeOfDay('0000')).toBe('00:00');
  });

  it('khoảng trắng đầu/cuối -> trim trước khi kiểm', () => {
    expect(normalizeTimeOfDay('  18:00  ')).toBe('18:00');
  });

  it('chuỗi rỗng -> null (không phải lỗi định dạng, là "thiếu")', () => {
    expect(normalizeTimeOfDay('')).toBeNull();
    expect(normalizeTimeOfDay('   ')).toBeNull();
  });

  it('giờ ngoài 00-23 hoặc phút ngoài 00-59 -> null', () => {
    expect(normalizeTimeOfDay('25:00')).toBeNull();
    expect(normalizeTimeOfDay('18:70')).toBeNull();
    expect(normalizeTimeOfDay('24:00')).toBeNull();
    expect(normalizeTimeOfDay('18:60')).toBeNull();
  });

  it('rác không phải số/giờ -> null', () => {
    expect(normalizeTimeOfDay('abc')).toBeNull();
    expect(normalizeTimeOfDay('6:0')).toBeNull(); // phút phải đủ 2 chữ số
    expect(normalizeTimeOfDay('18:00:00')).toBeNull();
  });
});

describe('isValidTimeOfDay', () => {
  it('khớp đúng kết quả normalizeTimeOfDay !== null', () => {
    expect(isValidTimeOfDay('18:00')).toBe(true);
    expect(isValidTimeOfDay('25:00')).toBe(false);
    expect(isValidTimeOfDay('')).toBe(false);
  });
});

describe('validateOpeningHoursForm', () => {
  it('mọi ngày rỗng -> không lỗi', () => {
    expect(validateOpeningHoursForm(emptyOpeningHoursFormState())).toEqual([]);
  });

  it('khung giờ đủ open+close -> không lỗi', () => {
    const state = emptyOpeningHoursFormState();
    state.regular.mon = [{ open: '08:00', close: '22:00' }];
    expect(validateOpeningHoursForm(state)).toEqual([]);
  });

  it('thiếu open hoặc close -> báo lỗi đúng ngày + vị trí', () => {
    const state = emptyOpeningHoursFormState();
    state.regular.tue = [{ open: '', close: '22:00' }];
    state.regular.fri = [{ open: '08:00', close: '' }];
    const errors = validateOpeningHoursForm(state);
    expect(errors).toEqual([
      { day: 'tue', index: 0 },
      { day: 'fri', index: 0 },
    ]);
  });

  it('khung qua đêm (open > close) KHÔNG bị coi là lỗi — backend cố tình không kiểm open<close', () => {
    const state = emptyOpeningHoursFormState();
    state.regular.sat = [{ open: '22:00', close: '02:00' }];
    expect(validateOpeningHoursForm(state)).toEqual([]);
  });

  it('có giá trị nhưng SAI định dạng/khoảng ("25:00", "18:70") -> báo lỗi đúng ngày + vị trí (không còn do trình duyệt đảm bảo)', () => {
    const state = emptyOpeningHoursFormState();
    state.regular.mon = [{ open: '25:00', close: '18:00' }];
    state.regular.wed = [{ open: '08:00', close: '18:70' }];
    const errors = validateOpeningHoursForm(state);
    expect(errors).toEqual([
      { day: 'mon', index: 0 },
      { day: 'wed', index: 0 },
    ]);
  });

  it('gõ không dấu ":" nhưng hợp lệ ("600", "1800") -> KHÔNG lỗi', () => {
    const state = emptyOpeningHoursFormState();
    state.regular.mon = [{ open: '600', close: '1800' }];
    expect(validateOpeningHoursForm(state)).toEqual([]);
  });
});

describe('formStateToOpeningHours', () => {
  it('state rỗng + original null -> object hợp lệ, KHÔNG null, 7 ngày rỗng, KHÔNG có note', () => {
    const result = formStateToOpeningHours(emptyOpeningHoursFormState(), null);
    expect(result).toEqual({
      is_24h: false,
      regular: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
    });
    expect(result).not.toHaveProperty('note');
  });

  it('note rỗng/toàn khoảng trắng -> KHÔNG có trong payload', () => {
    const state = emptyOpeningHoursFormState();
    state.note = '   ';
    const result = formStateToOpeningHours(state, null);
    expect(result).not.toHaveProperty('note');
  });

  it('note có nội dung -> trim rồi đưa vào payload', () => {
    const state = emptyOpeningHoursFormState();
    state.note = '  Nghỉ lễ  ';
    const result = formStateToOpeningHours(state, null);
    expect(result.note).toBe('Nghỉ lễ');
  });

  it('GIỮ NGUYÊN timezone/exceptions/khoá lạ từ dữ liệu gốc — form không có UI chỉnh các trường này', () => {
    const original: OpeningHours = {
      timezone: 'Asia/Ho_Chi_Minh',
      exceptions: [{ date: '2026-01-01', closed: true }],
      custom_key: 'giữ nguyên',
      regular: { mon: [{ open: '08:00', close: '22:00' }] },
      is_24h: false,
    };
    const state = openingHoursToFormState(original);
    const result = formStateToOpeningHours(state, original);
    expect(result.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(result.exceptions).toEqual([{ date: '2026-01-01', closed: true }]);
    expect(result.custom_key).toBe('giữ nguyên');
  });

  it('roundtrip (đọc rồi gộp lại không đổi gì) tạo ra ĐÚNG dữ liệu gốc cho regular/is_24h/note', () => {
    const original: OpeningHours = {
      is_24h: true,
      note: 'Ghi chú gốc',
      regular: {
        mon: [{ open: '08:00', close: '12:00' }, { open: '13:00', close: '22:00' }],
        tue: [],
      },
    };
    const state = openingHoursToFormState(original);
    const result = formStateToOpeningHours(state, original);
    expect(result.is_24h).toBe(true);
    expect(result.note).toBe('Ghi chú gốc');
    expect(result.regular?.mon).toEqual(original.regular?.mon);
    expect(result.regular?.tue).toEqual([]);
  });

  it('luôn phát đủ 7 khoá trong `regular`, kể cả khi original chỉ có một vài ngày', () => {
    const original: OpeningHours = { regular: { mon: [{ open: '08:00', close: '22:00' }] } };
    const state = openingHoursToFormState(original);
    const result = formStateToOpeningHours(state, original);
    expect(Object.keys(result.regular ?? {}).sort()).toEqual([...WEEKDAYS].sort());
  });

  it('lưới an toàn cuối: chuẩn hoá "6:00"/"1800" (chưa qua blur) thành "06:00"/"18:00" lúc gửi', () => {
    const state = emptyOpeningHoursFormState();
    state.regular.mon = [{ open: '6:00', close: '1800' }];
    const result = formStateToOpeningHours(state, null);
    expect(result.regular?.mon).toEqual([{ open: '06:00', close: '18:00' }]);
  });
});
