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
