import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageService } from '../../core/storage/storage.service';
import { MediaUrlService } from '../../core/media-url/media-url.service';
import { RedisService } from '../../core/redis/redis.service';
import { RealEstateListingsService } from '../real-estate-listings/real-estate-listings.service';
import { RealEstateListingPhotosRepository } from './repositories/real-estate-listing-photos.repository';
import { AllowedListingPhotoMimeType, PresignRealEstateListingPhotoDto, RegisterRealEstateListingPhotoDto } from './dto/real-estate-listing-photos.dto';
import { toRealEstateListingPhotoView } from './real-estate-listing-photos.mapper';
import { imageMayExposeLocation } from './lib/image-location-risk';

const MIME_TO_EXTENSION: Record<AllowedListingPhotoMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const PRESIGN_SESSION_PREFIX = 'rel-photo-presign:';
// Cùng lý do PRESIGN_SESSION_TTL_SECONDS của media.service.ts — dài hơn 600s của chính signed PUT
// URL một chút, để client upload sát rìa hạn vẫn còn thời gian gọi register.
const PRESIGN_SESSION_TTL_SECONDS = 900;

interface PresignSession {
  userId: string;
  listingId: string;
  contentType: string;
  size: number;
  checksumSha256: string;
}

/**
 * "Ảnh cho bất động sản" (mục V đợt 4) — tái dùng `StorageService` (entity-agnostic, xác nhận qua
 * đọc toàn văn) trực tiếp, KHÔNG qua `MediaService`/bảng `media` (place-coupled, có hàng chờ kiểm
 * duyệt riêng cho ảnh — không khớp vòng đời của real_estate_listings, đã có vòng đời duyệt của
 * chính nó). Cùng pattern đã dùng cho saved_items/listing_reports: hạ tầng MỚI, hẹp, chỉ tái dùng
 * phần THẬT SỰ dùng chung.
 *
 * Không có hàng chờ kiểm duyệt ảnh riêng — ảnh hiển thị công khai theo đúng trạng thái CỦA TIN nó
 * thuộc về (xem listPublic/getPublicById dưới), y hệt cách address/contact của listing đã hiển thị.
 */
@Injectable()
export class RealEstateListingPhotosService {
  constructor(
    private readonly repo: RealEstateListingPhotosRepository,
    private readonly storage: StorageService,
    private readonly redis: RedisService,
    private readonly mediaUrl: MediaUrlService,
    private readonly listings: RealEstateListingsService,
  ) {}

  private sessionKey(objectKey: string): string {
    return `${PRESIGN_SESSION_PREFIX}${objectKey}`;
  }

  async presign(listingId: string, userId: string, dto: PresignRealEstateListingPhotoDto) {
    await this.listings.getMine(listingId, userId); // Ném NotFoundException nếu không phải chủ tin.

    const existing = await this.repo.countByListing(listingId);
    if (existing >= this.repo.maxPerListing) {
      throw new ConflictException(`Tối đa ${this.repo.maxPerListing} ảnh mỗi tin — hãy xoá ảnh cũ trước khi thêm ảnh mới`);
    }

    const generatedKey = `real-estate-listing-photos/${randomUUID()}.${MIME_TO_EXTENSION[dto.content_type]}`;
    const presigned = await this.storage.createPresignedPutUrl(generatedKey, dto.content_type);

    const session: PresignSession = {
      userId,
      listingId,
      contentType: dto.content_type,
      size: dto.size,
      checksumSha256: dto.checksum_sha256,
    };
    await this.redis
      .getClient()
      .set(this.sessionKey(presigned.key), JSON.stringify(session), 'EX', PRESIGN_SESSION_TTL_SECONDS);

    return { key: presigned.key, upload_url: presigned.uploadUrl, expires_in: presigned.expiresIn };
  }

