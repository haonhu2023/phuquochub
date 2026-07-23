import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { SourcesService } from './sources.service';
import { CreateAttributionDto, CreateSourceDto, ListAttributionsQueryDto } from './dto/sources.dto';

// Provenance subsystem (source.md). GET = @Public() (badge nguồn hiển thị công khai,
// đúng nguyên tắc "minh bạch" §1). Ghi (tạo nguồn/attribution) cần Source.Create;
// xác nhận (verified_by) cần Source.Verify — api.md-style, chưa có mục riêng (bổ sung
// khi tài liệu API cập nhật — Module 10 Phase 7).
@Controller()
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Post('sources')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Source.Create')
  createSource(@Body() dto: CreateSourceDto, @CurrentUser() user: AuthPrincipal) {
    return this.sourcesService.createSource(dto, user.sub);
  }

  @Public()
  @Get('sources/:id')
  getSource(@Param('id', ParseUUIDPipe) id: string) {
    return this.sourcesService.getSource(id);
  }

  @Post('attributions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Source.Create')
  attachAttribution(@Body() dto: CreateAttributionDto, @CurrentUser() user: AuthPrincipal) {
    return this.sourcesService.attachAttribution(dto, user.sub);
  }

  @Public()
  @Get('attributions')
  listAttributions(@Query() query: ListAttributionsQueryDto) {
    return this.sourcesService.listAttributionsFor(query.entity_type, query.entity_id, query.field);
  }

  @Patch('attributions/:id/verify')
  @RequirePermissions('Source.Verify')
  verifyAttribution(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.sourcesService.verifyAttribution(id, user.sub);
  }
}
