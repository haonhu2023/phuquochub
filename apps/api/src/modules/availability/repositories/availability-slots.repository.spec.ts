import { Repository, SelectQueryBuilder } from 'typeorm';
import { AvailabilitySlotsRepository } from './availability-slots.repository';
import { AvailabilitySlot } from '../entities/availability-slot.entity';
import { InventoryHold } from '../entities/inventory-hold.entity';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

describe('AvailabilitySlotsRepository', () => {
  let slots: LooseMock<Repository<AvailabilitySlot>>;
  let holds: LooseMock<Repository<InventoryHold>>;
  let sut: AvailabilitySlotsRepository;

  function makeSlotQb(): LooseMock<SelectQueryBuilder<AvailabilitySlot>> {
    const qb = createMock<SelectQueryBuilder<AvailabilitySlot>>({
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      skip: jest.fn(),
      take: jest.fn(),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
    });
    qb.andWhere.mockReturnValue(qb);
    qb.orderBy.mockReturnValue(qb);
    qb.addOrderBy.mockReturnValue(qb);
    qb.skip.mockReturnValue(qb);
    qb.take.mockReturnValue(qb);
    return qb;
  }

  beforeEach(() => {
    slots = createMock<Repository<AvailabilitySlot>>({
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve({ ...v, id: 's1' })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    });
    holds = createMock<Repository<InventoryHold>>({ createQueryBuilder: jest.fn() });
    sut = new AvailabilitySlotsRepository(slots, holds);
  });

  afterEach(() => jest.clearAllMocks());

  it('create: lưu slot với đúng field đã cho', async () => {
    const res = await sut.create({
      entityType: 'tour',
      entityId: 'e1',
      placeId: 'p1',
      slotStart: new Date('2026-08-01T08:00:00Z'),
      slotEnd: null,
      totalCapacity: 20,
    });
    expect(res).toMatchObject({ id: 's1', entityType: 'tour', totalCapacity: 20 });
  });

  it('findById: uỷ quyền repo.findOne', async () => {
    slots.findOne.mockResolvedValue({ id: 's1' });
    const res = await sut.findById('s1');
    expect(slots.findOne).toHaveBeenCalledWith({ where: { id: 's1' } });
    expect(res).toEqual({ id: 's1' });
  });

  describe('list', () => {
    it('không có slot nào → trả về mảng rỗng, KHÔNG gọi truy vấn held_quantity (tránh IN () rỗng)', async () => {
      const qb = makeSlotQb();
      slots.createQueryBuilder.mockReturnValue(qb);

      const res = await sut.list({ sortBy: 'slot_start', sortDir: 'ASC', limit: 20, offset: 0 });

      expect(res).toEqual({ items: [], total: 0 });
      expect(holds.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('trả về held_quantity đúng cho từng slot (một truy vấn tổng hợp, không N+1)', async () => {
      const qb = makeSlotQb();
      qb.getCount.mockResolvedValue(2);
      qb.getMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }] as AvailabilitySlot[]);
      slots.createQueryBuilder.mockReturnValue(qb);

      const heldQb = createMock<SelectQueryBuilder<InventoryHold>>({
        select: jest.fn(),
        addSelect: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        groupBy: jest.fn(),
        getRawMany: jest.fn().mockResolvedValue([
          { availability_slot_id: 's1', held: '3' },
          { availability_slot_id: 's2', held: '0' },
        ]),
      });
      heldQb.select.mockReturnValue(heldQb);
      heldQb.addSelect.mockReturnValue(heldQb);
      heldQb.where.mockReturnValue(heldQb);
      heldQb.andWhere.mockReturnValue(heldQb);
      heldQb.groupBy.mockReturnValue(heldQb);
      holds.createQueryBuilder.mockReturnValue(heldQb);

      const res = await sut.list({ sortBy: 'slot_start', sortDir: 'ASC', limit: 20, offset: 0 });

      expect(res.total).toBe(2);
      expect(res.items).toEqual([
        { slot: { id: 's1' }, heldQuantity: 3 },
        { slot: { id: 's2' }, heldQuantity: 0 },
      ]);
    });

    it('slot không có hold nào (không có trong kết quả GROUP BY) → heldQuantity mặc định 0', async () => {
      const qb = makeSlotQb();
      qb.getMany.mockResolvedValue([{ id: 's1' }] as AvailabilitySlot[]);
      slots.createQueryBuilder.mockReturnValue(qb);

      const heldQb = createMock<SelectQueryBuilder<InventoryHold>>({
        select: jest.fn(),
        addSelect: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        groupBy: jest.fn(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      heldQb.select.mockReturnValue(heldQb);
      heldQb.addSelect.mockReturnValue(heldQb);
      heldQb.where.mockReturnValue(heldQb);
      heldQb.andWhere.mockReturnValue(heldQb);
      heldQb.groupBy.mockReturnValue(heldQb);
      holds.createQueryBuilder.mockReturnValue(heldQb);

      const res = await sut.list({ sortBy: 'slot_start', sortDir: 'ASC', limit: 20, offset: 0 });

      expect(res.items).toEqual([{ slot: { id: 's1' }, heldQuantity: 0 }]);
    });
  });
});
