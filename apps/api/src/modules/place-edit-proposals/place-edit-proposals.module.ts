import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceEditProposal } from './entities/place-edit-proposal.entity';
import { PlaceEditProposalsRepository } from './repositories/place-edit-proposals.repository';
import { PlaceEditProposalsService } from './place-edit-proposals.service';
import { PlaceEditProposalsController } from './place-edit-proposals.controller';
import { PlacesModule } from '../places/places.module';
import { LocalesModule } from '../locales/locales.module';

// `PlacesModule` imported for `PlacesRepository` (read current field value at submit/decide time)
// and `PlacesService` (the ONLY write path a decide()-approve ever calls — task requirement:
// "việc chấp thuận chỉ áp dụng qua service và các gate hiện có"). No cycle: PlacesModule does not
// import this module back, same direction as ReviewsModule/MediaModule -> PlacesModule already.
@Module({
  imports: [TypeOrmModule.forFeature([PlaceEditProposal]), PlacesModule, LocalesModule],
  controllers: [PlaceEditProposalsController],
  providers: [PlaceEditProposalsRepository, PlaceEditProposalsService],
  exports: [PlaceEditProposalsRepository, PlaceEditProposalsService],
})
export class PlaceEditProposalsModule {}
