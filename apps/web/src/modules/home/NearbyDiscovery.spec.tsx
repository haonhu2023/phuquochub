/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NearbyDiscovery } from './NearbyDiscovery';
import { nearbyTrusted } from '@/modules/map/api/geo.api';

jest.mock('@/modules/map/api/geo.api', () => ({ nearbyTrusted: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockNearbyTrusted = nearbyTrusted as jest.Mock;

const COPY = {
  cta: 'Địa điểm gần bạn',
  loading: 'Đang tìm địa điểm gần bạn…',
  denied: 'Bạn chưa cho phép truy cập vị trí.',
  error: 'Không lấy được vị trí.',
  empty: 'Không tìm thấy địa điểm nào gần vị trí hiện tại của bạn.',
  privacyNote: 'Vị trí của bạn chỉ dùng để tìm địa điểm gần đó, không được lưu lại.',
  openNow: 'Đang mở cửa',
  closedNow: 'Đã đóng cửa',
  hoursUnknown: 'Chưa có thông tin giờ mở cửa',
};

const EN_COPY = {
  ...COPY,
  openNow: 'Open now',
  closedNow: 'Closed now',
  hoursUnknown: 'Hours unknown',
};

function place(overrides = {}) {
  return {
    id: 'p1',
    name: 'Bãi Sao',
    slug: 'bai-sao',
    category_id: 'c1',
    short_description: null,
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'pending',
    status: 'published',
    location: { lat: 10, lng: 104 },
    opening_hours: null,
    ...overrides,
  };
}

// Trạng thái mở/đóng cửa dùng dữ liệu KHÔNG phụ thuộc giờ/ngày chạy test thật (deterministic):
// is_24h → luôn 'open'; mọi thứ rỗng → luôn 'closed' (mảng rỗng = lời khai "đóng cửa hôm nay",
// đúng quy ước openingHours.ts); null → luôn 'unknown'.
const OPEN_24H = { is_24h: true };
const CLOSED_ALL_WEEK = {
  regular: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
};

// Phase 8/9/32 — "Gần bạn" CHỈ được kích hoạt SAU KHI người dùng đồng ý, không tự động đòi quyền,
// và trang phải dùng được BÌNH THƯỜNG nếu người dùng từ chối/không có geolocation.
describe('NearbyDiscovery — Gần bạn', () => {
  const originalGeolocation = navigator.geolocation;

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', { value: originalGeolocation, configurable: true });
    mockNearbyTrusted.mockReset();
  });

  it('trạng thái ban đầu: chỉ có nút bấm — KHÔNG tự động đòi quyền vị trí', () => {
    const getCurrentPosition = jest.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<NearbyDiscovery locale="vi" copy={COPY} />);
    expect(screen.getByRole('button', { name: COPY.cta })).toBeInTheDocument();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('ghi rõ vị trí không được lưu lại (minh bạch quyền riêng tư)', () => {
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: jest.fn() }, configurable: true });
    render(<NearbyDiscovery locale="vi" copy={COPY} />);
    expect(screen.getByText(COPY.privacyNote)).toBeInTheDocument();
  });

  it('người dùng từ chối quyền → thông báo trung thực, KHÔNG crash, KHÔNG che trang', async () => {
    const getCurrentPosition = jest.fn((_success, error) => {
      error({ code: 1, PERMISSION_DENIED: 1 });
    });
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<NearbyDiscovery locale="vi" copy={COPY} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.cta }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(COPY.denied));
    expect(mockNearbyTrusted).not.toHaveBeenCalled();
  });

  it('đồng ý quyền → gọi API nearby thật với đúng toạ độ, render kết quả thật', async () => {
    mockNearbyTrusted.mockResolvedValueOnce([place(), place({ id: 'p2', name: 'Dinh Cậu', slug: 'dinh-cau' })]);
    const getCurrentPosition = jest.fn((success) => {
      success({ coords: { latitude: 10.22, longitude: 103.96 } });
    });
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<NearbyDiscovery locale="vi" copy={COPY} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.cta }));
    await waitFor(() => expect(screen.getByText('Dinh Cậu')).toBeInTheDocument());
    expect(mockNearbyTrusted).toHaveBeenCalledWith(10.22, 103.96, 5000);
  });

  it('API lỗi sau khi có vị trí → thông báo lỗi trung thực, không bịa kết quả', async () => {
    mockNearbyTrusted.mockRejectedValueOnce(new Error('network'));
    const getCurrentPosition = jest.fn((success) => success({ coords: { latitude: 10, longitude: 104 } }));
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<NearbyDiscovery locale="vi" copy={COPY} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.cta }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(COPY.error));
  });

  it('không có geolocation trong trình duyệt → thông báo lỗi trung thực, không giả vờ hoạt động', async () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    render(<NearbyDiscovery locale="vi" copy={COPY} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.cta }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(COPY.error));
  });

  it('không có kết quả gần đó → trạng thái rỗng trung thực, không bịa địa điểm', async () => {
    mockNearbyTrusted.mockResolvedValueOnce([]);
    const getCurrentPosition = jest.fn((success) => success({ coords: { latitude: 10, longitude: 104 } }));
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<NearbyDiscovery locale="vi" copy={COPY} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.cta }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(COPY.empty));
  });
});

