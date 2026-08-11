import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Place } from './entities/place.entity';
import { PlaceFaq } from './entities/place-faq.entity';
import { PlaceSeo } from './entities/place-seo.entity';
import { PlaceAiSummary } from './entities/place-ai-summary.entity';
import { PlacesRepository } from './repositories/places.repository';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { CategoriesModule } from '../categories/categories.module';
import { ContactsModule } from '../contacts/contacts.module';
import { PricesModule } from '../prices/prices.module';
import { MediaModule } from '../media/media.module';
import { RevisionsModule } from '../revisions/revisions.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Place, PlaceFaq, PlaceSeo, PlaceAiSummary]),
    CategoriesModule,
    ContactsModule,
    PricesModule,
    MediaModule,
    RevisionsModule,
    RbacModule,
  ],
  controllers: [PlacesController],
  providers: [PlacesRepository, PlacesService],
  exports: [PlacesRepository, PlacesService],
})
export class PlacesModule {}
