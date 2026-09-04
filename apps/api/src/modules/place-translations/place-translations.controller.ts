import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { TranslationReviewService, PLACE_TRANSLATION_REVIEW_PERMISSION } from './translation-review.service';
import { ReviewPlaceTranslationDto } from './dto/review-place-translation.dto';
import { ReviewQueueQueryDto } from './dto/review-queue-query.dto';

// Minimal owner/reviewer surface (human-translation-review, 2026-09-04). Deliberately two routes,
// both admin-only, both gated by the same permission — this is the smallest API needed to close
// the review loop end-to-end, not a general translation-management CMS.
@Controller('admin/place-translations')
export class PlaceTranslationsController {
  constructor(private readonly reviewService: TranslationReviewService) {}

  // GET /admin/place-translations/review-queue[?placeId=&placeSlug=&localeCode=&fieldKey=&limit=] —
  // one enriched row per translation still awaiting a human decision (PENDING or NEEDS_CHANGES):
  // place name/slug, the currently-live text for the same slot (for comparison), and source
  // url/title — see ReviewQueueRow. Read-only; never hides source/evidence fields.
  @Get('review-queue')
  @RequirePermissions(PLACE_TRANSLATION_REVIEW_PERMISSION)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  reviewQueue(@Query() query: ReviewQueueQueryDto) {
    return this.reviewService.listReviewQueue({
      placeId: query.placeId,
      placeSlug: query.placeSlug,
      localeCode: query.localeCode,
      fieldKey: query.fieldKey,
      humanReviewStatus: query.humanReviewStatus,
      limit: query.limit,
    });
  }

  // POST /admin/place-translations/:id/review — accepts ONLY {decision, notes} (see
  // ReviewPlaceTranslationDto). Never accepts reviewer_id/reviewed_at/is_public/production_eligible
  // from the client: the real reviewer identity comes from the authenticated principal
  // (CurrentUser), and every derived governance flag is computed inside
  // TranslationReviewService.reviewTranslation() — never trusted from the request body. Can return
  // 409 (ConflictException) when the translation was edited or already reviewed since the client
  // loaded the queue — see that method's own comment on the concurrency guarantee.
  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PLACE_TRANSLATION_REVIEW_PERMISSION)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPlaceTranslationDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<null> {
    // Same contract as POST /moderation/cases/{id}/decide: EmptySuccess (data: null). The client
    // never trusts an optimistic response — it re-fetches the queue after a 200, which reflects the
    // committed state, not whatever this call happened to return.
    await this.reviewService.reviewTranslation(id, user.sub, dto.decision, dto.notes ?? null);
    return null;
  }
}
