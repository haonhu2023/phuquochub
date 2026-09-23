import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { SiteContentService } from './site-content.service';
import { UpsertSiteContentDto } from './dto/upsert-site-content.dto';

// S1 (2026-09-22) — public read, no guard. `JwtAuthGuard` is a global APP_GUARD (see B1's fix on
// GuideArticlesPublicController for the exact failure mode of forgetting `@Public()` here: a guest
// request would 401 before ever reaching the handler).
@Public()
@Controller('site-content')
export class SiteContentPublicController {
  constructor(private readonly service: SiteContentService) {}

  @Get('home')
  async getHomeContent(@Query('locale') locale: string = 'vi') {
    return this.service.getHomeContent(locale);
  }
}

// Editorial write path — gated by SiteContent.Edit (granted only to `content_owner`, see
// SiteContentSchema1720006400000).
@Controller('admin/site-content')
export class SiteContentAdminController {
  constructor(private readonly service: SiteContentService) {}

  @Get()
  @RequirePermissions('SiteContent.Edit')
  async listAll() {
    return this.service.listAll();
  }

  // PUT (not PATCH): the whole `value` blob is always replaced wholesale — there is no partial-field
  // merge semantics for any of the four keys, unlike guide-articles' PATCH which merges into an
  // existing article's scalar fields alongside its block list. No `:key` route param — `key` lives
  // in the body (UpsertSiteContentDto) alongside `locale`, so there is exactly one source of truth
  // for which row is being written, not a URL segment that could disagree with the body.
  @Put()
  @RequirePermissions('SiteContent.Edit')
  async upsert(@Body() body: UpsertSiteContentDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.upsert(body.key, body.locale, body.value, body.expectedContentVersion, user.sub);
  }
}
