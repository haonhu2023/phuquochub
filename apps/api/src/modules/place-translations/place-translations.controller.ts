import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { TranslationReviewService, PLACE_TRANSLATION_REVIEW_PERMISSION } from './translation-review.service';
import { ReviewPlaceTranslationDto } from './dto/review-place-translation.dto';

// Minimal owner/reviewer surface (human-translation-review, 2026-09-04). Deliberately two routes,
// both admin-only, both gated by the same permission — this is the smallest API needed to close
// the review loop end-to-end, not a general translation-management CMS.
@Controller('admin/place-translations')
export class PlaceTranslationsController {
  constructor(private readonly reviewService: TranslationReviewService) {}

  // GET /admin/place-translations/review-queue[?placeId=...] — every current translation still
  // awaiting a human decision (PENDING or NEEDS_CHANGES). Read-only; never hides evidence fields —
  // the row returned is the full place_translations record, including source_id/evidence_id.
  @Get('review-queue')
  @RequirePermissions(PLACE_TRANSLATION_REVIEW_PERMISSION)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  reviewQueue(@Query('placeId') placeId?: string) {
    return this.reviewService.listPendingReview(placeId);
  }

  // POST /admin/place-translations/:id/review — accepts ONLY {decision, notes} (see
  // ReviewPlaceTranslationDto). Never accepts reviewer_id/reviewed_at/is_public/production_eligible
  // from the client: the real reviewer identity comes from the authenticated principal
  // (CurrentUser), and every derived governance flag is computed inside
  // TranslationReviewService.reviewTranslation() — never trusted from the request body.
  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PLACE_TRANSLATION_REVIEW_PERMISSION)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPlaceTranslationDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.reviewService.reviewTranslation(id, user.sub, dto.decision, dto.notes ?? null);
  }
}
