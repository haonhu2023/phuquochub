import { BadRequestException } from '@nestjs/common';
import { ToursService } from './tours.service';
import { TourTypeDto } from './dto/tours.dto';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Tour = Place (category='tour') + satellite (ADR-002). create → Place (pending) + tour_details.
describe('ToursService', () => {
  type Deps = ConstructorParameters<typeof ToursService>;
  let placesService: LooseMock<Deps[0]>;
  let repo: LooseMock<Deps[1]>;
  let service: ToursService;

  beforeEach(() => {
    placesService = createMock<Deps[0]>({ create: jest.fn(), getBySlug: jest.fn() });
    repo = createMock<Deps[1]>({
      listTours: jest.fn(),
      countTours: jest.fn(),
      detail: jest.fn(),
      stops: jest.fn(),
      schedules: jest.fn(),
      tourCategoryId: jest.fn(),
      createDetails: jest.fn(),
    });
    service = new ToursService(placesService, repo);
  });

  afterEach(() => jest.clearAllMocks());

  it('list: map tour_type/duration/difficulty + paginate', async () => {
    repo.listTours.mockResolvedValue([
      { id: 't1', name: 'Tour A', slug: 'tour-a', short_description: 'lặn', cover_image_url: null, rating_avg: null, rating_count: 0, price_range: null, ward: null, tour_type: 'boat', duration_minutes: 240, difficulty: 'easy', lat: '10.0', lng: '104.0' },
    ]);
    repo.countTours.mockResolvedValue(1);
    const res = await service.list();
    expect(res.data[0]).toMatchObject({ tour_type: 'boat', duration_minutes: 240, difficulty: 'easy', rating_avg: null, location: { lat: 10, lng: 104 } });
  });

  it('list: map cover_image_url/price_range/ward + rating_avg chuỗi → Number', async () => {
    repo.listTours.mockResolvedValue([
      { id: 't2', name: 'Tour B', slug: 'tour-b', short_description: null, cover_image_url: 'https://cdn/b.jpg', rating_avg: '4.5', rating_count: 12, price_range: 'mid', ward: 'An Thới', tour_type: 'cruise', duration_minutes: null, difficulty: null, lat: '9.9', lng: '104.01' },
    ]);
    repo.countTours.mockResolvedValue(1);

    const res = await service.list();

    expect(res.data[0]).toMatchObject({
      cover_image_url: 'https://cdn/b.jpg',
      rating_avg: 4.5,
      rating_count: 12,
      price_range: 'mid',
      ward: 'An Thới',
      duration_minutes: null,
      difficulty: null,
    });
  });

  it('list: truyền type/difficulty/price_range/max_duration_minutes/departure_area/sort xuống repository', async () => {
    repo.listTours.mockResolvedValue([]);
    repo.countTours.mockResolvedValue(0);

    await service.list({
      type: 'diving',
      difficulty: 'easy',
      price_range: 'mid',
      max_duration_minutes: 240,
      departure_area: 'An Thới',
      sort: 'duration_asc',
      page: 2,
      limit: 10,
    } as Parameters<typeof service.list>[0]);

    const expected = {
      type: 'diving',
      difficulty: 'easy',
      priceRange: 'mid',
      maxDurationMinutes: 240,
      departureArea: 'An Thới',
      sort: 'duration_asc',
    };
    expect(repo.listTours).toHaveBeenCalledWith(10, 10, expected);
    expect(repo.countTours).toHaveBeenCalledWith(expected);
  });

  it('getItinerary: mapStop; location null khi thiếu toạ độ', async () => {
    repo.stops.mockResolvedValue([
      { id: 's1', name: 'Bến', sort_order: 0, time: '08:00', note: null, lat: 10.1, lng: 103.9 },
      { id: 's2', name: 'Đảo', sort_order: 1, time: null, note: null, lat: null, lng: null },
    ]);
    const it = await service.getItinerary('t1');
    expect(it[0].location).toEqual({ lat: 10.1, lng: 103.9 });
    expect(it[1].location).toBeNull();
  });

  it('getSchedule: price→Number', async () => {
    repo.schedules.mockResolvedValue([
      { id: 'sc1', date: '2026-08-01', capacity: 20, price: '500000', currency: 'VND', valid_from: null, valid_to: null },
    ]);
    const sc = await service.getSchedule('t1');
    expect(sc[0].price).toBe(500000);
  });

  it('create: danh mục "tour" chưa khởi tạo → BadRequest', async () => {
    repo.tourCategoryId.mockResolvedValue(null);
    await expect(
      service.create({ name: 'T', location: { lat: 10, lng: 104 }, tour_type: TourTypeDto.CRUISE }, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create: hợp lệ → tạo Place + tour_details (map camelCase nội bộ)', async () => {
    repo.tourCategoryId.mockResolvedValue('cat-tour');
    placesService.create.mockResolvedValue({ id: 't1', name: 'T', slug: 't' });
    repo.createDetails.mockResolvedValue(undefined);
    repo.detail.mockResolvedValue({ tour_type: 'boat', duration_minutes: 120 });

    const res = await service.create(
      { name: 'T', location: { lat: 10, lng: 104 }, tour_type: TourTypeDto.CRUISE, duration_minutes: 120 },
      'u1',
    );

    expect(placesService.create).toHaveBeenCalled();
    expect(repo.createDetails).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ tourType: TourTypeDto.CRUISE, durationMinutes: 120 }),
    );
    expect(res.tour_details).toEqual({ tour_type: 'boat', duration_minutes: 120 });
  });
});
