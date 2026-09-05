/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NearbyDiscovery } from './NearbyDiscovery';
import { nearby } from '@/modules/map/api/geo.api';

jest.mock('@/modules/map/api/geo.api', () => ({ nearby: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockNearby = nearby as jest.Mock;

const COPY = {
  cta: 'Địa điểm gần bạn',
  loading: 'Đang tìm địa điểm gần bạn…',
  denied: 'Bạn chưa cho phép truy cập vị trí.',
  error: 'Không lấy được vị trí.',
  empty: 'Không tìm thấy địa điểm nào gần vị trí hiện tại của bạn.',
  privacyNote: 'Vị trí của bạn chỉ dùng để tìm địa điểm gần đó, không được lưu lại.',
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
    ...overrides,
  };
}

// Phase 8/9/32 — "Gần bạn" CHỈ được kích hoạt SAU KHI người dùng đồng ý, không tự động đòi quyền,
// và trang phải dùng được BÌNH THƯỜNG nếu người dùng từ chối/không có geolocation.
describe('NearbyDiscovery — Gần bạn', () => {
  const originalGeolocation = navigator.geolocation;

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', { value: originalGeolocation, configurable: true });
    mockNearby.mockReset();
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
    expect(mockNearby).not.toHaveBeenCalled();
  });

  it('đồng ý quyền → gọi API nearby thật với đúng toạ độ, render kết quả thật', async () => {
    mockNearby.mockResolvedValueOnce([place(), place({ id: 'p2', name: 'Dinh Cậu', slug: 'dinh-cau' })]);
    const getCurrentPosition = jest.fn((success) => {
      success({ coords: { latitude: 10.22, longitude: 103.96 } });
    });
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<NearbyDiscovery locale="vi" copy={COPY} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.cta }));
    await waitFor(() => expect(screen.getByText('Dinh Cậu')).toBeInTheDocument());
    expect(mockNearby).toHaveBeenCalledWith(10.22, 103.96, 5000);
  });

  it('API lỗi sau khi có vị trí → thông báo lỗi trung thực, không bịa kết quả', async () => {
    mockNearby.mockRejectedValueOnce(new Error('network'));
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
    mockNearby.mockResolvedValueOnce([]);
    const getCurrentPosition = jest.fn((success) => success({ coords: { latitude: 10, longitude: 104 } }));
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    render(<NearbyDiscovery locale="vi" copy={COPY} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.cta }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(COPY.empty));
  });
});
