import { NotFoundException } from '@nestjs/common';
import { TransportsService } from './transports.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Transport = Place (category='transport') + satellite `place_transport_details` (ADR-017).
// Mock PlacesService + repo — service không có phương thức ghi nào.
describe('TransportsService', () => {
  type Deps = ConstructorParameters<typeof TransportsService>;
  let placesService: LooseMock<Deps[0]>;
  let repo: LooseMock<Deps[1]>;
  let service: TransportsService;

  beforeEach(() => {
    placesService = createMock<Deps[0]>({ getBySlug: jest.fn() });
    repo = createMock<Deps[1]>({
      listTransports: jest.fn(),
      countTransports: jest.fn(),
      detail: jest.fn(),
      listServiceOptions: jest.fn(),
      listRoutes: jest.fn(),
      listServiceAreas: jest.fn(),
      listTypes: jest.fn(),
    });
    service = new TransportsService(placesService, repo);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('paginate + map transport_type/pricing/cờ tri-state/rating_avg', async () => {
      repo.listTransports.mockResolvedValue([
        {
          id: 't1', name: 'Taxi Mai Linh Phú Quốc', slug: 'taxi-mai-linh', short_description: null,
          cover_image_url: null, ward: 'Dương Đông', rating_avg: '4.2', rating_count: 10,
          verification_status: 'pending',
          transport_type_code: 'taxi', transport_type_label_vi: 'Taxi', transport_type_label_en: 'Taxi',
          pricing_model: 'per_km', price_ref: '15000', price_currency: 'VND', price_unit: 'km',
          capacity_passengers: 4, booking_required: false, airport_transfer: true,
          lat: '10.2', lng: '103.96',
        },
      ]);
      repo.countTransports.mockResolvedValue(1);

      const res = await service.list();

      expect(res.meta.total).toBe(1);
      expect(res.data[0]).toMatchObject({
        id: 't1',
        rating_avg: 4.2,
        transport_type: { code: 'taxi', label_vi: 'Taxi', label_en: 'Taxi' },
        pricing: { model: 'per_km', price_ref: 15000, currency: 'VND', unit: 'km' },
        capacity_passengers: 4,
        booking_required: false,
        airport_transfer: true,
        location: { lat: 10.2, lng: 103.96 },
      });
    });

    it('pricing_model/price_ref NULL → pricing.model=null, price_ref=null (chưa xác nhận ≠ 0/miễn phí)', async () => {
      repo.listTransports.mockResolvedValue([
        {
          id: 't2', name: 'Thuê xe máy Phú Quốc', slug: 'thue-xe-may', short_description: null,
          cover_image_url: null, ward: null, rating_avg: null, rating_count: 0,
          verification_status: 'pending',
          transport_type_code: 'motorbike_rental', transport_type_label_vi: 'Thuê xe máy', transport_type_label_en: 'Motorbike Rental',
          pricing_model: null, price_ref: null, price_currency: 'VND', price_unit: null,
          capacity_passengers: null, booking_required: null, airport_transfer: null,
          lat: '10.2', lng: '103.96',
        },
      ]);
      repo.countTransports.mockResolvedValue(1);

      const res = await service.list();

      expect(res.data[0]).toMatchObject({
        pricing: { model: null, price_ref: null, currency: 'VND', unit: null },
        booking_required: null,
        airport_transfer: null,
      });
    });

    it('truyền sort xuống repository; mặc định rating_desc khi không truyền', async () => {
      repo.listTransports.mockResolvedValue([]);
      repo.countTransports.mockResolvedValue(0);
      const emptyFilters = {
        transportType: undefined,
        ward: undefined,
        pricingModel: undefined,
        bookingRequired: undefined,
        airportTransfer: undefined,
      };

      await service.list();
      expect(repo.listTransports).toHaveBeenCalledWith(20, 0, 'rating_desc', emptyFilters);

      await service.list({ sort: 'name_asc', page: 2, limit: 10 } as Parameters<typeof service.list>[0]);
      expect(repo.listTransports).toHaveBeenCalledWith(10, 10, 'name_asc', emptyFilters);
    });

    it('limit > 100 bị cắt xuống 100 (clampLimit), meta.pageSize phản ánh giá trị đã cắt', async () => {
      repo.listTransports.mockResolvedValue([]);
      repo.countTransports.mockResolvedValue(0);

      const res = await service.list({ limit: 500 } as Parameters<typeof service.list>[0]);

      expect(repo.listTransports).toHaveBeenCalledWith(100, 0, 'rating_desc', expect.anything());
      expect(res.meta.pageSize).toBe(100);
    });

    // Transport Browse Filters (2026-07-30)
    it('truyền transport_type/ward/pricing_model/booking_required/airport_transfer xuống repo dạng filters object', async () => {
      repo.listTransports.mockResolvedValue([]);
      repo.countTransports.mockResolvedValue(0);

      const query = {
        transport_type: 'taxi',
        ward: 'Dương Đông',
        pricing_model: 'per_km',
        booking_required: false,
        airport_transfer: true,
      } as Parameters<typeof service.list>[0];
      await service.list(query);

      const expectedFilters = {
        transportType: 'taxi',
        ward: 'Dương Đông',
        pricingModel: 'per_km',
        bookingRequired: false,
        airportTransfer: true,
      };
      expect(repo.listTransports).toHaveBeenCalledWith(20, 0, 'rating_desc', expectedFilters);
      expect(repo.countTransports).toHaveBeenCalledWith(expectedFilters);
    });

    it('booking_required=false được truyền nguyên vẹn xuống repo (không bị coi là "không có filter")', async () => {
      repo.listTransports.mockResolvedValue([]);
      repo.countTransports.mockResolvedValue(0);

      await service.list({ booking_required: false } as Parameters<typeof service.list>[0]);

      const [, , , filters] = repo.listTransports.mock.calls[0];
      expect(filters).toMatchObject({ bookingRequired: false });
    });
  });

  describe('getBySlug', () => {
    it('ghép place + transport_details + service_options + routes + service_areas', async () => {
      placesService.getBySlug.mockResolvedValue({ id: 'p1', slug: 'taxi-mai-linh', name: 'Taxi Mai Linh' });
      repo.detail.mockResolvedValue({
        transport_type_code: 'taxi', transport_type_label_vi: 'Taxi', transport_type_label_en: 'Taxi',
        provider_business_id: null, pricing_model: 'fixed', price_ref: '200000', price_currency: 'VND',
        price_unit: null, capacity_passengers: 4, booking_required: true, airport_transfer: true,
        booking_note: 'Đặt trước 2 giờ',
      });
      repo.listServiceOptions.mockResolvedValue([
        { id: 'o1', name: 'Xe 4 chỗ', capacity_passengers: 4, price_ref: '200000', price_currency: 'VND', price_unit: null, valid_from: null, valid_to: null, sort_order: 0 },
      ]);
      repo.listRoutes.mockResolvedValue([
        { id: 'r1', origin_label: 'Sân bay Phú Quốc', origin_lat: 10.2, origin_lng: 103.96, destination_label: 'Dương Đông', destination_lat: null, destination_lng: null, note: null, sort_order: 0 },
      ]);
      repo.listServiceAreas.mockResolvedValue([{ ward: 'Dương Đông' }, { ward: 'An Thới' }]);

      const res = await service.getBySlug('taxi-mai-linh');

      expect(res.transport_details).toMatchObject({
        transport_type: { code: 'taxi', label_vi: 'Taxi', label_en: 'Taxi' },
        pricing: { model: 'fixed', price_ref: 200000, currency: 'VND', unit: null },
        booking_required: true,
        booking_note: 'Đặt trước 2 giờ',
      });
      expect(res.service_options).toHaveLength(1);
      expect(res.service_options[0]).toMatchObject({ id: 'o1', name: 'Xe 4 chỗ', price_ref: 200000 });
      expect(res.routes[0]).toMatchObject({
        origin_label: 'Sân bay Phú Quốc',
        origin_location: { lat: 10.2, lng: 103.96 },
        destination_location: null,
      });
      expect(res.service_areas).toEqual(['Dương Đông', 'An Thới']);
    });

    it('place tồn tại nhưng thiếu hàng vệ tinh → NotFoundException (toàn vẹn dữ liệu lệch, không trả record hỏng)', async () => {
      placesService.getBySlug.mockResolvedValue({ id: 'p1', slug: 'x' });
      repo.detail.mockResolvedValue(null);
      repo.listServiceOptions.mockResolvedValue([]);
      repo.listRoutes.mockResolvedValue([]);
      repo.listServiceAreas.mockResolvedValue([]);

      await expect(service.getBySlug('x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('slug không tồn tại → lỗi từ PlacesService.getBySlug lan lên nguyên vẹn (không nuốt lỗi)', async () => {
      const notFound = new NotFoundException('Không tìm thấy địa điểm');
      placesService.getBySlug.mockRejectedValue(notFound);

      await expect(service.getBySlug('khong-ton-tai')).rejects.toBe(notFound);
      expect(repo.detail).not.toHaveBeenCalled();
    });
  });

  describe('findByPlaceId', () => {
    it('có hàng → trả transport_details đã map (không kèm base Place — caller đã có)', async () => {
      repo.detail.mockResolvedValue({
        transport_type_code: 'ferry', transport_type_label_vi: 'Phà', transport_type_label_en: 'Ferry',
        provider_business_id: 'biz1', pricing_model: 'per_person', price_ref: '80000', price_currency: 'VND',
        price_unit: 'khách', capacity_passengers: null, booking_required: null, airport_transfer: null,
        booking_note: null,
      });

      const res = await service.findByPlaceId('p1');

      expect(repo.detail).toHaveBeenCalledWith('p1');
      expect(res).toMatchObject({
        transport_type: { code: 'ferry', label_vi: 'Phà' },
        provider_business_id: 'biz1',
        pricing: { model: 'per_person', price_ref: 80000, unit: 'khách' },
      });
    });

    it('không có hàng → NotFoundException', async () => {
      repo.detail.mockResolvedValue(null);
      await expect(service.findByPlaceId('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listTypes', () => {
    it('map đủ trường, giữ nguyên sort_order từ repository', async () => {
      repo.listTypes.mockResolvedValue([
        { id: 'tt1', code: 'taxi', label_vi: 'Taxi', label_en: 'Taxi', icon: null, parent_id: null, sort_order: 0 },
        { id: 'tt2', code: 'ferry', label_vi: 'Phà', label_en: 'Ferry', icon: null, parent_id: null, sort_order: 8 },
      ]);

      const res = await service.listTypes();

      expect(res).toHaveLength(2);
      expect(res[0]).toMatchObject({ code: 'taxi', sort_order: 0 });
      expect(res[1]).toMatchObject({ code: 'ferry', sort_order: 8 });
    });
  });
});
