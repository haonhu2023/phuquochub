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

// VINWONDERS_OPENING_HOURS_CONTRACT (2026-09-08 — Vinpearl Safari source conflict resolution task,
// Phase 1). Regression-locks the evaluator's behavior against the EXACT payload currently stored in
// `places.opening_hours` for VinWonders Phú Quốc in production (verified live via DB + public API +
// public web on 2026-09-08 — see the task's Phase 0 report). The task brief's own stated "current
// production value" used a collapsed `"mon-sun"` key; that does NOT match what is actually stored —
// production genuinely holds one entry per weekday (mon/tue/wed/thu/fri/sat/sun), each
// `09:00–19:30`. Both are tested below: the REAL payload (must be understood) and the `mon-sun`
// shorthand from the task's stale premise (must NOT be silently misread as a valid schedule).
describe('getOpeningToday — VinWonders production payload contract (2026-09-08)', () => {
  // Byte-for-byte the value read from `places.opening_hours` in production (DB, /api/places/…, and
  // the rendered JSON-LD all agreed — see Phase 0 of the report).
  const VINWONDERS_LIVE: OpeningHours = {
    timezone: 'Asia/Ho_Chi_Minh',
    regular: {
      mon: [{ open: '09:00', close: '19:30' }],
      tue: [{ open: '09:00', close: '19:30' }],
      wed: [{ open: '09:00', close: '19:30' }],
      thu: [{ open: '09:00', close: '19:30' }],
      fri: [{ open: '09:00', close: '19:30' }],
      sat: [{ open: '09:00', close: '19:30' }],
      sun: [{ open: '09:00', close: '19:30' }],
    },
  };

  // 2026-08-17 = Monday, 2026-08-19 = Wednesday, 2026-08-23 = Sunday (VN calendar) — same reference
  // week already used by the existing TUE_10H/TUE_22H/TUE_01H fixtures above, so a reader can verify
  // the weekday arithmetic by cross-checking those comments.
  const MON_10H = new Date('2026-08-17T03:00:00Z'); // 10:00 thứ Hai, giờ VN
  const WED_18H = new Date('2026-08-19T11:00:00Z'); // 18:00 thứ Tư, giờ VN
  const SUN_20H = new Date('2026-08-23T13:00:00Z'); // 20:00 Chủ Nhật, giờ VN
  const MON_0900_EXACT = new Date('2026-08-17T02:00:00Z'); // đúng 09:00 thứ Hai, giờ VN
  const MON_1930_EXACT = new Date('2026-08-17T12:30:00Z'); // đúng 19:30 thứ Hai, giờ VN

  it('thứ Hai 10:00 giờ VN → OPEN (payload thật đang lưu trên production)', () => {
    expect(getOpeningToday(VINWONDERS_LIVE, MON_10H).state).toBe('open');
  });

  it('thứ Tư 18:00 giờ VN → OPEN', () => {
    expect(getOpeningToday(VINWONDERS_LIVE, WED_18H).state).toBe('open');
  });

  it('Chủ nhật 20:00 giờ VN → CLOSED (sau 19:30)', () => {
    expect(getOpeningToday(VINWONDERS_LIVE, SUN_20H).state).toBe('closed');
  });

  it('đúng thời điểm mở cửa 09:00 → OPEN (biên dưới bao gồm cả điểm mở)', () => {
    expect(getOpeningToday(VINWONDERS_LIVE, MON_0900_EXACT).state).toBe('open');
  });

  it('đúng thời điểm đóng cửa 19:30 → CLOSED (biên trên KHÔNG bao gồm điểm đóng, xem covers())', () => {
    expect(getOpeningToday(VINWONDERS_LIVE, MON_1930_EXACT).state).toBe('closed');
  });

  it('payload hỏng (regular không phải object theo thứ) → unknown, không ném lỗi, không suy diễn', () => {
    const invalid = { timezone: 'Asia/Ho_Chi_Minh', regular: 'mon-fri 09:00-19:30' } as unknown as OpeningHours;
    expect(() => getOpeningToday(invalid, MON_10H)).not.toThrow();
    expect(getOpeningToday(invalid, MON_10H).state).toBe('unknown');
  });

  it('thiếu timezone → vẫn tính đúng theo mặc định Asia/Ho_Chi_Minh (không rơi về giờ máy chủ)', () => {
    const noTz: OpeningHours = { regular: VINWONDERS_LIVE.regular };
    expect(getOpeningToday(noTz, MON_10H).state).toBe('open');
    expect(getOpeningToday(noTz, SUN_20H).state).toBe('closed');
  });

  // Trả lời trực tiếp câu hỏi Phase 1 #1/#2/#3 của brief: hệ thống — cả evaluator hiển thị (file
  // này), Right Now (`RightNowSection.tsx` gọi thẳng `getOpeningToday`), lẫn structured data
  // (`lib/structured-data.ts`, dùng lại `WEEKDAY_KEYS`) — CHỈ hiểu khoá từng thứ riêng lẻ
  // (mon/tue/.../sun), KHÔNG hiểu khoá gộp dạng "mon-sun". `regular[zoned.weekday]` luôn tra đúng
  // MỘT trong bảy khoá đó; một khoá lạ như "mon-sun" không bao giờ khớp weekday nào, nên MỌI ngày
  // trong tuần đều đọc ra 'unknown' — không phải lỗi ném ra, mà là "chưa có thông tin" bị báo sai
  // cho một địa điểm thực ra có giờ mở cửa đầy đủ. Đây là premise SAI trong phần đầu brief (giá trị
  // production thật không dùng "mon-sun" — xem Phase 0) nhưng vẫn đáng khoá lại làm quy tắc chuẩn
  // hoá: KHÔNG BAO GIỜ ghi "mon-sun" (hay bất kỳ khoá gộp nào khác) vào `opening_hours.regular`.
  it('khoá gộp "mon-sun" (premise brief, KHÔNG khớp giá trị production thật) → unknown mọi ngày trong tuần, không phải open/closed đúng', () => {
    const collapsed = {
      timezone: 'Asia/Ho_Chi_Minh',
      regular: { 'mon-sun': [{ open: '09:00', close: '19:30' }] },
    } as unknown as OpeningHours;

    for (const now of [MON_10H, WED_18H, SUN_20H]) {
      const t = getOpeningToday(collapsed, now);
      expect(t.state).toBe('unknown');
      expect(t.hours).toBeNull();
    }
  });

  // Backend write-time validator (`apps/api/src/common/opening-hours.ts`) độc lập xác nhận cùng kết
  // luận: `regularErrors()` chỉ chấp nhận khoá nằm trong WEEKDAYS cố định — "mon-sun" bị từ chối
  // ngay tại DTO validation (`IsOpeningHours`), nên đường ghi ĐÃ ĐƯỢC VALIDATE (PlacesService
  // create/update) không bao giờ có thể lưu được khoá này. Rủi ro chỉ còn lại ở đường ghi KHÔNG qua
  // DTO (administrative-backfill, script raw SQL/TypeORM) — những đường đó không chạy
  // class-validator, nên trách nhiệm chặn "mon-sun" lọt vào phải nằm ở chính script/service ghi dữ
  // liệu, không thể trông cậy vào tầng đọc phát hiện ngược.
});

