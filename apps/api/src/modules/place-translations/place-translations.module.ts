import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceTranslation } from './entities/place-translation.entity';
import { PlaceTranslationRoute } from './entities/place-translation-route.entity';
import { PlaceTranslationSeo } from './entities/place-translation-seo.entity';
import { PlaceTranslationsRepository } from './repositories/place-translations.repository';
import { PlaceTranslationRoutesRepository } from './repositories/place-translation-routes.repository';
import { PlaceTranslationSeoRepository } from './repositories/place-translation-seo.repository';
import { PlaceTranslationsService } from './place-translations.service';
import { TranslationReviewService } from './translation-review.service';
import { PlaceTranslationsController } from './place-translations.controller';
import { LocalesModule } from '../locales/locales.module';
import { RevisionsModule } from '../revisions/revisions.module';
import { RbacModule } from '../rbac/rbac.module';
import { UsersModule } from '../users/users.module';

// Module i18n nền tảng (ADR-020) + minimal human-review workflow (human-translation-review,
// 2026-09-04). `RbacModule` (AuthorizationService — PDP for PlaceTranslation.Review.Any) and
// `UsersModule` (UsersRepository — actor exists/isActive/isServiceAccount checks) are imported
// solely for `TranslationReviewService`; neither imports this module back, so no cycle.
@Module({
  imports: [
    TypeOrmModule.forFeature([PlaceTranslation, PlaceTranslationRoute, PlaceTranslationSeo]),
    LocalesModule,
    RevisionsModule,
    RbacModule,
    UsersModule,
  ],
  controllers: [PlaceTranslationsController],
  providers: [
    PlaceTranslationsRepository,
    PlaceTranslationRoutesRepository,
    PlaceTranslationSeoRepository,
    PlaceTranslationsService,
    TranslationReviewService,
  ],
  exports: [PlaceTranslationsService, TranslationReviewService],
})
export class PlaceTranslationsModule {}