  async register(listingId: string, userId: string, dto: RegisterRealEstateListingPhotoDto) {
    const sessionKey = this.sessionKey(dto.key);
    const raw = await this.redis.getClient().get(sessionKey);
    if (!raw) {
      throw new UnprocessableEntityException(
        'Không có phiên presign hợp lệ cho key này (chưa từng presign, đã đăng ký, hoặc đã hết hạn)',
      );
    }

    const session = JSON.parse(raw) as PresignSession;
    if (session.userId !== userId || session.listingId !== listingId) {
      throw new ForbiddenException('Phiên presign này không thuộc về bạn hoặc không thuộc tin này');
    }

    const verification = await this.storage.verifyUploadedObject({
      key: dto.key,
      expectedContentType: session.contentType,
      expectedSize: session.size,
      expectedChecksumSha256: session.checksumSha256,
    });
    if (!verification.ok) {
      await this.redis.getClient().del(sessionKey);
      throw new UnprocessableEntityException(`Xác thực object thất bại: ${verification.reason}`);
    }

    // "Không chỉ ẩn marker; kiểm metadata ảnh khi có nguy cơ lộ vị trí" — tin chỉ hiển thị khu vực
    // chung (address_precision != 'exact') thì ảnh không được mang GPS EXIF, nếu không marker ẩn
    // trên bản đồ vô nghĩa (file ảnh tự nó lộ toạ độ).
    const listing = await this.listings.getMine(listingId, userId);
    if (listing.address_precision !== 'exact') {
      const bytes = await this.storage.getObject(dto.key);
      if (imageMayExposeLocation(bytes, session.contentType)) {
        await this.storage.deleteObject(dto.key);
        await this.redis.getClient().del(sessionKey);
        throw new UnprocessableEntityException(
          'Ảnh này có chứa toạ độ GPS (EXIF) — tin đang hiển thị khu vực chung, không hiển thị vị trí chính xác. Hãy dùng ảnh khác (đã tắt lưu vị trí khi chụp), hoặc đổi "mức chi tiết vị trí" của tin thành vị trí chính xác.',
        );
      }
    }

    const sortOrder = await this.repo.nextSortOrder(listingId);
    const created = await this.repo.create({
      listingId,
      objectKey: dto.key,
      bucket: this.storage.bucketName,
      contentType: session.contentType,
      sizeBytes: session.size,
      checksumSha256: session.checksumSha256,
      sortOrder,
      uploadedBy: userId,
    });

    await this.redis.getClient().del(sessionKey);
    return toRealEstateListingPhotoView(created, (photoId) => this.mediaUrl.realEstateListingPhotoFileUrl(listingId, photoId));
  }

  async listPublic(listingId: string) {
    await this.listings.getPublicById(listingId); // Ném NotFoundException nếu tin không công khai.
    const rows = await this.repo.listByListing(listingId);
    return rows.map((row) => toRealEstateListingPhotoView(row, (photoId) => this.mediaUrl.realEstateListingPhotoFileUrl(listingId, photoId)));
  }

  async listMine(listingId: string, userId: string) {
    await this.listings.getMine(listingId, userId);
    const rows = await this.repo.listByListing(listingId);
    return rows.map((row) => toRealEstateListingPhotoView(row, (photoId) => this.mediaUrl.realEstateListingPhotoOwnerFileUrl(listingId, photoId)));
  }

  private async findOwnedPhoto(listingId: string, photoId: string, userId: string) {
    await this.listings.getMine(listingId, userId);
    const row = await this.repo.findByIdAndListing(photoId, listingId);
    if (!row) throw new NotFoundException('Không tìm thấy ảnh');
    return row;
  }

  /** Kênh CÔNG KHAI — chỉ phân giải khi tin đang công khai VÀ ảnh thuộc đúng tin đó. */
  async resolvePublicFileUrl(listingId: string, photoId: string): Promise<string> {
    await this.listings.getPublicById(listingId);
    const row = await this.repo.findByIdAndListing(photoId, listingId);
    if (!row) throw new NotFoundException('Không tìm thấy ảnh');
    return this.storage.createPresignedGetUrl(row.objectKey);
  }

  /** Kênh CHỦ TIN — xem ảnh của chính mình ở BẤT KỲ trạng thái tin (nháp/chờ duyệt/đã đóng...). */
  async resolveOwnerFileUrl(listingId: string, photoId: string, userId: string): Promise<string> {
    const row = await this.findOwnedPhoto(listingId, photoId, userId);
    return this.storage.createPresignedGetUrl(row.objectKey);
  }

  get fileUrlTtl(): number {
    return this.storage.presignGetTtl;
  }

  async remove(listingId: string, photoId: string, userId: string): Promise<void> {
    const row = await this.findOwnedPhoto(listingId, photoId, userId);
    await this.storage.deleteObject(row.objectKey);
    await this.repo.remove(row.id);
  }
}
