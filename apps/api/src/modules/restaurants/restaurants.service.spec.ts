import { RestaurantsService } from './restaurants.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Restaurant = Place (category='restaurant') + satellite (ADR-002). Mock PlacesService + repo.
describe('RestaurantsService', () => {
  type Deps = ConstructorParameters<typeof RestaurantsService>;
  let placesService: LooseMock<Deps[0]>;
  let repo: LooseMock<Deps[1]>;
  let audit: LooseMock<Deps[2]>;
  let cacheInvalidation: LooseMock<Deps[3]>;
  let service: RestaurantsService;

  beforeEach(() => {
    placesService = createMock<Deps[0]>({ getBySlug: jest.fn(), getSlugAndStatus: jest.fn() });
    repo = createMock<Deps[1]>({
      listRestaurants: jest.fn(),
      countRestaurants: jest.fn(),
      detail: jest.fn(),
      listCuisines: jest.fn(),
      sections: jest.fn(),
      itemsBySection: jest.fn(),
      replaceMenu: jest.fn(),
      upsertDetails: jest.fn(),
      setCuisines: jest.fn(),
      listAllCuisines: jest.fn(),
    });
    audit = createMock<Deps[2]>({ record: jest.fn().mockResolvedValue(undefined) });
    cacheInvalidation = createMock<Deps[3]>({ invalidatePlace: jest.fn().mockResolvedValue(undefined) });
    service = new RestaurantsService(placesService, repo, audit, cacheInvalidation);
  });

  afterEach(() => jest.clearAllMocks());

  it('list: paginate + map is_local_specialty/location/rating_avg/cover_image_url/cuisines', async () => {
    repo.listRestaurants.mockResolvedValue([
      {
        id: 'r1',
        name: 'Quán A',
        slug: 'quan-a',
        short_description: 'hải sản',
        cover_image_url: 'https://cdn/a.jpg',
        rating_avg: '4.0',
        rating_count: 5,
        price_range: 'mid',
        // trusted — không phải trọng tâm test này (giá trị enum thật), xem describe('price trust
        // gate') bên dưới cho hành vi redact khi chưa tin cậy.
        verification_status: 'verified',
        is_local_specialty: true,
        cuisines: ['Hải sản'],
        lat: '10.1',
        lng: '103.8',
      },
    ]);
    repo.countRestaurants.mockResolvedValue(1);
    const res = await service.list();
    expect(res.meta.total).toBe(1);
    expect(res.data[0]).toMatchObject({
      id: 'r1',
      is_local_specialty: true,
      rating_avg: 4,
      cover_image_url: 'https://cdn/a.jpg',
      price_range: 'mid',
      verification_status: 'verified',
      cuisines: ['Hải sản'],
      location: { lat: 10.1, lng: 103.8 },
    });
  });

  // Public Beta price trust gate (2026-08-28): web quyết định có hiện price_range thật hay không
  // dựa trên verification_status — service PHẢI truyền đúng giá trị THẬT từ repository, không
  // được mặc định/hardcode một trạng thái.
  it('list: truyền đúng verification_status thật từ repository, không mặc định "pending"', async () => {
    repo.listRestaurants.mockResolvedValue([
      {
        id: 'r3',
        name: 'Quán C',
        slug: 'quan-c',
        short_description: null,
        cover_image_url: null,
        rating_avg: null,
        rating_count: 0,
        price_range: 'high',
        verification_status: 'verified',
        is_local_specialty: false,
        cuisines: null,
        lat: '10',
        lng: '103',
      },
    ]);
    repo.countRestaurants.mockResolvedValue(1);
    const res = await service.list();
    expect(res.data[0].verification_status).toBe('verified');
  });

  it('list: hàng không có cuisines (NULL từ array_agg rỗng) → mảng rỗng, không crash', async () => {
    repo.listRestaurants.mockResolvedValue([
      { id: 'r2', name: 'Quán B', slug: 'quan-b', short_description: null, cover_image_url: null, rating_avg: null, rating_count: 0, price_range: null, is_local_specialty: false, cuisines: null, lat: '10', lng: '103' },
    ]);
    repo.countRestaurants.mockResolvedValue(1);
    const res = await service.list();
    expect(res.data[0]).toMatchObject({ cuisines: [] });
  });

  it('list: truyền price_range/cuisine/sort xuống repository nguyên vẹn', async () => {
    repo.listRestaurants.mockResolvedValue([]);
    repo.countRestaurants.mockResolvedValue(0);

    await service.list({ price_range: 'high', cuisine: 'seafood', sort: 'name_asc', page: 2, limit: 10 } as Parameters<typeof service.list>[0]);

    expect(repo.listRestaurants).toHaveBeenCalledWith(10, 10, { priceRange: 'high', cuisine: 'seafood', sort: 'name_asc' });
    expect(repo.countRestaurants).toHaveBeenCalledWith({ priceRange: 'high', cuisine: 'seafood', sort: 'name_asc' });
  });

  it('getBySlug: ghép restaurant_details + cuisines', async () => {
    placesService.getBySlug.mockResolvedValue({ id: 'r1', slug: 'quan-a' });
    repo.detail.mockResolvedValue({ price_range: 'mid' });
    repo.listCuisines.mockResolvedValue(['seafood']);
    const res = await service.getBySlug('quan-a');
    expect(res.restaurant_details).toEqual({ price_range: 'mid' });
    expect(res.cuisines).toEqual(['seafood']);
  });

  it('getMenu: nhóm item theo section, price→Number', async () => {
    repo.sections.mockResolvedValue([
      { id: 's1', name: 'Khai vị', sort_order: 0 },
      { id: 's2', name: 'Món chính', sort_order: 1 },
    ]);
    repo.itemsBySection.mockResolvedValue([
      { id: 'i1', section_id: 's1', name: 'Gỏi', price: '50000', currency: 'VND', tags: null, sort_order: 0 },
      { id: 'i2', section_id: 's2', name: 'Cá', price: null, currency: 'VND', tags: null, sort_order: 0 },
    ]);
    const menu = await service.getMenu('r1');
    expect(repo.itemsBySection).toHaveBeenCalledWith(['s1', 's2']);
    expect(menu[0].items[0]).toMatchObject({ id: 'i1', price: 50000 });
    expect(menu[1].items[0].price).toBeNull();
  });

  it('updateMenu: replaceMenu rồi trả menu mới + content_version', async () => {
    const dto = { sections: [{ name: 'X', items: [] }], expected_content_version: 1 } as Parameters<typeof service.updateMenu>[1];
    repo.replaceMenu.mockResolvedValue({ conflict: false, newVersion: 2 });
    repo.sections.mockResolvedValue([]);
    repo.itemsBySection.mockResolvedValue([]);
    const menu = await service.updateMenu('r1', dto, 'u1');
    expect(repo.replaceMenu).toHaveBeenCalledWith('r1', dto.sections, 1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'place.menu_updated', entityId: 'r1', actorId: 'u1' }),
    );
    expect(menu).toEqual({ sections: [], content_version: 2 });
  });

  // CAS thật (2026-10-01) — cùng khuôn updateDetails's test 409: conflict trả về TRƯỚC khi đọc lại
  // menu, không audit, không invalidate cache.
  it('updateMenu: content_version không khớp → 409, KHÔNG audit, KHÔNG đọc lại menu', async () => {
    const dto = { sections: [], expected_content_version: 1 } as Parameters<typeof service.updateMenu>[1];
    repo.replaceMenu.mockResolvedValue({ conflict: true });

    await expect(service.updateMenu('r1', dto, 'u1')).rejects.toThrow(/vừa được người khác sửa/);
    expect(audit.record).not.toHaveBeenCalled();
    expect(repo.sections).not.toHaveBeenCalled();
  });

  // Public Beta price trust gate (2026-08-28)
  describe('price trust gate', () => {
    const SECRET_PLACE_RANGE = 'high';
    const SECRET_MENU_PRICE = 987653;

    it.each(['pending', 'expired', 'rejected'])('list: verification_status %s → price_range redact thành null', async (status) => {
      repo.listRestaurants.mockResolvedValue([
        { id: 'r1', name: 'Q', slug: 'q', short_description: null, cover_image_url: null, rating_avg: null, rating_count: 0, price_range: SECRET_PLACE_RANGE, verification_status: status, is_local_specialty: false, cuisines: [], lat: '10', lng: '103' },
      ]);
      repo.countRestaurants.mockResolvedValue(1);
      const res = await service.list();
      expect(res.data[0].price_range).toBeNull();
      expect(JSON.stringify(res)).not.toContain(SECRET_PLACE_RANGE);
    });

    it('getMenu({ publicResponse: true }) — route công khai: raw price KHÔNG BAO GIỜ lộ, kể cả trong JSON', async () => {
      repo.sections.mockResolvedValue([{ id: 's1', name: 'Khai vị', sort_order: 0 }]);
      repo.itemsBySection.mockResolvedValue([
        { id: 'i1', section_id: 's1', name: 'Gỏi hải sản', price: String(SECRET_MENU_PRICE), currency: 'VND', tags: null, sort_order: 0 },
      ]);

      const menu = await service.getMenu('r1', { publicResponse: true });

      expect(menu[0].items[0].price).toBeNull();
      expect(menu[0].items[0].name).toBe('Gỏi hải sản'); // tên món không phải giá, vẫn giữ nguyên
      expect(JSON.stringify(menu)).not.toContain(String(SECRET_MENU_PRICE));
    });

    it('getMenu (mặc định, KHÔNG publicResponse) vẫn giữ raw price — đường đặc quyền updateMenu() phản ánh đúng giá actor vừa lưu', async () => {
      repo.sections.mockResolvedValue([{ id: 's1', name: 'Khai vị', sort_order: 0 }]);
      repo.itemsBySection.mockResolvedValue([
        { id: 'i1', section_id: 's1', name: 'Gỏi hải sản', price: '50000', currency: 'VND', tags: null, sort_order: 0 },
      ]);

      const menu = await service.getMenu('r1');

      expect(menu[0].items[0].price).toBe(50000);
    });

    it('updateMenu (đặc quyền) trả raw price thật, không bị redact', async () => {
      const dto = { sections: [{ name: 'X', items: [] }], expected_content_version: 1 } as Parameters<typeof service.updateMenu>[1];
      repo.replaceMenu.mockResolvedValue({ conflict: false, newVersion: 2 });
      repo.sections.mockResolvedValue([{ id: 's1', name: 'X', sort_order: 0 }]);
      repo.itemsBySection.mockResolvedValue([
        { id: 'i1', section_id: 's1', name: 'Món mới', price: String(SECRET_MENU_PRICE), currency: 'VND', tags: null, sort_order: 0 },
      ]);

      const menu = await service.updateMenu('r1', dto, 'u1');

      expect(menu.sections[0].items[0].price).toBe(SECRET_MENU_PRICE);
    });
  });

  describe('getDetails (đọc đặc quyền — hoạt động cả khi place chưa published)', () => {
    it('ghép detail + cuisines + content_version (CAS token) từ repo', async () => {
      repo.detail.mockResolvedValue({ is_local_specialty: true, dietary: null });
      repo.listCuisines.mockResolvedValue([{ id: 'c1', code: 'seafood' }]);
      placesService.getSlugAndStatus.mockResolvedValue({ slug: 'quan-a', status: 'published', content_version: 4 });

      const res = await service.getDetails('r1');

      expect(res).toEqual({
        is_local_specialty: true,
        dietary: null,
        cuisines: [{ id: 'c1', code: 'seafood' }],
        content_version: 4,
      });
    });
  });

  // CAS thật (2026-09-30) — cuisine_codes giờ đi CHUNG một lần ghi/một transaction với
  // is_local_specialty/dietary trong RestaurantsRepository.upsertDetails (không còn setCuisines()
  // tách rời khỏi service.updateDetails — xem repository's ghi chú về lỗi ghi nửa vời đã sửa).
  describe('updateDetails (loại ẩm thực/đặc sản địa phương/chế độ ăn)', () => {
    const dtoBase = { expected_content_version: 1 };

    it('upsert details (kèm cuisine_codes trong CÙNG lệnh gọi repo), trả về details ghép cuisines + content_version mới', async () => {
      repo.upsertDetails.mockResolvedValue({ conflict: false, newVersion: 2 });
      repo.detail.mockResolvedValue({ is_local_specialty: true, dietary: { vegetarian: true } });
      repo.listCuisines.mockResolvedValue([{ id: 'c1', code: 'seafood', label_vi: 'Hải sản', label_en: 'Seafood' }]);

      const dto = {
        ...dtoBase,
        is_local_specialty: true,
        dietary: { vegetarian: true },
        cuisine_codes: ['seafood'],
      };
      const res = await service.updateDetails('r1', dto, 'u1');

      expect(repo.upsertDetails).toHaveBeenCalledWith('r1', dto, 1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'place.restaurant_details_updated', entityId: 'r1', actorId: 'u1' }),
      );
      expect(res).toEqual({
        is_local_specialty: true,
        dietary: { vegetarian: true },
        cuisines: [{ id: 'c1', code: 'seafood', label_vi: 'Hải sản', label_en: 'Seafood' }],
        content_version: 2,
      });
    });

    it('không truyền cuisine_codes → repo nhận dto không có field đó (giữ nguyên gán hiện có)', async () => {
      repo.upsertDetails.mockResolvedValue({ conflict: false, newVersion: 2 });
      repo.detail.mockResolvedValue({ is_local_specialty: false, dietary: null });
      repo.listCuisines.mockResolvedValue([]);

      const dto = { ...dtoBase, is_local_specialty: false };
      await service.updateDetails('r1', dto, 'u1');

      expect(repo.upsertDetails).toHaveBeenCalledWith('r1', dto, 1);
    });

    it('repo ném lỗi mã cuisine không tồn tại (từ transaction) → propagate 400, KHÔNG audit', async () => {
      repo.upsertDetails.mockRejectedValue(new Error('Mã ẩm thực không tồn tại: khong_ton_tai'));

      await expect(
        service.updateDetails('r1', { ...dtoBase, cuisine_codes: ['khong_ton_tai'] }, 'u1'),
      ).rejects.toThrow(/khong_ton_tai/);
      expect(audit.record).not.toHaveBeenCalled();
    });

    // CAS thật (2026-09-30) — xem HotelsService.updateDetails's ghi chú đầy đủ, cùng khuôn 409.
    it('repo báo conflict (content_version đã trôi) → ném ConflictException, KHÔNG audit, KHÔNG invalidate cache', async () => {
      repo.upsertDetails.mockResolvedValue({ conflict: true });

      await expect(service.updateDetails('r1', { ...dtoBase, is_local_specialty: true }, 'u1')).rejects.toMatchObject({
        status: 409,
      });
      expect(audit.record).not.toHaveBeenCalled();
      expect(cacheInvalidation.invalidatePlace).not.toHaveBeenCalled();
    });
  });

  describe('listAllCuisines', () => {
    it('uỷ quyền thẳng cho repo', async () => {
      repo.listAllCuisines.mockResolvedValue([{ id: 'c1', code: 'seafood' }]);
      await expect(service.listAllCuisines()).resolves.toEqual([{ id: 'c1', code: 'seafood' }]);
    });
  });
});
