import { toBooking, toBookingItem } from './bookings.mapper';
import { Booking } from './entities/booking.entity';
import { BookingItem } from './entities/booking-item.entity';
import { BookingStatus, BookingPaymentStatus, BookingFulfillmentStatus } from './booking.enums';

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1',
    bookingCode: 'ABC12345',
    bookingType: null,
    entityType: 'tour',
    entityId: 'e1',
    placeId: 'p1',
    customerUserId: 'u1',
    currencyCode: 'VND',
    bookingStatus: BookingStatus.PENDING,
    paymentStatus: BookingPaymentStatus.UNPAID,
    fulfillmentStatus: BookingFulfillmentStatus.PENDING,
    serviceStartAt: null,
    serviceEndAt: null,
    partySize: 2,
    subtotal: '1000000.00',
    discount: '0.00',
    fees: '0.00',
    grandTotal: '1000000.00',
    guestNote: null,
    internalNote: 'ghi chú nội bộ không được lộ',
    createdAt: new Date('2026-07-29T00:00:00Z'),
    updatedAt: new Date('2026-07-29T00:00:00Z'),
    ...overrides,
  } as Booking;
}

function makeItem(overrides: Partial<BookingItem> = {}): BookingItem {
  return {
    id: 'i1',
    bookingId: 'b1',
    label: 'Vé người lớn',
    quantity: 2,
    unitPrice: '500000.00',
    subtotal: '1000000.00',
    createdAt: new Date('2026-07-29T00:00:00Z'),
    ...overrides,
  } as BookingItem;
}

describe('toBookingItem', () => {
  it('chuyển decimal string sang number', () => {
    expect(toBookingItem(makeItem())).toEqual({
      id: 'i1',
      label: 'Vé người lớn',
      quantity: 2,
      unit_price: 500000,
      subtotal: 1000000,
    });
  });
});

describe('toBooking', () => {
  it('ánh xạ đầy đủ, KHÔNG lộ id nội bộ/internal_note/customer_user_id', () => {
    const res = toBooking(makeBooking(), [makeItem()]);
    expect(res).toMatchObject({
      booking_code: 'ABC12345',
      entity_type: 'tour',
      place_id: 'p1',
      currency_code: 'VND',
      booking_status: 'pending',
      payment_status: 'unpaid',
      fulfillment_status: 'pending',
      subtotal: 1000000,
      grand_total: 1000000,
      party_size: 2,
    });
    expect(res).not.toHaveProperty('id');
    expect(res).not.toHaveProperty('internal_note');
    expect(res).not.toHaveProperty('customer_user_id');
    expect(res.items).toHaveLength(1);
  });
});
