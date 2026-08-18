import type { OpeningHours } from '@phuquochub/shared-types';
import { getOpeningToday, getOpeningWeek, hasOpeningHours } from './openingHours';

// OPENING_HOURS_RENDERING (Place Information Foundation, 2026-08-18).
//
// Mọi mốc thời gian dưới đây viết ở UTC và cố ý chọn quanh ranh giới ngày để bắt đúng lỗi mà bản
// cũ mắc phải: máy chủ chạy UTC nhưng dữ liệu là giờ Việt Nam (UTC+7).
//   2026-08-18T03:00:00Z = 10:00 thứ Ba, giờ VN
//   2026-08-18T15:00:00Z = 22:00 thứ Ba, giờ VN
//   2026-08-17T18:00:00Z = 01:00 thứ Ba, giờ VN (ở UTC vẫn còn là thứ Hai)
const TUE_10H = new Date('2026-08-18T03:00:00Z');
const TUE_22H = new Date('2026-08-18T15:00:00Z');
const TUE_01H = new Date('2026-08-17T18:00:00Z');

const WEEKLY: OpeningHours = {
  timezone: 'Asia/Ho_Chi_Minh',
  regular: {
    mon: [{ open: '08:00', close: '22:00' }],
    tue: [{ open: '08:00', close: '22:00' }],
    wed: [{ open: '08:00', close: '22:00' }],
    thu: [{ open: '08:00', close: '22:00' }],
    fri: [{ open: '08:00', close: '22:00' }],
    sat: [{ open: '08:00', close: '23:00' }],
    sun: [],
  },
};

describe('hasOpeningHours', () => {
  it('null/undefined/rỗng → không có lịch để hiển thị', () => {
    expect(hasOpeningHours(null)).toBe(false);
    expect(hasOpeningHours(undefined)).toBe(false);
    expect(hasOpeningHours({})).toBe(false);
  });

  // `{}` và `{timezone}` đều HỢP LỆ với validator phía API (mọi trường tuỳ chọn) nhưng không nói
  // gì về giờ giấc — đúng cái bẫy làm bản cũ dựng khối "Thông tin" chỉ chứa dòng "Asia/Ho_Chi_Minh".
  it('chỉ có timezone/note → vẫn là KHÔNG có lịch (không dựng khối trống)', () => {
    expect(hasOpeningHours({ timezone: 'Asia/Ho_Chi_Minh' })).toBe(false);
    expect(hasOpeningHours({ note: 'Gọi trước khi đến' })).toBe(false);
  });

  it('nhận lịch tuần, 24/7, và ngày ngoại lệ', () => {
    expect(hasOpeningHours(WEEKLY)).toBe(true);
    expect(hasOpeningHours({ is_24h: true })).toBe(true);
    expect(hasOpeningHours({ exceptions: [{ date: '2026-01-01', closed: true }] })).toBe(true);
  });
});

