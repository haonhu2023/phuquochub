import { Module } from '@nestjs/common';
import { SiteContentService } from './site-content.service';
import { SiteContentPublicController, SiteContentAdminController } from './site-content.controller';

// S1 (2026-09-22). No TypeOrmModule.forFeature() here — SiteContentService uses raw
// `dataSource.query()` for its CAS upsert: a single `INSERT ... ON CONFLICT ... WHERE` statement
// that must both create-if-missing AND CAS-protect the update-if-present path in one round trip,
// which TypeORM's repository `.update()` API (an UPDATE-only, no-insert operation — see
// PlacesRepository.updateScalarsWithCas() for the pattern that fits an already-existing row) cannot
// express. MediaUrlModule is @Global() — not listed here, same precedent as every other module that
// injects MediaUrlService.
@Module({
  controllers: [SiteContentPublicController, SiteContentAdminController],
  providers: [SiteContentService],
  exports: [SiteContentService],
})
export class SiteContentModule {}
