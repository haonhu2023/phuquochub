/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { DISCOVER_LIMIT, DiscoverPlaces, DiscoverPlacesSkeleton } from './DiscoverPlaces';
import { listPlaces } from '@/modules/places/api/places.api';
import type { PlaceCard as PlaceCardType } from '@/modules/places/types';

jest.mock('@/modules/places/api/places.api', () => ({ listPlaces: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockListPlaces = listPlaces as jest.Mock;

function place(overrides: Partial<PlaceCardType> = {}): PlaceCardType {
  return {
    id: 'p1',
    name: 'Dinh Cậu',
    slug: 'dinh-cau',
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

beforeEach(() => {
  mockListPlaces.mockReset().mockResolvedValue([]);
});

describe('DiscoverPlaces — truy vấn', () => {
  // Trang chủ KHÔNG được kéo cả danh sách địa điểm: truy vấn luôn có chặn trên.
  it('gọi listPlaces đúng một lần với limit có chặn trên', async () => {
    render(await DiscoverPlaces());
    expect(mockListPlaces).toHaveBeenCalledTimes(1);
    expect(mockListPlaces).toHaveBeenCalledWith({ limit: DISCOVER_LIMIT });
  });

  // Không truyền tham số sắp xếp nào: thứ tự "nổi bật" CHÍNH LÀ thứ tự mặc định của GET /places
  // (rating_avg DESC NULLS LAST, created_at DESC, id ASC) — không có xếp hạng nào bịa ở client.
  it('không truyền tham số sắp xếp/lọc tự chế nào', async () => {
    render(await DiscoverPlaces());
    expect(Object.keys(mockListPlaces.mock.calls[0][0])).toEqual(['limit']);
  });
});

describe('DiscoverPlaces — có dữ liệu', () => {
  it('render thẻ địa điểm thật, liên kết tới trang chi tiết', async () => {
    mockListPlaces.mockResolvedValueOnce([place(), place({ id: 'p2', name: 'Bãi Sao', slug: 'bai-sao' })]);
    render(await DiscoverPlaces());

    expect(screen.getByText('Dinh Cậu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bãi Sao/ })).toHaveAttribute('href', '/places/bai-sao');
  });

  // Tiêu đề khối là h2 → tên địa điểm phải là h3, không được phẳng cùng bậc.
  it('tên địa điểm nằm dưới tiêu đề khối một bậc (h2 → h3)', async () => {
    mockListPlaces.mockResolvedValueOnce([place()]);
    render(await DiscoverPlaces());

    expect(screen.getByRole('heading', { level: 2, name: 'Địa điểm nổi bật' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Dinh Cậu' })).toBeInTheDocument();
  });

  it('có liên kết xem thêm tới /places', async () => {
    mockListPlaces.mockResolvedValueOnce([place()]);
    render(await DiscoverPlaces());
    expect(screen.getByRole('link', { name: /Xem thêm/ })).toHaveAttribute('href', '/places');
  });
});

describe('DiscoverPlaces — rỗng', () => {
  it('không có địa điểm nào → trạng thái rỗng trung thực, KHÔNG dữ liệu giả', async () => {
    mockListPlaces.mockResolvedValueOnce([]);
    render(await DiscoverPlaces());

    expect(screen.getByText('Chưa có địa điểm nào')).toBeInTheDocument();
    // Tiêu đề khối vẫn còn — người dùng hiểu khối này là gì.
    expect(screen.getByRole('heading', { level: 2, name: 'Địa điểm nổi bật' })).toBeInTheDocument();
  });
});

describe('DiscoverPlaces — API hỏng', () => {
  // Đây là bảo đảm quan trọng nhất của trang chủ: API chết KHÔNG được giết cả trang.
  it('listPlaces ném lỗi → KHÔNG ném ra ngoài, chỉ thu nhỏ khối này lại', async () => {
    mockListPlaces.mockRejectedValueOnce(new Error('API down'));

    const element = await DiscoverPlaces();
    render(element);

    expect(screen.getByRole('status')).toHaveTextContent(/chưa tải được danh sách địa điểm/i);
    // Vẫn còn tiêu đề + lối đi tiếp, không phải một khoảng trắng vô nghĩa.
    expect(screen.getByRole('heading', { level: 2, name: 'Địa điểm nổi bật' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Xem thêm/ })).toBeInTheDocument();
  });

  it('lỗi KHÔNG lộ chi tiết kỹ thuật ra giao diện', async () => {
    mockListPlaces.mockRejectedValueOnce(new Error('ECONNREFUSED 10.0.0.5:5432'));
    render(await DiscoverPlaces());
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
  });
});

describe('DiscoverPlacesSkeleton', () => {
  it('thông báo trạng thái đang tải cho trình đọc màn hình', () => {
    render(<DiscoverPlacesSkeleton />);
    const region = screen.getByLabelText('Đang tải địa điểm nổi bật');
    expect(region).toHaveAttribute('aria-busy', 'true');
  });
});
