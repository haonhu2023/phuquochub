import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { PlaceEditProposalsService } from './place-edit-proposals.service';
import {
  CreatePlaceEditProposalDto,
  DecidePlaceEditProposalDto,
  ListPlaceEditProposalsQueryDto,
} from './dto/place-edit-proposal.dto';

// Cùng khuôn ReviewsController: một controller không prefix cố định, khai route đầy đủ theo từng
// method — `places/:id/edit-proposals` (gửi, mở cho `member`) và `place-edit-proposals/...` (hàng
// đợi + quyết định, chỉ `moderator`). KHÔNG có route đọc công khai nào ở đây (task requirement:
// "không lộ ... nội dung chưa duyệt công khai") — PlacesController/getBySlug() không đổi gì.
@Controller()
export class PlaceEditProposalsController {
  constructor(private readonly proposalsService: PlaceEditProposalsService) {}

  @Post('places/:id/edit-proposals')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('PlaceEditProposal.Create')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePlaceEditProposalDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.proposalsService.submit(id, dto, user.sub);
  }

  @Get('place-edit-proposals')
  @RequirePermissions('PlaceEditProposal.Moderate')
  list(@Query() query: ListPlaceEditProposalsQueryDto) {
    return this.proposalsService.list({ status: query.status, placeId: query.place_id });
  }

  @Get('place-edit-proposals/:id')
  @RequirePermissions('PlaceEditProposal.Moderate')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.proposalsService.getById(id);
  }

  @Post('place-edit-proposals/:id/decide')
  @RequirePermissions('PlaceEditProposal.Moderate')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecidePlaceEditProposalDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.proposalsService.decide(id, dto, user.sub);
  }
}
