import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/reviews.dto';

// openapi.yaml /places/{id}/reviews. Đọc công khai (chỉ published); ghi cần Review.Create.
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get('places/:id/reviews')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewsService.listByPlace(id);
  }

  @Post('places/:id/reviews')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Review.Create')
  async create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.reviewsService.create(id, dto, user.sub);
    return null;
  }
}
