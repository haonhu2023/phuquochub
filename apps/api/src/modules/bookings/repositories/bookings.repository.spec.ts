import { DataSource, Repository } from 'typeorm';
import { BookingsRepository } from './bookings.repository';
import { Booking } from '../entities/booking.entity';
import { BookingItem } from '../entities/booking-item.entity';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

describe('BookingsRepository', () => {
  let bookings: LooseMock<Repository<Booking>>;
  let ds: LooseMock<DataSource>;
  let sut: BookingsRepository;

  beforeEach(() => {
    bookings = createMock<Repository<Booking>>({ exists: jest.fn(), findOne: jest.fn() });
    ds = createMock<DataSource>({ transaction: jest.fn(), getRepository: jest.fn() });
    sut = new BookingsRepository(bookings, ds);
  });

  afterEach(() => jest.clearAllMocks());

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
