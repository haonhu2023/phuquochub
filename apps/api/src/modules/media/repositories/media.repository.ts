import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { Media } from '../entities/media.entity';
import { MediaProvider, MediaStatus, MediaType } from '../media.enums';

export interface NewUploadedMedia {
  objectKey: string;
  bucket: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  uploadedBy: string;
  placeId: string | null;
  caption: string | null;
  altText: string | null;
}

// Repository `media`. Sprint 2: chỉ đọc gallery Place (published) cho trang chi tiết.
// Media Upload Foundation (2026-07-30): thêm đường ghi (findByUploaderAndChecksum/createUploaded).
@Injectable()
export class MediaRepository {
  constructor(
    @InjectRepository(Media)
    private readonly repo: Repository<Media>,
  ) {}

  /** Gallery đã duyệt của một Place, theo sort_order (dùng partial index idx_media_place). */
  listPublishedByPlace(placeId: string): Promise<Media[]> {
    return this.repo.find({
      where: { placeId, status: MediaStatus.PUBLISHED, deletedAt: IsNull() },
      order: { sortOrder: 'ASC' },
    });
  }

  /** Chống trùng theo người upload (idx_media_uploader_checksum) — chỉ media chưa xoá mềm. */
  findByUploaderAndChecksum(uploadedBy: string, checksumSha256: string): Promise<Media | null> {
    return this.repo.findOne({ where: { uploadedBy, checksumSha256, deletedAt: IsNull() } });
  }

  /**
   * Kiểm tra place_id tồn tại (chưa xoá mềm) — dùng raw query trực tiếp trên `places` thay vì
   * tiêm PlacesRepository, vì PlacesModule đã import MediaModule (đọc gallery Place); tiêm ngược
   * lại sẽ tạo circular dependency. Cùng ngữ nghĩa PlacesRepository.existsById() (deleted_at IS
   * NULL), chỉ khác cách truy cập.
   */
  async placeExists(placeId: string): Promise<boolean> {
    const rows: unknown[] = await this.repo.query(
      'SELECT 1 FROM places WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [placeId],
    );
    return rows.length > 0;
  }

  /**
   * Tạo media row mới cho một upload đã xác thực. Luôn `status=pending`, `provider=upload`,
   * `url=null` (Design review §A — không bao giờ lưu URL tuyệt đối/signed; sinh động lúc đọc).
   * Nhận `manager` trực tiếp (không dùng `this.repo`) để caller kiểm soát transaction.
   */
  createUploaded(manager: EntityManager, data: NewUploadedMedia): Promise<Media> {
    const repo = manager.getRepository(Media);
    const media = repo.create({
      type: MediaType.IMAGE,
      url: null,
      provider: MediaProvider.UPLOAD,
      status: MediaStatus.PENDING,
      objectKey: data.objectKey,
      bucket: data.bucket,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
      checksumSha256: data.checksumSha256,
      uploadedBy: data.uploadedBy,
      placeId: data.placeId,
      caption: data.caption,
      altText: data.altText,
    });
    return repo.save(media);
  }

  /**
   * Gắn media MỒ CÔI (chưa thuộc arc nào) vào một review — chỉ media do chính `userId` upload,
   * tránh việc chiếm dụng media của người khác qua media_ids (ReviewsService.create).
   */
  async attachToReview(mediaIds: string[], reviewId: string, userId: string): Promise<void> {
    if (mediaIds.length === 0) return;
    await this.repo.query(
      `UPDATE media SET review_id = $1
       WHERE id = ANY($2) AND uploaded_by = $3 AND deleted_at IS NULL
         AND place_id IS NULL AND review_id IS NULL AND post_id IS NULL
         AND business_id IS NULL AND event_id IS NULL`,
      [reviewId, mediaIds, userId],
    );
  }
}
