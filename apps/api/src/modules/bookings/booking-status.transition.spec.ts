import { UnprocessableEntityException } from '@nestjs/common';
import { assertValidTransition } from './booking-status.transition';
import { BookingStatus } from './booking.enums';

describe('assertValidTransition', () => {
  it.each([
    ['confirm', BookingStatus.PENDING, BookingStatus.CONFIRMED],
    ['cancel', BookingStatus.PENDING, BookingStatus.CANCELLED],
    ['cancel', BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
    ['markExpired', BookingStatus.PENDING, BookingStatus.EXPIRED],
  ] as const)('%s từ %s -> trả về %s (hợp lệ)', (action, from, to) => {
    expect(assertValidTransition(from, action)).toBe(to);
  });

  it.each([
    ['confirm', BookingStatus.CONFIRMED],
    ['confirm', BookingStatus.CANCELLED],
    ['confirm', BookingStatus.EXPIRED],
    ['cancel', BookingStatus.CANCELLED],
    ['cancel', BookingStatus.EXPIRED],
    ['markExpired', BookingStatus.CONFIRMED],
    ['markExpired', BookingStatus.CANCELLED],
    ['markExpired', BookingStatus.EXPIRED],
  ] as const)('%s từ %s -> KHÔNG hợp lệ, ném UnprocessableEntityException', (action, from) => {
    expect(() => assertValidTransition(from, action)).toThrow(UnprocessableEntityException);
  });

  it('markExpired trên booking đã confirmed: thông báo phải nêu rõ trạng thái hiện tại (không phải thông báo chung chung)', () => {
    try {
      assertValidTransition(BookingStatus.CONFIRMED, 'markExpired');
      fail('phải ném lỗi');
    } catch (err) {
      expect((err as Error).message).toContain('đã confirmed');
    }
  });
});
