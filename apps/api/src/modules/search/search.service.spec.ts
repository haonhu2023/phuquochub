import { SearchService } from './search.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('SearchService', () => {
  let placesRepo: LooseMock<ConstructorParameters<typeof SearchService>[0]>;
  let service: SearchService;

  beforeEach(() => {
    placesRepo = createMock<ConstructorParameters<typeof SearchService>[0]>({
      searchFullText: jest.fn().mockResolvedValue([
        { id: 'p1', name: 'Bãi Sao', slug: 'bai-sao', short_description: 'đẹp', score: 0.7 },
      ]),
      searchCount: jest.fn().mockResolvedValue(1),
    });
    service = new SearchService(placesRepo);
  });

  it('search trả envelope phân trang + kết quả type=place', async () => {
    const res = await service.search({ q: 'phu quoc', page: 1, limit: 20 });
    expect(res.success).toBe(true);
    expect(res.meta.total).toBe(1);
    expect(res.data[0]).toMatchObject({ type: 'place', id: 'p1', slug: 'bai-sao' });
  });

  // F-35 / OD-B4 (PLACE-024): ts_rank ('score' trên row) là tín hiệu xếp hạng NỘI BỘ — KHÔNG
  // được lộ ra SearchResult công khai nữa, kể cả khi repository row CÓ score (mô phỏng thực tế).
  it('KHÔNG BAO GIỜ phát `score` ra SearchResult công khai, kể cả khi row repository có score', async () => {
    const res = await service.search({ q: 'phu quoc', page: 1, limit: 20 });
    expect('score' in res.data[0]).toBe(false);
    expect(Object.keys(res.data[0]).sort()).toEqual(['id', 'slug', 'snippet', 'title', 'type']);
  });

  it('tìm không dấu: chuyển query xuống repo nguyên trạng (unaccent ở SQL)', async () => {
    await service.search({ q: 'bai sao' });
    expect(placesRepo.searchFullText).toHaveBeenCalledWith('bai sao', 20, 0);
  });

  it('reindex Postgres FTS là no-op ok', () => {
    expect(service.reindex().status).toBe('ok');
  });
});
