import { BeachesService } from './beaches.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Beach = Place (category='beach'). Từ InitBeachDetails (product spec, 2026-09-29) có
// place_beach_details, nên service nay cũng có getBySlug/updateDetails (xem describe riêng dưới).
describe('BeachesService', () => {
  type Deps = ConstructorParameters<typeof BeachesService>;
  let placesService: LooseMock<Deps[0]>;
  let repo: LooseMock<Deps[1]>;
  let audit: LooseMock<Deps[2]>;
  let cacheInvalidation: LooseMock<Deps[3]>;
  let service: BeachesService;

  beforeEach(() => {
    placesService = createMock<Deps[0]>({ getBySlug: jest.fn(), getSlugAndStatus: jest.fn() });
    repo = createMock<Deps[1]>({
      listBeaches: jest.fn(),
      countBeaches: jest.fn(),
      detail: jest.fn(),
      upsertDetails: jest.fn(),
    });
    audit = createMock<Deps[2]>({ record: jest.fn().mockResolvedValue(undefined) });
    cacheInvalidation = createMock<Deps[3]>({ invalidatePlace: jest.fn().mockResolvedValue(undefined) });
    service = new BeachesService(placesService, repo, audit, cacheInvalidation);
  });

  afterEach(() => jest.clearAllMocks());

  it('list: paginate + map cover_image_url/ward/price_range/verification_status', async () => {
    repo.listBeaches.mockResolvedValue([
      {
        id: 'b1',
        name: 'Bãi Sao',
        slug: 'bai-sao',
        short_description: 'Bãi biển cát trắng phía nam đảo',
        cover_image_url: 'https://cdn/bai-sao.jpg',
        rating_avg: '4.8',
        rating_count: 25,
        price_range: 'free',
        ward: 'An Thới',
        verification_status: 'verified',
        lat: '10.0466',
        lng: '104.0281',
      },
    ]);
    repo.countBeaches.mockResolvedValue(1);

    const res = await service.list();

    expect(res.meta.total).toBe(1);
    expect(res.data[0]).toMatchObject({
      id: 'b1',
      slug: 'bai-sao',
      cover_image_url: 'https://cdn/bai-sao.jpg',
      rating_avg: 4.8,
      rating_count: 25,
      price_range: 'free',
      ward: 'An Thới',
      verification_status: 'verified',
      location: { lat: 10.0466, lng: 104.0281 },
    });
  });

  it('list: hàng thiếu dữ liệu tuỳ chọn (ảnh/rating/giá NULL) → giữ null, không crash', async () => {
    // Đúng hình dạng dữ liệu seed thật: 3/10 bãi biển có price_range NULL, cả 10 chưa có ảnh bìa.
    repo.listBeaches.mockResolvedValue([
      {
        id: 'b2',
        name: 'Bãi Trường',
        slug: 'bai-truong',
        short_description: 'Bãi biển dài nhất Phú Quốc',
        cover_image_url: null,
        rating_avg: null,
        rating_count: 0,
        price_range: null,
        ward: 'Dương Tơ',
        verification_status: 'pending',
        lat: '10.172',
        lng: '103.966',
      },
    ]);
    repo.countBeaches.mockResolvedValue(1);

    const res = await service.list();

    expect(res.data[0]).toMatchObject({
      cover_image_url: null,
      rating_avg: null,
      price_range: null,
      ward: 'Dương Tơ',
    });
  });

  it('list: truyền ward/price_range/sort xuống repository, offset tính từ page', async () => {
    repo.listBeaches.mockResolvedValue([]);
    repo.countBeaches.mockResolvedValue(0);

    await service.list({
      ward: 'Gành Dầu',
      price_range: 'free',
      sort: 'name_asc',
      page: 3,
      limit: 5,
    } as Parameters<typeof service.list>[0]);

    const expected = { ward: 'Gành Dầu', priceRange: 'free', sort: 'name_asc' };
    expect(repo.listBeaches).toHaveBeenCalledWith(5, 10, expected);
    expect(repo.countBeaches).toHaveBeenCalledWith(expected);
  });

  it('list: limit > 100 bị cắt xuống 100 (clampLimit) và meta.pageSize phản ánh giá trị đã cắt', async () => {
    repo.listBeaches.mockResolvedValue([]);
    repo.countBeaches.mockResolvedValue(0);

    const res = await service.list({ limit: 500 } as Parameters<typeof service.list>[0]);

    expect(repo.listBeaches).toHaveBeenCalledWith(100, 0, expect.anything());
    expect(res.meta.pageSize).toBe(100);
  });

  it('list: meta.totalPages tính theo tổng ĐÃ LỌC của repository', async () => {
    repo.listBeaches.mockResolvedValue([]);
    repo.countBeaches.mockResolvedValue(10);

    const res = await service.list({ limit: 4 } as Parameters<typeof service.list>[0]);

    expect(res.meta.total).toBe(10);
    expect(res.meta.totalPages).toBe(3);
  });

  // Public Beta price trust gate (2026-08-28): route công khai GET /beaches trước đây trả raw
  // price_range bất kể verification_status — web chỉ ẩn ở tầng render, không phải response JSON.
  describe('price trust gate', () => {
    const SECRET_PLACE_RANGE = 'high';

    it.each(['pending', 'expired', 'rejected'])('verification_status %s → price_range redact thành null', async (status) => {
      repo.listBeaches.mockResolvedValue([
        { id: 'b3', name: 'Bãi X', slug: 'bai-x', short_description: null, cover_image_url: null, rating_avg: null, rating_count: 0, price_range: SECRET_PLACE_RANGE, ward: null, verification_status: status, lat: '10', lng: '104' },
      ]);
      repo.countBeaches.mockResolvedValue(1);
      const res = await service.list();
      expect(res.data[0].price_range).toBeNull();
      expect(JSON.stringify(res)).not.toContain(SECRET_PLACE_RANGE);
    });

    it.each(['verified', 'official', 'community_verified'])('verification_status %s → giữ nguyên price_range thật', async (status) => {
      repo.listBeaches.mockResolvedValue([
        { id: 'b4', name: 'Bãi Y', slug: 'bai-y', short_description: null, cover_image_url: null, rating_avg: null, rating_count: 0, price_range: SECRET_PLACE_RANGE, ward: null, verification_status: status, lat: '10', lng: '104' },
      ]);
      repo.countBeaches.mockResolvedValue(1);
      const res = await service.list();
      expect(res.data[0].price_range).toBe(SECRET_PLACE_RANGE);
    });
  });

  describe('getBySlug (beach_details — access_route/characteristics/season/services/lifeguard/notes)', () => {
    it('ghép beach_details lên base Place; field "có nguồn" trả object {title,url,verified_at} khi có source', async () => {
      placesService.getBySlug.mockResolvedValue({ id: 'b1', slug: 'bai-sao', name: 'Bãi Sao' });
      repo.detail.mockResolvedValue({
        access_route: 'Theo đường ven biển phía nam',
        characteristics: 'Cát trắng mịn, sóng nhẹ',
        services: 'Cho thuê ghế, đồ ăn nhẹ',
        best_season: 'Tháng 11 – tháng 4 (mùa khô)',
        best_season_source_id: 'src-1',
        best_season_verified_at: new Date('2026-09-29T00:00:00Z'),
        best_season_source_title: 'Sở Du lịch Kiên Giang',
        best_season_source_url: 'https://example.gov.vn/mua-du-lich',
        lifeguard_info: null,
        lifeguard_info_source_id: null,
        lifeguard_info_verified_at: null,
        lifeguard_info_source_title: null,
        lifeguard_info_source_url: null,
        sourced_notes: null,
        sourced_notes_source_id: null,
        sourced_notes_verified_at: null,
        sourced_notes_source_title: null,
        sourced_notes_source_url: null,
      });

      const res = await service.getBySlug('bai-sao');

      expect(res.beach_details).toEqual({
        access_route: 'Theo đường ven biển phía nam',
        characteristics: 'Cát trắng mịn, sóng nhẹ',
        services: 'Cho thuê ghế, đồ ăn nhẹ',
        best_season: 'Tháng 11 – tháng 4 (mùa khô)',
        best_season_source: {
          title: 'Sở Du lịch Kiên Giang',
          url: 'https://example.gov.vn/mua-du-lich',
          verified_at: new Date('2026-09-29T00:00:00Z'),
        },
        lifeguard_info: null,
        lifeguard_info_source: null,
        sourced_notes: null,
        sourced_notes_source: null,
      });
    });

    it('chưa có hàng place_beach_details nào → beach_details null (không crash)', async () => {
      placesService.getBySlug.mockResolvedValue({ id: 'b1', slug: 'bai-sao', name: 'Bãi Sao' });
      repo.detail.mockResolvedValue(null);

      const res = await service.getBySlug('bai-sao');

      expect(res.beach_details).toBeNull();
    });
  });

  describe('updateDetails — KHÔNG BAO GIỜ tự suy ra "an toàn" từ chuỗi text', () => {
    it('upsert rồi trả detail đã map; lifeguard_info không có source → lifeguard_info_source null', async () => {
      repo.upsertDetails.mockResolvedValue(undefined);
      repo.detail.mockResolvedValue({
        access_route: null,
        characteristics: null,
        services: null,
        best_season: null,
        best_season_source_id: null,
        best_season_verified_at: null,
        best_season_source_title: null,
        best_season_source_url: null,
        lifeguard_info: 'Có trạm cứu hộ giờ hành chính',
        lifeguard_info_source_id: null,
        lifeguard_info_verified_at: null,
        lifeguard_info_source_title: null,
        lifeguard_info_source_url: null,
        sourced_notes: null,
        sourced_notes_source_id: null,
        sourced_notes_verified_at: null,
        sourced_notes_source_title: null,
        sourced_notes_source_url: null,
      });

      const dto = { lifeguard_info: 'Có trạm cứu hộ giờ hành chính' };
      const res = await service.updateDetails('b1', dto, 'u1');

      expect(repo.upsertDetails).toHaveBeenCalledWith('b1', dto);
      // Có text mô tả nhưng KHÔNG có source_id → source null, KHÔNG suy ra trạng thái "an toàn" nào.
      expect(res?.lifeguard_info_source).toBeNull();
      expect(res?.lifeguard_info).toBe('Có trạm cứu hộ giờ hành chính');
    });

    it('ghi audit place.beach_details_updated và chỉ invalidate cache khi đã published', async () => {
      repo.upsertDetails.mockResolvedValue(undefined);
      repo.detail.mockResolvedValue({
        access_route: null, characteristics: null, services: null,
        best_season: null, best_season_source_id: null, best_season_verified_at: null,
        best_season_source_title: null, best_season_source_url: null,
        lifeguard_info: null, lifeguard_info_source_id: null, lifeguard_info_verified_at: null,
        lifeguard_info_source_title: null, lifeguard_info_source_url: null,
        sourced_notes: null, sourced_notes_source_id: null, sourced_notes_verified_at: null,
        sourced_notes_source_title: null, sourced_notes_source_url: null,
      });
      placesService.getSlugAndStatus.mockResolvedValue({ slug: 'bai-sao', status: 'published' });

      await service.updateDetails('b1', { access_route: 'x' }, 'u1');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'place.beach_details_updated', entityId: 'b1', actorId: 'u1' }),
      );
      expect(cacheInvalidation.invalidatePlace).toHaveBeenCalledWith('bai-sao');
    });
  });
});
