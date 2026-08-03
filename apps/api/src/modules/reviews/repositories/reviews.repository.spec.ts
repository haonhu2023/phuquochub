import { UnprocessableEntityException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ReviewsRepository } from './reviews.repository';
import { Review } from '../entities/review.entity';
import { ReviewStatus } from '../review.enums';
import { MediaRepository } from '../../media/repositories/media.repository';
import { PlacesRepository } from '../../places/repositories/places.repository';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

describe('ReviewsRepository', () => {
  let repo: LooseMock<Repository<Review>>;
  let ds: LooseMock<DataSource>;
  let mediaRepo: LooseMock<MediaRepository>;
  let placesRepo: LooseMock<PlacesRepository>;
  let sut: ReviewsRepository;
  let manager: LooseMock<EntityManager>;
  let reviewRepoInManager: LooseMock<Repository<Review>>;

  beforeEach(() => {
    repo = createMock<Repository<Review>>({ exists: jest.fn(), query: jest.fn() });
    reviewRepoInManager = createMock<Repository<Review>>({
      create: jest.fn((data: object) => ({ ...data })),
      save: jest.fn((r: object) => Promise.resolve({ ...r, id: 'r9' })),
    });
    manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(reviewRepoInManager) });
    ds = createMock<DataSource>({
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    });
    mediaRepo = createMock<MediaRepository>({ attachAndPublish: jest.fn() });
    placesRepo = createMock<PlacesRepository>({ recalculateRating: jest.fn() });
    sut = new ReviewsRepository(repo, ds, mediaRepo, placesRepo);
  });

  describe('existsByUser', () => {
    it('tra đúng place_id/user_id', async () => {
      await sut.existsByUser('p1', 'u1');
      expect(repo.exists).toHaveBeenCalledWith({ where: { placeId: 'p1', userId: 'u1' } });
    });
  });

  describe('existsPublished (WF-12/T3, M5)', () => {
    it('tra đúng id + status=published', async () => {
      await sut.existsPublished('r1');
      expect(repo.exists).toHaveBeenCalledWith({ where: { id: 'r1', status: ReviewStatus.PUBLISHED } });
    });
  });

  describe('createWithMedia', () => {
    it('không media_ids → tạo review published, KHÔNG gọi attachAndPublish, vẫn recalculateRating trong CÙNG transaction', async () => {
      const result = await sut.createWithMedia({
        placeId: 'p1',
        userId: 'u1',
        rating: 5,
        content: 'Đẹp',
        mediaIds: [],
      });

      expect(reviewRepoInManager.create).toHaveBeenCalledWith({
        placeId: 'p1',
        userId: 'u1',
        rating: 5,
        content: 'Đẹp',
        status: ReviewStatus.PUBLISHED,
      });
      expect(mediaRepo.attachAndPublish).not.toHaveBeenCalled();
      expect(placesRepo.recalculateRating).toHaveBeenCalledWith('p1', manager);
      expect(result.review.id).toBe('r9');
      expect(result.publishedMediaIds).toEqual([]);
    });

    it('có media_ids, TẤT CẢ hợp lệ → attachAndPublish trả đủ số lượng, không rollback', async () => {
      mediaRepo.attachAndPublish.mockResolvedValue(['m1', 'm2']);

      const result = await sut.createWithMedia({
        placeId: 'p1',
        userId: 'u1',
        rating: 4,
        content: null,
        mediaIds: ['m1', 'm2'],
      });

      expect(mediaRepo.attachAndPublish).toHaveBeenCalledWith(manager, ['m1', 'm2'], 'r9', 'u1');
      expect(result.publishedMediaIds).toEqual(['m1', 'm2']);
      expect(placesRepo.recalculateRating).toHaveBeenCalledWith('p1', manager);
    });

    it('MỘT media_id không hợp lệ (attachAndPublish trả về ít hơn) → ném UnprocessableEntityException, KHÔNG recalculateRating (INV-14, toàn bộ-hoặc-không-gì)', async () => {
      mediaRepo.attachAndPublish.mockResolvedValue(['m1']); // chỉ 1/2

      await expect(
        sut.createWithMedia({ placeId: 'p1', userId: 'u1', rating: 4, content: null, mediaIds: ['m1', 'm2'] }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(placesRepo.recalculateRating).not.toHaveBeenCalled();
    });

    it('lỗi bên trong transaction ném ra ngoài createWithMedia (TypeORM tự rollback — xác nhận propagation, không nuốt lỗi)', async () => {
      mediaRepo.attachAndPublish.mockRejectedValue(new Error('DB lỗi'));

      await expect(
        sut.createWithMedia({ placeId: 'p1', userId: 'u1', rating: 4, content: null, mediaIds: ['m1'] }),
      ).rejects.toThrow('DB lỗi');
    });

    it('dùng ĐÚNG MỘT transaction cho toàn bộ (ds.transaction chỉ gọi 1 lần)', async () => {
      mediaRepo.attachAndPublish.mockResolvedValue(['m1']);
      await sut.createWithMedia({ placeId: 'p1', userId: 'u1', rating: 4, content: null, mediaIds: ['m1'] });
      expect(ds.transaction).toHaveBeenCalledTimes(1);
    });
  });
});
