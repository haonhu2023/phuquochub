import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { JobListingTranslationsService } from './job-listing-translations.service';
import { DecideJobListingTranslationDto, UpsertJobListingTranslationDto } from './dto/job-listing-translations.dto';

// Lồng dưới `/job-listings/:id/translations/en` (khác place-translations' `/admin/place-
// translations` riêng biệt — ở đây MỖI tin có ĐÚNG MỘT bản dịch, nên "của tin nào" là một phần tự
// nhiên của route, không cần một mặt CRUD theo id bản dịch riêng). `pending` khai TRƯỚC `:id`
// không áp dụng ở đây vì không có route `:id` trần nào trong controller này (mọi route đều có hậu
// tố `/translations/en...`) — không cần tránh ParseUUIDPipe nuốt nhầm như JobListingsController.
@Controller('job-listings')
export class JobListingTranslationsController {
  constructor(private readonly service: JobListingTranslationsService) {}

  @Get('translations/en/pending')
  @RequirePermissions('JobListing.Moderate')
  listPending() {
    return this.service.listPending();
  }

  @Get(':id/translations/en')
  getMine(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.getMine(id, user.sub);
  }

  @Put(':id/translations/en')
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertJobListingTranslationDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.save(id, dto, user.sub);
  }

  @Post(':id/translations/en/submit')
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.submit(id, user.sub);
  }

  @Post(':id/translations/en/decide')
  @RequirePermissions('JobListing.Moderate')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideJobListingTranslationDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.decide(id, dto, user.sub);
  }
}
