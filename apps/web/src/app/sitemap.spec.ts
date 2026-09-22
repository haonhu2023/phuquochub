import sitemap from './sitemap';
import { listPlaces, listEnIndexablePlaceIds } from '@/modules/places/api/places.api';
import { listHotelSlugs } from '@/modules/hotels/api/hotels.api';
import { listRestaurantSlugs } from '@/modules/restaurants/api/restaurants.api';
import { listTourSlugs } from '@/modules/tours/api/tours.api';
import { listEvents } from '@/modules/events/api/events.api';
import { listGuideArticles } from '@/modules/guide/api/guide.api';

jest.mock('@/modules/places/api/places.api', () => ({ listPlaces: jest.fn(), listEnIndexablePlaceIds: jest.fn() }));
jest.mock('@/modules/hotels/api/hotels.api', () => ({ listHotelSlugs: jest.fn() }));
jest.mock('@/modules/restaurants/api/restaurants.api', () => ({ listRestaurantSlugs: jest.fn() }));
jest.mock('@/modules/tours/api/tours.api', () => ({ listTourSlugs: jest.fn() }));
jest.mock('@/modules/events/api/events.api', () => ({ listEvents: jest.fn() }));
jest.mock('@/modules/guide/api/guide.api', () => ({ listGuideArticles: jest.fn() }));

const mockListPlaces = listPlaces as jest.Mock;
const mockListEnIndexablePlaceIds = listEnIndexablePlaceIds as jest.Mock;
const mockListHotelSlugs = listHotelSlugs as jest.Mock;
const mockListRestaurantSlugs = listRestaurantSlugs as jest.Mock;
const mockListTourSlugs = listTourSlugs as jest.Mock;
const mockListEvents = listEvents as jest.Mock;
const mockListGuideArticles = listGuideArticles as jest.Mock;

