import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { RealEstateListingPhotosService } from './real-estate-listing-photos.service';
import { RealEstateListingPhoto } from './entities/real-estate-listing-photo.entity';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';
import type { RealEstateListingsService } from '../real-estate-listings/real-estate-listings.service';
import type { RealEstateListingPhotosRepository } from './repositories/real-estate-listing-photos.repository';

jest.mock('./lib/image-location-risk', () => ({ imageMayExposeLocation: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { imageMayExposeLocation } = jest.requireMock('./lib/image-location-risk') as { imageMayExposeLocation: jest.Mock };

describe('RealEstateListingPhotosService', () => {
  let storage: LooseMock<import('../../core/storage/storage.service').StorageService>;
  let redis: LooseMock<import('../../core/redis/redis.service').RedisService>;
  let mediaUrl: LooseMock<import('../../core/media-url/media-url.service').MediaUrlService>;
  let listings: LooseMock<RealEstateListingsService>;
  let repo: LooseMock<RealEstateListingPhotosRepository>;
  let redisClient: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
  let service: RealEstateListingPhotosService;

  const USER_ID = 'owner-1';
  const LISTING_ID = 'rel-1';
  const VALID_CHECKSUM = 'a'.repeat(64);

  function photoRow(overrides: Partial<RealEstateListingPhoto> = {}): RealEstateListingPhoto {
    const row = new RealEstateListingPhoto();
    row.id = 'photo-1';
    row.listingId = LISTING_ID;
    row.objectKey = 'real-estate-listing-photos/abc.jpg';
    row.bucket = 'phuquochub-test';
    row.contentType = 'image/jpeg';
    row.sizeBytes = 1000;
    row.checksumSha256 = VALID_CHECKSUM;
    row.sortOrder = 0;
    row.uploadedBy = USER_ID;
    row.createdAt = new Date('2026-10-08T00:00:00Z');
    return Object.assign(row, overrides);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    redisClient = { set: jest.fn(), get: jest.fn(), del: jest.fn() };
    storage = createMock<import('../../core/storage/storage.service').StorageService>({
      createPresignedPutUrl: jest.fn(),
      verifyUploadedObject: jest.fn(),
      getObject: jest.fn(),
      deleteObject: jest.fn(),
      createPresignedGetUrl: jest.fn(),
      presignGetTtl: 300 as unknown as never,
      bucketName: 'phuquochub-test' as unknown as never,
    });
    redis = createMock<import('../../core/redis/redis.service').RedisService>({
      getClient: jest.fn().mockReturnValue(redisClient),
    });
    mediaUrl = createMock<import('../../core/media-url/media-url.service').MediaUrlService>({
      realEstateListingPhotoFileUrl: jest.fn((listingId: string, photoId: string) => `https://x/real-estate-listings/${listingId}/photos/${photoId}/file`),
      realEstateListingPhotoOwnerFileUrl: jest.fn((listingId: string, photoId: string) => `https://x/real-estate-listings/${listingId}/photos/${photoId}/owner-file`),
    });
    listings = createMock<RealEstateListingsService>({
      getMine: jest.fn(),
      getPublicById: jest.fn(),
    });
    repo = createMock<RealEstateListingPhotosRepository>({
      countByListing: jest.fn(),
      nextSortOrder: jest.fn(),
      listByListing: jest.fn(),
      findByIdAndListing: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
      maxPerListing: 10 as unknown as never,
    });
    service = new RealEstateListingPhotosService(repo, storage, redis, mediaUrl, listings);
  });

  describe('presign', () => {
    const dto = { content_type: 'image/jpeg' as const, size: 1000, checksum_sha256: VALID_CHECKSUM };

    it('không phải chủ tin → NotFoundException (qua getMine), không tạo presigned URL', async () => {
      listings.getMine.mockRejectedValue(new NotFoundException());
      await expect(service.presign(LISTING_ID, USER_ID, dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.createPresignedPutUrl).not.toHaveBeenCalled();
    });

    it('đã đủ số ảnh tối đa → ConflictException, không tạo presigned URL', async () => {
      listings.getMine.mockResolvedValue({ address_precision: 'area' });
      repo.countByListing.mockResolvedValue(10);
      await expect(service.presign(LISTING_ID, USER_ID, dto)).rejects.toBeInstanceOf(ConflictException);
      expect(storage.createPresignedPutUrl).not.toHaveBeenCalled();
    });

    it('hợp lệ → tạo key server-side dạng real-estate-listing-photos/{uuid}.jpg, lưu phiên Redis', async () => {
      listings.getMine.mockResolvedValue({ address_precision: 'area' });
      repo.countByListing.mockResolvedValue(0);
      storage.createPresignedPutUrl.mockResolvedValue({ key: 'real-estate-listing-photos/abc.jpg', uploadUrl: 'https://x', expiresIn: 600 });

      const result = await service.presign(LISTING_ID, USER_ID, dto);

      const [key, contentType] = storage.createPresignedPutUrl.mock.calls[0];
      expect(key).toMatch(/^real-estate-listing-photos\/[0-9a-f-]{36}\.jpg$/);
      expect(contentType).toBe('image/jpeg');
      expect(result).toEqual({ key: 'real-estate-listing-photos/abc.jpg', upload_url: 'https://x', expires_in: 600 });

      const [sessionKey, sessionRaw] = redisClient.set.mock.calls[0];
      expect(sessionKey).toBe('rel-photo-presign:real-estate-listing-photos/abc.jpg');
      expect(JSON.parse(sessionRaw)).toEqual({
        userId: USER_ID,
        listingId: LISTING_ID,
        contentType: 'image/jpeg',
        size: 1000,
        checksumSha256: VALID_CHECKSUM,
      });
    });
  });

  describe('register', () => {
    const KEY = 'real-estate-listing-photos/abc.jpg';
    const dto = { key: KEY };
    function validSession(overrides: Record<string, unknown> = {}) {
      return JSON.stringify({ userId: USER_ID, listingId: LISTING_ID, contentType: 'image/jpeg', size: 1000, checksumSha256: VALID_CHECKSUM, ...overrides });
    }

    it('không có phiên presign → UnprocessableEntityException', async () => {
      redisClient.get.mockResolvedValue(null);
      await expect(service.register(LISTING_ID, USER_ID, dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('phiên thuộc user khác → ForbiddenException, KHÔNG xoá phiên (chủ phiên vẫn còn thời gian)', async () => {
      redisClient.get.mockResolvedValue(validSession({ userId: 'someone-else' }));
      await expect(service.register(LISTING_ID, USER_ID, dto)).rejects.toBeInstanceOf(ForbiddenException);
      expect(redisClient.del).not.toHaveBeenCalled();
    });

    it('phiên thuộc đúng user nhưng tin khác → ForbiddenException', async () => {
      redisClient.get.mockResolvedValue(validSession({ listingId: 'other-listing' }));
      await expect(service.register(LISTING_ID, USER_ID, dto)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('xác thực object thất bại → UnprocessableEntityException, xoá phiên', async () => {
      redisClient.get.mockResolvedValue(validSession());
      storage.verifyUploadedObject.mockResolvedValue({ ok: false, reason: 'checksum_mismatch' });
      await expect(service.register(LISTING_ID, USER_ID, dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(redisClient.del).toHaveBeenCalledWith('rel-photo-presign:' + KEY);
      expect(listings.getMine).not.toHaveBeenCalled();
    });

    it('address_precision=area và ảnh có GPS EXIF → UnprocessableEntityException, xoá object + phiên, KHÔNG tạo dòng', async () => {
      redisClient.get.mockResolvedValue(validSession());
      storage.verifyUploadedObject.mockResolvedValue({ ok: true });
      listings.getMine.mockResolvedValue({ address_precision: 'area' });
      storage.getObject.mockResolvedValue(Buffer.from('fake-bytes'));
      imageMayExposeLocation.mockReturnValue(true);

      await expect(service.register(LISTING_ID, USER_ID, dto)).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(storage.deleteObject).toHaveBeenCalledWith(KEY);
      expect(redisClient.del).toHaveBeenCalledWith('rel-photo-presign:' + KEY);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('address_precision=exact → KHÔNG kiểm GPS EXIF (vị trí đã công khai, ảnh có GPS không thêm rủi ro)', async () => {
      redisClient.get.mockResolvedValue(validSession());
      storage.verifyUploadedObject.mockResolvedValue({ ok: true });
      listings.getMine.mockResolvedValue({ address_precision: 'exact' });
      repo.nextSortOrder.mockResolvedValue(0);
      repo.create.mockResolvedValue(photoRow());

      await service.register(LISTING_ID, USER_ID, dto);

      expect(storage.getObject).not.toHaveBeenCalled();
      expect(imageMayExposeLocation).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalled();
    });

    it('area + ảnh KHÔNG có GPS EXIF → tạo dòng thành công, trả về url ổn định qua mediaUrl', async () => {
      redisClient.get.mockResolvedValue(validSession());
      storage.verifyUploadedObject.mockResolvedValue({ ok: true });
      listings.getMine.mockResolvedValue({ address_precision: 'area' });
      storage.getObject.mockResolvedValue(Buffer.from('fake-bytes'));
      imageMayExposeLocation.mockReturnValue(false);
      repo.nextSortOrder.mockResolvedValue(3);
      repo.create.mockResolvedValue(photoRow({ sortOrder: 3 }));

      const result = await service.register(LISTING_ID, USER_ID, dto);

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ listingId: LISTING_ID, objectKey: KEY, sortOrder: 3, uploadedBy: USER_ID }));
      expect(redisClient.del).toHaveBeenCalledWith('rel-photo-presign:' + KEY);
      expect(result).toEqual({ id: 'photo-1', sort_order: 3, url: expect.stringContaining('/file'), created_at: expect.any(String) });
    });
  });

  describe('listPublic / listMine', () => {
    it('listPublic: tin không công khai → NotFoundException (qua getPublicById)', async () => {
      listings.getPublicById.mockRejectedValue(new NotFoundException());
      await expect(service.listPublic(LISTING_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('listPublic: trả ảnh theo thứ tự sort_order, url dùng kênh công khai', async () => {
      listings.getPublicById.mockResolvedValue({});
      repo.listByListing.mockResolvedValue([photoRow({ id: 'p1', sortOrder: 0 }), photoRow({ id: 'p2', sortOrder: 1 })]);
      const result = await service.listPublic(LISTING_ID);
      expect(result.map((r) => r.id)).toEqual(['p1', 'p2']);
      expect(mediaUrl.realEstateListingPhotoFileUrl).toHaveBeenCalledWith(LISTING_ID, 'p1');
    });

    it('listMine: không phải chủ tin → NotFoundException', async () => {
      listings.getMine.mockRejectedValue(new NotFoundException());
      await expect(service.listMine(LISTING_ID, USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('listMine: url dùng kênh chủ tin (owner-file), xem được bất kỳ trạng thái tin', async () => {
      listings.getMine.mockResolvedValue({});
      repo.listByListing.mockResolvedValue([photoRow()]);
      const result = await service.listMine(LISTING_ID, USER_ID);
      expect(mediaUrl.realEstateListingPhotoOwnerFileUrl).toHaveBeenCalledWith(LISTING_ID, 'photo-1');
      expect(result[0].url).toContain('/owner-file');
    });
  });

  describe('resolvePublicFileUrl / resolveOwnerFileUrl', () => {
    it('resolvePublicFileUrl: tin không công khai → NotFoundException, không gọi storage', async () => {
      listings.getPublicById.mockRejectedValue(new NotFoundException());
      await expect(service.resolvePublicFileUrl(LISTING_ID, 'photo-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.createPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('resolvePublicFileUrl: ảnh không thuộc tin này → NotFoundException', async () => {
      listings.getPublicById.mockResolvedValue({});
      repo.findByIdAndListing.mockResolvedValue(null);
      await expect(service.resolvePublicFileUrl(LISTING_ID, 'photo-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resolvePublicFileUrl: hợp lệ → trả signed GET URL của đúng object_key', async () => {
      listings.getPublicById.mockResolvedValue({});
      repo.findByIdAndListing.mockResolvedValue(photoRow());
      storage.createPresignedGetUrl.mockResolvedValue('https://signed-url');
      const url = await service.resolvePublicFileUrl(LISTING_ID, 'photo-1');
      expect(url).toBe('https://signed-url');
      expect(storage.createPresignedGetUrl).toHaveBeenCalledWith('real-estate-listing-photos/abc.jpg');
    });

    it('resolveOwnerFileUrl: không phải chủ tin → NotFoundException (qua getMine), không yêu cầu tin công khai', async () => {
      listings.getMine.mockRejectedValue(new NotFoundException());
      await expect(service.resolveOwnerFileUrl(LISTING_ID, 'photo-1', USER_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(listings.getPublicById).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('không phải chủ tin → NotFoundException, không xoá object', async () => {
      listings.getMine.mockRejectedValue(new NotFoundException());
      await expect(service.remove(LISTING_ID, 'photo-1', USER_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it('ảnh không tồn tại/không thuộc tin → NotFoundException', async () => {
      listings.getMine.mockResolvedValue({});
      repo.findByIdAndListing.mockResolvedValue(null);
      await expect(service.remove(LISTING_ID, 'photo-1', USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('hợp lệ → xoá object storage rồi xoá dòng DB', async () => {
      listings.getMine.mockResolvedValue({});
      const row = photoRow();
      repo.findByIdAndListing.mockResolvedValue(row);
      await service.remove(LISTING_ID, 'photo-1', USER_ID);
      expect(storage.deleteObject).toHaveBeenCalledWith(row.objectKey);
      expect(repo.remove).toHaveBeenCalledWith(row.id);
    });
  });
});
