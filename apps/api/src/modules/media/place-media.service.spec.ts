import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaStatus } from './media.enums';
import type { ModerationReportsService } from '../moderation/moderation-reports.service';
import type { ModerationCasesRepository } from '../moderation/repositories/moderation-cases.repository';
import type { AuditService } from '../../core/audit/audit.service';
import { ModerationTargetType } from '../moderation/moderation.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Owner Place Photos (2026-08-11) — ảnh do chủ/quản lý cơ sở đăng.
// Quyết định sản phẩm (chốt, MVP): KHÔNG BAO GIỜ tự công khai. upload -> pending -> moderator
// duyệt/từ chối. File này canh phần nghiệp vụ của MediaService; ranh giới PHÂN QUYỀN thật được
// chứng minh ở place-media.e2e-spec.ts (Postgres thật, đi qua guard thật).
describe('MediaService — ảnh của cơ sở (Owner Place Photos)', () => {
  const USER_ID = 'user-1';
  const PLACE_ID = 'place-1';
  const VALID_CHECKSUM = 'a'.repeat(64);

  let storage: LooseMock<import('../../core/storage/storage.service').StorageService>;
  let mediaUrl: LooseMock<import('../../core/media-url/media-url.service').MediaUrlService>;
  let redisClient: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let redis: LooseMock<import('../../core/redis/redis.service').RedisService>;
  let mediaRepo: LooseMock<import('./repositories/media.repository').MediaRepository>;
  let ds: LooseMock<import('typeorm').DataSource>;
  let moderationReports: LooseMock<ModerationReportsService>;
  let moderationCases: LooseMock<ModerationCasesRepository>;
  let audit: LooseMock<AuditService>;
  let service: MediaService;

  const placeSession = {
    userId: USER_ID,
    contentType: 'image/jpeg',
    size: 1000,
    checksumSha256: VALID_CHECKSUM,
    placeId: PLACE_ID,
  };

  function createdMedia(id: string) {
    return {
      id,
      status: MediaStatus.PENDING,
      objectKey: 'media/abc.jpg',
      url: null,
      thumbnailUrl: null,
      caption: null,
      altText: null,
      type: 'image',
    };
  }

  beforeEach(() => {
    storage = createMock<import('../../core/storage/storage.service').StorageService>({
      createPresignedPutUrl: jest.fn().mockResolvedValue({
        key: 'media/abc.jpg',
        uploadUrl: 'https://storage/put',
        expiresIn: 600,
      }),
      createPresignedGetUrl: jest.fn().mockResolvedValue('https://signed.example/obj'),
      verifyUploadedObject: jest.fn().mockResolvedValue({ ok: true }),
      deleteObject: jest.fn(),
    });
    Object.defineProperty(storage, 'bucketName', { value: 'bucket', configurable: true });
    Object.defineProperty(storage, 'presignGetTtl', { value: 300, configurable: true });

    mediaUrl = createMock<import('../../core/media-url/media-url.service').MediaUrlService>({
      fileUrl: jest.fn((id: string) => `https://api/media/${id}/file`),
      placeMediaFileUrl: jest.fn((p: string, id: string) => `https://api/places/${p}/media/${id}/file`),
      moderationFileUrl: jest.fn((id: string) => `https://api/media/${id}/moderation-file`),
    });

    redisClient = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    redis = createMock<import('../../core/redis/redis.service').RedisService>({
      getClient: jest.fn().mockReturnValue(redisClient),
    });

    mediaRepo = createMock<import('./repositories/media.repository').MediaRepository>({
      placeExists: jest.fn().mockResolvedValue(true),
      findByUploaderAndChecksum: jest.fn().mockResolvedValue(null),
      createUploaded: jest.fn(),
      findAnyStatusObjectKey: jest.fn(),
      listAllByPlace: jest.fn().mockResolvedValue([]),
      existsForPlace: jest.fn(),
      softDeletePlaceMedia: jest.fn(),
      getCoverImageId: jest.fn().mockResolvedValue(null),
      clearCoverImageByMedia: jest.fn(),
      listIdsForPlaceForUpdate: jest.fn().mockResolvedValue([]),
      reorderPlaceMedia: jest.fn().mockResolvedValue([]),
      setPlaceCoverImage: jest.fn(),
      updatePlaceMediaMetadata: jest.fn(),
    });

    ds = createMock<import('typeorm').DataSource>({
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb({ fakeManager: true })),
    });
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

  describe('presignForPlace', () => {
    const dto = { content_type: 'image/jpeg' as const, size: 1000, checksum_sha256: VALID_CHECKSUM };

    it('cơ sở không tồn tại -> 422, KHÔNG tạo presigned URL', async () => {
      mediaRepo.placeExists.mockResolvedValue(false);
      await expect(service.presignForPlace(dto, USER_ID, PLACE_ID)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(storage.createPresignedPutUrl).not.toHaveBeenCalled();
    });

    // placeId bị KHOÁ vào phiên presign ngay tại thời điểm quyền vừa được guard kiểm tra — đây là
    // lý do register() không cần (và không được) tin bất cứ place id nào client gửi sau đó.
    it('ghi placeId ĐÃ ĐƯỢC CẤP QUYỀN vào phiên presign', async () => {
      await service.presignForPlace(dto, USER_ID, PLACE_ID);
      const session = JSON.parse(redisClient.set.mock.calls[0][1] as string);
      expect(session).toMatchObject({ userId: USER_ID, placeId: PLACE_ID });
    });

    it('không trả object key nội bộ nào ngoài key đã sinh + upload_url', async () => {
      const res = await service.presignForPlace(dto, USER_ID, PLACE_ID);
      expect(Object.keys(res).sort()).toEqual(['expires_in', 'key', 'upload_url']);
    });
  });

  describe('register — ảnh gắn cơ sở', () => {
    beforeEach(() => {
      redisClient.get.mockResolvedValue(JSON.stringify(placeSession));
      mediaRepo.createUploaded.mockResolvedValue(createdMedia('m1') as never);
    });

    it('ảnh vào PENDING và KHÔNG phát url công khai', async () => {
      const res = await service.register({ key: 'media/abc.jpg' }, USER_ID);
      expect(res.status).toBe(MediaStatus.PENDING);
      expect(res.url).toBeNull();
    });

    it('gắn placeId TỪ SESSION (không phải từ body của client)', async () => {
      await service.register({ key: 'media/abc.jpg' }, USER_ID);
      expect(mediaRepo.createUploaded.mock.calls[0][1]).toMatchObject({ placeId: PLACE_ID });
    });

    // Nếu case được tạo NGOÀI transaction, một sự cố giữa chừng để lại ảnh pending mà không có
    // case nào — tức ảnh mắc kẹt vĩnh viễn, đúng lỗ hổng ADR-018 §Context từng mô tả với ảnh review.
    it('tạo case new_content TRONG CÙNG transaction với dòng media', async () => {
      await service.register({ key: 'media/abc.jpg' }, USER_ID);

      expect(moderationCases.createOpenCase).toHaveBeenCalledTimes(1);
      const [manager, data] = moderationCases.createOpenCase.mock.calls[0];
      expect(manager).toEqual({ fakeManager: true });
      expect(mediaRepo.createUploaded.mock.calls[0][0]).toEqual(manager);
      expect(data).toEqual({
        targetType: ModerationTargetType.MEDIA,
        targetId: 'm1',
        source: 'new_content',
        severity: 'low',
        priority: 0,
      });
    });

    it('ghi audit media.place_submitted sau commit', async () => {
      await service.register({ key: 'media/abc.jpg' }, USER_ID);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'media.place_submitted',
          entityType: 'media',
          entityId: 'm1',
          actorId: USER_ID,
        }),
      );
    });
  });

  describe('register — ảnh mồ côi (review) giữ NGUYÊN hành vi cũ', () => {
    it('placeId null -> KHÔNG tạo case, KHÔNG ghi audit place_submitted', async () => {
      redisClient.get.mockResolvedValue(JSON.stringify({ ...placeSession, placeId: null }));
      mediaRepo.createUploaded.mockResolvedValue(createdMedia('m2') as never);

      await service.register({ key: 'media/abc.jpg' }, USER_ID);

      expect(moderationCases.createOpenCase).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('listForPlaceOwner', () => {
    it('trả MỌI trạng thái + URL nội bộ theo cơ sở', async () => {
      mediaRepo.listAllByPlace.mockResolvedValue([
        {
          id: 'm1',
          status: MediaStatus.PENDING,
          caption: null,
          altText: null,
          createdAt: new Date('2026-08-11T00:00:00Z'),
        },
        {
          id: 'm2',
          status: MediaStatus.REJECTED,
          caption: 'x',
          altText: null,
          createdAt: new Date('2026-08-10T00:00:00Z'),
        },
      ] as never);

      const res = await service.listForPlaceOwner(PLACE_ID);

      expect(res.map((r) => r.status)).toEqual([MediaStatus.PENDING, MediaStatus.REJECTED]);
      expect(res[0].url).toBe(`https://api/places/${PLACE_ID}/media/m1/file`);
    });

    it('đánh dấu ĐÚNG một ảnh là bìa, theo places.cover_image_id', async () => {
      mediaRepo.getCoverImageId.mockResolvedValue('m2');
      mediaRepo.listAllByPlace.mockResolvedValue([
        { id: 'm1', status: MediaStatus.PUBLISHED, caption: null, altText: null, createdAt: new Date(), sortOrder: 0 },
        { id: 'm2', status: MediaStatus.PUBLISHED, caption: null, altText: null, createdAt: new Date(), sortOrder: 1 },
      ] as never);

      const res = await service.listForPlaceOwner(PLACE_ID);

      expect(res.map((r) => r.is_cover)).toEqual([false, true]);
      expect(res.map((r) => r.sort_order)).toEqual([0, 1]);
    });

    it('cơ sở chưa chọn bìa -> không ảnh nào is_cover', async () => {
      mediaRepo.getCoverImageId.mockResolvedValue(null);
      mediaRepo.listAllByPlace.mockResolvedValue([
        { id: 'm1', status: MediaStatus.PENDING, caption: null, altText: null, createdAt: new Date(), sortOrder: null },
      ] as never);

      const res = await service.listForPlaceOwner(PLACE_ID);

      expect(res[0].is_cover).toBe(false);
      expect(res[0].sort_order).toBeNull();
    });

    it('không rò object_key/bucket/checksum ra response', async () => {
      mediaRepo.listAllByPlace.mockResolvedValue([
        {
          id: 'm1',
          status: MediaStatus.PENDING,
          caption: null,
          altText: null,
          createdAt: new Date('2026-08-11T00:00:00Z'),
          objectKey: 'media/secret.jpg',
          bucket: 'private-bucket',
          checksumSha256: VALID_CHECKSUM,
        },
      ] as never);

      const res = await service.listForPlaceOwner(PLACE_ID);

      const serialized = JSON.stringify(res);
      expect(serialized).not.toContain('media/secret.jpg');
      expect(serialized).not.toContain('private-bucket');
      expect(serialized).not.toContain(VALID_CHECKSUM);
    });
  });

  describe('removeFromPlace', () => {
    it('ảnh không thuộc cơ sở này -> 404, KHÔNG ghi audit', async () => {
      mediaRepo.softDeletePlaceMedia.mockResolvedValue(false);
      await expect(service.removeFromPlace(PLACE_ID, 'm-other', USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });

    // (placeId, mediaId) đi THẲNG vào WHERE của UPDATE — không có khe TOCTOU giữa kiểm tra và ghi.
    it('gỡ thành công -> xoá mềm theo (placeId, mediaId) + audit', async () => {
      mediaRepo.softDeletePlaceMedia.mockResolvedValue(true);
      await service.removeFromPlace(PLACE_ID, 'm1', USER_ID);
      expect(mediaRepo.softDeletePlaceMedia).toHaveBeenCalledWith(PLACE_ID, 'm1', { fakeManager: true });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'media.place_removed', entityId: 'm1' }),
      );
    });

    // Gỡ ảnh + dọn con trỏ ảnh bìa phải là MỘT đơn vị nguyên tử: nếu tách ra, một sự cố giữa chừng
    // để lại `places.cover_image_id` trỏ vào ảnh đã xoá.
    it('gỡ ảnh -> dọn con trỏ ảnh bìa trong CÙNG transaction', async () => {
      mediaRepo.softDeletePlaceMedia.mockResolvedValue(true);
      await service.removeFromPlace(PLACE_ID, 'm1', USER_ID);
      expect(mediaRepo.clearCoverImageByMedia).toHaveBeenCalledWith('m1', { fakeManager: true });
    });

    it('không gỡ được gì -> KHÔNG đụng tới ảnh bìa', async () => {
      mediaRepo.softDeletePlaceMedia.mockResolvedValue(false);
      await expect(service.removeFromPlace(PLACE_ID, 'm-other', USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mediaRepo.clearCoverImageByMedia).not.toHaveBeenCalled();
    });
  });

  // Owner Cover & Photo Ordering (2026-08-12). Ranh giới PHÂN QUYỀN của hai luồng này được chứng
  // minh ở place-media-cover-order.e2e-spec.ts (Postgres thật, guard thật); ở đây là phần nghiệp vụ.
  describe('reorderPlaceMedia', () => {
    beforeEach(() => {
      mediaRepo.listIdsForPlaceForUpdate.mockResolvedValue(['m1', 'm2', 'm3']);
      mediaRepo.reorderPlaceMedia.mockResolvedValue(['m3', 'm1', 'm2']);
    });

    it('tập ĐẦY ĐỦ, không trùng -> ghi thứ tự trong transaction, giữ nguyên thứ tự client gửi', async () => {
      await service.reorderPlaceMedia(PLACE_ID, ['m3', 'm1', 'm2'], USER_ID);

      expect(ds.transaction).toHaveBeenCalledTimes(1);
      expect(mediaRepo.reorderPlaceMedia).toHaveBeenCalledWith({ fakeManager: true }, PLACE_ID, [
        'm3',
        'm1',
        'm2',
      ]);
      // Đọc tập hiện tại phải KHOÁ hàng, nếu không hai lần sắp đồng thời có thể lồng vào nhau.
      expect(mediaRepo.listIdsForPlaceForUpdate).toHaveBeenCalledWith({ fakeManager: true }, PLACE_ID);
    });

    it('id trùng lặp -> 422, KHÔNG ghi gì', async () => {
      await expect(service.reorderPlaceMedia(PLACE_ID, ['m1', 'm1', 'm2'], USER_ID)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(mediaRepo.reorderPlaceMedia).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('danh sách THIẾU ảnh -> 422, KHÔNG ghi gì', async () => {
      await expect(service.reorderPlaceMedia(PLACE_ID, ['m1', 'm2'], USER_ID)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(mediaRepo.reorderPlaceMedia).not.toHaveBeenCalled();
    });

    // Id của cơ sở khác không bao giờ nằm trong tập hiện tại của cơ sở này ⇒ lệch tập ⇒ 422.
    // (Lớp thứ hai: `place_id` nằm trong WHERE của chính câu UPDATE, xem media.repository.ts.)
    it('chèn id ảnh của cơ sở KHÁC -> 422, KHÔNG ghi gì', async () => {
      await expect(
        service.reorderPlaceMedia(PLACE_ID, ['m1', 'm2', 'foreign-media'], USER_ID),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(mediaRepo.reorderPlaceMedia).not.toHaveBeenCalled();
    });

    it('UPDATE không chạm hết số ảnh -> ném lỗi TRONG transaction (rollback), không audit', async () => {
      mediaRepo.reorderPlaceMedia.mockResolvedValue(['m3', 'm1']);
      await expect(service.reorderPlaceMedia(PLACE_ID, ['m3', 'm1', 'm2'], USER_ID)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('ghi audit media.place_reordered sau khi ghi xong', async () => {
      await service.reorderPlaceMedia(PLACE_ID, ['m3', 'm1', 'm2'], USER_ID);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'media.place_reordered', entityType: 'place', entityId: PLACE_ID }),
      );
    });
  });

  describe('setPlaceCover', () => {
    it('ảnh đủ điều kiện -> ghi cover + audit, trả lại danh sách đã đánh dấu', async () => {
      mediaRepo.setPlaceCoverImage.mockResolvedValue(true);
      mediaRepo.getCoverImageId.mockResolvedValue('m1');
      mediaRepo.listAllByPlace.mockResolvedValue([
        { id: 'm1', status: MediaStatus.PUBLISHED, caption: null, altText: null, createdAt: new Date(), sortOrder: 0 },
        { id: 'm2', status: MediaStatus.PUBLISHED, caption: null, altText: null, createdAt: new Date(), sortOrder: 1 },
      ] as never);

      const res = await service.setPlaceCover(PLACE_ID, 'm1', USER_ID);

      expect(mediaRepo.setPlaceCoverImage).toHaveBeenCalledWith(PLACE_ID, 'm1');
      expect(res.map((p) => p.is_cover)).toEqual([true, false]);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'place.cover_image_set', entityId: PLACE_ID }),
      );
    });

    // Không tiết lộ ảnh của cơ sở khác có tồn tại hay không — cùng khuôn `removeFromPlace`.
    it('ảnh không thuộc cơ sở này -> 404, KHÔNG audit', async () => {
      mediaRepo.setPlaceCoverImage.mockResolvedValue(false);
      mediaRepo.existsForPlace.mockResolvedValue(false);

      await expect(service.setPlaceCover(PLACE_ID, 'm-other', USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });

    // Ảnh CÓ thuộc cơ sở nhưng chưa duyệt/đã bị từ chối: chủ cơ sở đã thấy trạng thái đó trên màn
    // hình của mình, nên nói thẳng là hữu ích và không rò rỉ gì.
    it('ảnh thuộc cơ sở nhưng chưa published -> 422, KHÔNG audit', async () => {
      mediaRepo.setPlaceCoverImage.mockResolvedValue(false);
      mediaRepo.existsForPlace.mockResolvedValue(true);

      await expect(service.setPlaceCover(PLACE_ID, 'm-pending', USER_ID)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  // Owner Photo Metadata (2026-08-12).
  describe('updatePlaceMediaMetadata', () => {
    beforeEach(() => {
      mediaRepo.updatePlaceMediaMetadata.mockResolvedValue(true);
      mediaRepo.listAllByPlace.mockResolvedValue([
        {
          id: 'm1',
          status: MediaStatus.PENDING,
          caption: 'new caption',
          altText: null,
          createdAt: new Date('2026-08-12T00:00:00Z'),
          sortOrder: null,
        },
      ] as never);
    });

    it('cập nhật CẢ HAI trường -> gọi repository với giá trị đã trim, trả danh sách mới', async () => {
      const res = await service.updatePlaceMediaMetadata(
        PLACE_ID,
        'm1',
        { caption: '  new caption  ', alt_text: '  new alt  ' },
        USER_ID,
      );
      expect(mediaRepo.updatePlaceMediaMetadata).toHaveBeenCalledWith(PLACE_ID, 'm1', {
        caption: 'new caption',
        altText: 'new alt',
      });
      expect(res[0].caption).toBe('new caption');
    });

    it('chỉ gửi caption -> alt_text KHÔNG bị đụng (undefined, không phải null)', async () => {
      await service.updatePlaceMediaMetadata(PLACE_ID, 'm1', { caption: 'only caption' }, USER_ID);
      expect(mediaRepo.updatePlaceMediaMetadata).toHaveBeenCalledWith(PLACE_ID, 'm1', {
        caption: 'only caption',
        altText: undefined,
      });
    });

    it('chỉ gửi alt_text -> caption KHÔNG bị đụng', async () => {
      await service.updatePlaceMediaMetadata(PLACE_ID, 'm1', { alt_text: 'only alt' }, USER_ID);
      expect(mediaRepo.updatePlaceMediaMetadata).toHaveBeenCalledWith(PLACE_ID, 'm1', {
        caption: undefined,
        altText: 'only alt',
      });
    });

    it('chuỗi rỗng -> chuẩn hoá thành null (ý định xoá)', async () => {
      await service.updatePlaceMediaMetadata(PLACE_ID, 'm1', { caption: '   ', alt_text: '' }, USER_ID);
      expect(mediaRepo.updatePlaceMediaMetadata).toHaveBeenCalledWith(PLACE_ID, 'm1', {
        caption: null,
        altText: null,
      });
    });

    // `@IsOptional()` cho phép null lọt qua DTO — service PHẢI xử lý an toàn, không ném lỗi khi gọi
    // .trim() trên null.
    it('null lọt qua DTO -> coi như ý định xoá, KHÔNG ném lỗi', async () => {
      await service.updatePlaceMediaMetadata(
        PLACE_ID,
        'm1',
        { caption: null as unknown as string, alt_text: null as unknown as string },
        USER_ID,
      );
      expect(mediaRepo.updatePlaceMediaMetadata).toHaveBeenCalledWith(PLACE_ID, 'm1', {
        caption: null,
        altText: null,
      });
    });

    it('cả hai trường đều vắng mặt -> 400, KHÔNG gọi repository', async () => {
      await expect(service.updatePlaceMediaMetadata(PLACE_ID, 'm1', {}, USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mediaRepo.updatePlaceMediaMetadata).not.toHaveBeenCalled();
    });

    it('ảnh không thuộc cơ sở này (repository trả false) -> 404, KHÔNG audit', async () => {
      mediaRepo.updatePlaceMediaMetadata.mockResolvedValue(false);
      await expect(
        service.updatePlaceMediaMetadata(PLACE_ID, 'm-other', { caption: 'x' }, USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('ghi audit media.place_metadata_updated sau khi ghi thành công', async () => {
      await service.updatePlaceMediaMetadata(PLACE_ID, 'm1', { caption: 'x' }, USER_ID);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'media.place_metadata_updated',
          entityType: 'media',
          entityId: 'm1',
          actorId: USER_ID,
        }),
      );
    });

    // Trạng thái/thứ tự/bìa KHÔNG phải trách nhiệm của hàm này — chỉ repository.updatePlaceMediaMetadata
    // được gọi, không có lời gọi nào tới reorderPlaceMedia/setPlaceCoverImage/updateStatus.
    it('KHÔNG gọi bất kỳ hàm nào khác ngoài updatePlaceMediaMetadata + listAllByPlace + getCoverImageId', async () => {
      await service.updatePlaceMediaMetadata(PLACE_ID, 'm1', { caption: 'x' }, USER_ID);
      expect(mediaRepo.reorderPlaceMedia).not.toHaveBeenCalled();
      expect(mediaRepo.setPlaceCoverImage).not.toHaveBeenCalled();
      expect(mediaRepo.clearCoverImageByMedia).not.toHaveBeenCalled();
    });
  });

  describe('resolveInternalFileUrl', () => {
    it('phân giải ảnh ở BẤT KỲ trạng thái nào (kênh nội bộ, quyền đã gác ở controller)', async () => {
      mediaRepo.findAnyStatusObjectKey.mockResolvedValue('media/abc.jpg');
      await expect(service.resolveInternalFileUrl('m1')).resolves.toBe('https://signed.example/obj');
      expect(storage.createPresignedGetUrl).toHaveBeenCalledWith('media/abc.jpg');
    });

    it('không có object (đã xoá mềm / dòng nhúng) -> 404', async () => {
      mediaRepo.findAnyStatusObjectKey.mockResolvedValue(null);
      await expect(service.resolveInternalFileUrl('m1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
