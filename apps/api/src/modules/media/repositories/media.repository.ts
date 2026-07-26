import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Media } from '../entities/media.entity';
import { MediaStatus } from '../media.enums';

// Repository `media`. Sprint 2: chỉ đọc gallery Place (published) cho trang chi tiết.
// Upload/presign/resize thuộc Sprint 5.
@Injectable()
export class MediaRepository {
  constructor(
    @InjectRepository(Media)
    private readonly repo: Repository<Media>,
  ) {}

  /** Gallery đã duyệt của một Place, theo sort_order (dùng partial index idx_media_place). */
  listPublishedByPlace(placeId: string): Promise<Media[]> {
    return this.repo.find({
      where: { placeId, status: MediaStatus.PUBLISHED, deletedAt: IsNull() },
      order: { sortOrder: 'ASC' },
    });
  }

  /**
   * Gắn media MỒ CÔI (chưa thuộc arc nào) vào một review — chỉ media do chính `userId` upload,
   * tránh việc chiếm dụng media của người khác qua media_ids (ReviewsService.create).
   */
  async attachToReview(mediaIds: string[], reviewId: string, userId: string): Promise<void> {
    if (mediaIds.length === 0) return;
    await this.repo.query(
      `UPDATE media SET review_id = $1
       WHERE id = ANY($2) AND uploaded_by = $3 AND deleted_at IS NULL
         AND place_id IS NULL AND review_id IS NULL AND post_id IS NULL
         AND business_id IS NULL AND event_id IS NULL`,
      [reviewId, mediaIds, userId],
    );
  }
}
