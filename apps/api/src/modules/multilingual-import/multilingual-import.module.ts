import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MultilingualImportBatch } from './entities/multilingual-import-batch.entity';
import { MultilingualImportRow } from './entities/multilingual-import-row.entity';
import { MultilingualImportBatchRepository } from './repositories/multilingual-import-batch.repository';
import { MultilingualImportRowRepository } from './repositories/multilingual-import-row.repository';
import { MultilingualPlaceImportService } from './multilingual-place-import.service';
import { PlaceTranslationsModule } from '../place-translations/place-translations.module';
import { LocalesModule } from '../locales/locales.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MultilingualImportBatch, MultilingualImportRow]),
    PlaceTranslationsModule,
    LocalesModule,
  ],
  providers: [
    MultilingualImportBatchRepository,
    MultilingualImportRowRepository,
    MultilingualPlaceImportService,
  ],
  exports: [MultilingualPlaceImportService],
})
export class MultilingualImportModule {}
