import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Review } from '../entities/review.entity';
import { ReviewStatus } from '../review.enums';
import { Media } from '../../media/entities/media.entity';
import { MediaRepository } from '../../media/repositories/media.repository';
import { PlacesRepository } from '../../places/repositories/places.repository';

export interface ReviewRow {
  id: string;
  rating: number;
  content: string | null;
  status: ReviewStatus;
  created_at: Date;
  user_id: string;
  author_name: string;
  author_avatar_url: string | null;
  /** Media đã published, non-deleted của review này, theo sort_order rồi created_at/id — nạp
   * bằng một truy vấn batch riêng (MediaRepository.listPublishedByReviewIds), KHÔNG phải từ SQL
   * SELECT phía trên (join reviews+users) nên không camelCase lẫn snake_case trong CÙNG câu SQL. */
  media: Media[];
}

export interface NewReviewWithMedia {
  placeId: string;
  userId: string;
  rating: number;
  content: string | null;
  mediaIds: string[];
}

export interface CreatedReviewWithMedia {
  review: Review;
  /** id media đã THỰC SỰ được gắn + published trong transaction này (có thể ngắn hơn mediaIds
   * yêu cầu CHỈ khi transaction sắp bị rollback ngay sau — xem createWithMedia). */
  publishedMediaIds: string[];
}

@Injectable()
export class ReviewsRepository {
  constructor(
    @InjectRepository(Review)
    private readonly repo: Repository<Review>,
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly mediaRepo: MediaRepository,
    private readonly placesRepo: PlacesRepository,
  ) {}

  existsByUser(placeId: string, userId: string): Promise<boolean> {
    return this.repo.exists({ where: { placeId, userId } });
  }

  /**
   * WF-12 (Moderation Foundation M5) — "target tồn tại và ở trạng thái báo cáo được" (T3 bước 1)
   * cho `POST /reviews/{id}/report`. Chỉ review `published` là nội dung công khai một người dùng
   * thường có thể GẶP để báo cáo — `pending`/`hidden` không hiển thị, nên trả về false y hệt
   * "không tồn tại" (endpoint trả về CÙNG một 404 cho cả hai — không rò rỉ trạng thái kiểm duyệt
   * nội bộ cho reporter).
   */
  existsPublished(id: string): Promise<boolean> {
    return this.repo.exists({ where: { id, status: ReviewStatus.PUBLISHED } });
  }

  /**
   * Đánh giá đã published của một Place, mới nhất trước — kèm tên/avatar người viết, kèm media
   * đã published/non-deleted của MỖI review (batch một truy vấn riêng qua MediaRepository, KHÔNG
   * N+1 — xem `listPublishedByReviewIds`). Media pending/hidden/rejected/xoá mềm KHÔNG BAO GIỜ lọt
   * vào đây (lọc ở chính truy vấn đó, không lọc lại ở tầng này).
   */
  async listPublishedByPlace(placeId: string): Promise<ReviewRow[]> {
    const rows: Array<Omit<ReviewRow, 'media'>> = await this.repo.query(
      `SELECT r.id, r.rating, r.content, r.status, r.created_at,
              r.user_id, u.display_name AS author_name, u.avatar_url AS author_avatar_url
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.place_id = $1 AND r.status = $2
       ORDER BY r.created_at DESC, r.id ASC`,
      [placeId, ReviewStatus.PUBLISHED],
    );
    if (rows.length === 0) return [];

    const media = await this.mediaRepo.listPublishedByReviewIds(rows.map((r) => r.id));
    const mediaByReview = new Map<string, Media[]>();
    for (const m of media) {
      const list = mediaByReview.get(m.reviewId!) ?? [];
      list.push(m);
      mediaByReview.set(m.reviewId!, list);
    }
    return rows.map((row) => ({ ...row, media: mediaByReview.get(row.id) ?? [] }));
  }

  /**
   * ADR-018 T1 (Moderation Foundation M3) — tạo review + gắn/publish media trong MỘT transaction
   * nguyên tử (D4: "tạo review trở thành giao dịch nguyên tử", sửa lỗ hổng có sẵn —
   * `ReviewsService.create()` trước đây KHÔNG có transaction, mỗi bước tự commit riêng).
   *
   * Toàn bộ-hoặc-không-có-gì (INV-14): nếu `attachAndPublish()` không gắn đủ số `mediaIds` yêu
   * cầu, ném lỗi NGAY BÊN TRONG callback → TypeORM tự rollback toàn bộ (review vừa INSERT cũng
   * biến mất) — cùng cơ chế `InventoryHoldsRepository.placeHold()` ném `ConflictException` bên
   * trong `BookingsRepository.create()`'s transaction để rollback over-allocation.
   *
   * `recalculateRating` chạy trong CÙNG transaction (INV-4) — không tách bước riêng, không có
   * khoảng hở nào giữa "review/media đã đổi" và "rating chưa cập nhật".
   */
  async createWithMedia(data: NewReviewWithMedia): Promise<CreatedReviewWithMedia> {
    return this.ds.transaction(async (manager) => {
      const reviewRepo = manager.getRepository(Review);
      const review = reviewRepo.create({
        placeId: data.placeId,
        userId: data.userId,
        rating: data.rating,
        content: data.content,
        status: ReviewStatus.PUBLISHED, // O1 — giữ nguyên auto-publish, không đổi hành vi
      });
      const saved = await reviewRepo.save(review);

      let publishedMediaIds: string[] = [];
      if (data.mediaIds.length > 0) {
        publishedMediaIds = await this.mediaRepo.attachAndPublish(manager, data.mediaIds, saved.id, data.userId);
        if (publishedMediaIds.length !== data.mediaIds.length) {
          throw new UnprocessableEntityException(
            'Một hoặc nhiều media_ids không hợp lệ để gắn vào đánh giá này (không mồ côi, không ' +
              'phải của bạn, hoặc chưa xác minh upload) — không tạo đánh giá.',
          );
        }
      }

      await this.placesRepo.recalculateRating(data.placeId, manager);

      return { review: saved, publishedMediaIds };
    });
  }
}
