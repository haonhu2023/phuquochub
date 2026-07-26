import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ReviewsRepository } from './repositories/reviews.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { MediaRepository } from '../media/repositories/media.repository';
import { CreateReviewDto } from './dto/reviews.dto';
import { toReview } from './reviews.mapper';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviewsRepo: ReviewsRepository,
    private readonly placesRepo: PlacesRepository,
    private readonly mediaRepo: MediaRepository,
  ) {}

  async listByPlace(placeId: string) {
    const rows = await this.reviewsRepo.listPublishedByPlace(placeId);
    return rows.map(toReview);
  }

  // MVP: không có hàng đợi kiểm duyệt (roadmap Medium riêng) → ghi 'published' ngay khi tạo,
  // để tính năng thực sự hiển thị được thay vì rơi vào trạng thái 'pending' không ai xử lý.
  async create(placeId: string, dto: CreateReviewDto, userId: string): Promise<void> {
    if (!(await this.placesRepo.existsById(placeId))) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    if (await this.reviewsRepo.existsByUser(placeId, userId)) {
      throw new ConflictException('Bạn đã đánh giá địa điểm này rồi');
    }

    const review = this.reviewsRepo.create({
      placeId,
      userId,
      rating: dto.rating,
      content: dto.content ?? null,
    });
    const saved = await this.reviewsRepo.save(review);

    if (dto.media_ids && dto.media_ids.length > 0) {
      await this.mediaRepo.attachToReview(dto.media_ids, saved.id, userId);
    }
    await this.placesRepo.recalculateRating(placeId);
  }
}
