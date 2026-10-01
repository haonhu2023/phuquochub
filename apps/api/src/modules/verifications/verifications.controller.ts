import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { AuthorizationService } from '../authz/authorization.service';
import { VerificationsService } from './verifications.service';
import { VerificationTargetType } from './verification.enums';
import {
  SubmitVerificationDto,
  ListVerificationsQueryDto,
  ClaimVerificationDto,
  VerifyDecisionDto,
  OfficialDecisionDto,
  RejectDecisionDto,
  CastVoteDto,
} from './dto/verification.dto';

// ADR-008 Verification Foundation. `Verification.Verify`/`Verification.Reject`/`Verification.Vote`
// KHÔNG có hậu tố scope (global — moderator-only cho Verify/Reject, local_guide+DAG cho Vote,
// Owner Decision 2026-08-06) — KHÔNG cần `@AuthorizationContext` ở BẤT KỲ route nào tại đây, đi
// đường context-free của PDP (ADR-019 D2 bước 3), giống hệt `Business.Claim`/`Verification.Verify`
// đã seed từ SeedRbac. `business_owner` KHÔNG giữ permission nào ở controller này.
//
// Price verification ownership (2026-10-01, P0 permission audit, SeedPriceVerifyPermission). Chỉ
// `submit()`/`verify()` chấp nhận THÊM `Price.Verify` — CHỈ khi target là price_history — như một
// lối thoát bên cạnh `Verification.Verify` (`@RequirePermissions` tĩnh không diễn đạt được "HOẶC
// permission khác tuỳ entity", nên hai route này bỏ decorator, tự gọi `AuthorizationService` sau
// khi biết đúng target_type). Place/contact và /official/reject/votes/list/claim/events GIỮ
// NGUYÊN moderator-only, không đổi gì — không âm thầm mở rộng ra ngoài giá.
@Controller('verifications')
export class VerificationsController {
  constructor(
    private readonly service: VerificationsService,
    private readonly authz: AuthorizationService,
  ) {}

  private async assertCanVerify(userId: string, isPriceTarget: boolean): Promise<void> {
    if (await this.authz.can(userId, 'Verification.Verify')) return;
    if (isPriceTarget && (await this.authz.can(userId, 'Price.Verify'))) return;
    throw new ForbiddenException('Thiếu quyền: Verification.Verify');
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async submit(@Body() dto: SubmitVerificationDto, @CurrentUser() user: AuthPrincipal) {
    await this.assertCanVerify(user.sub, dto.target_type === VerificationTargetType.PRICE_HISTORY);
    return this.service.submit(dto, user.sub);
  }

  @Get()
  @RequirePermissions('Verification.Verify')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  list(@Query() query: ListVerificationsQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions('Verification.Verify')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(id);
  }

  @Get(':id/events')
  @RequirePermissions('Verification.Verify')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  listEvents(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listEvents(id);
  }

  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Verification.Verify')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  claim(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClaimVerificationDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.claim(id, dto, user.sub);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyDecisionDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    // Gọi thẳng service (không qua HTTP) chỉ để biết target_type của dòng ĐÃ TỒN TẠI này trước khi
    // định đoạt permission nào áp dụng — getById() không tự ý lộ gì thêm so với route GET cùng tên.
    const current = await this.service.getById(id);
    await this.assertCanVerify(user.sub, current.price_history_id !== null);
    return this.service.verify(id, dto, user.sub);
  }

  @Post(':id/official')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Verification.Verify')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  official(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OfficialDecisionDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.official(id, dto, user.sub);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Verification.Reject')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDecisionDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.reject(id, dto, user.sub);
  }

  @Post(':id/votes')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Verification.Vote')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  vote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CastVoteDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.vote(id, dto, user.sub);
  }
}
