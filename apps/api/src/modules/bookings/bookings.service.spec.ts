import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

jest.mock('./bookings.mapper', () => ({
  toBooking: (b: { id?: string }, items: unknown[]) => ({ id: b?.id, itemCount: items.length, mapped: true }),
}));
jest.mock('./booking-code', () => ({
  ...jest.requireActual('./booking-code'),
  generateBookingCode: jest.fn(),
}));

import { BookingsService } from './bookings.service';
import { BookingsRepository } from './repositories/bookings.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { generateBookingCode } from './booking-code';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

const generateBookingCodeMock = generateBookingCode as jest.Mock;

describe('BookingsService', () => {
  let bookingsRepo: LooseMock<BookingsRepository>;
  let placesRepo: LooseMock<PlacesRepository>;
  let service: BookingsService;

  const dto = {
    entity_type: 'tour' as const,
    entity_id: 'e1',
    place_id: 'p1',
    party_size: 2,
    items: [{ label: 'Vé người lớn', quantity: 2, unit_price: 500000 }],
  };

  beforeEach(() => {
    bookingsRepo = createMock<BookingsRepository>({
      existsByCode: jest.fn(),
      findByCode: jest.fn(),
      findItemsByBookingId: jest.fn(),
      create: jest.fn(),
    });
    placesRepo = createMock<PlacesRepository>({ existsByIdAndCategorySlug: jest.fn() });
    service = new BookingsService(bookingsRepo, placesRepo);
    generateBookingCodeMock.mockReturnValue('ABC23456');
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('place_id không khớp entity_type → UnprocessableEntity, không tạo booking', async () => {
      placesRepo.existsByIdAndCategorySlug.mockResolvedValue(false);
      await expect(service.create(dto, 'u1')).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(bookingsRepo.create).not.toHaveBeenCalled();
    });

    it('hợp lệ → sinh booking_code, tạo booking qua repository', async () => {
      placesRepo.existsByIdAndCategorySlug.mockResolvedValue(true);
      bookingsRepo.existsByCode.mockResolvedValue(false);
      bookingsRepo.create.mockResolvedValue({ booking: { id: 'b1' }, items: [{ id: 'i1' }] });

      const res = await service.create(dto, 'u1');

      expect(placesRepo.existsByIdAndCategorySlug).toHaveBeenCalledWith('p1', 'tour');
      expect(bookingsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingCode: 'ABC23456',
          entityType: 'tour',
          entityId: 'e1',
          placeId: 'p1',
          customerUserId: 'u1',
          partySize: 2,
          items: [{ label: 'Vé người lớn', quantity: 2, unitPrice: 500000 }],
        }),
      );
      expect(res).toEqual({ id: 'b1', itemCount: 1, mapped: true });
    });

    it('booking_code trùng → thử lại tới khi trống', async () => {
      placesRepo.existsByIdAndCategorySlug.mockResolvedValue(true);
      bookingsRepo.existsByCode.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      bookingsRepo.create.mockResolvedValue({ booking: { id: 'b1' }, items: [] });

      await service.create(dto, 'u1');

      expect(bookingsRepo.existsByCode).toHaveBeenCalledTimes(2);
    });

    it('không sinh được code không trùng sau nhiều lần thử → lỗi, không tạo booking', async () => {
      placesRepo.existsByIdAndCategorySlug.mockResolvedValue(true);
      bookingsRepo.existsByCode.mockResolvedValue(true);

      await expect(service.create(dto, 'u1')).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(bookingsRepo.create).not.toHaveBeenCalled();
    });

    it('repository.create thất bại (vd lỗi transaction) → lỗi lan ra ngoài nguyên vẹn, không bị nuốt', async () => {
      placesRepo.existsByIdAndCategorySlug.mockResolvedValue(true);
      bookingsRepo.existsByCode.mockResolvedValue(false);
      const dbError = new Error('transaction rollback: insert booking_items violates constraint');
      bookingsRepo.create.mockRejectedValue(dbError);

      await expect(service.create(dto, 'u1')).rejects.toBe(dbError);
    });
  });

  describe('getByCodeForUser', () => {
    it.each(['', 'abc', '1234567890123', 'CODE0001', "'; DROP TABLE bookings;--"])(
      'booking_code sai định dạng (%p) → BadRequest, không truy vấn DB',
      async (bad) => {
        await expect(service.getByCodeForUser(bad, 'u1')).rejects.toBeInstanceOf(BadRequestException);
        expect(bookingsRepo.findByCode).not.toHaveBeenCalled();
      },
    );

    it('không tìm thấy booking → NotFound', async () => {
      bookingsRepo.findByCode.mockResolvedValue(null);
      await expect(service.getByCodeForUser('ABC23456', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('booking thuộc người khác → NotFound (không lộ tồn tại)', async () => {
      bookingsRepo.findByCode.mockResolvedValue({ id: 'b1', customerUserId: 'u2' });
      await expect(service.getByCodeForUser('ABC23456', 'u1')).rejects.toBeInstanceOf(NotFoundException);
      expect(bookingsRepo.findItemsByBookingId).not.toHaveBeenCalled();
    });

    it('đúng chủ booking → trả về kèm items', async () => {
      bookingsRepo.findByCode.mockResolvedValue({ id: 'b1', customerUserId: 'u1' });
      bookingsRepo.findItemsByBookingId.mockResolvedValue([{ id: 'i1' }]);

      const res = await service.getByCodeForUser('ABC23456', 'u1');

      expect(bookingsRepo.findItemsByBookingId).toHaveBeenCalledWith('b1');
      expect(res).toEqual({ id: 'b1', itemCount: 1, mapped: true });
    });
  });
});
