import { HotelsService } from './hotels.service';
import { PlaceStatus } from '../places/place.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Hotel = Place (category='hotel') + satellite (ADR-002). Mock PlacesService + repo (new + mock).
describe('HotelsService', () => {
  type Deps = ConstructorParameters<typeof HotelsService>;
  let placesService: LooseMock<Deps[0]>;
  let repo: LooseMock<Deps[1]>;
  let audit: LooseMock<Deps[2]>;
  let cacheInvalidation: LooseMock<Deps[3]>;
  let service: HotelsService;

  beforeEach(() => {
    placesService = createMock<Deps[0]>({ getBySlug: jest.fn(), getSlugAndStatus: jest.fn() });
    repo = createMock<Deps[1]>({
      listHotels: jest.fn(),
      countHotels: jest.fn(),
      detail: jest.fn(),
      listRooms: jest.fn(),
      listAmenities: jest.fn(),
      replaceRooms: jest.fn(),
      upsertDetails: jest.fn(),
    });
    audit = createMock<Deps[2]>({ record: jest.fn().mockResolvedValue(undefined) });
    cacheInvalidation = createMock<Deps[3]>({ invalidatePlace: jest.fn().mockResolvedValue(undefined) });
    service = new HotelsService(placesService, repo, audit, cacheInvalidation);
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

  // Public Beta price trust gate (2026-08-28): getBySlug() là chi tiết CÔNG KHAI — rooms luôn
  // publicResponse=true, raw price_ref không có trust column nên fail-closed vô điều kiện.
  it('getBySlug: ghép hotel_details/rooms/amenities lên base Place — rooms.price_ref redact (public detail)', async () => {
    placesService.getBySlug.mockResolvedValue({ id: 'h1', slug: 'ks-a', name: 'Khách sạn A' });
    repo.detail.mockResolvedValue({
      star_rating: 4,
      hotel_type: 'resort',
      check_in: '14:00',
      check_out: '12:00',
      star_rating_source_id: null,
      star_rating_verified_at: null,
      star_rating_source_title: null,
      star_rating_source_url: null,
    });
    repo.listRooms.mockResolvedValue([
      { id: 'r1', name: 'Deluxe', capacity: 2, price_ref: '1500000', currency: 'VND', valid_from: null, valid_to: null, sort_order: 0 },
    ]);
    repo.listAmenities.mockResolvedValue(['wifi', 'pool']);

    const res = await service.getBySlug('ks-a');

    // Không truyền locale → forward đúng `undefined` xuống PlacesService.getBySlug() (KHÔNG phải
    // "không truyền tham số thứ hai nào cả" — hai việc khác nhau về mặt spy assertion, dù tương
    // đương về hành vi runtime; xem describe "locale forwarding" bên dưới cho case có locale).
    expect(placesService.getBySlug).toHaveBeenCalledWith('ks-a', undefined);
    expect(res.hotel_details).toEqual({
      star_rating: 4,
      hotel_type: 'resort',
      check_in: '14:00',
      check_out: '12:00',
      star_rating_source: null,
    });
    expect(res.amenities).toEqual(['wifi', 'pool']);
    expect(res.rooms[0]).toMatchObject({ id: 'r1', name: 'Deluxe', price_ref: null });
    expect(JSON.stringify(res)).not.toContain('1500000');
  });

  // 2026-09 locale forwarding fix: trước đây getBySlug(slug) không nhận/forward locale nào cả, nên
  // PlacesService luôn thấy `undefined` bất kể client yêu cầu gì. Đây là đúng ranh giới bị vá.
  describe('getBySlug — locale forwarding', () => {
    beforeEach(() => {
      placesService.getBySlug.mockResolvedValue({ id: 'h1', slug: 'ks-a', name: 'Khách sạn A' });
      repo.detail.mockResolvedValue(null);
      repo.listRooms.mockResolvedValue([]);
      repo.listAmenities.mockResolvedValue([]);
    });

    it('locale="en" → placesService.getBySlug("ks-a", "en")', async () => {
      await service.getBySlug('ks-a', 'en');
      expect(placesService.getBySlug).toHaveBeenCalledWith('ks-a', 'en');
    });

    it('locale="vi" → placesService.getBySlug("ks-a", "vi")', async () => {
      await service.getBySlug('ks-a', 'vi');
      expect(placesService.getBySlug).toHaveBeenCalledWith('ks-a', 'vi');
    });

    it('không truyền locale (0 đối số thứ hai) → forward undefined, KHÔNG tự đặt default "vi" ở tầng này (PlacesService/LocalesService đã lo việc đó, không nhân đôi)', async () => {
      await service.getBySlug('ks-a');
      expect(placesService.getBySlug).toHaveBeenCalledWith('ks-a', undefined);
    });
  });

  it('listRooms (mặc định, KHÔNG publicResponse): chuyển price_ref sang Number — đường đặc quyền updateRooms() phản ánh đúng giá actor vừa lưu', async () => {
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

  describe('getDetails (đọc đặc quyền — hoạt động cả khi place chưa published)', () => {
    it('trả detail đã map (có nguồn) kèm content_version từ places (CAS token)', async () => {
      repo.detail.mockResolvedValue({
        star_rating: 4,
        hotel_type: 'resort',
        check_in: '14:00',
        check_out: '12:00',
        star_rating_source_id: null,
        star_rating_verified_at: null,
        star_rating_source_title: null,
        star_rating_source_url: null,
      });
      placesService.getSlugAndStatus.mockResolvedValue({ slug: 'ks-a', status: PlaceStatus.PUBLISHED, content_version: 7 });

      const res = await service.getDetails('h1');

      expect(res).toEqual({
        star_rating: 4,
        hotel_type: 'resort',
        check_in: '14:00',
        check_out: '12:00',
        star_rating_source: null,
        content_version: 7,
      });
    });

    it('chưa có hàng place_hotel_details nào -> vẫn trả content_version (token CAS cho lần PATCH đầu tiên)', async () => {
      repo.detail.mockResolvedValue(null);
      placesService.getSlugAndStatus.mockResolvedValue({ slug: 'ks-a', status: PlaceStatus.DRAFT, content_version: 1 });
      await expect(service.getDetails('h1')).resolves.toEqual({ content_version: 1 });
    });
  });

  describe('updateDetails (loại hình/hạng sao có nguồn/check-in-out)', () => {
    const dtoBase = { expected_content_version: 1 };

    it('upsert đúng input rồi trả lại detail đã map (có nguồn) kèm content_version mới', async () => {
      repo.upsertDetails.mockResolvedValue({ conflict: false, newVersion: 2 });
      repo.detail.mockResolvedValue({
        star_rating: 5,
        hotel_type: 'resort',
        check_in: '14:00',
        check_out: '12:00',
        star_rating_source_id: 'src-1',
        star_rating_verified_at: new Date('2026-09-29T00:00:00Z'),
        star_rating_source_title: 'Sở Du lịch Kiên Giang',
        star_rating_source_url: 'https://example.gov.vn/xep-hang',
      });

      const dto = {
        ...dtoBase,
        hotel_type: 'resort' as const,
        star_rating: 5,
        star_rating_source_id: 'src-1',
        check_in: '14:00',
        check_out: '12:00',
      };
      const res = await service.updateDetails('h1', dto, 'u1');

      expect(repo.upsertDetails).toHaveBeenCalledWith('h1', dto, 1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'place.hotel_details_updated', entityId: 'h1', actorId: 'u1', permission: 'Place.Edit.Managed' }),
      );
      expect(res).toEqual({
        star_rating: 5,
        hotel_type: 'resort',
        check_in: '14:00',
        check_out: '12:00',
        star_rating_source: {
          title: 'Sở Du lịch Kiên Giang',
          url: 'https://example.gov.vn/xep-hang',
          verified_at: new Date('2026-09-29T00:00:00Z'),
        },
        content_version: 2,
      });
    });

    it('không truyền star_rating_source_id → star_rating_source null (không suy đoán nguồn)', async () => {
      repo.upsertDetails.mockResolvedValue({ conflict: false, newVersion: 2 });
      repo.detail.mockResolvedValue({
        star_rating: null,
        hotel_type: 'homestay',
        check_in: null,
        check_out: null,
        star_rating_source_id: null,
        star_rating_verified_at: null,
        star_rating_source_title: null,
        star_rating_source_url: null,
      });

      const dto = { ...dtoBase, hotel_type: 'homestay' as const };
      const res = await service.updateDetails('h1', dto, 'u1');

      expect(repo.upsertDetails).toHaveBeenCalledWith('h1', dto, 1);
      expect(res?.star_rating_source).toBeNull();
    });

    it('place đã published → invalidate cache; place còn draft → KHÔNG invalidate (chưa từng được cache)', async () => {
      repo.upsertDetails.mockResolvedValue({ conflict: false, newVersion: 2 });
      repo.detail.mockResolvedValue({ hotel_type: 'resort' });

      placesService.getSlugAndStatus.mockResolvedValue({ slug: 'ks-a', status: PlaceStatus.PUBLISHED, content_version: 2 });
      await service.updateDetails('h1', { ...dtoBase, hotel_type: 'resort' }, 'u1');
      expect(cacheInvalidation.invalidatePlace).toHaveBeenCalledWith('ks-a');

      cacheInvalidation.invalidatePlace.mockClear();
      placesService.getSlugAndStatus.mockResolvedValue({ slug: 'ks-b', status: PlaceStatus.DRAFT, content_version: 2 });
      await service.updateDetails('h1', { ...dtoBase, hotel_type: 'resort' }, 'u1');
      expect(cacheInvalidation.invalidatePlace).not.toHaveBeenCalled();
    });

    // CAS thật (2026-09-30) — góp ý chỉ ra "SELECT ... FOR UPDATE" trước đây KHÔNG phải CAS (không
    // chặn được request đọc dữ liệu đã cũ). Test này khoá lại hành vi 409 ở tầng service khi
    // repository báo conflict, KHÔNG ghi audit / KHÔNG invalidate cache.
    it('repo báo conflict (content_version đã trôi) → ném ConflictException, KHÔNG audit, KHÔNG invalidate cache', async () => {
      repo.upsertDetails.mockResolvedValue({ conflict: true });

      await expect(service.updateDetails('h1', { ...dtoBase, hotel_type: 'resort' }, 'u1')).rejects.toMatchObject({
        status: 409,
      });
      expect(audit.record).not.toHaveBeenCalled();
      expect(cacheInvalidation.invalidatePlace).not.toHaveBeenCalled();
    });
  });

  // Public Beta price trust gate (2026-08-28)
  describe('price trust gate', () => {
    const SECRET_ROOM_PRICE = 987655;

    it('listRooms({ publicResponse: true }) — route công khai: raw price KHÔNG BAO GIỜ lộ, kể cả trong JSON', async () => {
      repo.listRooms.mockResolvedValue([
        { id: 'r1', name: 'Phòng Deluxe', capacity: 2, price_ref: String(SECRET_ROOM_PRICE), currency: 'VND', valid_from: null, valid_to: null, sort_order: 0 },
      ]);

      const rooms = await service.listRooms('h1', { publicResponse: true });

      expect(rooms[0].price_ref).toBeNull();
      expect(rooms[0].name).toBe('Phòng Deluxe'); // tên phòng không phải giá, vẫn giữ nguyên
      expect(JSON.stringify(rooms)).not.toContain(String(SECRET_ROOM_PRICE));
    });

    it('updateRooms (đặc quyền) trả raw price thật, không bị redact', async () => {
      const dto = { rooms: [{ name: 'Deluxe' }] } as Parameters<typeof service.updateRooms>[1];
      repo.replaceRooms.mockResolvedValue(undefined);
      repo.listRooms.mockResolvedValue([
        { id: 'r1', name: 'Deluxe', capacity: 2, price_ref: String(SECRET_ROOM_PRICE), currency: 'VND', valid_from: null, valid_to: null, sort_order: 0 },
      ]);

      const rooms = await service.updateRooms('h1', dto);

      expect(rooms[0].price_ref).toBe(SECRET_ROOM_PRICE);
    });
  });
});
