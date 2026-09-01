import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceTranslation } from './entities/place-translation.entity';
import { PlaceTranslationRoute } from './entities/place-translation-route.entity';
import { PlaceTranslationSeo } from './entities/place-translation-seo.entity';
import { PlaceTranslationsRepository } from './repositories/place-translations.repository';
import { PlaceTranslationRoutesRepository } from './repositories/place-translation-routes.repository';
import { PlaceTranslationSeoRepository } from './repositories/place-translation-seo.repository';
import { PlaceTranslationsService } from './place-translations.service';
import { LocalesModule } from '../locales/locales.module';
import { RevisionsModule } from '../revisions/revisions.module';

// Module i18n nền tảng (ADR-020). Không có controller — chưa có yêu cầu API surface ở giai đoạn
// này; một importer/production-write job tương lai sẽ inject PlaceTranslationsService trực tiếp,
// cùng cách AdminDataModule đang dùng RevisionsService hôm nay.
@Module({
  imports: [
    TypeOrmModule.forFeature([PlaceTranslation, PlaceTranslationRoute, PlaceTranslationSeo]),
    LocalesModule,
    RevisionsModule,
  ],
  providers: [
    PlaceTranslationsRepository,
    PlaceTranslationRoutesRepository,
    PlaceTranslationSeoRepository,
    PlaceTranslationsService,
  ],
  exports: [PlaceTranslationsService],
})
export class PlaceTranslationsModule {}
