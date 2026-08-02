import { ConflictException, NotFoundException } from '@nestjs/common';

jest.mock('./reviews.mapper', () => ({ toReview: (r: { id?: string }) => ({ id: r?.id, mapped: true }) }));

import { ReviewsService } from './reviews.service';
import { ReviewsRepository } from './repositories/reviews.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { AuditService } from '../../core/audit/audit.service';
import type { ModerationEventPublisher } from '../moderation/events/moderation-events';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('ReviewsService', () => {
  let reviewsRepo: LooseMock<ReviewsRepository>;
  let placesRepo: LooseMock<PlacesRepository>;
  let audit: LooseMock<AuditService>;
  let events: LooseMock<ModerationEventPublisher>;
  let service: ReviewsService;

  beforeEach(() => {
    reviewsRepo = createMock<ReviewsRepository>({
      listPublishedByPlace: jest.fn(),
      existsByUser: jest.fn(),
      createWithMedia: jest.fn(),
    });
    placesRepo = createMock<PlacesRepository>({ existsById: jest.fn() });
    audit = createMock<AuditService>({ record: jest.fn() });
    events = createMock<ModerationEventPublisher>({ publish: jest.fn() });
    service = new ReviewsService(reviewsRepo, placesRepo, audit, events);
  });

  afterEach(() => jest.clearAllMocks());

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
});
