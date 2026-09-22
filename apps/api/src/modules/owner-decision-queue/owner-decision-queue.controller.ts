import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../authz/guards/jwt-auth.guard';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { OwnerDecisionQueueService } from './owner-decision-queue.service';
import { OdqStatus } from './entities/owner-decision-queue.entity';

// Fixed 2026-09-22 (B4): these three DTOs previously had no class-validator decorators. The
// global ValidationPipe runs with `whitelist:true, forbidNonWhitelisted:true` (main.ts) — with no
// decorated properties, every field on the incoming body was treated as "unknown" and stripped
// before the handler ever saw it. `resolve()`/`withdraw()` then silently received `{}`, masked by
// `dto.resolution ?? {}` / `dto.reason ?? ''` reading as "caller sent nothing" instead of failing
// loudly. `resolution` stays a free-form `Record<string, unknown>` (ResolveItemInput in the
// service, itself just persisted as-is) — `@IsObject()` here means the field is no longer
// stripped, not that its shape is constrained further than the service already allows.
const ODQ_STATUSES: OdqStatus[] = ['pending', 'resolved', 'expired', 'withdrawn'];

class ListDecisionsQueryDto {
  @IsOptional() @IsIn(ODQ_STATUSES)
  status?: OdqStatus;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset?: number;
}

class ResolveDecisionDto {
  @IsObject()
  resolution!: Record<string, unknown>;
}

class WithdrawDecisionDto {
  @IsString() @MinLength(1) @MaxLength(500)
  reason!: string;
}

// Owner Decision Queue API — source-first publish pipeline (2026-09-18).
// GET endpoints: Place.Approve (moderator) — prevents leaking conflict details to unauthed callers.
// POST resolve/withdraw: JWT-only at HTTP layer; service enforces scope:
//   - Place.Approve (global, moderator) — full access
//   - Place.Edit.Managed scoped to item.placeId — business_owner for their own place
@Controller('owner-decisions')
export class OwnerDecisionQueueController {
  constructor(private readonly odqService: OwnerDecisionQueueService) {}

  @RequirePermissions('Place.Approve')
  @Get()
  list(@Query() query: ListDecisionsQueryDto) {
    const limit = Math.min(Number(query.limit) || 50, 200);
    const offset = Number(query.offset) || 0;
    return this.odqService.list(query.status, limit, offset);
  }

  @RequirePermissions('Place.Approve')
  @Get(':id')
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    const item = await this.odqService.getById(id);
    if (!item) throw new NotFoundException(`Decision queue item ${id} not found`);
    return item;
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/resolve')
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDecisionDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.odqService.resolve({ id, resolvedBy: user.sub, resolution: dto.resolution ?? {} });
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/withdraw')
  async withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WithdrawDecisionDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.odqService.withdraw(id, user.sub, dto.reason ?? '');
  }
}
