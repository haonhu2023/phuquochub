import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { PRINCIPAL_RESOLVER } from '../authz/resolvers/principal.resolver';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { CreateMediaDto, PresignMediaDto } from './dto/media.dto';
import { CreateReportDto } from '../moderation/dto/moderation.dto';

// Media Upload Foundation (design review, 2026-07-30). Backend-only — no frontend upload UI in
// this milestone. See docs/data/modules/media.md.
// /media/{id}/report (M5, WF-12) — Report.Create, throttle 5/phút (moderation-design.md §8.2).
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Media.Upload.Own')
  @AuthorizationContext({
    resourceType: 'media',
    resource: { from: 'principal' },
    resolver: PRINCIPAL_RESOLVER,
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  presign(@Body() dto: PresignMediaDto, @CurrentUser() user: AuthPrincipal) {
    return this.mediaService.presign(dto, user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Media.Upload.Own')
  @AuthorizationContext({
    resourceType: 'media',
    resource: { from: 'principal' },
    resolver: PRINCIPAL_RESOLVER,
  })
  register(@Body() dto: CreateMediaDto, @CurrentUser() user: AuthPrincipal) {
    return this.mediaService.register(dto, user.sub);
  }

  @Post(':id/report')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Report.Create')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async report(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReportDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.mediaService.report(id, dto, user.sub);
    return null;
  }
}
