/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { RIGHT_NOW_LIMIT, RightNowSection, RightNowSectionSkeleton } from './RightNowSection';
import { listRightNow } from '@/modules/places/api/places.api';
import type { PlaceNowCard } from '@/modules/places/types';

jest.mock('@/modules/places/api/places.api', () => ({ listRightNow: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockListRightNow = listRightNow as jest.Mock;

// Dữ liệu KHÔNG phụ thuộc giờ/ngày chạy test thật (deterministic): is_24h → luôn 'open'; mọi
// thứ rỗng → luôn 'closed' (mảng rỗng = lời khai "đóng cửa hôm nay", đúng quy ước openingHours.ts);
// null → luôn 'unknown'.
const OPEN_24H = { is_24h: true };
const CLOSED_ALL_WEEK = {
  regular: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
};

function place(overrides: Partial<PlaceNowCard> = {}): PlaceNowCard {
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
    verification_status: 'verified',
    status: 'published',
    location: { lat: 10, lng: 104 },
    opening_hours: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockListRightNow.mockReset().mockResolvedValue([]);
});

describe('RightNowSection — truy vấn', () => {
  it('gọi listRightNow đúng một lần với locale + limit có chặn trên', async () => {
    render(await RightNowSection({ locale: 'vi' }));
    expect(mockListRightNow).toHaveBeenCalledTimes(1);
    expect(mockListRightNow).toHaveBeenCalledWith({ locale: 'vi', limit: RIGHT_NOW_LIMIT });
  });

  it('locale en → truyền đúng locale xuống API', async () => {
    render(await RightNowSection({ locale: 'en' }));
    expect(mockListRightNow).toHaveBeenCalledWith({ locale: 'en', limit: RIGHT_NOW_LIMIT });
  });
});

describe('RightNowSection — có dữ liệu', () => {
  it('render thẻ địa điểm thật, liên kết tới trang chi tiết', async () => {
    mockListRightNow.mockResolvedValueOnce([
      place(),
      place({ id: 'p2', name: 'Bãi Sao', slug: 'bai-sao', opening_hours: OPEN_24H }),
    ]);
    render(await RightNowSection({ locale: 'vi' }));

    expect(screen.getByText('Dinh Cậu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bãi Sao/ })).toHaveAttribute('href', '/vi/places/bai-sao');
  });

  it('tên địa điểm nằm dưới tiêu đề khối một bậc (h2 → h3)', async () => {
    mockListRightNow.mockResolvedValueOnce([place()]);
    render(await RightNowSection({ locale: 'vi' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Đi đâu ngay bây giờ?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Dinh Cậu' })).toBeInTheDocument();
  });

  it('có liên kết xem thêm tới /places', async () => {
    mockListRightNow.mockResolvedValueOnce([place()]);
    render(await RightNowSection({ locale: 'vi' }));
    expect(screen.getByRole('link', { name: /Xem thêm/ })).toHaveAttribute('href', '/vi/places');
  });
});

describe('RightNowSection — rỗng', () => {
  it('không có gợi ý nào → trạng thái rỗng trung thực, KHÔNG dữ liệu giả', async () => {
    mockListRightNow.mockResolvedValueOnce([]);
    render(await RightNowSection({ locale: 'vi' }));

    expect(screen.getByText('Chưa có gợi ý nào lúc này')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Đi đâu ngay bây giờ?' })).toBeInTheDocument();
  });
});

describe('RightNowSection — API hỏng', () => {
  it('listRightNow ném lỗi → KHÔNG ném ra ngoài, chỉ thu nhỏ khối này lại', async () => {
    mockListRightNow.mockRejectedValueOnce(new Error('API down'));

    const element = await RightNowSection({ locale: 'vi' });
    render(element);

    expect(screen.getByRole('status')).toHaveTextContent(/chưa tải được gợi ý/i);
  });

  it('lỗi KHÔNG lộ chi tiết kỹ thuật ra giao diện', async () => {
    mockListRightNow.mockRejectedValueOnce(new Error('ECONNREFUSED 10.0.0.5:5432'));
    render(await RightNowSection({ locale: 'vi' }));
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
  });
});

describe('RightNowSection — trạng thái mở/đóng cửa (getOpeningToday)', () => {
  it('opening_hours 24h → hiển thị "Đang mở cửa" (VI)', async () => {
    mockListRightNow.mockResolvedValueOnce([place({ opening_hours: OPEN_24H })]);
    render(await RightNowSection({ locale: 'vi' }));
    expect(screen.getByText('Đang mở cửa')).toBeInTheDocument();
  });

  it('opening_hours đóng cả tuần → hiển thị "Đã đóng cửa" (VI)', async () => {
    mockListRightNow.mockResolvedValueOnce([place({ opening_hours: CLOSED_ALL_WEEK })]);
    render(await RightNowSection({ locale: 'vi' }));
    expect(screen.getByText('Đã đóng cửa')).toBeInTheDocument();
  });

  it('opening_hours null → hiển thị "Chưa có thông tin giờ mở cửa" (VI), KHÔNG BAO GIỜ hiện "Đã đóng cửa"', async () => {
    mockListRightNow.mockResolvedValueOnce([place({ opening_hours: null })]);
    render(await RightNowSection({ locale: 'vi' }));
    expect(screen.getByText('Chưa có thông tin giờ mở cửa')).toBeInTheDocument();
    expect(screen.queryByText('Đã đóng cửa')).not.toBeInTheDocument();
  });

  it('locale EN → văn bản trạng thái tiếng Anh, không rơi về nhãn tiếng Việt của getOpeningToday()', async () => {
    mockListRightNow.mockResolvedValueOnce([
      place({ id: 'p1', opening_hours: OPEN_24H }),
      place({ id: 'p2', name: 'Dinh Cậu 2', slug: 'dinh-cau-2', opening_hours: CLOSED_ALL_WEEK }),
      place({ id: 'p3', name: 'Sunset Sanato', slug: 'sunset-sanato', opening_hours: null }),
    ]);
    render(await RightNowSection({ locale: 'en' }));

    expect(screen.getByText('Open now')).toBeInTheDocument();
    expect(screen.getByText('Closed now')).toBeInTheDocument();
    expect(screen.getByText('Hours unknown')).toBeInTheDocument();
    expect(screen.queryByText('Đang mở cửa')).not.toBeInTheDocument();
    expect(screen.queryByText('Đã đóng cửa')).not.toBeInTheDocument();
    expect(screen.queryByText('Chưa có thông tin giờ mở cửa')).not.toBeInTheDocument();
  });
});

describe('RightNowSectionSkeleton', () => {
  it('thông báo trạng thái đang tải cho trình đọc màn hình', () => {
    render(<RightNowSectionSkeleton locale="vi" />);
    const region = screen.getByLabelText('Đang tìm địa điểm phù hợp ngay bây giờ');
    expect(region).toHaveAttribute('aria-busy', 'true');
  });
});
