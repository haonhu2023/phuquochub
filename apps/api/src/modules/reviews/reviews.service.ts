import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ReviewsRepository } from './repositories/reviews.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { AuditService } from '../../core/audit/audit.service';
import { StorageService } from '../../core/storage/storage.service';
import {
  MODERATION_EVENT_PUBLISHER,
  MediaAutoPublishedEvent,
  ModerationEventPublisher,
  ReviewCreatedEvent,
} from '../moderation/events/moderation-events';
import { ModerationReportsService } from '../moderation/moderation-reports.service';
import { ModerationTargetType } from '../moderation/moderation.enums';
import { CreateReportDto } from '../moderation/dto/moderation.dto';
import { CreateReviewDto } from './dto/reviews.dto';
import { toReview } from './reviews.mapper';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly reviewsRepo: ReviewsRepository,
    private readonly placesRepo: PlacesRepository,
    private readonly audit: AuditService,
    @Inject(MODERATION_EVENT_PUBLISHER)
    private readonly events: ModerationEventPublisher,
    private readonly moderationReports: ModerationReportsService,
    private readonly storage: StorageService,
  ) {}

  async listByPlace(placeId: string) {
    const rows = await this.reviewsRepo.listPublishedByPlace(placeId);
    return rows.map((row) => toReview(row, (key) => this.storage.getPublicUrl(key)));
  }

  /**
   * WF-12/T3 (Moderation Foundation M5, ADR-018/moderation-design.md §9.2). T3 bước 1 ("target
   * tồn tại và ở trạng thái báo cáo được") sống Ở ĐÂY — chỉ ReviewsRepository biết `reviews`.
   * `existsPublished()` trả về false CHO CẢ "không tồn tại" LẪN "tồn tại nhưng chưa/không còn
   * published" — cùng một 404, không rò rỉ trạng thái kiểm duyệt nội bộ cho reporter. Phần còn
   * lại của T3 (case reuse/creation, report, report_count/severity/priority) uỷ quyền hoàn toàn
   * cho `ModerationReportsService` — KHÔNG cài lại logic đó ở đây.
   */
  async report(reviewId: string, dto: CreateReportDto, reporterId: string): Promise<void> {
    if (!(await this.reviewsRepo.existsPublished(reviewId))) {
      throw new NotFoundException('Không tìm thấy đánh giá');
    }
    await this.moderationReports.report({
      targetType: ModerationTargetType.REVIEW,
      targetId: reviewId,
      reporterId,
      reason: dto.reason,
      description: dto.description || null,
    });
  }

  // ADR-018 T1 (Moderation Foundation M3) — tạo review + gắn/auto-publish media_ids trong MỘT
  // transaction nguyên tử (D3/D4/O2). Trước milestone này, việc này KHÔNG có transaction và media
  // KHÔNG BAO GIỜ được publish (§Context ADR-018) — hai lỗ hổng có sẵn, cả hai đều đóng ở đây.
  async create(placeId: string, dto: CreateReviewDto, userId: string): Promise<void> {
    if (!(await this.placesRepo.existsById(placeId))) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    if (await this.reviewsRepo.existsByUser(placeId, userId)) {
      throw new ConflictException('Bạn đã đánh giá địa điểm này rồi');
    }

    const { review, publishedMediaIds } = await this.reviewsRepo.createWithMedia({
      placeId,
      userId,
      rating: dto.rating,
      content: dto.content ?? null,
      mediaIds: dto.media_ids ?? [],
    });

    // Đến được đây nghĩa là transaction đã COMMIT thành công (createWithMedia ném lỗi và rollback
    // nếu không). INV-9: audit/event CHỈ sau commit, KHÔNG BAO GIỜ trong transaction.
    await this.emitPostCommit(review.id, placeId, userId, publishedMediaIds);
  }

  /**
   * Audit + domain event SAU KHI commit (INV-9). Lỗi ở đây KHÔNG được hoàn tác review/media đã
   * tạo thành công — chỉ log và tiếp tục (ADR-018 §11 "mất một dòng audit/event tệ hơn nhưng
   * không tệ bằng âm thầm hoàn tác một thao tác đã thành công thật"). Hai khối try/catch tách
   * riêng để lỗi audit không chặn việc phát event và ngược lại.
   */
  private async emitPostCommit(
    reviewId: string,
    placeId: string,
    userId: string,
    publishedMediaIds: string[],
  ): Promise<void> {
    try {
      await this.audit.record({
        event: 'review.created',
        entityType: 'review',
        entityId: reviewId,
        actorId: userId,
        after: { placeId, mediaCount: publishedMediaIds.length },
      });
      for (const mediaId of publishedMediaIds) {
        await this.audit.record({
          event: 'media.auto_published',
          entityType: 'media',
          entityId: mediaId,
          actorId: userId,
          before: { status: 'pending' },
          after: { status: 'published', reviewId },
        });
      }
    } catch (err) {
      this.logger.error(`Ghi audit sau khi tạo review ${reviewId} thất bại: ${(err as Error).message}`);
    }

    try {
      await this.events.publish(new ReviewCreatedEvent(reviewId, placeId, userId));
      for (const mediaId of publishedMediaIds) {
        await this.events.publish(new MediaAutoPublishedEvent(mediaId, reviewId));
      }
    } catch (err) {
      this.logger.error(`Phát event sau khi tạo review ${reviewId} thất bại: ${(err as Error).message}`);
    }
  }
}
