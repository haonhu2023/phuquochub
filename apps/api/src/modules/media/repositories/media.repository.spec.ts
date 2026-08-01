import { EntityManager, Repository } from 'typeorm';
import { MediaRepository } from './media.repository';
import { Media } from '../entities/media.entity';
import { MediaProvider, MediaStatus, MediaType } from '../media.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('MediaRepository.attachToReview', () => {
  let repo: LooseMock<Repository<Media>>;
  let sut: MediaRepository;

  beforeEach(() => {
    repo = createMock<Repository<Media>>({ query: jest.fn() });
    sut = new MediaRepository(repo);
  });

  it('mediaIds rỗng → không gọi DB', async () => {
    await sut.attachToReview([], 'r1', 'u1');
    expect(repo.query).not.toHaveBeenCalled();
  });

  it('chỉ gắn media MỒ CÔI của đúng người upload (chặn chiếm dụng media người khác)', async () => {
    repo.query.mockResolvedValue(undefined);

    await sut.attachToReview(['m1', 'm2'], 'r1', 'u1');

    const [query, params] = repo.query.mock.calls[0];
    const q = sql(query);
    expect(q).toContain('uploaded_by = $3');
    expect(q).toContain('place_id IS NULL');
    expect(q).toContain('review_id IS NULL');
    expect(q).toContain('post_id IS NULL');
    expect(q).toContain('business_id IS NULL');
    expect(q).toContain('event_id IS NULL');
    expect(params).toEqual(['r1', ['m1', 'm2'], 'u1']);
  });
});

// Media Upload Foundation (2026-07-30) — presign/register support methods.
describe('MediaRepository — Media Upload Foundation', () => {
  let repo: LooseMock<Repository<Media>>;
  let sut: MediaRepository;

  beforeEach(() => {
    repo = createMock<Repository<Media>>({ query: jest.fn(), findOne: jest.fn() });
    sut = new MediaRepository(repo);
  });

  describe('placeExists', () => {
    it('có dòng khớp (chưa xoá mềm) → true', async () => {
      repo.query.mockResolvedValue([{ '?column?': 1 }]);
      await expect(sut.placeExists('p1')).resolves.toBe(true);
      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).toContain('FROM places WHERE id = $1 AND deleted_at IS NULL');
      expect(params).toEqual(['p1']);
    });

    it('không có dòng khớp (không tồn tại hoặc đã xoá mềm) → false', async () => {
      repo.query.mockResolvedValue([]);
      await expect(sut.placeExists('p1')).resolves.toBe(false);
    });
  });

  describe('findByUploaderAndChecksum', () => {
    it('tìm theo đúng uploaded_by + checksum_sha256, loại trừ đã xoá mềm', async () => {
      repo.findOne.mockResolvedValue({ id: 'm1' });
      const res = await sut.findByUploaderAndChecksum('u1', 'a'.repeat(64));
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { uploadedBy: 'u1', checksumSha256: 'a'.repeat(64), deletedAt: expect.anything() },
      });
      expect(res).toEqual({ id: 'm1' });
    });

    it('không tìm thấy → null', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(sut.findByUploaderAndChecksum('u1', 'a'.repeat(64))).resolves.toBeNull();
    });
  });

  describe('createUploaded', () => {
    it('luôn tạo với type=image, provider=upload, status=pending, url=null (không bao giờ lưu URL)', async () => {
      const created = { id: 'm1' };
      const mediaTypeRepo = createMock<Repository<Media>>({
        create: jest.fn().mockImplementation((v) => v),
        save: jest.fn().mockResolvedValue(created),
      });
      const manager = createMock<EntityManager>({
        getRepository: jest.fn().mockReturnValue(mediaTypeRepo),
      });

      const res = await sut.createUploaded(manager, {
        objectKey: 'media/abc.jpg',
        bucket: 'phuquochub-test',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
        checksumSha256: 'a'.repeat(64),
        uploadedBy: 'u1',
        placeId: 'p1',
        caption: 'a caption',
        altText: null,
      });

      expect(mediaTypeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MediaType.IMAGE,
          url: null,
          provider: MediaProvider.UPLOAD,
          status: MediaStatus.PENDING,
          objectKey: 'media/abc.jpg',
          bucket: 'phuquochub-test',
          contentType: 'image/jpeg',
          sizeBytes: 1000,
          checksumSha256: 'a'.repeat(64),
          uploadedBy: 'u1',
          placeId: 'p1',
          caption: 'a caption',
          altText: null,
        }),
      );
      expect(res).toEqual(created);
    });
  });
});
