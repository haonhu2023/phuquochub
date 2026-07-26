import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './entities/review.entity';
import { ReviewsRepository } from './repositories/reviews.repository';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { PlacesModule } from '../places/places.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [TypeOrmModule.forFeature([Review]), PlacesModule, MediaModule],
  controllers: [ReviewsController],
  providers: [ReviewsRepository, ReviewsService],
  exports: [ReviewsRepository, ReviewsService],
})
export class ReviewsModule {}
