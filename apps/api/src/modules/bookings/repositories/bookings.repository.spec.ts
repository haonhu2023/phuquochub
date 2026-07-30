import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { BookingsRepository } from './bookings.repository';
import { Booking } from '../entities/booking.entity';
import { BookingItem } from '../entities/booking-item.entity';
import { BookingStatus } from '../booking.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

describe('BookingsRepository', () => {
  let bookings: LooseMock<Repository<Booking>>;
  let ds: LooseMock<DataSource>;
  let sut: BookingsRepository;

  beforeEach(() => {
    bookings = createMock<Repository<Booking>>({
      exists: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      update: jest.fn(),
    });
    ds = createMock<DataSource>({ transaction: jest.fn(), getRepository: jest.fn() });
    sut = new BookingsRepository(bookings, ds);
  });

  afterEach(() => jest.clearAllMocks());

  it('findById: uỷ quyền repo.findOne theo id nội bộ', async () => {
    bookings.findOne.mockResolvedValue({ id: 'b1' });
    const res = await sut.findById('b1');
    expect(bookings.findOne).toHaveBeenCalledWith({ where: { id: 'b1' } });
    expect(res).toEqual({ id: 'b1' });
  });

  it('updateStatus: chỉ update cột bookingStatus, không đụng trường nào khác', async () => {
    await sut.updateStatus('b1', BookingStatus.CONFIRMED);
    expect(bookings.update).toHaveBeenCalledWith({ id: 'b1' }, { bookingStatus: BookingStatus.CONFIRMED });
  });

  describe('list (Phase 2 — Booking.List)', () => {
    function makeQb(): LooseMock<SelectQueryBuilder<Booking>> {
      const qb = createMock<SelectQueryBuilder<Booking>>({
        andWhere: jest.fn(),
        orderBy: jest.fn(),
        addOrderBy: jest.fn(),
        skip: jest.fn(),
        take: jest.fn(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      });
      // chuỗi gọi (builder pattern) — mỗi method trả về chính qb để .andWhere().andWhere()... hoạt động
      qb.andWhere.mockReturnValue(qb);
      qb.orderBy.mockReturnValue(qb);
      qb.addOrderBy.mockReturnValue(qb);
      qb.skip.mockReturnValue(qb);
      qb.take.mockReturnValue(qb);
      return qb;
    }

    it('không truyền filter nào → không gọi andWhere, vẫn phân trang + sắp xếp đúng', async () => {
      const qb = makeQb();
      bookings.createQueryBuilder.mockReturnValue(qb);

      await sut.list({ sortBy: 'created_at', sortDir: 'DESC', limit: 20, offset: 0 });

      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith('b.createdAt', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('b.id', 'DESC'); // tie-breaker ổn định
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('truyền đủ filter → mỗi filter tạo đúng MỘT andWhere tương ứng', async () => {
      const qb = makeQb();
      bookings.createQueryBuilder.mockReturnValue(qb);
      const dateFrom = new Date('2026-08-01T00:00:00Z');
      const dateTo = new Date('2026-08-31T00:00:00Z');

      await sut.list({
        bookingStatus: BookingStatus.PENDING,
        paymentStatus: 'unpaid' as never,
        fulfillmentStatus: 'pending' as never,
        entityType: 'hotel',
        dateFrom,
        dateTo,
        sortBy: 'grand_total',
        sortDir: 'ASC',
        limit: 10,
        offset: 20,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('b.bookingStatus = :bookingStatus', { bookingStatus: 'pending' });
      expect(qb.andWhere).toHaveBeenCalledWith('b.paymentStatus = :paymentStatus', { paymentStatus: 'unpaid' });
      expect(qb.andWhere).toHaveBeenCalledWith('b.fulfillmentStatus = :fulfillmentStatus', {
        fulfillmentStatus: 'pending',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('b.entityType = :entityType', { entityType: 'hotel' });
      expect(qb.andWhere).toHaveBeenCalledWith('b.serviceStartAt >= :dateFrom', { dateFrom });
      expect(qb.andWhere).toHaveBeenCalledWith('b.serviceStartAt <= :dateTo', { dateTo });
      expect(qb.orderBy).toHaveBeenCalledWith('b.grandTotal', 'ASC');
    });

    it('trả về items + total từ getMany()/getCount() (không lẫn lộn thứ tự gọi)', async () => {
      const qb = makeQb();
      qb.getCount.mockResolvedValue(42);
      qb.getMany.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }] as Booking[]);
      bookings.createQueryBuilder.mockReturnValue(qb);

      const res = await sut.list({ sortBy: 'created_at', sortDir: 'DESC', limit: 20, offset: 0 });

      expect(res.total).toBe(42);
      expect(res.items).toHaveLength(2);
    });
  });

  it('existsByCode: uỷ quyền repo.exists theo bookingCode', async () => {
    bookings.exists.mockResolvedValue(true);
    const res = await sut.existsByCode('CODE0001');
    expect(bookings.exists).toHaveBeenCalledWith({ where: { bookingCode: 'CODE0001' } });
    expect(res).toBe(true);
  });

  it('findByCode: uỷ quyền repo.findOne theo bookingCode', async () => {
    bookings.findOne.mockResolvedValue({ id: 'b1' });
    const res = await sut.findByCode('CODE0001');
    expect(bookings.findOne).toHaveBeenCalledWith({ where: { bookingCode: 'CODE0001' } });
    expect(res).toEqual({ id: 'b1' });
  });

  it('findItemsByBookingId: sắp theo createdAt ASC', async () => {
    const itemsRepo = createMock<Repository<BookingItem>>({ find: jest.fn().mockResolvedValue([]) });
    ds.getRepository.mockReturnValue(itemsRepo);

    await sut.findItemsByBookingId('b1');

    expect(itemsRepo.find).toHaveBeenCalledWith({ where: { bookingId: 'b1' }, order: { createdAt: 'ASC' } });
  });

  describe('create', () => {
    function setupTransaction() {
      const bookingRepo = createMock<Repository<Booking>>({
        create: jest.fn((v) => v),
        save: jest.fn((v) => Promise.resolve({ ...v, id: 'b1' })),
      });
      const itemRepo = createMock<Repository<BookingItem>>({
        create: jest.fn((v) => v),
        save: jest.fn((v) => Promise.resolve(v.map((it: object, i: number) => ({ ...it, id: `i${i}` })))),
      });
      const manager = {
        getRepository: jest.fn((entity: unknown) => (entity === Booking ? bookingRepo : itemRepo)),
      };
      ds.transaction.mockImplementation((cb: (m: unknown) => unknown) => cb(manager));
      return { bookingRepo, itemRepo };
    }

    it('tính subtotal/grand_total từ tổng quantity*unitPrice của items, discount/fees = 0', async () => {
      setupTransaction();

      const { booking } = await sut.create({
        bookingCode: 'CODE0001',
        bookingType: null,
        entityType: 'tour',
        entityId: 'e1',
        placeId: 'p1',
        customerUserId: 'u1',
        serviceStartAt: null,
        serviceEndAt: null,
        partySize: 2,
        guestNote: null,
        items: [
          { label: 'Vé người lớn', quantity: 2, unitPrice: 500000 },
          { label: 'Vé trẻ em', quantity: 1, unitPrice: 250000 },
        ],
      });

      expect(booking.subtotal).toBe('1250000.00');
      expect(booking.discount).toBe('0');
      expect(booking.fees).toBe('0');
      expect(booking.grandTotal).toBe('1250000.00');
    });

    it('lưu đúng số item với subtotal từng dòng', async () => {
      setupTransaction();

      const { items } = await sut.create({
        bookingCode: 'CODE0001',
        bookingType: null,
        entityType: 'tour',
        entityId: 'e1',
        placeId: 'p1',
        customerUserId: 'u1',
        serviceStartAt: null,
        serviceEndAt: null,
        partySize: 2,
        guestNote: null,
        items: [{ label: 'Vé người lớn', quantity: 2, unitPrice: 500000 }],
      });

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ label: 'Vé người lớn', quantity: 2, subtotal: '1000000.00' });
    });

    it('booking.id được gán đúng cho MỌI item (đúng quan hệ Booking–BookingItems, không lẫn booking khác)', async () => {
      setupTransaction();

      const { booking, items } = await sut.create({
        bookingCode: 'CODE0001',
        bookingType: null,
        entityType: 'tour',
        entityId: 'e1',
        placeId: 'p1',
        customerUserId: 'u1',
        serviceStartAt: null,
        serviceEndAt: null,
        partySize: 2,
        guestNote: null,
        items: [
          { label: 'Vé người lớn', quantity: 2, unitPrice: 500000 },
          { label: 'Vé trẻ em', quantity: 1, unitPrice: 250000 },
        ],
      });

      for (const item of items) {
        expect(item.bookingId).toBe(booking.id);
      }
    });

    it('lưu item thất bại (vd vi phạm CHECK quantity>0 ở DB thật) → toàn bộ operation reject, không trả về booking đã "thành công" một phần', async () => {
      const bookingRepo = createMock<Repository<Booking>>({
        create: jest.fn((v) => v),
        save: jest.fn((v) => Promise.resolve({ ...v, id: 'b1' })),
      });
      const dbError = new Error('violates check constraint "chk_booking_items_quantity"');
      const itemRepo = createMock<Repository<BookingItem>>({
        create: jest.fn((v) => v),
        save: jest.fn().mockRejectedValue(dbError),
      });
      const manager = {
        getRepository: jest.fn((entity: unknown) => (entity === Booking ? bookingRepo : itemRepo)),
      };
      // ds.transaction thật của TypeORM tự ROLLBACK và rethrow khi callback reject — mock tái hiện
      // đúng hành vi "rethrow", KHÔNG tự bắt lỗi ở đây, để chứng minh BookingsRepository.create
      // không nuốt lỗi transaction.
      ds.transaction.mockImplementation((cb: (m: unknown) => unknown) => cb(manager));

      await expect(
        sut.create({
          bookingCode: 'CODE0001',
          bookingType: null,
          entityType: 'tour',
          entityId: 'e1',
          placeId: 'p1',
          customerUserId: 'u1',
          serviceStartAt: null,
          serviceEndAt: null,
          partySize: 2,
          guestNote: null,
          items: [{ label: 'Vé lỗi', quantity: 1, unitPrice: 1000 }],
        }),
      ).rejects.toBe(dbError);
    });
  });
});