describe('getOpeningToday — lịch tuần lồng nhau', () => {
  it('trong khung giờ → đang mở, kèm khung giờ của hôm nay', () => {
    const t = getOpeningToday(WEEKLY, TUE_10H);
    expect(t.state).toBe('open');
    expect(t.label).toBe('Đang mở cửa');
    expect(t.hours).toBe('08:00 – 22:00');
  });

  it('ngoài khung giờ → đã đóng, VẪN hiển thị khung giờ của hôm nay', () => {
    const t = getOpeningToday(WEEKLY, TUE_22H);
    expect(t.state).toBe('closed');
    expect(t.hours).toBe('08:00 – 22:00');
  });

  // Chính là lỗi mà `new Date().getDay()` trên máy chủ UTC gây ra: 01:00 thứ Ba giờ VN vẫn đang là
  // thứ Hai ở UTC. Đọc nhầm ngày thì cả "hôm nay" lẫn mở/đóng đều sai.
  it('quy đổi múi giờ: 01:00 thứ Ba giờ VN đọc lịch THỨ BA, không phải thứ Hai theo UTC', () => {
    const oh: OpeningHours = {
      timezone: 'Asia/Ho_Chi_Minh',
      regular: { mon: [{ open: '00:00', close: '23:59' }], tue: [] },
    };
    // Nếu đọc nhầm sang thứ Hai (theo UTC) thì sẽ ra 'open'.
    expect(getOpeningToday(oh, TUE_01H).state).toBe('closed');
  });

  it('mảng rỗng = đóng cửa hôm nay (không phải "chưa có thông tin")', () => {
    const sunday = new Date('2026-08-23T03:00:00Z'); // 10:00 Chủ Nhật, giờ VN
    const t = getOpeningToday(WEEKLY, sunday);
    expect(t.state).toBe('closed');
    expect(t.hours).toBe('Đóng cửa');
  });

  // Phân biệt VẮNG MẶT với RỖNG. Gộp hai cái sẽ biến "chưa ai nhập" thành lời khẳng định "đã đóng
  // cửa" — đúng kiểu thông tin sai khiến người đọc không đến nơi.
  it('khoá thứ VẮNG MẶT → unknown, KHÔNG phải closed', () => {
    const oh: OpeningHours = {
      timezone: 'Asia/Ho_Chi_Minh',
      regular: { mon: [{ open: '08:00', close: '17:00' }] }, // không khai thứ Ba
    };
    expect(getOpeningToday(oh, TUE_10H).state).toBe('unknown');
  });

  it('is_24h → luôn mở, nhãn "Cả ngày"', () => {
    const t = getOpeningToday({ is_24h: true }, TUE_22H);
    expect(t.state).toBe('open');
    expect(t.hours).toBe('Cả ngày');
  });

  it('khung QUA ĐÊM (22:00–02:00) tính đúng ở cả hai phía nửa đêm', () => {
    const bar: OpeningHours = {
      timezone: 'Asia/Ho_Chi_Minh',
      regular: {
        mon: [{ open: '22:00', close: '02:00' }],
        tue: [{ open: '22:00', close: '02:00' }],
      },
    };
    expect(getOpeningToday(bar, TUE_22H).state).toBe('open'); // 22:00
    expect(getOpeningToday(bar, TUE_01H).state).toBe('open'); // 01:00
    expect(getOpeningToday(bar, TUE_10H).state).toBe('closed'); // 10:00
  });

  it('nhiều ca trong ngày (nghỉ trưa) nối bằng dấu phẩy và tính đúng khoảng nghỉ', () => {
    const oh: OpeningHours = {
      timezone: 'Asia/Ho_Chi_Minh',
      regular: {
        tue: [
          { open: '07:00', close: '11:00' },
          { open: '13:00', close: '21:00' },
        ],
      },
    };
    const t = getOpeningToday(oh, TUE_10H);
    expect(t.hours).toBe('07:00 – 11:00, 13:00 – 21:00');
    expect(t.state).toBe('open');

    const noon = new Date('2026-08-18T05:00:00Z'); // 12:00 giờ VN — đang nghỉ trưa
    expect(getOpeningToday(oh, noon).state).toBe('closed');
  });
});

describe('getOpeningToday — ngoại lệ theo ngày', () => {
  it('ngày nghỉ lễ THẮNG lịch thường, kèm ghi chú', () => {
    const oh: OpeningHours = {
      ...WEEKLY,
      exceptions: [{ date: '2026-08-18', closed: true, note: 'Nghỉ lễ' }],
    };
    const t = getOpeningToday(oh, TUE_10H);
    expect(t.state).toBe('closed');
    expect(t.note).toBe('Nghỉ lễ');
  });

  it('ngoại lệ có khung giờ riêng THẮNG khung giờ thường', () => {
    const oh: OpeningHours = {
      ...WEEKLY,
      exceptions: [{ date: '2026-08-18', hours: [{ open: '10:00', close: '12:00' }] }],
    };
    const t = getOpeningToday(oh, TUE_10H);
    expect(t.hours).toBe('10:00 – 12:00');
    expect(t.state).toBe('open');
  });

  it('ngoại lệ của ngày KHÁC không ảnh hưởng hôm nay', () => {
    const oh: OpeningHours = {
      ...WEEKLY,
      exceptions: [{ date: '2026-12-25', closed: true, note: 'Giáng sinh' }],
    };
    const t = getOpeningToday(oh, TUE_10H);
    expect(t.state).toBe('open');
    expect(t.note).toBeNull();
  });

  it('is_24h nhưng hôm nay có ngoại lệ đóng cửa → đóng cửa', () => {
    const oh: OpeningHours = {
      is_24h: true,
      exceptions: [{ date: '2026-08-18', closed: true, note: 'Bảo trì' }],
    };
    expect(getOpeningToday(oh, TUE_10H).state).toBe('closed');
  });
});

