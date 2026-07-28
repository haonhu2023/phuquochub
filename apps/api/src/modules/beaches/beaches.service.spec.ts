import { BeachesService } from './beaches.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Beach = Place (category='beach'), không có bảng vệ tinh → service chỉ có đường đọc.
describe('BeachesService', () => {
  type Deps = ConstructorParameters<typeof BeachesService>;
  let repo: LooseMock<Deps[0]>;
  let service: BeachesService;

  beforeEach(() => {
    repo = createMock<Deps[0]>({ listBeaches: jest.fn(), countBeaches: jest.fn() });
    service = new BeachesService(repo);
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
});