// REAL_DATA_SPRINT1C (2026-09-09): locks down the exact midnight-boundary semantics before any
// "closes at 24:00 daily" claim (VUI-Fest Bazaar: 16:00–24:00) is normalized into a payload. The
// task's own instruction is to normalize a midnight close as `close: "00:00"`, never `"23:59"` —
// this suite proves what that produces via the REAL `covers()` logic, not a guess: `covers()`'s
// wrap-around branch (`close > open ? ... : minutes >= open || minutes < close`) can only trigger
// its `minutes < close` half when `close` is nonzero, so `close: "00:00"` behaves as "open from
// `open` through the end of the calendar day, CLOSED again at the literal 00:00 boundary" — not a
// genuine overnight wrap into the next day. No coverage of this specific close:"00:00" shape
// existed before this suite (only a same-day `close:"23:59"` fixture, unrelated to this question).
describe('getOpeningToday — biên đóng cửa nửa đêm (close: "00:00", vd VUI-Fest 16:00–24:00 hàng ngày)', () => {
  const MIDNIGHT_CLOSE: OpeningHours = {
    timezone: 'Asia/Ho_Chi_Minh',
    regular: {
      mon: [{ open: '16:00', close: '00:00' }],
      tue: [{ open: '16:00', close: '00:00' }],
      wed: [{ open: '16:00', close: '00:00' }],
      thu: [{ open: '16:00', close: '00:00' }],
      fri: [{ open: '16:00', close: '00:00' }],
      sat: [{ open: '16:00', close: '00:00' }],
      sun: [{ open: '16:00', close: '00:00' }],
    },
  };

  // Cùng ngày Thứ Ba 2026-08-18 dùng lại ở các mốc TUE_* phía trên; giờ UTC = giờ VN - 7h.
  const TUE_1559 = new Date('2026-08-18T08:59:00Z'); // 15:59 thứ Ba, giờ VN
  const TUE_1600 = new Date('2026-08-18T09:00:00Z'); // 16:00 thứ Ba, giờ VN
  const TUE_2359 = new Date('2026-08-18T16:59:00Z'); // 23:59 thứ Ba, giờ VN
  const WED_0000 = new Date('2026-08-18T17:00:00Z'); // 00:00 thứ Tư, giờ VN — cùng mốc dùng ở dòng ~199

  it('15:59 → CLOSED (ngay trước giờ mở)', () => {
    expect(getOpeningToday(MIDNIGHT_CLOSE, TUE_1559).state).toBe('closed');
  });

  it('16:00 → OPEN (đúng giờ mở, biên dưới bao gồm điểm mở)', () => {
    expect(getOpeningToday(MIDNIGHT_CLOSE, TUE_1600).state).toBe('open');
  });

  it('23:59 → OPEN (còn trong ngày, chưa qua nửa đêm)', () => {
    expect(getOpeningToday(MIDNIGHT_CLOSE, TUE_2359).state).toBe('open');
  });

  it('00:00 (đã sang ngày mới) → CLOSED, KHÔNG suy diễn tràn sang ngày kế — close:"00:00" không phải khung qua đêm thật (vd 22:00–02:00), mà là "đóng đúng lúc nửa đêm"', () => {
    // Tại 00:00, weekday đã là thứ Tư (khung của thứ Ba không còn áp dụng) — nhưng dù ngay cả khi
    // so covers() trực tiếp cho khung 16:00–00:00, kết quả vẫn là false: nhánh wrap-around của
    // covers() là `minutes >= open || minutes < close`, và `minutes < 0` không bao giờ đúng (phút
    // luôn nằm trong [0, 1439]), nên khung 16:00–00:00 không bao giờ "mở" tại đúng phút 00:00.
    expect(getOpeningToday(MIDNIGHT_CLOSE, WED_0000).state).toBe('closed');
  });

  it('00:01 (1 phút sau nửa đêm, đã sang ngày mới) → CLOSED', () => {
    const WED_0001 = new Date('2026-08-18T17:01:00Z'); // 00:01 thứ Tư, giờ VN
    expect(getOpeningToday(MIDNIGHT_CLOSE, WED_0001).state).toBe('closed');
  });

  it('sau khi qua nửa đêm, hệ thống đọc lịch của NGÀY KẾ TIẾP theo đúng khoá thứ của nó — không phải lịch hôm trước bị "tràn" sang, và không phải một trạng thái mù/lẫn lộn', () => {
    // Cho thứ Ba một khung khác hẳn thứ Tư để phân biệt được "đang dùng khung nào". Nếu implementation
    // có lỗi carry-over (dùng nhầm mảng của ngày hôm trước sau khi qua nửa đêm), test dưới đây sẽ lộ ra
    // ngay: 00:01 thứ Tư phải phản ánh khung CỦA THỨ TƯ (đóng cả ngày), không phải khung của thứ Ba.
    const DIFFERENT_PER_DAY: OpeningHours = {
      timezone: 'Asia/Ho_Chi_Minh',
      regular: {
        mon: [{ open: '16:00', close: '00:00' }],
        tue: [{ open: '16:00', close: '00:00' }],
        wed: [], // thứ Tư đóng cửa cả ngày — cố ý khác thứ Ba để lộ carry-over nếu có
        thu: [{ open: '16:00', close: '00:00' }],
        fri: [{ open: '16:00', close: '00:00' }],
        sat: [{ open: '16:00', close: '00:00' }],
        sun: [{ open: '16:00', close: '00:00' }],
      },
    };
    const WED_0001 = new Date('2026-08-18T17:01:00Z'); // 00:01 thứ Tư, giờ VN
    const result = getOpeningToday(DIFFERENT_PER_DAY, WED_0001);
    // Thứ Tư có mảng RỖNG ("đóng cửa hôm nay", một lời khai) — nếu hệ thống lỡ dùng lại khung
    // 16:00–00:00 của thứ Ba (carry-over), state vẫn sẽ là 'closed' ở phút 00:01 nên không đủ để
    // phân biệt hai khả năng — phải kiểm cả `hours` (chỉ khung THẬT mới có, mảng rỗng luôn là
    // 'Đóng cửa') để chứng minh hệ thống đang đọc ĐÚNG mảng của thứ Tư, không phải mảng thứ Ba.
    expect(result.state).toBe('closed');
    expect(result.hours).toBe('Đóng cửa');
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
