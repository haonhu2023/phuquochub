/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { MapCta, MapCtaSkeleton, OwnerCta } from './HomeCtas';
import { getHomeCopy } from './home.copy';
import { countPublishedPlaces } from '@/modules/places/api/places.api';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock('@/modules/places/api/places.api', () => ({ countPublishedPlaces: jest.fn() }));

const mockCount = countPublishedPlaces as jest.Mock;

// `MapCta` là async Server Component (2026-09-17, real-data pass) — gọi trực tiếp và `await` kết
// quả trước khi `render`, CÙNG khuôn `DiscoverPlaces.spec.tsx`: `render(<MapCta .../>)` KHÔNG chạy
// được dưới Jest/RTL (react-dom client không biết "await" một function component).
describe('MapCta', () => {
  beforeEach(() => {
    mockCount.mockReset().mockResolvedValue(50);
  });

  it('liên kết tới trải nghiệm bản đồ đã có (/{locale}/map)', async () => {
    render(await MapCta({ locale: 'vi' }));
    const copy = getHomeCopy('vi');
    expect(screen.getByRole('link', { name: copy.mapLink })).toHaveAttribute('href', '/vi/map');
  });

  it('PR A: dùng đúng locale="en" khi được truyền — cả URL lẫn nội dung', async () => {
    render(await MapCta({ locale: 'en' }));
    const copy = getHomeCopy('en');
    expect(screen.getByRole('link', { name: copy.mapLink })).toHaveAttribute('href', '/en/map');
    expect(screen.getByRole('heading', { level: 2, name: copy.mapTitle })).toBeInTheDocument();
  });

  it('là section có tiêu đề h2 gắn nhãn', async () => {
    render(await MapCta({ locale: 'vi' }));
    const title = getHomeCopy('vi').mapTitle;
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
  });

  it('minh hoạ bản đồ CSS là trang trí (aria-hidden), không phải nội dung/liên kết thật', async () => {
    const { container } = render(await MapCta({ locale: 'vi' }));
    // Đúng một liên kết trong section: "Mở bản đồ". Minh hoạ CSS không được mọc thêm liên kết nào.
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('tổng place THẬT (meta.total qua GET /places?limit=1) → hiện dòng freshness', async () => {
    mockCount.mockResolvedValue(50);
    render(await MapCta({ locale: 'vi' }));
    expect(screen.getByText('50 địa điểm đã có trên bản đồ')).toBeInTheDocument();
  });

  it('API lỗi → ẩn hẳn dòng đếm, không hiện "0 địa điểm" hay thông báo lỗi nào', async () => {
    mockCount.mockRejectedValue(new Error('network'));
    render(await MapCta({ locale: 'vi' }));
    expect(screen.queryByText(/địa điểm đã có trên bản đồ/)).not.toBeInTheDocument();
  });

  it('tổng bằng 0 → ẩn hẳn dòng đếm (không khẳng định "0 địa điểm")', async () => {
    mockCount.mockResolvedValue(0);
    render(await MapCta({ locale: 'vi' }));
    expect(screen.queryByText(/địa điểm đã có trên bản đồ/)).not.toBeInTheDocument();
  });
});

describe('MapCtaSkeleton', () => {
  beforeEach(() => {
    mockCount.mockClear();
  });

  it('cùng bố cục tĩnh, không gọi API, không có dòng đếm', () => {
    render(<MapCtaSkeleton locale="vi" />);
    const copy = getHomeCopy('vi');
    expect(screen.getByRole('link', { name: copy.mapLink })).toHaveAttribute('href', '/vi/map');
    expect(mockCount).not.toHaveBeenCalled();
    expect(screen.queryByText(/địa điểm đã có trên bản đồ/)).not.toBeInTheDocument();
  });
});

describe('OwnerCta', () => {
  it('liên kết tới luồng xác nhận quyền quản lý CÓ THẬT (không qua localizedHref — ngoài [locale])', () => {
    render(<OwnerCta locale="vi" />);
    const copy = getHomeCopy('vi');
    expect(screen.getByRole('link', { name: copy.ownerLink })).toHaveAttribute(
      'href',
      '/dashboard/business-claims/new',
    );
  });

  it('href không đổi theo locale — (dashboard) nằm ngoài segment [locale]', () => {
    render(<OwnerCta locale="en" />);
    const copy = getHomeCopy('en');
    expect(screen.getByRole('link', { name: copy.ownerLink })).toHaveAttribute(
      'href',
      '/dashboard/business-claims/new',
    );
  });

  it('là section có tiêu đề h2 gắn nhãn', () => {
    render(<OwnerCta locale="vi" />);
    expect(
      screen.getByRole('heading', { level: 2, name: getHomeCopy('vi').ownerTitle }),
    ).toBeInTheDocument();
  });

  // Mục PHỤ trên trang dành cho khách tham quan: đúng một lời kêu gọi, không phải một khối bán hàng.
  it('chỉ có duy nhất một liên kết (không phải khối quảng bá nhiều lối)', () => {
    render(<OwnerCta locale="vi" />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('không hứa hẹn số liệu/quyền lợi bịa — chỉ nêu việc thật sự làm được sau khi xác nhận', () => {
    render(<OwnerCta locale="vi" />);
    expect(screen.getByText(getHomeCopy('vi').ownerDesc)).toBeInTheDocument();
  });
});
