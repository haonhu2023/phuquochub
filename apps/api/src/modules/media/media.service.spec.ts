import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaStatus } from './media.enums';
import type { ModerationReportsService } from '../moderation/moderation-reports.service';
import type { ModerationCasesRepository } from '../moderation/repositories/moderation-cases.repository';
import type { AuditService } from '../../core/audit/audit.service';
import { ModerationTargetType } from '../moderation/moderation.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('MediaService', () => {
  let storage: LooseMock<import('../../core/storage/storage.service').StorageService>;
  let mediaUrl: LooseMock<import('../../core/media-url/media-url.service').MediaUrlService>;
  let redis: LooseMock<import('../../core/redis/redis.service').RedisService>;
  let mediaRepo: LooseMock<import('./repositories/media.repository').MediaRepository>;
  let ds: LooseMock<import('typeorm').DataSource>;
  let moderationReports: LooseMock<ModerationReportsService>;
  let moderationCases: LooseMock<ModerationCasesRepository>;
  let audit: LooseMock<AuditService>;
  let redisClient: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
  let service: MediaService;

  const USER_ID = 'u1';
  const VALID_CHECKSUM = 'a'.repeat(64);

  beforeEach(() => {
    redisClient = { set: jest.fn(), get: jest.fn(), del: jest.fn() };
    storage = createMock<import('../../core/storage/storage.service').StorageService>({
      createPresignedPutUrl: jest.fn(),
      verifyUploadedObject: jest.fn(),
      deleteObject: jest.fn(),
      createPresignedGetUrl: jest.fn(),
      presignGetTtl: 300 as unknown as never,
      bucketName: 'phuquochub-test' as unknown as never,
    });
    mediaUrl = createMock<import('../../core/media-url/media-url.service').MediaUrlService>({
      fileUrl: jest.fn((id: string) => `https://phuquochub.com/api/media/${id}/file`),
    });
    redis = createMock<import('../../core/redis/redis.service').RedisService>({
      getClient: jest.fn().mockReturnValue(redisClient),
    });
    mediaRepo = createMock<import('./repositories/media.repository').MediaRepository>({
      placeExists: jest.fn(),
      findByUploaderAndChecksum: jest.fn(),
      createUploaded: jest.fn(),
      existsPublished: jest.fn(),
      findPublishedObjectKey: jest.fn(),
      findAnyStatusObjectKey: jest.fn(),
      listAllByPlace: jest.fn(),
      existsForPlace: jest.fn(),
      softDeletePlaceMedia: jest.fn(),
    });
    ds = createMock<import('typeorm').DataSource>({ transaction: jest.fn() });
    moderationReports = createMock<ModerationReportsService>({ report: jest.fn() });
    moderationCases = createMock<ModerationCasesRepository>({ createOpenCase: jest.fn() });
    audit = createMock<AuditService>({ record: jest.fn() });
    service = new MediaService(
      storage,
      mediaUrl,
      redis,
      mediaRepo,
      ds,
      moderationReports,
      moderationCases,
      audit,
    );
  });

  describe('presign', () => {
    const dto = { content_type: 'image/jpeg' as const, size: 1000, checksum_sha256: VALID_CHECKSUM };

    it('không place_id → không kiểm tra place, tạo key server-side dạng media/{uuid}.jpg', async () => {
      storage.createPresignedPutUrl.mockResolvedValue({ key: 'ignored', uploadUrl: 'https://x', expiresIn: 600 });
      await service.presign(dto, USER_ID);
      expect(mediaRepo.placeExists).not.toHaveBeenCalled();
      const [key, contentType] = storage.createPresignedPutUrl.mock.calls[0];
      expect(key).toMatch(/^media\/[0-9a-f-]{36}\.jpg$/);
      expect(contentType).toBe('image/jpeg');
    });

    // `place_id` trong body ĐÃ BỊ GỠ khỏi PresignMediaDto (Owner Place Photos): nó chỉ kiểm tra
    // "place có tồn tại" chứ không kiểm tra quyền. Ảnh của cơ sở giờ đi qua presignForPlace(),
    // nơi placeId đến từ route param đã qua PermissionsGuard.
    it('presign mồ côi KHÔNG BAO GIỜ gắn place — session lưu placeId null', async () => {
      storage.createPresignedPutUrl.mockResolvedValue({ key: 'media/abc.jpg', uploadUrl: 'https://x', expiresIn: 600 });
      await service.presign(dto, USER_ID);

      const session = JSON.parse(redisClient.set.mock.calls[0][1] as string);
      expect(session.placeId).toBeNull();
      expect(mediaRepo.placeExists).not.toHaveBeenCalled();
    });
  });

  describe('presignForPlace (ảnh của cơ sở)', () => {
    const dto = { content_type: 'image/jpeg' as const, size: 1000, checksum_sha256: VALID_CHECKSUM };

    it('cơ sở không tồn tại → UnprocessableEntityException, KHÔNG tạo presigned URL', async () => {
      mediaRepo.placeExists.mockResolvedValue(false);
      await expect(service.presignForPlace(dto, USER_ID, 'p1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(storage.createPresignedPutUrl).not.toHaveBeenCalled();
    });

    // placeId được KHOÁ vào phiên presign ngay lúc quyền vừa được kiểm tra — register() sau đó chỉ
    // đọc từ session, nên không có khe hở để tráo sang cơ sở khác giữa hai bước.
    it('cơ sở tồn tại → session ghi ĐÚNG placeId đã được cấp quyền', async () => {
      mediaRepo.placeExists.mockResolvedValue(true);
      storage.createPresignedPutUrl.mockResolvedValue({ key: 'media/x.jpg', uploadUrl: 'https://x', expiresIn: 600 });

      const res = await service.presignForPlace(dto, USER_ID, 'place-1');

      expect(res).toEqual({ key: 'media/x.jpg', upload_url: 'https://x', expires_in: 600 });
      const session = JSON.parse(redisClient.set.mock.calls[0][1] as string);
      expect(session.placeId).toBe('place-1');
      expect(session.userId).toBe(USER_ID);
    });

    it('lưu presign-session vào Redis, key theo ĐÚNG presigned.key trả về (không phải key nội bộ), TTL 900s', async () => {
      storage.createPresignedPutUrl.mockResolvedValue({ key: 'media/abc.jpg', uploadUrl: 'https://x', expiresIn: 600 });
      await service.presign(dto, USER_ID);

      expect(redisClient.set).toHaveBeenCalledWith(
        'media-presign:media/abc.jpg',
        expect.stringContaining(`"userId":"${USER_ID}"`),
        'EX',
        900,
      );
      const stored = JSON.parse(redisClient.set.mock.calls[0][1]);
      expect(stored).toEqual({
        userId: USER_ID,
        contentType: 'image/jpeg',
        size: 1000,
        checksumSha256: VALID_CHECKSUM,
        placeId: null,
      });
    });

    it('response KHÔNG BAO GIỜ chứa presigned URL trong bất kỳ trường log-able nào khác ngoài upload_url trả thẳng cho caller', async () => {
      storage.createPresignedPutUrl.mockResolvedValue({ key: 'media/x.jpg', uploadUrl: 'https://secret', expiresIn: 600 });
      const res = await service.presign(dto, USER_ID);
      expect(Object.keys(res).sort()).toEqual(['expires_in', 'key', 'upload_url']);
    });
  });

  describe('register', () => {
    const createDto = { key: 'media/abc.jpg' };
    const session = {
      userId: USER_ID,
      contentType: 'image/jpeg',
      size: 1000,
      checksumSha256: VALID_CHECKSUM,
      placeId: null,
    };

    beforeEach(() => {
      ds.transaction.mockImplementation((cb: (m: unknown) => unknown) => cb({ fakeManager: true }));
    });

    it('không có Redis presign-session → UnprocessableEntityException, không gọi verifyUploadedObject', async () => {
      redisClient.get.mockResolvedValue(null);
      await expect(service.register(createDto, USER_ID)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(storage.verifyUploadedObject).not.toHaveBeenCalled();
    });

    it('session thuộc user KHÁC → ForbiddenException, KHÔNG xoá session của người kia', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify({ ...session, userId: 'someone-else' }));
      await expect(service.register(createDto, USER_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(redisClient.del).not.toHaveBeenCalled();
      expect(storage.verifyUploadedObject).not.toHaveBeenCalled();
    });

    it('session hết hạn (Redis TTL tự xoá) → get() trả null → cùng lỗi 422 như "chưa từng presign"', async () => {
      redisClient.get.mockResolvedValue(null); // TTL expiry ⇒ ioredis GET trả null, không phân biệt được với "chưa presign"
      await expect(service.register(createDto, USER_ID)).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('dùng expected MIME/size/checksum từ Redis session, KHÔNG phải từ client input (CreateMediaDto không có các trường này)', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify(session));
      storage.verifyUploadedObject.mockResolvedValue({ ok: true });
      mediaRepo.findByUploaderAndChecksum.mockResolvedValue(null);
      mediaRepo.createUploaded.mockResolvedValue({ id: 'm1', status: MediaStatus.PENDING, url: null } as never);

      await service.register(createDto, USER_ID);

      expect(storage.verifyUploadedObject).toHaveBeenCalledWith({
        key: 'media/abc.jpg',
        expectedContentType: session.contentType,
        expectedSize: session.size,
        expectedChecksumSha256: session.checksumSha256,
      });
    });

    it('verifyUploadedObject thất bại → xoá Redis session, ném 422 với lý do, KHÔNG tạo row (object storage tự xoá object)', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify(session));
      storage.verifyUploadedObject.mockResolvedValue({ ok: false, reason: 'checksum_mismatch' });

      await expect(service.register(createDto, USER_ID)).rejects.toThrow(/checksum_mismatch/);
      expect(redisClient.del).toHaveBeenCalledWith('media-presign:media/abc.jpg');
      expect(mediaRepo.createUploaded).not.toHaveBeenCalled();
    });

    it('trùng checksum theo cùng người upload → xoá object vừa tải lên + xoá session + ConflictException, KHÔNG tạo row', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify(session));
      storage.verifyUploadedObject.mockResolvedValue({ ok: true });
      mediaRepo.findByUploaderAndChecksum.mockResolvedValue({ id: 'existing' } as never);

      await expect(service.register(createDto, USER_ID)).rejects.toBeInstanceOf(ConflictException);
      expect(storage.deleteObject).toHaveBeenCalledWith('media/abc.jpg');
      expect(redisClient.del).toHaveBeenCalledWith('media-presign:media/abc.jpg');
      expect(mediaRepo.createUploaded).not.toHaveBeenCalled();
    });

    it('thành công → tạo row trong transaction, xoá session, trả về shape toMedia() với url=null (pending)', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify(session));
      storage.verifyUploadedObject.mockResolvedValue({ ok: true });
      mediaRepo.findByUploaderAndChecksum.mockResolvedValue(null);
      mediaRepo.createUploaded.mockResolvedValue({
        id: 'm1',
        type: 'image',
        url: null,
        thumbnailUrl: null,
        caption: 'a caption',
        altText: null,
        status: MediaStatus.PENDING,
      } as never);

      const res = await service.register({ key: 'media/abc.jpg', caption: 'a caption' }, USER_ID);

      expect(ds.transaction).toHaveBeenCalledTimes(1);
      expect(mediaRepo.createUploaded).toHaveBeenCalledWith(
        { fakeManager: true },
        expect.objectContaining({
          objectKey: 'media/abc.jpg',
          bucket: 'phuquochub-test',
          contentType: session.contentType,
          sizeBytes: session.size,
          checksumSha256: session.checksumSha256,
          uploadedBy: USER_ID,
          placeId: null,
          caption: 'a caption',
        }),
      );
      expect(redisClient.del).toHaveBeenCalledWith('media-presign:media/abc.jpg');
      expect(res).toEqual({
        id: 'm1',
        type: 'image',
        url: null,
        thumbnail_url: null,
        caption: 'a caption',
        alt_text: null,
        status: MediaStatus.PENDING,
      });
    });
  });

  describe('report (WF-12/T3, M5)', () => {
    it('media không published (hoặc không tồn tại) -> 404, KHÔNG gọi ModerationReportsService', async () => {
      mediaRepo.existsPublished.mockResolvedValue(false);

      await expect(service.report('m1', { reason: 'spam' } as never, 'u1')).rejects.toThrow(NotFoundException);
      expect(moderationReports.report).not.toHaveBeenCalled();
    });

    it('media published -> uỷ quyền cho ModerationReportsService với targetType=media đúng targetId/reporterId/reason/description', async () => {
      mediaRepo.existsPublished.mockResolvedValue(true);

      await service.report('m1', { reason: 'offensive', description: 'xúc phạm' } as never, 'u1');

      expect(moderationReports.report).toHaveBeenCalledWith({
        targetType: ModerationTargetType.MEDIA,
        targetId: 'm1',
        reporterId: 'u1',
        reason: 'offensive',
        description: 'xúc phạm',
      });
    });

    it('description bỏ trống -> truyền null (không phải undefined)', async () => {
      mediaRepo.existsPublished.mockResolvedValue(true);

      await service.report('m1', { reason: 'spam' } as never, 'u1');

      expect(moderationReports.report).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
    });
  });

  // Secure Private Media (2026-08-10) — GET /media/{id}/file. Repository gộp MỌI trường hợp không
  // phục vụ được thành `null`; service biến `null` đó thành đúng một 404 không phân biệt.
  describe('resolveFileUrl', () => {
    const MEDIA_ID = '43ac8a28-a2ed-4076-995c-8536f365f13e';

    it('media published → ký GET URL cho ĐÚNG object_key và trả về', async () => {
      mediaRepo.findPublishedObjectKey.mockResolvedValue('media/abc.jpg');
      storage.createPresignedGetUrl.mockResolvedValue('https://signed.example/media/abc.jpg?sig=1');

      await expect(service.resolveFileUrl(MEDIA_ID)).resolves.toBe(
        'https://signed.example/media/abc.jpg?sig=1',
      );
      expect(mediaRepo.findPublishedObjectKey).toHaveBeenCalledWith(MEDIA_ID);
      expect(storage.createPresignedGetUrl).toHaveBeenCalledWith('media/abc.jpg');
    });

    // Repository trả `null` cho: không tồn tại, pending, hidden, rejected, đã xoá mềm, và dòng
    // không có object_key. Tất cả PHẢI ra cùng một 404 — và tuyệt đối KHÔNG được ký URL nào.
    it('repository trả null (không tồn tại/pending/hidden/rejected/đã xoá mềm) → 404, KHÔNG ký URL', async () => {
      mediaRepo.findPublishedObjectKey.mockResolvedValue(null);

      await expect(service.resolveFileUrl(MEDIA_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.createPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('SECURITY: thông điệp 404 không tiết lộ media có tồn tại hay đang ở trạng thái kiểm duyệt nào', async () => {
      mediaRepo.findPublishedObjectKey.mockResolvedValue(null);

      await expect(service.resolveFileUrl(MEDIA_ID)).rejects.toThrow('Không tìm thấy media');
    });

    it('fileUrlTtl phản ánh TTL của storage — Cache-Control không thể sống lâu hơn signed URL', () => {
      expect(service.fileUrlTtl).toBe(300);
    });
  });
});
