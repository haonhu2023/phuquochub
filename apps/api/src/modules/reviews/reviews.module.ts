import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './entities/review.entity';
import { ReviewsRepository } from './repositories/reviews.repository';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { PlacesModule } from '../places/places.module';
import { MediaModule } from '../media/media.module';
import { ModerationCoreModule } from '../moderation/moderation-core.module';

// `ModerationCoreModule` (not the full `ModerationModule`) imported for MODERATION_EVENT_PUBLISHER
// (T1 emits ReviewCreated/MediaAutoPublished through it, ADR-018 D12) and, since M5,
// `ModerationReportsService` (T3, POST /reviews/{id}/report). ReviewsModule never needed
// `ModerationService`/`ModerationController` themselves, only these — importing the dependency-free
// core module instead of the full `ModerationModule` avoids pulling in `ModerationModule`'s own
// MediaModule/PlacesModule/RbacModule imports for no reason, and sidesteps the cycle M5 introduced
// (`ModerationModule` now needs `MediaModule` for its own new report feature too — see
// `moderation-core.module.ts`'s comment for the full explanation). No cycle: `ModerationCoreModule`
// imports nothing beyond TypeORM entities.
@Module({
  imports: [TypeOrmModule.forFeature([Review]), PlacesModule, MediaModule, ModerationCoreModule],
  controllers: [ReviewsController],
  providers: [ReviewsRepository, ReviewsService],
  exports: [ReviewsRepository, ReviewsService],
})
export class ReviewsModule {}
