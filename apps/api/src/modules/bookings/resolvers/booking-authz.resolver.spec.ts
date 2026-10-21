import { BookingAuthzResolver } from './booking-authz.resolver';
import { BookingsRepository } from '../repositories/bookings.repository';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

describe('BookingAuthzResolver (ADR-019 D5/D16, Giai đoạn 3)', () => {
  let bookingsRepo: LooseMock<BookingsRepository>;
  let resolver: BookingAuthzResolver;

  beforeEach(() => {
    bookingsRepo = createMock<BookingsRepository>({ findById: jest.fn() });
    resolver = new BookingAuthzResolver(bookingsRepo);
  });

  it('booking tồn tại -> context với businessId = place_id của booking, ownerId null', async () => {
    bookingsRepo.findById.mockResolvedValue({ id: 'booking-1', placeId: 'place-A' } as never);

    const ctx = await resolver.resolve({ resourceId: 'booking-1', resourceType: 'booking', userId: 'u1' });

    expect(bookingsRepo.findById).toHaveBeenCalledWith('booking-1');
    expect(ctx).toEqual({
      resourceType: 'booking',
      resourceId: 'booking-1',
      businessId: 'place-A',
      ownerId: null,
    });
  });

  it('booking không tồn tại -> null (INV-A4, guard DENY)', async () => {
    bookingsRepo.findById.mockResolvedValue(null);

    const ctx = await resolver.resolve({ resourceId: 'missing', resourceType: 'booking', userId: 'u1' });

    expect(ctx).toBeNull();
  });

  it('không có side effect: chỉ gọi findById, không gọi create/updateStatus nào', async () => {
    bookingsRepo.findById.mockResolvedValue({ id: 'b1', placeId: 'p1' } as never);

    await resolver.resolve({ resourceId: 'b1', resourceType: 'booking', userId: 'u1' });

    expect(bookingsRepo.findById).toHaveBeenCalledTimes(1);
  });
});
