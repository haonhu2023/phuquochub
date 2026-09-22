import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { GuideArticlesService } from './guide-articles.service';
import { SaveGuideDraftDto } from './dto/save-guide-draft.dto';
import { UpdateGuideDraftDto } from './dto/update-guide-draft.dto';
import { PublishGuideArticleDto } from './dto/publish-guide-article.dto';
import { FlagContentGapDto } from './dto/flag-content-gap.dto';

// Public read — no guard. Only ever resolves a PUBLISHED article (see
// GuideArticlesService.getPublished()'s own comment for why a draft can never leak through here).
// `@Public()` is required, not decorative: `JwtAuthGuard` is a global APP_GUARD
// (auth.module.ts), so without this a guest request 401s before it ever reaches the handler.
@Public()
@Controller('guide-articles')
export class GuideArticlesPublicController {
  constructor(private readonly service: GuideArticlesService) {}

  @Get(':slug')
  async getPublished(@Param('slug') slug: string, @Query('locale') locale: string = 'vi') {
    return this.service.getPublished(slug, locale);
  }
}

// Editorial write path — gated by Guide.Edit.Any (covers create/edit/publish/flag-gap, same
// single-permission-for-the-whole-workflow choice ContactImportModule made this session).
@Controller('admin/guide-articles')
export class GuideArticlesAdminController {
  constructor(private readonly service: GuideArticlesService) {}

  @Get()
  @RequirePermissions('Guide.Edit.Any')
  async listAll() {
    return this.service.listAll();
  }

  @Get(':id')
  @RequirePermissions('Guide.Edit.Any')
  async getDraft(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getDraft(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Guide.Edit.Any')
  async createDraft(@Body() body: SaveGuideDraftDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.createDraft(body, user.sub);
  }

  // PATCH (not PUT): reuses the web app's existing apiPatchAuth helper (Place Content Management
  // MVP precedent) rather than adding a new apiPutAuth just for this one route.
  @Patch(':id')
  @RequirePermissions('Guide.Edit.Any')
  async saveDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateGuideDraftDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.saveDraft(id, body, user.sub);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Guide.Edit.Any')
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PublishGuideArticleDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.publish(id, body.expectedContentVersion, user.sub);
  }

  @Post(':id/flag-gap')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Guide.Edit.Any')
  async flagContentGap(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: FlagContentGapDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.service.flagContentGap(id, body.blockId, body.note, user.sub);
    return { success: true };
  }
}
