import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { BusinessClaimsService } from './business-claims.service';
import { DecideBusinessClaimDto, ListBusinessClaimsQueryDto, SubmitBusinessClaimDto } from './dto/business.dto';

// ADR-015 Claim Decision Workflow (WF-05). `Business.Claim`/`Business.Verify` KHÔNG có hậu tố
// scope (Any-tương đương) — KHÔNG cần `@AuthorizationContext` ở bất kỳ route nào tại đây, đi
// đường context-free của PDP (ADR-019 D2 bước 3), giống hệt `Place.Create`. `decide`/`withdraw`
// khoá dòng claim + kiểm tra actor NGAY TRONG service (self-verification, requester-only) — không
// diễn đạt được bằng permission tĩnh.
@Controller('business-claims')
export class BusinessClaimsController {
  constructor(private readonly service: BusinessClaimsService) {}

  @Post()
  @RequirePermissions('Business.Claim')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  submit(@Body() dto: SubmitBusinessClaimDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.submit(dto, user.sub);
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Business.Claim')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  withdraw(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.withdraw(id, user.sub);
  }

  @Get()
  @RequirePermissions('Business.Verify')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  list(@Query() query: ListBusinessClaimsQueryDto) {
    return this.service.list(query);
  }

  // Claim của CHÍNH requester đang gọi. KHÔNG @RequirePermissions — self-scope enforce ở
  // service/repository (lọc requesterId từ JWT), cùng tiền lệ 'places/mine' (PlacesController).
  // PHẢI đặt TRƯỚC ':id' — nếu không, ':id' (ParseUUIDPipe) sẽ nuốt '/business-claims/mine' trước
  // (khớp như thể 'mine' là một UUID, ném 400 thay vì tới đúng route này).
  @Get('mine')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  listMine(@CurrentUser() user: AuthPrincipal) {
    return this.service.listMine(user.sub);
  }

  @Get(':id')
  @RequirePermissions('Business.Verify')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(id);
  }

  @Post(':id/decide')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Business.Verify')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideBusinessClaimDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.decide(id, dto, user.sub);
  }
}
