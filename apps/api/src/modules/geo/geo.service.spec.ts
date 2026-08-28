import { GeoService } from './geo.service';
import { PlacesRepository } from '../places/repositories/places.repository';
import { RedisService } from '../../core/redis/redis.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Search Filters trên bản đồ — GeoService.bbox() phải chuyển tiếp category/ward từ DTO
// xuống PlacesRepository.bboxClusters() nguyên vẹn (đây là nơi DUY NHẤT nối hai lớp đó).
describe('GeoService.bbox — chuyển tiếp Search Filters (category/ward)', () => {
  let placesRepo: LooseMock<PlacesRepository>;
  let sut: GeoService;

  beforeEach(() => {
    placesRepo = createMock<PlacesRepository>({ bboxClusters: jest.fn().mockResolvedValue([]) });
    const redis = createMock<RedisService>({});
    sut = new GeoService(placesRepo, redis);
  });

  const BBOX = { minLng: 103.8, minLat: 10.0, maxLng: 104.1, maxLat: 10.4 };

  it('không truyền category/ward → bboxClusters nhận undefined (không lọc)', async () => {
    await sut.bbox({ ...BBOX, zoom: 12 });

    const arg = placesRepo.bboxClusters.mock.calls[0][0];
    expect(arg.category).toBeUndefined();
    expect(arg.ward).toBeUndefined();
  });

  it('truyền category/ward → chuyển thẳng xuống bboxClusters', async () => {
    await sut.bbox({ ...BBOX, zoom: 12, category: 'c1', ward: 'An Thới' });

    const arg = placesRepo.bboxClusters.mock.calls[0][0];
    expect(arg.category).toBe('c1');
    expect(arg.ward).toBe('An Thới');
  });
});

// Public Beta price trust gate (2026-08-28): GET /geo/nearby trước đây trả raw price_range
// (qua toPlaceCard) bất kể verification_status — web chỉ ẩn ở tầng render, không phải response JSON.
describe('GeoService.nearby — price trust gate', () => {
  let placesRepo: LooseMock<PlacesRepository>;
  let sut: GeoService;

  beforeEach(() => {
    placesRepo = createMock<PlacesRepository>({ nearby: jest.fn() });
    const redis = createMock<RedisService>({});
    sut = new GeoService(placesRepo, redis);
  });

  const SECRET_PLACE_RANGE = 'high';

  function nearbyRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'p1',
      name: 'Bãi Sao',
      slug: 'bai-sao',
      category_id: 'c1',
      short_description: null,
      price_range: SECRET_PLACE_RANGE,
      cover_image_url: null,
      rating_avg: null,
      rating_count: 0,
      verification_status: 'pending',
      status: 'published',
      lat: '10.0',
      lng: '104.0',
      ...overrides,
    };
  }

  it.each(['pending', 'expired', 'rejected'])('verification_status %s → price_range redact thành null', async (status) => {
    placesRepo.nearby.mockResolvedValue([nearbyRow({ verification_status: status })]);
    const res = await sut.nearby({ lat: 10, lng: 104 } as Parameters<typeof sut.nearby>[0]);
    expect(res[0].price_range).toBeNull();
    expect(JSON.stringify(res)).not.toContain(SECRET_PLACE_RANGE);
  });

  it.each(['verified', 'official', 'community_verified'])('verification_status %s → giữ nguyên price_range thật', async (status) => {
    placesRepo.nearby.mockResolvedValue([nearbyRow({ verification_status: status })]);
    const res = await sut.nearby({ lat: 10, lng: 104 } as Parameters<typeof sut.nearby>[0]);
    expect(res[0].price_range).toBe(SECRET_PLACE_RANGE);
  });
});
