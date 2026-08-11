import {
  emptyOpeningHoursFormState,
  formStateToOpeningHours,
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
});
