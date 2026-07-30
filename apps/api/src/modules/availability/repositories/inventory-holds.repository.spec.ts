import { ConflictException } from '@nestjs/common';
import { EntityManager, Repository, SelectQueryBuilder, UpdateQueryBuilder } from 'typeorm';
import { InventoryHoldsRepository } from './inventory-holds.repository';
import { InventoryHold } from '../entities/inventory-hold.entity';
import { AvailabilitySlot } from '../entities/availability-slot.entity';
import { InventoryHoldStatus } from '../availability.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

describe('InventoryHoldsRepository', () => {
  let holds: LooseMock<Repository<InventoryHold>>;
  let ds: LooseMock<import('typeorm').DataSource>;
  let sut: InventoryHoldsRepository;

  beforeEach(() => {
    holds = createMock<Repository<InventoryHold>>({ findOne: jest.fn(), update: jest.fn(), createQueryBuilder: jest.fn() });
    ds = createMock<import('typeorm').DataSource>();
    sut = new InventoryHoldsRepository(holds, ds);
  });

  afterEach(() => jest.clearAllMocks());

  it('findByBookingId: uỷ quyền repo.findOne theo bookingId', async () => {
    holds.findOne.mockResolvedValue({ id: 'h1' });
    const res = await sut.findByBookingId('b1');
    expect(holds.findOne).toHaveBeenCalledWith({ where: { bookingId: 'b1' } });
    expect(res).toEqual({ id: 'h1' });
  });

  it.each(['markConfirmed', 'markReleased', 'markExpired'] as const)(
    '%s: chỉ update cột status tương ứng',
    async (method) => {
      await sut[method]('h1');
      const expectedStatus = {
        markConfirmed: InventoryHoldStatus.CONFIRMED,
        markReleased: InventoryHoldStatus.RELEASED,
        markExpired: InventoryHoldStatus.EXPIRED,
      }[method];
      expect(holds.update).toHaveBeenCalledWith({ id: 'h1' }, { status: expectedStatus });
    },
  );

  describe('expireOverdueHolds', () => {
    it('update WHERE status=active AND expiresAt<=now, trả về số dòng bị ảnh hưởng', async () => {
      const updateQb = createMock<UpdateQueryBuilder<InventoryHold>>({
        set: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        execute: jest.fn().mockResolvedValue({ affected: 3 }),
      });
      updateQb.set.mockReturnValue(updateQb);
      updateQb.where.mockReturnValue(updateQb);
      updateQb.andWhere.mockReturnValue(updateQb);
      const qb = createMock<SelectQueryBuilder<InventoryHold>>({ update: jest.fn().mockReturnValue(updateQb) });
      holds.createQueryBuilder.mockReturnValue(qb);

      const res = await sut.expireOverdueHolds(new Date('2026-08-01T00:00:00Z'));

      expect(updateQb.set).toHaveBeenCalledWith({ status: InventoryHoldStatus.EXPIRED });
      expect(res).toBe(3);
    });

    it('affected null/undefined → trả về 0 (không throw)', async () => {
      const updateQb = createMock<UpdateQueryBuilder<InventoryHold>>({
        set: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        execute: jest.fn().mockResolvedValue({ affected: undefined }),
      });
      updateQb.set.mockReturnValue(updateQb);
      updateQb.where.mockReturnValue(updateQb);
      updateQb.andWhere.mockReturnValue(updateQb);
      const qb = createMock<SelectQueryBuilder<InventoryHold>>({ update: jest.fn().mockReturnValue(updateQb) });
      holds.createQueryBuilder.mockReturnValue(qb);

      expect(await sut.expireOverdueHolds()).toBe(0);
    });
  });

  describe('placeHold (over-allocation prevention — mục E)', () => {
    function makeManager(opts: {
      slot: { id: string; totalCapacity: number } | null;
      currentlyHeld: number;
    }): LooseMock<EntityManager> {
      const slotQb = createMock<SelectQueryBuilder<AvailabilitySlot>>({
        setLock: jest.fn(),
        where: jest.fn(),
        getOne: jest.fn().mockResolvedValue(opts.slot),
      });
      slotQb.setLock.mockReturnValue(slotQb);
      slotQb.where.mockReturnValue(slotQb);

      const heldQb = createMock<SelectQueryBuilder<InventoryHold>>({
        select: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        getRawMany: jest.fn().mockResolvedValue([{ held: String(opts.currentlyHeld) }]),
      });
      heldQb.select.mockReturnValue(heldQb);
      heldQb.where.mockReturnValue(heldQb);
      heldQb.andWhere.mockReturnValue(heldQb);

      const holdRepo = createMock<Repository<InventoryHold>>({
        createQueryBuilder: jest.fn().mockReturnValue(heldQb),
        create: jest.fn((v) => v),
        save: jest.fn((v) => Promise.resolve({ ...v, id: 'h1' })),
      });
      const slotRepo = createMock<Repository<AvailabilitySlot>>({
        createQueryBuilder: jest.fn().mockReturnValue(slotQb),
      });

      return createMock<EntityManager>({
        getRepository: jest.fn((entity: unknown) => (entity === AvailabilitySlot ? slotRepo : holdRepo)),
      });
    }

    it('slot không tồn tại → ConflictException, không insert hold', async () => {
      const manager = makeManager({ slot: null, currentlyHeld: 0 });
      await expect(
        sut.placeHold(manager, { availabilitySlotId: 's1', bookingId: 'b1', quantity: 2, expiresAt: new Date() }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('còn đủ dung lượng (currentlyHeld + quantity <= totalCapacity) → tạo hold ACTIVE', async () => {
      const manager = makeManager({ slot: { id: 's1', totalCapacity: 10 }, currentlyHeld: 5 });
      const expiresAt = new Date('2026-08-01T09:00:00Z');

      const hold = await sut.placeHold(manager, {
        availabilitySlotId: 's1',
        bookingId: 'b1',
        quantity: 5,
        expiresAt,
      });

      expect(hold).toMatchObject({
        id: 'h1',
        availabilitySlotId: 's1',
        bookingId: 'b1',
        quantity: 5,
        status: InventoryHoldStatus.ACTIVE,
        expiresAt,
      });
    });

    it('vượt quá dung lượng còn lại (currentlyHeld + quantity > totalCapacity) → ConflictException, KHÔNG insert hold', async () => {
      const manager = makeManager({ slot: { id: 's1', totalCapacity: 10 }, currentlyHeld: 8 });

      await expect(
        sut.placeHold(manager, { availabilitySlotId: 's1', bookingId: 'b1', quantity: 5, expiresAt: new Date() }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('đúng bằng dung lượng còn lại (currentlyHeld + quantity === totalCapacity) → hợp lệ (biên đúng, không sai lệch off-by-one)', async () => {
      const manager = makeManager({ slot: { id: 's1', totalCapacity: 10 }, currentlyHeld: 5 });

      await expect(
        sut.placeHold(manager, { availabilitySlotId: 's1', bookingId: 'b1', quantity: 5, expiresAt: new Date() }),
      ).resolves.toMatchObject({ quantity: 5 });
    });

    it('slot chưa có hold nào (currentlyHeld=0, COALESCE SUM) → hợp lệ với quantity = totalCapacity', async () => {
      const manager = makeManager({ slot: { id: 's1', totalCapacity: 10 }, currentlyHeld: 0 });

      await expect(
        sut.placeHold(manager, { availabilitySlotId: 's1', bookingId: 'b1', quantity: 10, expiresAt: new Date() }),
      ).resolves.toMatchObject({ quantity: 10 });
    });

    it('dùng setLock("pessimistic_write") — khoá dòng slot để chặn race condition đồng thời', async () => {
      const manager = makeManager({ slot: { id: 's1', totalCapacity: 10 }, currentlyHeld: 0 });
      await sut.placeHold(manager, { availabilitySlotId: 's1', bookingId: 'b1', quantity: 1, expiresAt: new Date() });

      const slotRepoCall = (manager.getRepository as jest.Mock).mock.results[0].value;
      const qb = slotRepoCall.createQueryBuilder.mock.results[0].value;
      expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
    });
  });
});
