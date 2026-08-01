import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { CreateMediaDto, PresignMediaDto } from './dto/media.dto';

// Media Upload Foundation (design review, 2026-07-30). Backend-only — no frontend upload UI in
// this milestone. See docs/data/modules/media.md.
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Media.Upload.Own')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  presign(@Body() dto: PresignMediaDto, @CurrentUser() user: AuthPrincipal) {
    return this.mediaService.presign(dto, user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Media.Upload.Own')
  register(@Body() dto: CreateMediaDto, @CurrentUser() user: AuthPrincipal) {
    return this.mediaService.register(dto, user.sub);
  }
}