describe('getOpeningToday — dữ liệu hỏng/lạ không được thành khẳng định sai', () => {
  // Negative control cho toàn bộ nhóm này: dữ liệu rác PHẢI ra 'unknown', KHÔNG BAO GIỜ ra
  // 'open' (mời người đọc đến nơi đóng cửa) hay 'closed' (đuổi họ khỏi nơi đang mở).
  const garbage: unknown[] = [
    { regular: 'mở cửa cả tuần' },
    { regular: { tue: 'suốt ngày' } },
    { regular: { tue: [{ open: '25:00', close: '99:99' }] } },
    { regular: { tue: [{ open: '08:00' }] } },
    { regular: null },
    { is_24h: 'yes' },
    [],
    'opening hours',
    42,
  ];

  it.each(garbage.map((g, i) => [i, g]))('payload rác #%i → unknown', (_i, g) => {
    const t = getOpeningToday(g as OpeningHours, TUE_10H);
    expect(t.state).toBe('unknown');
    expect(t.hours).toBeNull();
  });

  it('timezone rác → unknown, không ném lỗi (Intl sẽ ném RangeError nếu không bắt)', () => {
    const oh = { ...WEEKLY, timezone: 'Không/Có_Thật' } as OpeningHours;
    expect(() => getOpeningToday(oh, TUE_10H)).not.toThrow();
    expect(getOpeningToday(oh, TUE_10H).state).toBe('unknown');
  });

  it('thiếu timezone → mặc định giờ Việt Nam (không rơi về giờ máy chủ)', () => {
    const oh: OpeningHours = { regular: { tue: [{ open: '08:00', close: '22:00' }] } };
    expect(getOpeningToday(oh, TUE_10H).state).toBe('open');
    // 17:00 UTC = 00:00 thứ Tư giờ VN → đã sang ngày khác, thứ Ba không còn áp dụng.
    expect(getOpeningToday(oh, new Date('2026-08-18T17:00:00Z')).state).toBe('unknown');
  });

  it('khung giờ hỏng bị loại, khung hợp lệ còn lại vẫn dùng được', () => {
    const oh: OpeningHours = {
      timezone: 'Asia/Ho_Chi_Minh',
      regular: {
        tue: [
          { open: '99:99', close: '08:00' } as never,
          { open: '08:00', close: '22:00' },
        ],
      },
    };
    expect(getOpeningToday(oh, TUE_10H).hours).toBe('08:00 – 22:00');
  });
});

describe('getOpeningWeek', () => {
  it('trả đủ 7 thứ theo tiếng Việt, đánh dấu hôm nay', () => {
    const week = getOpeningWeek(WEEKLY, TUE_10H);
    expect(week).toHaveLength(7);
    expect(week[0]).toMatchObject({ key: 'mon', label: 'Thứ Hai', hours: '08:00 – 22:00' });
    expect(week[6]).toMatchObject({ key: 'sun', label: 'Chủ Nhật', hours: 'Đóng cửa' });
    expect(week.filter((r) => r.isToday)).toHaveLength(1);
    expect(week.find((r) => r.isToday)?.key).toBe('tue');
  });

  it('không có lịch → mảng rỗng (trang không dựng bảng trống)', () => {
    expect(getOpeningWeek(null, TUE_10H)).toEqual([]);
    expect(getOpeningWeek({}, TUE_10H)).toEqual([]);
  });

  it('is_24h → cả bảy ngày "Cả ngày"', () => {
    expect(getOpeningWeek({ is_24h: true }, TUE_10H).every((r) => r.hours === 'Cả ngày')).toBe(true);
  });

  it('thứ chưa khai → "Chưa có thông tin", KHÔNG phải "Đóng cửa"', () => {
    const oh: OpeningHours = { regular: { mon: [{ open: '08:00', close: '17:00' }] } };
    const week = getOpeningWeek(oh, TUE_10H);
    expect(week.find((r) => r.key === 'tue')?.hours).toBe('Chưa có thông tin');
  });
});