beforeEach(() => {
  mockListPlaces.mockReset().mockResolvedValue([{ id: 'p1', slug: 'vinwonders-phu-quoc' }]);
  // Mặc định: KHÔNG entity nào đủ điều kiện EN — giữ nguyên đúng assertion cũ (chưa qua cổng EN)
  // cho mọi test không tự set lại mock này.
  mockListEnIndexablePlaceIds.mockReset().mockResolvedValue([]);
  mockListHotelSlugs.mockReset().mockResolvedValue([{ slug: 'jw-marriott', id: 'h1' }]);
  mockListRestaurantSlugs.mockReset().mockResolvedValue([{ slug: 'crab-house', id: 'r1' }]);
  mockListTourSlugs.mockReset().mockResolvedValue([{ slug: 'sunset-cruise', id: 't1' }]);
  mockListEvents.mockReset().mockResolvedValue([{ slug: 'some-event' }]);
  // listGuideArticles(locale) is called TWICE (once per locale) — mockImplementation so each call
  // gets the right locale's fixture instead of both getting the same mockResolvedValueOnce.
  mockListGuideArticles.mockReset().mockImplementation((locale: string) =>
    Promise.resolve(
      locale === 'vi'
        ? [{ slug: 'phu-quoc', locale: 'vi', title: 'Cẩm nang', intro: null, heroImageUrl: null, publishedAt: '2026-09-01T00:00:00.000Z' }]
        : [],
    ),
  );
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

  // SEO1 (2026-09-22) — sửa lỗi "luôn truyền undefined nên isEnDetailIndexable luôn false": nay
  // sitemap tự gọi listEnIndexablePlaceIds() với id thật của place/hotel/restaurant/tour, và
  // /en/{path}/{slug} chỉ xuất hiện khi id đó nằm trong tập kết quả.
  describe('EN detail entries (SEO1)', () => {
    it('place có id nằm trong kết quả listEnIndexablePlaceIds → /en/places/{slug} CÓ mặt', async () => {
      mockListEnIndexablePlaceIds.mockResolvedValue(['p1']);
      const entries = await sitemap();
      expect(entries.map((e) => e.url)).toContain('http://localhost:3000/en/places/vinwonders-phu-quoc');
    });

    it('hotel/restaurant/tour có id nằm trong kết quả → /en/{path}/{slug} CÓ mặt cho cả ba', async () => {
      mockListEnIndexablePlaceIds.mockResolvedValue(['h1', 'r1', 't1']);
      const entries = await sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain('http://localhost:3000/en/hotels/jw-marriott');
      expect(urls).toContain('http://localhost:3000/en/restaurants/crab-house');
      expect(urls).toContain('http://localhost:3000/en/tours/sunset-cruise');
    });

    it('listEnIndexablePlaceIds được gọi với id gộp CẢ BỐN loại entity trong MỘT lần gọi', async () => {
      await sitemap();
      expect(mockListEnIndexablePlaceIds).toHaveBeenCalledTimes(1);
      expect(mockListEnIndexablePlaceIds).toHaveBeenCalledWith(['p1', 'h1', 'r1', 't1']);
    });

    it('event KHÔNG bao giờ vào /en dù trùng id với một place đủ điều kiện — event không phải hàng `places`, không có cơ chế EN', async () => {
      mockListEvents.mockResolvedValue([{ slug: 'some-event', id: 'p1' }]);
      mockListEnIndexablePlaceIds.mockResolvedValue(['p1']);
      const entries = await sitemap();
      expect(entries.map((e) => e.url)).not.toContain('http://localhost:3000/en/events/some-event');
    });

    it('listEnIndexablePlaceIds lỗi → KHÔNG làm hỏng sitemap, không có /en detail nào (fail closed), /vi vẫn đủ', async () => {
      mockListEnIndexablePlaceIds.mockRejectedValue(new Error('API down'));
      const entries = await sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain('http://localhost:3000/vi/places/vinwonders-phu-quoc');
      expect(urls.some((u) => u.includes('/en/places/') || u.includes('/en/hotels/') || u.includes('/en/restaurants/') || u.includes('/en/tours/'))).toBe(false);
    });
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

  // G-D/SEO1 (2026-09-22) — trang duyệt cẩm nang (route tĩnh) + từng bài viết đã published.
  describe('cẩm nang (guide)', () => {
    it('trang duyệt /guide có mặt CẢ hai locale (route tĩnh)', async () => {
      const entries = await sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain('http://localhost:3000/vi/guide');
      expect(urls).toContain('http://localhost:3000/en/guide');
    });

    it('bài viết VI published → /vi/guide/{slug} có mặt, có lastModified = publishedAt', async () => {
      const entries = await sitemap();
      const entry = entries.find((e) => e.url === 'http://localhost:3000/vi/guide/phu-quoc');
      expect(entry).toBeDefined();
      expect(entry?.lastModified).toBe('2026-09-01T00:00:00.000Z');
    });

    it('không có bài EN nào published → KHÔNG có URL /en/guide/{slug} nào (khác /vi/places — không phải một cổng chờ duyệt, đơn giản là chưa có hàng nào locale=en)', async () => {
      const entries = await sitemap();
      const guideUrls = entries.map((e) => e.url).filter((u) => u.includes('/guide/'));
      expect(guideUrls.every((u) => u.includes('/vi/guide/'))).toBe(true);
    });

    it('có bài EN published (locale=en thật) → /en/guide/{slug} có mặt — khác cổng EN của place, guide không có điều kiện chờ duyệt riêng', async () => {
      mockListGuideArticles.mockImplementation((locale: string) =>
        Promise.resolve(
          locale === 'en'
            ? [{ slug: 'phu-quoc', locale: 'en', title: 'Guide', intro: null, heroImageUrl: null, publishedAt: null }]
            : [],
        ),
      );
      const entries = await sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain('http://localhost:3000/en/guide/phu-quoc');
    });

    it('listGuideArticles lỗi → KHÔNG làm hỏng sitemap, các entity khác vẫn có mặt', async () => {
      mockListGuideArticles.mockRejectedValue(new Error('API down'));
      const entries = await sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls.some((u) => u.includes('/guide/'))).toBe(false);
      expect(urls).toContain('http://localhost:3000/vi/guide'); // route tĩnh vẫn còn
      expect(urls).toContain('http://localhost:3000/vi/places/vinwonders-phu-quoc');
    });
  });
});
