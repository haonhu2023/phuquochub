import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PlaceEditProposalPhotosService } from './place-edit-proposal-photos.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';
import type { PlaceEditProposalsService } from '../place-edit-proposals/place-edit-proposals.service';
import type { MediaRepository } from '../media/repositories/media.repository';
import type { ModerationCasesRepository } from '../moderation/repositories/moderation-cases.repository';
import type { EntityManager } from 'typeorm';

describe('PlaceEditProposalPhotosService', () => {
  let storage: LooseMock<import('../../core/storage/storage.service').StorageService>;
  let redis: LooseMock<import('../../core/redis/redis.service').RedisService>;
  let mediaUrl: LooseMock<import('../../core/media-url/media-url.service').MediaUrlService>;
  let proposalsService: LooseMock<PlaceEditProposalsService>;
  let mediaRepo: LooseMock<MediaRepository>;
  let moderationCases: LooseMock<ModerationCasesRepository>;
  let dataSource: LooseMock<import('typeorm').DataSource>;
  let manager: EntityManager;
  let redisClient: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
  let service: PlaceEditProposalPhotosService;

  const USER_ID = 'user-1';
  const PROPOSAL_ID = 'proposal-1';
  const VALID_CHECKSUM = 'a'.repeat(64);

  function mediaRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'media-1',
      status: 'pending',
      objectKey: 'media/abc.jpg',
      createdAt: new Date('2026-10-09T00:00:00Z'),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    manager = createMock<EntityManager>();
    redisClient = { set: jest.fn(), get: jest.fn(), del: jest.fn() };
    storage = createMock<import('../../core/storage/storage.service').StorageService>({
      createPresignedPutUrl: jest.fn(),
      verifyUploadedObject: jest.fn(),
      createPresignedGetUrl: jest.fn(),
      deleteObject: jest.fn(),
      presignGetTtl: 300 as unknown as never,
      bucketName: 'phuquochub-test' as unknown as never,
    });
    redis = createMock<import('../../core/redis/redis.service').RedisService>({
      getClient: jest.fn().mockReturnValue(redisClient),
    });
    mediaUrl = createMock<import('../../core/media-url/media-url.service').MediaUrlService>({
      placeEditProposalPhotoFileUrl: jest.fn((proposalId: string, id: string) => `https://x/place-edit-proposals/${proposalId}/media/${id}/file`),
    });
    proposalsService = createMock<PlaceEditProposalsService>({ getMine: jest.fn() });
    mediaRepo = createMock<MediaRepository>({
      listAllByProposal: jest.fn(),
      existsForProposal: jest.fn(),
      findAnyStatusObjectKey: jest.fn(),
      createUploaded: jest.fn(),
    });
    moderationCases = createMock<ModerationCasesRepository>({ createOpenCase: jest.fn() });
    dataSource = createMock<import('typeorm').DataSource>({
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    });
    service = new PlaceEditProposalPhotosService(mediaRepo, storage, redis, mediaUrl, proposalsService, moderationCases, dataSource);
  });

  describe('presign', () => {
    const dto = { content_type: 'image/jpeg' as const, size: 1000, checksum_sha256: VALID_CHECKSUM };

    it('không phải chủ đề xuất → NotFoundException (qua getMine), không tạo presigned URL', async () => {
      proposalsService.getMine.mockRejectedValue(new NotFoundException());
      await expect(service.presign(PROPOSAL_ID, USER_ID, dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.createPresignedPutUrl).not.toHaveBeenCalled();
    });

    it('đã đủ 3 ảnh → ConflictException, không tạo presigned URL', async () => {
      proposalsService.getMine.mockResolvedValue({} as never);
      mediaRepo.listAllByProposal.mockResolvedValue([mediaRow(), mediaRow({ id: 'm2' }), mediaRow({ id: 'm3' })] as never);
      await expect(service.presign(PROPOSAL_ID, USER_ID, dto)).rejects.toBeInstanceOf(ConflictException);
      expect(storage.createPresignedPutUrl).not.toHaveBeenCalled();
    });

    it('hợp lệ → key server-side dạng media/{uuid}.jpg (CÙNG tiền tố media/ của MediaService), lưu phiên Redis', async () => {
      proposalsService.getMine.mockResolvedValue({} as never);
      mediaRepo.listAllByProposal.mockResolvedValue([]);
      storage.createPresignedPutUrl.mockResolvedValue({ key: 'media/abc.jpg', uploadUrl: 'https://x', expiresIn: 600 });

      const result = await service.presign(PROPOSAL_ID, USER_ID, dto);

      const [key, contentType] = storage.createPresignedPutUrl.mock.calls[0];
      expect(key).toMatch(/^media\/[0-9a-f-]{36}\.jpg$/);
      expect(contentType).toBe('image/jpeg');
      expect(result).toEqual({ key: 'media/abc.jpg', upload_url: 'https://x', expires_in: 600 });

      const [sessionKey, sessionRaw] = redisClient.set.mock.calls[0];
      expect(sessionKey).toBe('pep-photo-presign:media/abc.jpg');
      expect(JSON.parse(sessionRaw)).toEqual({ userId: USER_ID, proposalId: PROPOSAL_ID, contentType: 'image/jpeg', size: 1000, checksumSha256: VALID_CHECKSUM });
    });
  });

  describe('register', () => {
    const KEY = 'media/abc.jpg';
    const dto = { key: KEY };
    function validSession(overrides: Record<string, unknown> = {}) {
      return JSON.stringify({ userId: USER_ID, proposalId: PROPOSAL_ID, contentType: 'image/jpeg', size: 1000, checksumSha256: VALID_CHECKSUM, ...overrides });
    }

    it('không có phiên presign → UnprocessableEntityException', async () => {
      redisClient.get.mockResolvedValue(null);
      await expect(service.register(PROPOSAL_ID, USER_ID, dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('phiên thuộc user khác → NotFoundException (không lộ tồn tại đề xuất của người khác)', async () => {
      redisClient.get.mockResolvedValue(validSession({ userId: 'someone-else' }));
      await expect(service.register(PROPOSAL_ID, USER_ID, dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('xác thực object thất bại → UnprocessableEntityException, xoá phiên, KHÔNG tạo media/case', async () => {
      redisClient.get.mockResolvedValue(validSession());
      storage.verifyUploadedObject.mockResolvedValue({ ok: false, reason: 'checksum_mismatch' });
      await expect(service.register(PROPOSAL_ID, USER_ID, dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(redisClient.del).toHaveBeenCalledWith('pep-photo-presign:' + KEY);
      expect(mediaRepo.createUploaded).not.toHaveBeenCalled();
    });

    it('hợp lệ → tạo media (status pending) VÀ mở case kiểm duyệt TRONG CÙNG transaction, trả về id/status/created_at', async () => {
      redisClient.get.mockResolvedValue(validSession());
      storage.verifyUploadedObject.mockResolvedValue({ ok: true });
      mediaRepo.createUploaded.mockResolvedValue(mediaRow() as never);

      const result = await service.register(PROPOSAL_ID, USER_ID, dto);

      expect(mediaRepo.createUploaded).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ objectKey: KEY, proposalId: PROPOSAL_ID, placeId: null, uploadedBy: USER_ID }),
      );
      expect(moderationCases.createOpenCase).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ targetType: 'media', targetId: 'media-1', source: 'new_content' }),
      );
      expect(redisClient.del).toHaveBeenCalledWith('pep-photo-presign:' + KEY);
      expect(result).toEqual({ id: 'media-1', status: 'pending', created_at: '2026-10-09T00:00:00.000Z' });
    });
  });

  describe('listMine', () => {
    it('không phải chủ đề xuất → NotFoundException', async () => {
      proposalsService.getMine.mockRejectedValue(new NotFoundException());
      await expect(service.listMine(PROPOSAL_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('trả đúng danh sách, url qua kênh của người gửi', async () => {
      proposalsService.getMine.mockResolvedValue({} as never);
      mediaRepo.listAllByProposal.mockResolvedValue([mediaRow()] as never);

      const result = await service.listMine(PROPOSAL_ID, USER_ID);

      expect(result).toEqual([{ id: 'media-1', status: 'pending', created_at: '2026-10-09T00:00:00.000Z', url: `https://x/place-edit-proposals/${PROPOSAL_ID}/media/media-1/file` }]);
    });
  });

  describe('resolveOwnerFileUrl', () => {
    it('không phải chủ đề xuất → NotFoundException, không gọi storage', async () => {
      proposalsService.getMine.mockRejectedValue(new NotFoundException());
      await expect(service.resolveOwnerFileUrl(PROPOSAL_ID, 'media-1', USER_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.createPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('ảnh không thuộc đề xuất này → NotFoundException', async () => {
      proposalsService.getMine.mockResolvedValue({} as never);
      mediaRepo.existsForProposal.mockResolvedValue(false);
      await expect(service.resolveOwnerFileUrl(PROPOSAL_ID, 'media-1', USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('hợp lệ, BẤT KỂ trạng thái kiểm duyệt (pending/rejected) → trả signed GET URL', async () => {
      proposalsService.getMine.mockResolvedValue({} as never);
      mediaRepo.existsForProposal.mockResolvedValue(true);
      mediaRepo.findAnyStatusObjectKey.mockResolvedValue('media/abc.jpg');
      storage.createPresignedGetUrl.mockResolvedValue('https://signed-url');

      const url = await service.resolveOwnerFileUrl(PROPOSAL_ID, 'media-1', USER_ID);

      expect(url).toBe('https://signed-url');
      expect(storage.createPresignedGetUrl).toHaveBeenCalledWith('media/abc.jpg');
    });
  });
});
