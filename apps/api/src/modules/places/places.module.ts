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
import { SourcesModule } from '../sources/sources.module';

// Place Trust & Freshness Surface (2026-08-19): `SourcesModule` cấp SourceAttributionsRepository/
// SourcesRepository để PlacesService.getBySlug() đọc `trust_sources` (source_attributions +
// sources — subsystem đã có, chỉ thêm một đường ĐỌC mới). An toàn về chiều phụ thuộc:
// SourcesModule KHÔNG import ngược PlacesModule (khác VerificationsModule, nơi import PlacesModule
// để ghi cache verification_status/verified_at — import VerificationsModule ở đây sẽ tạo vòng lặp).
@Module({
  imports: [
    TypeOrmModule.forFeature([Place, PlaceFaq, PlaceSeo, PlaceAiSummary]),
    CategoriesModule,
    ContactsModule,
    PricesModule,
    MediaModule,
    RevisionsModule,
    RbacModule,
    SourcesModule,
  ],
  controllers: [PlacesController],
  providers: [PlacesRepository, PlacesService],
  exports: [PlacesRepository, PlacesService],
})
export class PlacesModule {}
