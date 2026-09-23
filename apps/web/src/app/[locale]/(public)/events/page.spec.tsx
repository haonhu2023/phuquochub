/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { listEvents, type EventSummary } from '@/modules/events/api/events.api';
import EventsPage from './page';

jest.mock('@/modules/events/api/events.api', () => ({ listEvents: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockListEvents = listEvents as jest.Mock;

function event(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: 'e1',
    title: 'Vui Fest Bazaar',
    slug: 'vui-fest-bazaar',
    start_at: '2026-10-01T00:00:00.000Z',
    end_at: '2026-10-02T00:00:00.000Z',
    timezone: 'Asia/Ho_Chi_Minh',
    event_category: null,
    status: 'published',
    time_status: 'upcoming',
    ...overrides,
  };
}

// Empty state hữu ích (2026-09-17): production hôm nay có 0 sự kiện published thật
// (GET /events -> meta.total: 0), nên trạng thái rỗng này là trạng thái THẬT SẼ gặp, không phải
// một nhánh lý thuyết ít khi chạy.
describe('EventsPage', () => {
  beforeEach(() => {
    mockListEvents.mockReset();
  });

  it('danh sách rỗng -> hướng người dùng sang các nhóm ĐÃ có dữ liệu thật, không dừng ở "chưa có sự kiện"', async () => {
    mockListEvents.mockResolvedValue([]);
    render(await EventsPage({ params: Promise.resolve({ locale: 'vi' }) }));

    expect(screen.getByText('Chưa có sự kiện nào được công khai')).toBeInTheDocument();
    // 5 lối vào thật (khớp home.copy.ts sau khi gỡ '/events' khỏi lưới danh mục trang chủ).
    expect(screen.getByRole('link', { name: 'Khách sạn' })).toHaveAttribute('href', '/vi/hotels');
    expect(screen.getByRole('link', { name: 'Nhà hàng' })).toHaveAttribute('href', '/vi/restaurants');
    expect(screen.getByRole('link', { name: 'Tour' })).toHaveAttribute('href', '/vi/tours');
    expect(screen.getByRole('link', { name: 'Điểm tham quan' })).toHaveAttribute('href', '/vi/attractions');
    expect(screen.getByRole('link', { name: 'Bãi biển' })).toHaveAttribute('href', '/vi/beaches');
  });

  it('lỗi API -> vẫn coi là rỗng, hiện đúng lối thoát, không rơi vào error.tsx', async () => {
    mockListEvents.mockRejectedValue(new Error('network'));
    render(await EventsPage({ params: Promise.resolve({ locale: 'vi' }) }));

    expect(screen.getByText('Chưa có sự kiện nào được công khai')).toBeInTheDocument();
  });

  it('EN: empty state và lối thoát đều dịch đúng', async () => {
    mockListEvents.mockResolvedValue([]);
    render(await EventsPage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByText('No published events yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hotels' })).toHaveAttribute('href', '/en/hotels');
  });

  it('có sự kiện thật -> render danh sách, KHÔNG hiện empty state/lối thoát', async () => {
    mockListEvents.mockResolvedValue([event()]);
    render(await EventsPage({ params: Promise.resolve({ locale: 'vi' }) }));

    expect(screen.getByRole('link', { name: 'Vui Fest Bazaar' })).toHaveAttribute(
      'href',
      '/vi/events/vui-fest-bazaar',
    );
    expect(screen.queryByText('Chưa có sự kiện nào được công khai')).not.toBeInTheDocument();
  });
});