// Trusted Nearby + Opening State v0 (Phase 2) — trạng thái mở/đóng cửa đọc qua getOpeningToday(),
// văn bản hiển thị đúng theo locale, và 'unknown' KHÔNG BAO GIỜ hiển thị như 'closed'.
describe('NearbyDiscovery — Trusted Nearby + Opening State v0', () => {
  function clickCta(locale: 'vi' | 'en', copy: typeof COPY) {
    const getCurrentPosition = jest.fn((success) => success({ coords: { latitude: 10, longitude: 104 } }));
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<NearbyDiscovery locale={locale} copy={copy} />);
    fireEvent.click(screen.getByRole('button', { name: copy.cta }));
  }

  afterEach(() => {
    mockNearbyTrusted.mockReset();
  });

  it('opening_hours 24h → hiển thị "Đang mở cửa" (VI)', async () => {
    mockNearbyTrusted.mockResolvedValueOnce([place({ opening_hours: OPEN_24H })]);
    clickCta('vi', COPY);
    await waitFor(() => expect(screen.getByText(COPY.openNow)).toBeInTheDocument());
  });

  it('opening_hours đóng cả tuần → hiển thị "Đã đóng cửa" (VI)', async () => {
    mockNearbyTrusted.mockResolvedValueOnce([place({ opening_hours: CLOSED_ALL_WEEK })]);
    clickCta('vi', COPY);
    await waitFor(() => expect(screen.getByText(COPY.closedNow)).toBeInTheDocument());
  });

  it('opening_hours null → hiển thị "Chưa có thông tin giờ mở cửa" (VI), KHÔNG BAO GIỜ hiện "Đã đóng cửa"', async () => {
    mockNearbyTrusted.mockResolvedValueOnce([place({ opening_hours: null })]);
    clickCta('vi', COPY);
    await waitFor(() => expect(screen.getByText(COPY.hoursUnknown)).toBeInTheDocument());
    expect(screen.queryByText(COPY.closedNow)).not.toBeInTheDocument();
  });

  it('locale EN → văn bản trạng thái tiếng Anh, không rơi về nhãn tiếng Việt của getOpeningToday()', async () => {
    mockNearbyTrusted.mockResolvedValueOnce([
      place({ id: 'p1', opening_hours: OPEN_24H }),
      place({ id: 'p2', name: 'Dinh Cậu', slug: 'dinh-cau', opening_hours: CLOSED_ALL_WEEK }),
      place({ id: 'p3', name: 'Sunset Sanato', slug: 'sunset-sanato', opening_hours: null }),
    ]);
    clickCta('en', EN_COPY);
    await waitFor(() => expect(screen.getByText(EN_COPY.openNow)).toBeInTheDocument());
    expect(screen.getByText(EN_COPY.closedNow)).toBeInTheDocument();
    expect(screen.getByText(EN_COPY.hoursUnknown)).toBeInTheDocument();
    expect(screen.queryByText('Đang mở cửa')).not.toBeInTheDocument();
    expect(screen.queryByText('Đã đóng cửa')).not.toBeInTheDocument();
    expect(screen.queryByText('Chưa có thông tin giờ mở cửa')).not.toBeInTheDocument();
  });
});

// 2026-09-09 Discovery trust surface follow-up: nearbyTrusted()'s field-evidence gate only proves
// opening_hours — Nearby must not lend that to a generic "Đã xác minh" badge or a real price, both
// of which read the unrelated whole-place verification_status.
describe('NearbyDiscovery — không mượn badge/giá từ verification_status toàn place', () => {
  afterEach(() => {
    mockNearbyTrusted.mockReset();
  });

  it('place trusted + có giá → KHÔNG hiện badge "Đã xác minh" lẫn giá thật', async () => {
    mockNearbyTrusted.mockResolvedValueOnce([
      place({ verification_status: 'verified', price_range: 'low', opening_hours: OPEN_24H }),
    ]);
    const getCurrentPosition = jest.fn((success) => success({ coords: { latitude: 10, longitude: 104 } }));
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<NearbyDiscovery locale="vi" copy={COPY} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.cta }));

    await waitFor(() => expect(screen.getByText(COPY.openNow)).toBeInTheDocument());
    expect(screen.queryByText('Đã xác minh')).not.toBeInTheDocument();
    expect(screen.queryByText('Bình dân')).not.toBeInTheDocument();
  });
});
