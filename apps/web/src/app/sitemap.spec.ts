import sitemap from './sitemap';
import { listPlaces } from '@/modules/places/api/places.api';
import { listHotelSlugs } from '@/modules/hotels/api/hotels.api';
import { listRestaurantSlugs } from '@/modules/restaurants/api/restaurants.api';
import { listTourSlugs } from '@/modules/tours/api/tours.api';
import { listEvents } from '@/modules/events/api/events.api';

jest.mock('@/modules/places/api/places.api', () => ({ listPlaces: jest.fn() }));
jest.mock('@/modules/hotels/api/hotels.api', () => ({ listHotelSlugs: jest.fn() }));
jest.mock('@/modules/restaurants/api/restaurants.api', () => ({ listRestaurantSlugs: jest.fn() }));
jest.mock('@/modules/tours/api/tours.api', () => ({ listTourSlugs: jest.fn() }));
jest.mock('@/modules/events/api/events.api', () => ({ listEvents: jest.fn() }));

const mockListPlaces = listPlaces as jest.Mock;
const mockListHotelSlugs = listHotelSlugs as jest.Mock;
const mockListRestaurantSlugs = listRestaurantSlugs as jest.Mock;
const mockListTourSlugs = listTourSlugs as jest.Mock;
const mockListEvents = listEvents as jest.Mock;

beforeEach(() => {
  mockListPlaces.mockReset().mockResolvedValue([{ id: 'p1', slug: 'vinwonders-phu-quoc' }]);
  mockListHotelSlugs.mockReset().mockResolvedValue([{ slug: 'jw-marriott' }]);
  mockListRestaurantSlugs.mockReset().mockResolvedValue([{ slug: 'crab-house' }]);
  mockListTourSlugs.mockReset().mockResolvedValue([{ slug: 'sunset-cruise' }]);
  mockListEvents.mockReset().mockResolvedValue([{ slug: 'some-event' }]);
});

// SEO v2 (Phase 21) — hợp đồng sitemap sau nâng cấp:
//  - /search KHÔNG còn xuất hiện (kết quả tìm kiếm nội bộ không nên là bề mặt index lớn);
//  - route "hub" (places/hotels/restaurants/tours/attractions/beaches/explore/map/events) có CẢ
//    /vi VÀ /en — cả hai bản đều có tiêu đề/H1/mô tả tiếng Anh thật (hub-pages.copy.ts);
//  - trang chi tiết thực thể chỉ có /vi cho tới khi có bản dịch EN đã duyệt
//    (`isEnDetailIndexable` khoá `false` toàn bộ hôm nay — xem lib/seo.ts).
describe('sitemap v2', () => {
  it('không còn URL /search nào (nội bộ, không nên là bề mặt index lớn)', async () => {
    const entries = await sitemap();
    expect(entries.some((e) => e.url.includes('/search'))).toBe(false);
  });

  it('có URL hub CẢ hai locale (vi và en)', async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('http://localhost:3000/vi/restaurants');
    expect(urls).toContain('http://localhost:3000/en/restaurants');
    expect(urls).toContain('http://localhost:3000/vi/map');
    expect(urls).toContain('http://localhost:3000/en/map');
  });

  it('trang chủ có mặt ở cả hai locale với priority cao nhất', async () => {
    const entries = await sitemap();
    const home = entries.filter((e) => e.url === 'http://localhost:3000/vi' || e.url === 'http://localhost:3000/en');
    expect(home).toHaveLength(2);
    for (const e of home) expect(e.priority).toBe(1);
  });

  it('trang chi tiết thực thể: có /vi/places/{slug}, KHÔNG có /en/places/{slug} (chưa qua cổng EN)', async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('http://localhost:3000/vi/places/vinwonders-phu-quoc');
    expect(urls).not.toContain('http://localhost:3000/en/places/vinwonders-phu-quoc');
  });

  it('bao gồm chi tiết hotel/restaurant/tour/event ở /vi', async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('http://localhost:3000/vi/hotels/jw-marriott');
    expect(urls).toContain('http://localhost:3000/vi/restaurants/crab-house');
    expect(urls).toContain('http://localhost:3000/vi/tours/sunset-cruise');
    expect(urls).toContain('http://localhost:3000/vi/events/some-event');
  });

  it('một endpoint lỗi KHÔNG làm hỏng cả sitemap — các entity khác vẫn có mặt', async () => {
    mockListHotelSlugs.mockRejectedValueOnce(new Error('API down'));
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('http://localhost:3000/vi/places/vinwonders-phu-quoc');
    expect(urls.some((u) => u.includes('/hotels/'))).toBe(false);
    // Trang duyệt /hotels (route tĩnh) vẫn còn — chỉ chi tiết từng hotel bị bỏ qua khi fetch lỗi.
    expect(urls).toContain('http://localhost:3000/vi/hotels');
  });
});
