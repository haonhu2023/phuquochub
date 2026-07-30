import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { BookingsController } from './bookings.controller';
import { IS_PUBLIC_KEY } from '../authz/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';

// Controller mỏng (chỉ uỷ quyền) — giá trị kiểm thử nằm ở METADATA của decorator, nơi ranh giới
// bảo mật thực sự được khai báo (cùng khuôn PlacesController spec).
type Handler = keyof BookingsController;

function handlerOf(name: Handler): object {
  return BookingsController.prototype[name] as unknown as object;
}

describe('BookingsController — ranh giới công khai / đặc quyền / rate-limit', () => {
  it.each<Handler>(['create', 'getByCode', 'list', 'confirm', 'cancel', 'markExpired'])(
    'route `%s` KHÔNG @Public() — tất cả đều yêu cầu đăng nhập',
    (name) => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handlerOf(name))).not.toBe(true);
    },
  );

  it('create yêu cầu Booking.Create', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('create'))).toEqual(['Booking.Create']);
  });

  it('getByCode yêu cầu Booking.View', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('getByCode'))).toEqual(['Booking.View']);
  });

  it('list (Phase 2) yêu cầu Booking.List — khác Booking.View (kênh admin/staff, không phải kênh tự-xem-booking-của-mình)', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('list'))).toEqual(['Booking.List']);
  });

  it('confirm yêu cầu Booking.Confirm', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('confirm'))).toEqual(['Booking.Confirm']);
  });

  it('cancel yêu cầu Booking.Cancel', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('cancel'))).toEqual(['Booking.Cancel']);
  });

  it('markExpired yêu cầu Booking.MarkExpired', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('markExpired'))).toEqual(['Booking.MarkExpired']);
  });

  it('create bị throttle (chống spam tạo booking)', () => {
    const target = handlerOf('create');
    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', target)).toBe(10);
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', target)).toBe(60_000);
  });

  it('getByCode bị throttle (chống dò booking_code từ một tài khoản hợp lệ)', () => {
    const target = handlerOf('getByCode');
    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', target)).toBe(30);
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', target)).toBe(60_000);
  });
});
