import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

jest.mock('./bookings.mapper', () => ({
  toBooking: (b: { id?: string }, items: unknown[]) => ({ id: b?.id, itemCount: items.length, mapped: true }),
  toBookingAdminCard: (b: { id?: string }) => ({ id: b?.id, mapped: 'admin-card' }),
}));
jest.mock('./booking-code', () => ({
  ...jest.requireActual('./booking-code'),
  generateBookingCode: jest.fn(),
}));

import { BookingsService } from './bookings.service';
import { BookingsRepository } from './repositories/bookings.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { AuditService } from '../../core/audit/audit.service';
import { BookingEventPublisher } from './events/booking-events';
import { AvailabilitySlotsRepository } from '../availability/repositories/availability-slots.repository';
import { AvailabilityService } from '../availability/availability.service';
import { generateBookingCode } from './booking-code';
import { BookingStatus } from './booking.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

const generateBookingCodeMock = generateBookingCode as jest.Mock;

describe('BookingsService', () => {
  let bookingsRepo: LooseMock<BookingsRepository>;
  let placesRepo: LooseMock<PlacesRepository>;
  let audit: LooseMock<AuditService>;
  let events: LooseMock<BookingEventPublisher>;
  let availabilitySlotsRepo: LooseMock<AvailabilitySlotsRepository>;
  let availabilityService: LooseMock<AvailabilityService>;
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
      findById: jest.fn(),
      findItemsByBookingId: jest.fn(),
      create: jest.fn(),
      list: jest.fn(),
      updateStatus: jest.fn(),
    });
    placesRepo = createMock<PlacesRepository>({ existsByIdAndCategorySlug: jest.fn() });
    audit = createMock<AuditService>({ record: jest.fn() });
    events = createMock<BookingEventPublisher>({ publish: jest.fn() });
    availabilitySlotsRepo = createMock<AvailabilitySlotsRepository>({ findById: jest.fn() });
    availabilityService = createMock<AvailabilityService>({
      confirmHoldForBooking: jest.fn(),
      releaseHoldForBooking: jest.fn(),
    });
    service = new BookingsService(bookingsRepo, placesRepo, audit, events, availabilitySlotsRepo, availabilityService);
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

    describe('availability_slot_id (Availability & Inventory Foundation — optional, mục C)', () => {
      it('vắng mặt → KHÔNG gọi availabilitySlotsRepo.findById, bookingsRepo.create nhận hold=undefined (hành vi y hệt trước khi có tính năng này)', async () => {
        placesRepo.existsByIdAndCategorySlug.mockResolvedValue(true);
        bookingsRepo.existsByCode.mockResolvedValue(false);
        bookingsRepo.create.mockResolvedValue({ booking: { id: 'b1' }, items: [] });

        await service.create(dto, 'u1');

        expect(availabilitySlotsRepo.findById).not.toHaveBeenCalled();
        expect(bookingsRepo.create).toHaveBeenCalledWith(expect.objectContaining({ hold: undefined }));
      });

      it('slot không tồn tại → UnprocessableEntity, KHÔNG tạo booking', async () => {
        placesRepo.existsByIdAndCategorySlug.mockResolvedValue(true);
        availabilitySlotsRepo.findById.mockResolvedValue(null);

        await expect(
          service.create({ ...dto, availability_slot_id: 's1' } as never, 'u1'),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(bookingsRepo.create).not.toHaveBeenCalled();
      });

      it.each([
        ['entityType', { entityType: 'hotel', entityId: 'e1', placeId: 'p1' }],
        ['entityId', { entityType: 'tour', entityId: 'OTHER', placeId: 'p1' }],
        ['placeId', { entityType: 'tour', entityId: 'e1', placeId: 'OTHER' }],
      ])('slot lệch %s so với booking → UnprocessableEntity, KHÔNG tạo booking', async (_field, slot) => {
        placesRepo.existsByIdAndCategorySlug.mockResolvedValue(true);
        availabilitySlotsRepo.findById.mockResolvedValue(slot as never);

        await expect(
          service.create({ ...dto, availability_slot_id: 's1' } as never, 'u1'),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(bookingsRepo.create).not.toHaveBeenCalled();
      });

      it('slot khớp đúng → truyền hold {availabilitySlotId, quantity: party_size, expiresAt} cho bookingsRepo.create', async () => {
        placesRepo.existsByIdAndCategorySlug.mockResolvedValue(true);
        bookingsRepo.existsByCode.mockResolvedValue(false);
        availabilitySlotsRepo.findById.mockResolvedValue({ entityType: 'tour', entityId: 'e1', placeId: 'p1' } as never);
        bookingsRepo.create.mockResolvedValue({ booking: { id: 'b1' }, items: [] });

        const before = Date.now();
        await service.create({ ...dto, availability_slot_id: 's1' } as never, 'u1');

        expect(bookingsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            hold: expect.objectContaining({ availabilitySlotId: 's1', quantity: 2 }),
          }),
        );
        const call = bookingsRepo.create.mock.calls[0][0] as { hold: { expiresAt: Date } };
        // mặc định 30 phút (DEFAULT_HOLD_TTL_MINUTES) khi hold_ttl_minutes không được gửi
        expect(call.hold.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 29 * 60_000);
        expect(call.hold.expiresAt.getTime()).toBeLessThanOrEqual(before + 31 * 60_000);
      });

      it('hold_ttl_minutes được gửi → dùng giá trị đó thay vì mặc định ("Configurable expiration time", mục B)', async () => {
        placesRepo.existsByIdAndCategorySlug.mockResolvedValue(true);
        bookingsRepo.existsByCode.mockResolvedValue(false);
        availabilitySlotsRepo.findById.mockResolvedValue({ entityType: 'tour', entityId: 'e1', placeId: 'p1' } as never);
        bookingsRepo.create.mockResolvedValue({ booking: { id: 'b1' }, items: [] });

        const before = Date.now();
        await service.create({ ...dto, availability_slot_id: 's1', hold_ttl_minutes: 5 } as never, 'u1');

        const call = bookingsRepo.create.mock.calls[0][0] as { hold: { expiresAt: Date } };
        expect(call.hold.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 4 * 60_000);
        expect(call.hold.expiresAt.getTime()).toBeLessThanOrEqual(before + 6 * 60_000);
      });
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

  describe('list (Phase 2 — Booking.List)', () => {
    it('module_code và entity_type mâu thuẫn nhau → BadRequest, không truy vấn DB', async () => {
      await expect(
        service.list({ module_code: 'hotel', entity_type: 'tour' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(bookingsRepo.list).not.toHaveBeenCalled();
    });

    it('module_code và entity_type giống nhau → hợp lệ, dùng giá trị đó làm entityType filter', async () => {
      bookingsRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({ module_code: 'hotel', entity_type: 'hotel' } as never);
      expect(bookingsRepo.list).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'hotel' }));
    });

    it('chỉ module_code (không có entity_type) → dùng module_code làm entityType filter', async () => {
      bookingsRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({ module_code: 'tour' } as never);
      expect(bookingsRepo.list).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'tour' }));
    });

    it('không truyền sort_by/sort_dir → mặc định created_at DESC', async () => {
      bookingsRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({} as never);
      expect(bookingsRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'created_at', sortDir: 'DESC' }),
      );
    });

    it('sort_dir=asc → truyền ASC xuống repository', async () => {
      bookingsRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({ sort_dir: 'asc' } as never);
      expect(bookingsRepo.list).toHaveBeenCalledWith(expect.objectContaining({ sortDir: 'ASC' }));
    });

    it('map items qua toBookingAdminCard, trả về theo pagination convention hiện tại (paginate())', async () => {
      bookingsRepo.list.mockResolvedValue({ items: [{ id: 'b1' }, { id: 'b2' }], total: 2 });
      const res = await service.list({ page: 1, limit: 20 } as never);
      expect(res).toMatchObject({
        success: true,
        data: [
          { id: 'b1', mapped: 'admin-card' },
          { id: 'b2', mapped: 'admin-card' },
        ],
        meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      });
    });

    it('date_from/date_to lọc theo service_start_at (Date), KHÔNG phải created_at', async () => {
      bookingsRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({ date_from: '2026-08-01T00:00:00Z', date_to: '2026-08-31T23:59:59Z' } as never);
      expect(bookingsRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ dateFrom: new Date('2026-08-01T00:00:00Z'), dateTo: new Date('2026-08-31T23:59:59Z') }),
      );
    });
  });

  describe('confirm/cancel/markExpired (Phase 2 — mọi thay đổi trạng thái đi qua BookingService)', () => {
    it('confirm: không tìm thấy booking → NotFound, không update/audit/publish', async () => {
      bookingsRepo.findById.mockResolvedValue(null);
      await expect(service.confirm('b1', 'staff1')).rejects.toBeInstanceOf(NotFoundException);
      expect(bookingsRepo.updateStatus).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('confirm: pending -> confirmed hợp lệ → update DB, ghi audit, publish BookingConfirmedEvent', async () => {
      bookingsRepo.findById.mockResolvedValue({
        id: 'b1',
        bookingCode: 'ABC23456',
        bookingStatus: BookingStatus.PENDING,
      });

      const res = await service.confirm('b1', 'staff1');

      expect(bookingsRepo.updateStatus).toHaveBeenCalledWith('b1', BookingStatus.CONFIRMED);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'booking.status_changed',
          entityType: 'booking',
          entityId: 'b1',
          actorId: 'staff1',
          permission: 'Booking.Confirm',
          context: { from: BookingStatus.PENDING, to: BookingStatus.CONFIRMED },
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'BookingConfirmed', bookingId: 'b1', bookingCode: 'ABC23456' }),
      );
      expect(res).toBeNull();
    });

    describe('Availability & Inventory Foundation — confirm/cancel hold integration (mục C/E)', () => {
      it('confirm: gọi availabilityService.confirmHoldForBooking TRƯỚC bookingsRepo.updateStatus (nếu hold expired, KHÔNG được confirm booking)', async () => {
        bookingsRepo.findById.mockResolvedValue({ id: 'b1', bookingCode: 'ABC23456', bookingStatus: BookingStatus.PENDING });
        const callOrder: string[] = [];
        availabilityService.confirmHoldForBooking.mockImplementation(async () => {
          callOrder.push('confirmHold');
        });
        bookingsRepo.updateStatus.mockImplementation(async () => {
          callOrder.push('updateStatus');
        });

        await service.confirm('b1', 'staff1');

        expect(availabilityService.confirmHoldForBooking).toHaveBeenCalledWith('b1');
        expect(callOrder).toEqual(['confirmHold', 'updateStatus']);
      });

      it('confirm: availabilityService.confirmHoldForBooking ném lỗi (hold expired) → booking KHÔNG được updateStatus/audit/publish (toàn bộ confirm thất bại)', async () => {
        bookingsRepo.findById.mockResolvedValue({ id: 'b1', bookingCode: 'ABC23456', bookingStatus: BookingStatus.PENDING });
        const holdExpiredError = new UnprocessableEntityException('Không thể confirm: hold đã expired');
        availabilityService.confirmHoldForBooking.mockRejectedValue(holdExpiredError);

        await expect(service.confirm('b1', 'staff1')).rejects.toBe(holdExpiredError);
        expect(bookingsRepo.updateStatus).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
        expect(events.publish).not.toHaveBeenCalled();
      });

      it('cancel: gọi availabilityService.releaseHoldForBooking SAU bookingsRepo.updateStatus (best-effort, không chặn quyết định huỷ)', async () => {
        bookingsRepo.findById.mockResolvedValue({ id: 'b1', bookingCode: 'ABC23456', bookingStatus: BookingStatus.PENDING });
        const callOrder: string[] = [];
        bookingsRepo.updateStatus.mockImplementation(async () => {
          callOrder.push('updateStatus');
        });
        availabilityService.releaseHoldForBooking.mockImplementation(async () => {
          callOrder.push('releaseHold');
        });

        await service.cancel('b1', 'staff1');

        expect(availabilityService.releaseHoldForBooking).toHaveBeenCalledWith('b1');
        expect(callOrder).toEqual(['updateStatus', 'releaseHold']);
      });

      it('markExpired: KHÔNG gọi availabilityService.confirmHoldForBooking/releaseHoldForBooking (chỉ confirm/cancel tương tác với hold)', async () => {
        bookingsRepo.findById.mockResolvedValue({ id: 'b1', bookingCode: 'ABC23456', bookingStatus: BookingStatus.PENDING });
        await service.markExpired('b1', 'staff1');
        expect(availabilityService.confirmHoldForBooking).not.toHaveBeenCalled();
        expect(availabilityService.releaseHoldForBooking).not.toHaveBeenCalled();
      });
    });

    it('confirm: booking đã confirmed → UnprocessableEntity, KHÔNG update/audit/publish (validation trước side-effect)', async () => {
      bookingsRepo.findById.mockResolvedValue({ id: 'b1', bookingStatus: BookingStatus.CONFIRMED });
      await expect(service.confirm('b1', 'staff1')).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(bookingsRepo.updateStatus).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('cancel: pending -> cancelled hợp lệ → publish BookingCancelledEvent', async () => {
      bookingsRepo.findById.mockResolvedValue({
        id: 'b1',
        bookingCode: 'ABC23456',
        bookingStatus: BookingStatus.PENDING,
      });
      await service.cancel('b1', 'staff1');
      expect(bookingsRepo.updateStatus).toHaveBeenCalledWith('b1', BookingStatus.CANCELLED);
      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'BookingCancelled' }));
    });

    it('cancel: confirmed -> cancelled cũng hợp lệ', async () => {
      bookingsRepo.findById.mockResolvedValue({
        id: 'b1',
        bookingCode: 'ABC23456',
        bookingStatus: BookingStatus.CONFIRMED,
      });
      await service.cancel('b1', 'staff1');
      expect(bookingsRepo.updateStatus).toHaveBeenCalledWith('b1', BookingStatus.CANCELLED);
    });

    it('cancel: booking đã cancelled → UnprocessableEntity', async () => {
      bookingsRepo.findById.mockResolvedValue({ id: 'b1', bookingStatus: BookingStatus.CANCELLED });
      await expect(service.cancel('b1', 'staff1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('markExpired: pending -> expired hợp lệ → update DB, ghi audit, KHÔNG publish event (chỉ Created/Confirmed/Cancelled có trong Phase 2)', async () => {
      bookingsRepo.findById.mockResolvedValue({
        id: 'b1',
        bookingCode: 'ABC23456',
        bookingStatus: BookingStatus.PENDING,
      });
      await service.markExpired('b1', 'staff1');
      expect(bookingsRepo.updateStatus).toHaveBeenCalledWith('b1', BookingStatus.EXPIRED);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ permission: 'Booking.MarkExpired' }));
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('markExpired: booking đã confirmed → UnprocessableEntity (confirmed không "expire", phải cancel)', async () => {
      bookingsRepo.findById.mockResolvedValue({ id: 'b1', bookingStatus: BookingStatus.CONFIRMED });
      await expect(service.markExpired('b1', 'staff1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('booking đã expired → cả 3 hành động đều UnprocessableEntity', async () => {
      bookingsRepo.findById.mockResolvedValue({ id: 'b1', bookingStatus: BookingStatus.EXPIRED });
      await expect(service.confirm('b1', 's1')).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(service.cancel('b1', 's1')).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(service.markExpired('b1', 's1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });
});
