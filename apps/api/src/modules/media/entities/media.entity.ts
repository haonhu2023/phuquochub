import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MediaLicenseType, MediaProvider, MediaStatus, MediaType } from '../media.enums';
import { Place } from '../../places/entities/place.entity';

// Bảng `media` — exclusive arc 5 nhánh (place/review/post/business/event), thay `place_media`
// (ADR-009, +event_id theo ADR-003/ADR-002 — database.md §3.5). CHECK TỐI ĐA một chủ sở hữu áp ở
// migration (nới lỏng từ đúng-một, Media Upload Foundation 2026-07-30 — cho phép media mồ côi,
// pending, chưa gắn owner nào, cùng cách attachToReview() đã giả định từ trước). review_id/
// event_id đã có FK thật (thêm sau khi reviews/events tồn tại); chỉ post_id còn chưa FK (bảng
// đích thuộc Wave sau).
@Entity('media')
@Index(['placeId'])
@Index(['status'])
export class Media {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  placeId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  postId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  businessId!: string | null; // → places (media chính thức cơ sở đã claim)

  @Column({ type: 'uuid', nullable: true })
  eventId!: string | null; // → events (Wave 2/ADR-002); FK thêm khi bảng events tồn tại

  @Column({ type: 'enum', enum: MediaType, enumName: 'media_type' })
  type!: MediaType;

  // Media Upload Foundation (design review, 2026-07-30): nullable — new upload rows never
  // persist an absolute/signed URL (see object_key/bucket/contentType/sizeBytes/checksumSha256
  // below). Only legacy/externally-embedded rows (provider=youtube|vimeo, or any pre-existing
  // upload row) still carry a real stored value here.
  @Column({ type: 'varchar', length: 500, nullable: true })
  url!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnailUrl!: string | null;

  @Column({ type: 'enum', enum: MediaProvider, enumName: 'media_provider' })
  provider!: MediaProvider;

  @Column({ type: 'varchar', length: 100, nullable: true })
  externalId!: string | null;

  @Column({ type: 'int', nullable: true })
  width!: number | null;

  @Column({ type: 'int', nullable: true })
  height!: number | null;

  @Column({ type: 'int', nullable: true })
  duration!: number | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  caption!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  altText!: string | null;

  @Column({ type: 'int', nullable: true })
  sortOrder!: number | null;

  @Column({ type: 'enum', enum: MediaStatus, enumName: 'media_status', default: MediaStatus.PENDING })
  status!: MediaStatus;

  @Column({ type: 'decimal', precision: 4, scale: 3, nullable: true })
  aiModerationScore!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  aiLabels!: Record<string, unknown> | null;

  @Column({ type: 'uuid', nullable: true })
  uploadedBy!: string | null;

  // --- Place Information Foundation (2026-08-18) — QUYỀN sử dụng tệp, không phải NGUỒN thông tin.
  // Nguồn đi qua `source_attributions` (entity_type='media') → `sources`; ba cột dưới đây trả lời
  // câu khác: được phép hiển thị tệp này theo cơ sở nào, và phải ghi công thế nào.
  //
  // NULL = chưa ai xét quyền (mặc định cho mọi dòng có trước migration này). Xem MediaLicenseType.
  @Column({ type: 'enum', enum: MediaLicenseType, enumName: 'media_license_type', nullable: true })
  licenseType!: MediaLicenseType | null;

  /**
   * Dòng ghi công hiển thị công khai, vd `Trantuonglam / Wikimedia Commons`.
   *
   * Cố ý là MỘT chuỗi tự do chứ không phải FK tới `users` hay `sources`: tác giả ở đây thường là
   * người NGOÀI nền tảng (không có tài khoản), và định dạng credit do chính giấy phép quy định
   * chứ không do ta chuẩn hoá. `sources.publisher` là tên đơn vị phát hành DÙNG LẠI cho nhiều
   * tệp — không thay thế được credit riêng của từng ảnh.
   */
  @Column({ type: 'varchar', length: 300, nullable: true })
  attribution!: string | null;

  /** Link tới nguyên văn giấy phép (vd `https://creativecommons.org/licenses/by-sa/4.0/`). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  licenseUrl!: string | null;

  // --- Media Upload Foundation (design review, 2026-07-30) — object storage metadata ONLY.
  // Never an absolute or signed URL (that is generated dynamically at read time, never persisted).
  @Column({ type: 'varchar', length: 300, nullable: true })
  objectKey!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bucket!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  contentType!: string | null;

  @Column({ type: 'int', nullable: true })
  sizeBytes!: number | null;

  @Column({ type: 'char', length: 64, nullable: true })
  checksumSha256!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => Place, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'place_id' })
  place!: Place | null;
}
