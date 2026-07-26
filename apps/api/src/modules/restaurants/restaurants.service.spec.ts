import { RestaurantsService } from './restaurants.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Restaurant = Place (category='restaurant') + satellite (ADR-002). Mock PlacesService + repo.
describe('RestaurantsService', () => {
  type Deps = ConstructorParameters<typeof RestaurantsService>;
  let placesService: LooseMock<Deps[0]>;
  let repo: LooseMock<Deps[1]>;
  let service: RestaurantsService;

  beforeEach(() => {
    placesService = createMock<Deps[0]>({ getBySlug: jest.fn() });
    repo = createMock<Deps[1]>({
      listRestaurants: jest.fn(),
      countRestaurants: jest.fn(),
      detail: jest.fn(),
      listCuisines: jest.fn(),
      sections: jest.fn(),
      itemsBySection: jest.fn(),
      replaceMenu: jest.fn(),
    });
    service = new RestaurantsService(placesService, repo);
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
      cuisines: ['Hải sản'],
      location: { lat: 10.1, lng: 103.8 },
    });
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

  it('updateMenu: replaceMenu rồi trả menu mới', async () => {
    const dto = { sections: [{ name: 'X', items: [] }] } as Parameters<typeof service.updateMenu>[1];
    repo.replaceMenu.mockResolvedValue(undefined);
    repo.sections.mockResolvedValue([]);
    repo.itemsBySection.mockResolvedValue([]);
    const menu = await service.updateMenu('r1', dto);
    expect(repo.replaceMenu).toHaveBeenCalledWith('r1', dto.sections);
    expect(menu).toEqual([]);
  });
});
