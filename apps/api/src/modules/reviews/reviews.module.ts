import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './entities/review.entity';
import { ReviewsRepository } from './repositories/reviews.repository';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { PlacesModule } from '../places/places.module';
import { MediaModule } from '../media/media.module';
import { ModerationModule } from '../moderation/moderation.module';

// ModerationModule imported for MODERATION_EVENT_PUBLISHER only (T1 emits ReviewCreated/
// MediaAutoPublished through it, ADR-018 D12) — no cycle: ModerationModule -> MediaModule (leaf),
// ReviewsModule -> {PlacesModule, MediaModule, ModerationModule}, none loop back to ReviewsModule.
@Module({
  imports: [TypeOrmModule.forFeature([Review]), PlacesModule, MediaModule, ModerationModule],
  controllers: [ReviewsController],
  providers: [ReviewsRepository, ReviewsService],
  exports: [ReviewsRepository, ReviewsService],
})
export class ReviewsModule {}
