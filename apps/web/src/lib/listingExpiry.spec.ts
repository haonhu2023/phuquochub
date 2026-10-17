/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import {
  listingEffectiveStatus,
  matchesListingFilter,
  todayInVietnam,
  useTodayInVietnam,
  EXPIRING_SOON_DAYS,
} from './listingExpiry';

describe('listingEffectiveStatus', () => {
  it('status khác published -> luôn null, kể cả còn/hết hạn', () => {
    expect(listingEffectiveStatus('draft', '2026-01-01', '2026-06-01')).toBeNull();
    expect(listingEffectiveStatus('pending', '2026-01-01', '2026-06-01')).toBeNull();
    expect(listingEffectiveStatus('closed', '2026-01-01', '2026-06-01')).toBeNull();
  });

  it('published, expires_at null -> null (chưa đặt hạn, không phải sắp/đã hết hạn)', () => {
    expect(listingEffectiveStatus('published', null, '2026-06-01')).toBeNull();
  });

  it('published, hạn đã qua -> "expired"', () => {
    expect(listingEffectiveStatus('published', '2026-05-01', '2026-06-01')).toBe('expired');
    expect(listingEffectiveStatus('published', '2026-05-31', '2026-06-01')).toBe('expired');
  });

  it('published, hạn đúng hôm nay -> CHƯA hết hạn (status=expired chỉ khi đã QUA, khớp backend expiresAt >= CURRENT_DATE)', () => {
    expect(listingEffectiveStatus('published', '2026-06-01', '2026-06-01')).not.toBe('expired');
  });

  it(`published, còn <= ${EXPIRING_SOON_DAYS} ngày -> "expiring_soon"`, () => {
    expect(listingEffectiveStatus('published', '2026-06-01', '2026-06-01')).toBe('expiring_soon');
    expect(listingEffectiveStatus('published', '2026-06-08', '2026-06-01')).toBe('expiring_soon');
  });

  it(`published, còn > ${EXPIRING_SOON_DAYS} ngày -> null (còn hạn, chưa cần cảnh báo)`, () => {
    expect(listingEffectiveStatus('published', '2026-06-09', '2026-06-01')).toBeNull();
    expect(listingEffectiveStatus('published', '2026-12-31', '2026-06-01')).toBeNull();
  });
});

describe('matchesListingFilter', () => {
  const base = { status: 'published', expires_at: '2026-06-01' as string | null };

  it('"all" khớp mọi item', () => {
    expect(matchesListingFilter(base, 'all', '2026-01-01')).toBe(true);
    expect(matchesListingFilter({ status: 'draft', expires_at: null }, 'all', '2026-01-01')).toBe(true);
  });

  it('lọc theo status thật (draft/pending/published/closed/rejected)', () => {
    expect(matchesListingFilter({ status: 'draft', expires_at: null }, 'draft', '2026-01-01')).toBe(true);
    expect(matchesListingFilter({ status: 'draft', expires_at: null }, 'pending', '2026-01-01')).toBe(false);
  });

  it('"expiring_soon"/"expired" lọc theo trạng thái SUY RA, không phải cột status thật', () => {
    // Hạn 2026-06-01, hôm nay 2026-06-01 -> sắp hết hạn (status thật vẫn "published").
    expect(matchesListingFilter(base, 'expiring_soon', '2026-06-01')).toBe(true);
    expect(matchesListingFilter(base, 'expired', '2026-06-01')).toBe(false);
    // Hạn đã qua.
    expect(matchesListingFilter(base, 'expired', '2026-07-01')).toBe(true);
    expect(matchesListingFilter(base, 'expiring_soon', '2026-07-01')).toBe(false);
    // Lọc "published" (status thật) KHÔNG tự động khớp/loại theo hạn — tin published còn hạn xa vẫn khớp "published".
    expect(matchesListingFilter({ status: 'published', expires_at: '2026-12-31' }, 'published', '2026-01-01')).toBe(true);
  });
});

describe('todayInVietnam', () => {
  it('trả đúng dạng YYYY-MM-DD', () => {
    expect(todayInVietnam()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// Bug thật đã sửa 2026-10-17: dashboard tính "hôm nay" một lần trong thân component thì không tự
// cập nhật khi sang ngày mới nếu không có thao tác nào khác ép re-render — một tab mở qua nửa đêm sẽ
// giữ nhãn/bộ lọc của ngày cũ vô thời hạn. Hook này tự kiểm định kỳ và re-render khi đổi.
describe('useTodayInVietnam', () => {
  // Dùng fake timer thật của Jest (ảnh hưởng `new Date()` lẫn `setInterval` bên trong hook) thay vì
  // mock nội bộ `todayInVietnam()` — thử cách đó trước và xác nhận KHÔNG hoạt động: hàm nội bộ hook
  // gọi tới vẫn là tham chiếu cục bộ trong cùng module, không phải qua object export bị
  // `jest.spyOn`/mock ghi đè (CommonJS compile ra lời gọi hàm trực tiếp, không qua `exports.`).
  // Test này KHÔNG dùng `screen.findByText`/`waitFor` của RTL (nơi fake timer từng làm treo khi thử
  // ở MyJobListingsView.spec.tsx) — chỉ `act()` + `jest.advanceTimersByTime`, nên an toàn.
  afterEach(() => {
    jest.useRealTimers();
  });

  it('trả giá trị ban đầu đúng theo giờ VN, rồi tự cập nhật khi sang ngày mới — không cần thao tác gì khác', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-15T23:59:30+07:00')); // gần nửa đêm giờ VN

    const { result } = renderHook(() => useTodayInVietnam());
    expect(result.current).toBe('2026-06-15');

    act(() => {
      jest.setSystemTime(new Date('2026-06-16T00:00:30+07:00')); // vừa qua nửa đêm giờ VN
      jest.advanceTimersByTime(60_000); // tới lần kiểm định kỳ tiếp theo của hook
    });
    expect(result.current).toBe('2026-06-16');
  });

  it('không re-render thừa khi "hôm nay" chưa đổi giữa các lần kiểm định kỳ', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-15T10:00:00+07:00'));

    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useTodayInVietnam();
    });
    const countAfterMount = renderCount;

    act(() => {
      jest.advanceTimersByTime(120_000); // 2 lần kiểm định kỳ, cùng ngày, giá trị không đổi
    });
    expect(result.current).toBe('2026-06-15');
    expect(renderCount).toBe(countAfterMount); // setState(prev => prev) không gây re-render thừa
  });
});
