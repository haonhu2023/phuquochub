import { AttractionsService } from './attractions.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Attraction = Place (category='attraction'), không có bảng vệ tinh → service chỉ có đường đọc.
describe('AttractionsService', () => {
  type Deps = ConstructorParameters<typeof AttractionsService>;
  let repo: LooseMock<Deps[0]>;
  let service: AttractionsService;

  beforeEach(() => {
    repo = createMock<Deps[0]>({ listAttractions: jest.fn(), countAttractions: jest.fn() });
    service = new AttractionsService(repo);
  });

  afterEach(() => jest.clearAllMocks());

  it('list: paginate + map cover_image_url/ward/price_range/verification_status', async () => {
    repo.listAttractions.mockResolvedValue([
      {
        id: 'a1',
        name: 'Dinh Cậu',
        slug: 'dinh-cau',
        short_description: 'Miếu thờ bên cửa biển',
        cover_image_url: 'https://cdn/dinh-cau.jpg',
        rating_avg: '4.6',
        rating_count: 18,
        price_range: 'free',
        ward: 'Dương Đông',
        verification_status: 'verified',
        lat: '10.2158',
        lng: '103.9576',
      },
    ]);
    repo.countAttractions.mockResolvedValue(1);

    const res = await service.list();

    expect(res.meta.total).toBe(1);
    expect(res.data[0]).toMatchObject({
      id: 'a1',
      slug: 'dinh-cau',
      cover_image_url: 'https://cdn/dinh-cau.jpg',
      rating_avg: 4.6,
      rating_count: 18,
      price_range: 'free',
      ward: 'Dương Đông',
      verification_status: 'verified',
      location: { lat: 10.2158, lng: 103.9576 },
    });
  });

  it('list: hàng thiếu dữ liệu tuỳ chọn (ảnh/rating/giá/ward NULL) → giữ null, không crash', async () => {
    repo.listAttractions.mockResolvedValue([
      {
        id: 'a2',
        name: 'Suối Tranh',
        slug: 'suoi-tranh',
        short_description: null,
        cover_image_url: null,
        rating_avg: null,
        rating_count: 0,
        price_range: null,
        ward: null,
        verification_status: 'pending',
        lat: '10.193',
        lng: '104.009',
      },
    ]);
    repo.countAttractions.mockResolvedValue(1);

    const res = await service.list();

    expect(res.data[0]).toMatchObject({
      cover_image_url: null,
      rating_avg: null,
      price_range: null,
      ward: null,
    });
  });

  it('list: truyền ward/price_range/sort xuống repository, offset tính từ page', async () => {
    repo.listAttractions.mockResolvedValue([]);
    repo.countAttractions.mockResolvedValue(0);

    await service.list({
      ward: 'Gành Dầu',
      price_range: 'high',
      sort: 'name_asc',
      page: 3,
      limit: 10,
    } as Parameters<typeof service.list>[0]);

    const expected = { ward: 'Gành Dầu', priceRange: 'high', sort: 'name_asc' };
    expect(repo.listAttractions).toHaveBeenCalledWith(10, 20, expected);
    expect(repo.countAttractions).toHaveBeenCalledWith(expected);
  });

  it('list: limit > 100 bị cắt xuống 100 (clampLimit) và meta.pageSize phản ánh giá trị đã cắt', async () => {
    repo.listAttractions.mockResolvedValue([]);
    repo.countAttractions.mockResolvedValue(0);

    const res = await service.list({ limit: 500 } as Parameters<typeof service.list>[0]);

    expect(repo.listAttractions).toHaveBeenCalledWith(100, 0, expect.anything());
    expect(res.meta.pageSize).toBe(100);
  });

  it('list: meta.totalPages tính theo tổng ĐÃ LỌC của repository', async () => {
    repo.listAttractions.mockResolvedValue([]);
    repo.countAttractions.mockResolvedValue(45);

    const res = await service.list({ limit: 20 } as Parameters<typeof service.list>[0]);

    expect(res.meta.total).toBe(45);
    expect(res.meta.totalPages).toBe(3);
  });
});
