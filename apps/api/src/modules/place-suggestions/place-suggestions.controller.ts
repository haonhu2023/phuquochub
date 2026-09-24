import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { PlaceSuggestionsService } from './place-suggestions.service';
import { CreateSuggestionDto, ResolveSuggestionDto } from './dto/place-suggestions.dto';
import { PlaceSuggestionStatus } from './entities/place-edit-suggestion.entity';

const SUGGESTION_STATUSES: PlaceSuggestionStatus[] = ['pending', 'applied', 'rejected'];

class ListSuggestionsQueryDto {
  @IsOptional() @IsIn(SUGGESTION_STATUSES)
  status?: PlaceSuggestionStatus;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  offset?: number;
}

// "Báo thông tin sai / Đề xuất chỉnh sửa" — bản tối thiểu (2026-09-24, Ưu tiên 3).
// POST /places/:id/suggestions   — Report.Create (member — mọi tài khoản đã đăng nhập), throttle
//   5/phút (cùng chính sách /reviews/:id/report).
// GET  /places/:id/suggestions   — JWT-only tại tầng HTTP; service khoanh vùng theo place
//   (Place.Approve HOẶC Place.Edit.Managed cho ĐÚNG place đó).
// GET  /suggestions?status=pending — Place.Approve toàn cục (worklist gộp, dùng ở "Việc cần làm").
// POST /suggestions/:id/resolve  — JWT-only; service khoanh vùng giống GET theo place.
@Controller()
export class PlaceSuggestionsController {
  constructor(private readonly service: PlaceSuggestionsService) {}

  @Post('places/:id/suggestions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Report.Create')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSuggestionDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.create(
      {
        placeId: id,
        field: dto.field,
        proposedValue: dto.proposed_value,
        sourceUrl: dto.source_url,
        sourceNote: dto.source_note,
      },
      user.sub,
    );
  }

  @Get('places/:id/suggestions')
  listForPlace(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListSuggestionsQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.listForPlace(id, user.sub, query.status);
  }

  @Get('suggestions')
  @RequirePermissions('Place.Approve')
  listPending(@Query() query: ListSuggestionsQueryDto) {
    const limit = Math.min(Number(query.limit) || 50, 200);
    const offset = Number(query.offset) || 0;
    return this.service.listPending(limit, offset);
  }

  @Post('suggestions/:id/resolve')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveSuggestionDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.resolve({ id, reviewedBy: user.sub, action: dto.action, note: dto.note });
  }
}
