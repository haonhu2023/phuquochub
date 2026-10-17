import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { RealEstateListingTranslationsService } from './real-estate-listing-translations.service';
import { DecideRealEstateListingTranslationDto, UpsertRealEstateListingTranslationDto } from './dto/real-estate-listing-translations.dto';

// Cùng khuôn job-listing-translations.controller.ts (xem ghi chú đầy đủ ở đó) — lồng dưới
// `/real-estate-listings/:id/translations/en`.
@Controller('real-estate-listings')
export class RealEstateListingTranslationsController {
  constructor(private readonly service: RealEstateListingTranslationsService) {}

  @Get('translations/en/pending')
  @RequirePermissions('RealEstateListing.Moderate')
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
    @Body() dto: UpsertRealEstateListingTranslationDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.save(id, dto, user.sub);
  }

  @Post(':id/translations/en/submit')
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.service.submit(id, user.sub);
  }

  @Post(':id/translations/en/decide')
  @RequirePermissions('RealEstateListing.Moderate')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideRealEstateListingTranslationDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.decide(id, dto, user.sub);
  }
}
