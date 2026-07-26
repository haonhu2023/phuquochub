import { HotelsService } from './hotels.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Hotel = Place (category='hotel') + satellite (ADR-002). Mock PlacesService + repo (new + mock).
describe('HotelsService', () => {
  type Deps = ConstructorParameters<typeof HotelsService>;
  let placesService: LooseMock<Deps[0]>;
  let repo: LooseMock<Deps[1]>;
  let service: HotelsService;

  beforeEach(() => {
    placesService = createMock<Deps[0]>({ getBySlug: jest.fn() });
    repo = createMock<Deps[1]>({
      listHotels: jest.fn(),
      countHotels: jest.fn(),
      detail: jest.fn(),
      listRooms: jest.fn(),
      listAmenities: jest.fn(),
      replaceRooms: jest.fn(),
    });
    service = new HotelsService(placesService, repo);
  });

  afterEach(() => jest.clearAllMocks());

  it('list: map + paginate (star_rating/hotel_type/location/cover_image_url, rating_avg numeric)', async () => {
    repo.listHotels.mockResolvedValue([
      {
        id: 'h1',
        name: 'Khách sạn A',
        slug: 'ks-a',
        short_description: 'gần biển',
        cover_image_url: 'https://cdn/x.jpg',
        rating_avg: '4.5',
        rating_count: 12,
        star_rating: 4,
        hotel_type: 'resort',
        lat: '10.2',
        lng: '103.9',
      },
    ]);
    repo.countHotels.mockResolvedValue(1);

    const res = await service.list({ page: 1, limit: 20 });

    expect(res.success).toBe(true);
    expect(res.meta.total).toBe(1);
    expect(res.data[0]).toMatchObject({
      id: 'h1',
      star_rating: 4,
      hotel_type: 'resort',
      cover_image_url: 'https://cdn/x.jpg',
      rating_avg: 4.5,
      location: { lat: 10.2, lng: 103.9 },
    });
  });

  it('list: không truyền query → dùng trang mặc định, không lọc', async () => {
    repo.listHotels.mockResolvedValue([]);
    repo.countHotels.mockResolvedValue(0);

    await service.list();

    expect(repo.listHotels).toHaveBeenCalledWith(20, 0, { stars: undefined, sort: undefined });
    expect(repo.countHotels).toHaveBeenCalledWith({ stars: undefined, sort: undefined });
  });

  it('list: truyền stars/sort xuống repository nguyên vẹn', async () => {
    repo.listHotels.mockResolvedValue([]);
    repo.countHotels.mockResolvedValue(0);

    await service.list({ stars: 5, sort: 'name_asc', page: 2, limit: 10 });

    expect(repo.listHotels).toHaveBeenCalledWith(10, 10, { stars: 5, sort: 'name_asc' });
    expect(repo.countHotels).toHaveBeenCalledWith({ stars: 5, sort: 'name_asc' });
  });

  it('getBySlug: ghép hotel_details/rooms/amenities lên base Place', async () => {
    placesService.getBySlug.mockResolvedValue({ id: 'h1', slug: 'ks-a', name: 'Khách sạn A' });
    repo.detail.mockResolvedValue({ star_rating: 4, hotel_type: 'resort' });
    repo.listRooms.mockResolvedValue([
      { id: 'r1', name: 'Deluxe', capacity: 2, price_ref: '1500000', currency: 'VND', valid_from: null, valid_to: null, sort_order: 0 },
    ]);
    repo.listAmenities.mockResolvedValue(['wifi', 'pool']);

    const res = await service.getBySlug('ks-a');

    expect(placesService.getBySlug).toHaveBeenCalledWith('ks-a');
    expect(res.hotel_details).toEqual({ star_rating: 4, hotel_type: 'resort' });
    expect(res.amenities).toEqual(['wifi', 'pool']);
    expect(res.rooms[0]).toMatchObject({ id: 'r1', price_ref: 1500000 }); // string→Number
  });

  it('listRooms: chuyển price_ref sang Number', async () => {
    repo.listRooms.mockResolvedValue([
      { id: 'r1', name: 'Std', capacity: null, price_ref: null, currency: 'VND', valid_from: null, valid_to: null, sort_order: 1 },
      { id: 'r2', name: 'Suite', capacity: 4, price_ref: '3000000', currency: 'VND', valid_from: null, valid_to: null, sort_order: 2 },
    ]);
    const rooms = await service.listRooms('h1');
    expect(rooms[0].price_ref).toBeNull();
    expect(rooms[1].price_ref).toBe(3000000);
  });

  it('updateRooms: thay toàn bộ rooms rồi trả danh sách mới', async () => {
    const dto = { rooms: [{ name: 'Deluxe' }] } as Parameters<typeof service.updateRooms>[1];
    repo.replaceRooms.mockResolvedValue(undefined);
    repo.listRooms.mockResolvedValue([
      { id: 'r9', name: 'Deluxe', capacity: null, price_ref: null, currency: 'VND', valid_from: null, valid_to: null, sort_order: 0 },
    ]);

    const res = await service.updateRooms('h1', dto);

    expect(repo.replaceRooms).toHaveBeenCalledWith('h1', dto.rooms);
    expect(res[0]).toMatchObject({ id: 'r9', name: 'Deluxe' });
  });
});
