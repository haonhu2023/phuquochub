import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingRequestDto, ListBookingsQueryDto } from './dto/bookings.dto';

// Booking Request Foundation (create + đọc theo booking_code) + Phase 2 Booking Application Layer
// (query/update trạng thái đặc quyền cho admin/staff). KHÔNG payment/inventory thật ở cả hai.
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // Đặt TRƯỚC ':bookingCode' — cùng lý do PlacesController đặt list()/':id/revisions' trước
  // ':slug': dù ở đây không thực sự mơ hồ (list() 0 segment vs ':bookingCode' 1 segment), giữ
  // đúng thứ tự "danh sách trước chi tiết" cho dễ đọc, khớp quy ước PlacesController.
  @Get()
  @RequirePermissions('Booking.List')
  list(@Query() query: ListBookingsQueryDto) {
    return this.bookingsService.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Booking.Create')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@Body() dto: CreateBookingRequestDto, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.create(dto, user.sub);
  }

  @Get(':bookingCode')
  @RequirePermissions('Booking.View')
  // booking_code có entropy thấp hơn JWT/mật khẩu (~40 bit, xem booking-code.ts) — auth+ownership
  // check là hàng rào chính, throttle là lớp phòng thủ thứ hai chống dò mã từ một tài khoản hợp lệ.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  getByCode(@Param('bookingCode') bookingCode: string, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.getByCodeForUser(bookingCode, user.sub);
  }

  // Phase 2 — chỉ 3 hành động chuyển trạng thái được phép, KHÔNG có PATCH tuỳ ý toàn bộ entity
  // (yêu cầu mục B). `:id` là uuid nội bộ (kênh đặc quyền, khác booking_code công khai ở trên) —
  // cùng khuôn PlacesController (`PATCH/DELETE/:id/approve` dùng id, không dùng slug).
  @Post(':id/confirm')
  @RequirePermissions('Booking.Confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.confirm(id, user.sub);
  }

  @Post(':id/cancel')
  @RequirePermissions('Booking.Cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.cancel(id, user.sub);
  }

  @Post(':id/expire')
  @RequirePermissions('Booking.MarkExpired')
  markExpired(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.markExpired(id, user.sub);
  }
}
