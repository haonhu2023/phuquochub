import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceEditProposal } from './entities/place-edit-proposal.entity';
import { PlaceEditProposalsRepository } from './repositories/place-edit-proposals.repository';
import { PlaceEditProposalsService } from './place-edit-proposals.service';
import { PlaceEditProposalsController } from './place-edit-proposals.controller';
import { PlacesModule } from '../places/places.module';
import { LocalesModule } from '../locales/locales.module';
import { PlaceTranslationsModule } from '../place-translations/place-translations.module';

// `PlacesModule` imported for `PlacesRepository` (read current field value at submit/decide time)
// and `PlacesService` (the ONLY write path a decide()-approve ever calls — task requirement:
// "việc chấp thuận chỉ áp dụng qua service và các gate hiện có"). No cycle: PlacesModule does not
// import this module back, same direction as ReviewsModule/MediaModule -> PlacesModule already.
// `PlaceTranslationsModule` (imported directly, not just through PlacesModule) — for
// `PlaceTranslationsService.getCurrentPublicTranslatedText()`, needed to detect when a
// `place_translations` row overlays the base column for the DEFAULT locale too (short_description
// is public-readable via a translation row even at locale=vi, not only for non-default locales —
// see the guard in the service). No cycle: PlaceTranslationsModule does not import this module or
// PlacesModule back (verified — it only imports LocalesModule/RevisionsModule/RbacModule/UsersModule).
@Module({
  imports: [TypeOrmModule.forFeature([PlaceEditProposal]), PlacesModule, LocalesModule, PlaceTranslationsModule],
  controllers: [PlaceEditProposalsController],
  providers: [PlaceEditProposalsRepository, PlaceEditProposalsService],
  exports: [PlaceEditProposalsRepository, PlaceEditProposalsService],
})
export class PlaceEditProposalsModule {}
