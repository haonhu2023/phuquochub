import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingRequestDto, ListBookingsQueryDto } from './dto/bookings.dto';
import { BOOKING_AUTHZ_RESOLVER } from './resolvers/booking-authz.resolver';

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

  // Giai đoạn 3 — ĐẶT TRƯỚC ':bookingCode' (một segment, cùng rủi ro "literal vs param" mà
  // comment ở list() đã nêu): nếu đặt sau, 'mine' sẽ bị :bookingCode nuốt mất, gọi nhầm
  // getByCodeForUser('mine', ...) thay vì route này. KHÔNG @RequirePermissions (cùng khuôn
  // PlacesController.listMine): nội dung trả về đã TỰ lọc theo đúng userId của người gọi
  // (BookingsService.listMine tự suy + re-confirm từng cơ sở qua PDP thật), không có MỘT tài
  // nguyên chung nào để đặt permission tĩnh/@AuthorizationContext lên — chỉ cần đã đăng nhập
  // (JwtAuthGuard chặn trước); permissions.guard.ts's nhánh "không khai permission → chỉ cần xác
  // thực" áp dụng ở đây.
  @Get('mine')
  listMine(@Query() query: ListBookingsQueryDto, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.listMine(user.sub, query);
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
  // Giai đoạn 3 — hậu tố .Managed (thay vì .Confirm/.Cancel trơn): grant unscoped của moderator
  // (rank "any") vẫn thoả yêu cầu này qua grantSatisfies (ADR-019 D6, SCOPE_RANK any ≥ managed) —
  // KHÔNG cần đổi migration cũ của moderator. Mới mở thêm: business_manager/business_owner giữ
  // grant CÓ hậu tố .Managed (AddBookingManagedPermissions) + context đúng cơ sở của chính
  // booking này (BookingAuthzResolver, vì :id là id của booking, KHÔNG phải id của place).
  @Post(':id/confirm')
  @RequirePermissions('Booking.Confirm.Managed')
  @AuthorizationContext({
    resourceType: 'booking',
    resource: { from: 'param', name: 'id' },
    resolver: BOOKING_AUTHZ_RESOLVER,
  })
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.confirm(id, user.sub);
  }

  @Post(':id/cancel')
  @RequirePermissions('Booking.Cancel.Managed')
  @AuthorizationContext({
    resourceType: 'booking',
    resource: { from: 'param', name: 'id' },
    resolver: BOOKING_AUTHZ_RESOLVER,
  })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.cancel(id, user.sub);
  }

  @Post(':id/expire')
  @RequirePermissions('Booking.MarkExpired')
  markExpired(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.bookingsService.markExpired(id, user.sub);
  }
}
