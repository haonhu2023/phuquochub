import { ConflictException, NotFoundException } from '@nestjs/common';

// Ghi lại resolver mà service truyền xuống toReview (Secure Private Media, 2026-08-10) — hình dạng
// trả về giữ NGUYÊN như trước để các assertion cũ không đổi.
const toReviewCalls: Array<(mediaId: string) => string> = [];
jest.mock('./reviews.mapper', () => ({
  toReview: (r: { id?: string }, resolve: (mediaId: string) => string) => {
    toReviewCalls.push(resolve);
    return { id: r?.id, mapped: true };
  },
}));

import { ReviewsService } from './reviews.service';
import { ReviewsRepository } from './repositories/reviews.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { AuditService } from '../../core/audit/audit.service';
import type { ModerationEventPublisher } from '../moderation/events/moderation-events';
import type { ModerationReportsService } from '../moderation/moderation-reports.service';
import { ModerationTargetType } from '../moderation/moderation.enums';
import type { MediaUrlService } from '../../core/media-url/media-url.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('ReviewsService', () => {
  let reviewsRepo: LooseMock<ReviewsRepository>;
  let placesRepo: LooseMock<PlacesRepository>;
  let audit: LooseMock<AuditService>;
  let events: LooseMock<ModerationEventPublisher>;
  let moderationReports: LooseMock<ModerationReportsService>;
  let mediaUrl: LooseMock<MediaUrlService>;
  let service: ReviewsService;

  beforeEach(() => {
    reviewsRepo = createMock<ReviewsRepository>({
      listPublishedByPlace: jest.fn(),
      existsByUser: jest.fn(),
      createWithMedia: jest.fn(),
      existsPublished: jest.fn(),
    });
    placesRepo = createMock<PlacesRepository>({ existsById: jest.fn() });
    audit = createMock<AuditService>({ record: jest.fn() });
    events = createMock<ModerationEventPublisher>({ publish: jest.fn() });
    moderationReports = createMock<ModerationReportsService>({ report: jest.fn() });
    mediaUrl = createMock<MediaUrlService>({ fileUrl: jest.fn() });
    service = new ReviewsService(reviewsRepo, placesRepo, audit, events, moderationReports, mediaUrl);
  });

  afterEach(() => jest.clearAllMocks());

  it('listByPlace: resolver truyền xuống toReview là mediaUrl.fileUrl (URL API ổn định, không phải URL object storage)', async () => {
    toReviewCalls.length = 0;
    reviewsRepo.listPublishedByPlace.mockResolvedValue([{ id: 'r1' }]);
    mediaUrl.fileUrl.mockReturnValue('https://phuquochub.com/api/media/m1/file');

    await service.listByPlace('p1');

    expect(toReviewCalls).toHaveLength(1);
    expect(toReviewCalls[0]('m1')).toBe('https://phuquochub.com/api/media/m1/file');
    expect(mediaUrl.fileUrl).toHaveBeenCalledWith('m1');
  });

  it('listByPlace: map rows qua toReview', async () => {
    reviewsRepo.listPublishedByPlace.mockResolvedValue([{ id: 'r1' }]);
    const res = await service.listByPlace('p1');
    expect(reviewsRepo.listPublishedByPlace).toHaveBeenCalledWith('p1');
    expect(res).toEqual([{ id: 'r1', mapped: true }]);
  });

  it('create: place không tồn tại → NotFound, KHÔNG gọi createWithMedia', async () => {
    placesRepo.existsById.mockResolvedValue(false);
    await expect(service.create('p1', { rating: 5 }, 'u1')).rejects.toBeInstanceOf(NotFoundException);
    expect(reviewsRepo.createWithMedia).not.toHaveBeenCalled();
  });

  it('create: đã đánh giá rồi → Conflict, KHÔNG gọi createWithMedia', async () => {
    placesRepo.existsById.mockResolvedValue(true);
    reviewsRepo.existsByUser.mockResolvedValue(true);
    await expect(service.create('p1', { rating: 5 }, 'u1')).rejects.toBeInstanceOf(ConflictException);
    expect(reviewsRepo.createWithMedia).not.toHaveBeenCalled();
  });

  it('create: hợp lệ, không media_ids → truyền mảng rỗng xuống repository', async () => {
    placesRepo.existsById.mockResolvedValue(true);
    reviewsRepo.existsByUser.mockResolvedValue(false);
    reviewsRepo.createWithMedia.mockResolvedValue({ review: { id: 'r9' }, publishedMediaIds: [] });

    await service.create('p1', { rating: 5, content: 'Đẹp' }, 'u1');

    expect(reviewsRepo.createWithMedia).toHaveBeenCalledWith({
      placeId: 'p1',
      userId: 'u1',
      rating: 5,
      content: 'Đẹp',
      mediaIds: [],
    });
  });

  it('create: có media_ids → truyền xuống repository nguyên vẹn (repository tự xử lý transaction)', async () => {
    placesRepo.existsById.mockResolvedValue(true);
    reviewsRepo.existsByUser.mockResolvedValue(false);
    reviewsRepo.createWithMedia.mockResolvedValue({ review: { id: 'r9' }, publishedMediaIds: ['m1', 'm2'] });

    await service.create('p1', { rating: 3, media_ids: ['m1', 'm2'] }, 'u1');

    expect(reviewsRepo.createWithMedia).toHaveBeenCalledWith(
      expect.objectContaining({ mediaIds: ['m1', 'm2'] }),
    );
  });

  it('create: sau khi commit ghi audit review.created + media.auto_published cho MỖI media đã publish', async () => {
    placesRepo.existsById.mockResolvedValue(true);
    reviewsRepo.existsByUser.mockResolvedValue(false);
    reviewsRepo.createWithMedia.mockResolvedValue({ review: { id: 'r9' }, publishedMediaIds: ['m1', 'm2'] });

    await service.create('p1', { rating: 3, media_ids: ['m1', 'm2'] }, 'u1');

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'review.created', entityId: 'r9' }));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'media.auto_published', entityId: 'm1' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'media.auto_published', entityId: 'm2' }),
    );
    expect(audit.record).toHaveBeenCalledTimes(3); // 1 review.created + 2 media.auto_published
  });

  it('create: không media_ids → KHÔNG ghi audit media.auto_published nào', async () => {
    placesRepo.existsById.mockResolvedValue(true);
    reviewsRepo.existsByUser.mockResolvedValue(false);
    reviewsRepo.createWithMedia.mockResolvedValue({ review: { id: 'r9' }, publishedMediaIds: [] });

    await service.create('p1', { rating: 5 }, 'u1');

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'review.created' }));
  });

  it('create: phát ReviewCreated + một MediaAutoPublished cho mỗi media SAU commit', async () => {
    placesRepo.existsById.mockResolvedValue(true);
    reviewsRepo.existsByUser.mockResolvedValue(false);
    reviewsRepo.createWithMedia.mockResolvedValue({ review: { id: 'r9' }, publishedMediaIds: ['m1'] });

    await service.create('p1', { rating: 5, media_ids: ['m1'] }, 'u1');

    expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'ReviewCreated', reviewId: 'r9' }));
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MediaAutoPublished', mediaId: 'm1', reviewId: 'r9' }),
    );
  });

  it('create: audit ghi lỗi SAU commit → KHÔNG ném lỗi ra ngoài, review vẫn coi là tạo thành công', async () => {
    placesRepo.existsById.mockResolvedValue(true);
    reviewsRepo.existsByUser.mockResolvedValue(false);
    reviewsRepo.createWithMedia.mockResolvedValue({ review: { id: 'r9' }, publishedMediaIds: [] });
    audit.record.mockRejectedValue(new Error('DB tạm thời không ghi được'));

    await expect(service.create('p1', { rating: 5 }, 'u1')).resolves.toBeUndefined();
  });

  it('create: publish event lỗi SAU commit → KHÔNG ném lỗi ra ngoài', async () => {
    placesRepo.existsById.mockResolvedValue(true);
    reviewsRepo.existsByUser.mockResolvedValue(false);
    reviewsRepo.createWithMedia.mockResolvedValue({ review: { id: 'r9' }, publishedMediaIds: [] });
    events.publish.mockRejectedValue(new Error('broker không phản hồi'));

    await expect(service.create('p1', { rating: 5 }, 'u1')).resolves.toBeUndefined();
  });

  describe('report (WF-12/T3, M5)', () => {
    it('review không published (hoặc không tồn tại) -> 404, KHÔNG gọi ModerationReportsService', async () => {
      reviewsRepo.existsPublished.mockResolvedValue(false);

      await expect(service.report('r1', { reason: 'spam' } as never, 'u1')).rejects.toThrow(NotFoundException);
      expect(moderationReports.report).not.toHaveBeenCalled();
    });

    it('review published -> uỷ quyền cho ModerationReportsService với targetType=review đúng targetId/reporterId/reason/description', async () => {
      reviewsRepo.existsPublished.mockResolvedValue(true);

      await service.report('r1', { reason: 'spam', description: 'nội dung spam' } as never, 'u1');

      expect(moderationReports.report).toHaveBeenCalledWith({
        targetType: ModerationTargetType.REVIEW,
        targetId: 'r1',
        reporterId: 'u1',
        reason: 'spam',
        description: 'nội dung spam',
      });
    });

    it('description bỏ trống -> truyền null (không phải undefined)', async () => {
      reviewsRepo.existsPublished.mockResolvedValue(true);

      await service.report('r1', { reason: 'spam' } as never, 'u1');

      expect(moderationReports.report).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
    });
  });
});
