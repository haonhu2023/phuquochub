import { ConflictException, NotFoundException } from '@nestjs/common';

jest.mock('./reviews.mapper', () => ({ toReview: (r: { id?: string }) => ({ id: r?.id, mapped: true }) }));

import { ReviewsService } from './reviews.service';
import { ReviewsRepository } from './repositories/reviews.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { MediaRepository } from '../media/repositories/media.repository';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('ReviewsService', () => {
  let reviewsRepo: LooseMock<ReviewsRepository>;
  let placesRepo: LooseMock<PlacesRepository>;
  let mediaRepo: LooseMock<MediaRepository>;
  let service: ReviewsService;

  beforeEach(() => {
    reviewsRepo = createMock<ReviewsRepository>({
      listPublishedByPlace: jest.fn(),
      existsByUser: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    });
    placesRepo = createMock<PlacesRepository>({
      existsById: jest.fn(),
      recalculateRating: jest.fn(),
    });
    mediaRepo = createMock<MediaRepository>({ attachToReview: jest.fn() });
    service = new ReviewsService(reviewsRepo, placesRepo, mediaRepo);
  });

  afterEach(() => jest.clearAllMocks());

  it('listByPlace: map rows qua toReview', async () => {
    reviewsRepo.listPublishedByPlace.mockResolvedValue([{ id: 'r1' }]);
    const res = await service.listByPlace('p1');
    expect(reviewsRepo.listPublishedByPlace).toHaveBeenCalledWith('p1');
    expect(res).toEqual([{ id: 'r1', mapped: true }]);
  });

  it('create: place không tồn tại → NotFound, không tạo review', async () => {
    placesRepo.existsById.mockResolvedValue(false);
    await expect(service.create('p1', { rating: 5 }, 'u1')).rejects.toBeInstanceOf(NotFoundException);
    expect(reviewsRepo.create).not.toHaveBeenCalled();
  });

  it('create: đã đánh giá rồi → Conflict, không tạo review', async () => {
    placesRepo.existsById.mockResolvedValue(true);
    reviewsRepo.existsByUser.mockResolvedValue(true);
    await expect(service.create('p1', { rating: 5 }, 'u1')).rejects.toBeInstanceOf(ConflictException);
    expect(reviewsRepo.create).not.toHaveBeenCalled();
  });

  it('create: hợp lệ → lưu review, không media_ids → không gọi attachToReview, tính lại rating', async () => {
    placesRepo.existsById.mockResolvedValue(true);
    reviewsRepo.existsByUser.mockResolvedValue(false);
    reviewsRepo.create.mockReturnValue({ placeId: 'p1', userId: 'u1', rating: 5 });
    reviewsRepo.save.mockResolvedValue({ id: 'r9' });

    await service.create('p1', { rating: 5, content: 'Đẹp' }, 'u1');

    expect(reviewsRepo.create).toHaveBeenCalledWith({
      placeId: 'p1',
      userId: 'u1',
      rating: 5,
      content: 'Đẹp',
    });
    expect(mediaRepo.attachToReview).not.toHaveBeenCalled();
    expect(placesRepo.recalculateRating).toHaveBeenCalledWith('p1');
  });

  it('create: có media_ids → gắn media vào review vừa tạo', async () => {
    placesRepo.existsById.mockResolvedValue(true);
    reviewsRepo.existsByUser.mockResolvedValue(false);
    reviewsRepo.create.mockReturnValue({});
    reviewsRepo.save.mockResolvedValue({ id: 'r9' });

    await service.create('p1', { rating: 3, media_ids: ['m1', 'm2'] }, 'u1');

    expect(mediaRepo.attachToReview).toHaveBeenCalledWith(['m1', 'm2'], 'r9', 'u1');
  });
});
