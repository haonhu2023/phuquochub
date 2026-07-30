import { UnprocessableEntityException } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { AvailabilitySlotsRepository } from './repositories/availability-slots.repository';
import { InventoryHoldsRepository } from './repositories/inventory-holds.repository';
import { InventoryHoldStatus } from './availability.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('AvailabilityService', () => {
  let slotsRepo: LooseMock<AvailabilitySlotsRepository>;
  let holdsRepo: LooseMock<InventoryHoldsRepository>;
  let ds: LooseMock<import('typeorm').DataSource>;
  let service: AvailabilityService;

  beforeEach(() => {
    slotsRepo = createMock<AvailabilitySlotsRepository>({ create: jest.fn(), list: jest.fn() });
    holdsRepo = createMock<InventoryHoldsRepository>({
      findByBookingId: jest.fn(),
      markConfirmed: jest.fn(),
      markReleased: jest.fn(),
      markExpired: jest.fn(),
      placeHold: jest.fn(),
      expireOverdueHolds: jest.fn(),
    });
    ds = createMock<import('typeorm').DataSource>({ transaction: jest.fn() });
    service = new AvailabilityService(slotsRepo, holdsRepo, ds);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createSlot', () => {
    it('map DTO -> NewAvailabilitySlot, trả về response với held_quantity=0/remaining_capacity=total_capacity', async () => {
      slotsRepo.create.mockResolvedValue({
        id: 's1',
        entityType: 'tour',
        entityId: 'e1',
        placeId: 'p1',
        slotStart: new Date('2026-08-01T08:00:00Z'),
        slotEnd: null,
        totalCapacity: 20,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.createSlot({
        entity_type: 'tour',
        entity_id: 'e1',
        place_id: 'p1',
        slot_start: '2026-08-01T08:00:00Z',
        total_capacity: 20,
      } as never);

      expect(slotsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'tour', entityId: 'e1', placeId: 'p1', totalCapacity: 20, slotEnd: null }),
      );
      expect(res).toMatchObject({ id: 's1', held_quantity: 0, remaining_capacity: 20, total_capacity: 20 });
    });
  });

  describe('list', () => {
    it('map items -> response (id/held_quantity/remaining_capacity), theo pagination convention', async () => {
      slotsRepo.list.mockResolvedValue({
        items: [
          {
            slot: {
              id: 's1',
              entityType: 'tour',
              entityId: 'e1',
              placeId: 'p1',
              slotStart: new Date(),
              slotEnd: null,
              totalCapacity: 10,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            heldQuantity: 4,
          },
        ],
        total: 1,
      });

      const res = await service.list({ page: 1, limit: 20 } as never);

      expect(res).toMatchObject({
        success: true,
        data: [expect.objectContaining({ id: 's1', held_quantity: 4, remaining_capacity: 6 })],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
    });
  });

  describe('confirmHoldForBooking (mục E: prevent confirming expired holds)', () => {
    it('booking chưa từng yêu cầu hold → no-op, KHÔNG throw', async () => {
      holdsRepo.findByBookingId.mockResolvedValue(null);
      await expect(service.confirmHoldForBooking('b1')).resolves.toBeUndefined();
      expect(holdsRepo.markConfirmed).not.toHaveBeenCalled();
    });

    it('hold active, chưa hết hạn → markConfirmed', async () => {
      holdsRepo.findByBookingId.mockResolvedValue({
        id: 'h1',
        status: InventoryHoldStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 60_000),
      } as never);

      await service.confirmHoldForBooking('b1');

      expect(holdsRepo.markConfirmed).toHaveBeenCalledWith('h1');
      expect(holdsRepo.markExpired).not.toHaveBeenCalled();
    });

    it('hold active nhưng expiresAt đã qua (lazy expiration) → markExpired + UnprocessableEntity, KHÔNG markConfirmed', async () => {
      holdsRepo.findByBookingId.mockResolvedValue({
        id: 'h1',
        status: InventoryHoldStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 60_000),
      } as never);

      await expect(service.confirmHoldForBooking('b1')).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(holdsRepo.markExpired).toHaveBeenCalledWith('h1');
      expect(holdsRepo.markConfirmed).not.toHaveBeenCalled();
    });

    it.each([InventoryHoldStatus.EXPIRED, InventoryHoldStatus.RELEASED, InventoryHoldStatus.CONFIRMED])(
      'hold ở trạng thái %s (không phải active) → UnprocessableEntity, KHÔNG markConfirmed',
      async (status) => {
        holdsRepo.findByBookingId.mockResolvedValue({ id: 'h1', status, expiresAt: new Date(Date.now() + 60_000) } as never);
        await expect(service.confirmHoldForBooking('b1')).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(holdsRepo.markConfirmed).not.toHaveBeenCalled();
      },
    );
  });

  describe('releaseHoldForBooking', () => {
    it('booking chưa từng yêu cầu hold → no-op', async () => {
      holdsRepo.findByBookingId.mockResolvedValue(null);
      await service.releaseHoldForBooking('b1');
      expect(holdsRepo.markReleased).not.toHaveBeenCalled();
    });

    it.each([InventoryHoldStatus.ACTIVE, InventoryHoldStatus.CONFIRMED])(
      'hold ở trạng thái %s → markReleased',
      async (status) => {
        holdsRepo.findByBookingId.mockResolvedValue({ id: 'h1', status } as never);
        await service.releaseHoldForBooking('b1');
        expect(holdsRepo.markReleased).toHaveBeenCalledWith('h1');
      },
    );

    it.each([InventoryHoldStatus.RELEASED, InventoryHoldStatus.EXPIRED])(
      'hold đã ở trạng thái cuối %s → no-op (idempotent, không gọi lại markReleased)',
      async (status) => {
        holdsRepo.findByBookingId.mockResolvedValue({ id: 'h1', status } as never);
        await service.releaseHoldForBooking('b1');
        expect(holdsRepo.markReleased).not.toHaveBeenCalled();
      },
    );
  });

  describe('placeHold / expireOverdueHolds (uỷ quyền)', () => {
    it('placeHold: mở transaction riêng, uỷ quyền holdsRepo.placeHold(manager, params)', async () => {
      const manager = { fake: 'manager' };
      ds.transaction.mockImplementation((cb: (m: unknown) => unknown) => cb(manager));
      const params = { availabilitySlotId: 's1', bookingId: 'b1', quantity: 2, expiresAt: new Date() };

      await service.placeHold(params);

      expect(holdsRepo.placeHold).toHaveBeenCalledWith(manager, params);
    });

    it('expireOverdueHolds: uỷ quyền holdsRepo.expireOverdueHolds', async () => {
      holdsRepo.expireOverdueHolds.mockResolvedValue(4);
      const now = new Date();
      expect(await service.expireOverdueHolds(now)).toBe(4);
      expect(holdsRepo.expireOverdueHolds).toHaveBeenCalledWith(now);
    });
  });
});
