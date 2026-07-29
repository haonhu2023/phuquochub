import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingRequestDto } from './dto/bookings.dto';

// Booking Request Foundation — chỉ create + đọc theo booking_code (không payment/inventory
// thật). Cả hai endpoint yêu cầu đăng nhập: GET theo code KHÔNG public — chỉ đúng chủ booking
// mới xem được (BookingsService.getByCodeForUser), tránh lộ dữ liệu tài chính/cá nhân qua mã
// đoán được.
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Booking.Create')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@Body() dto: CreateBookingRequestDto, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.create(dto, user.sub);
  }

  @Get(':bookingCode')
  @RequirePermissions('Booking.View')
  getByCode(@Param('bookingCode') bookingCode: string, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.getByCodeForUser(bookingCode, user.sub);
  }
}
