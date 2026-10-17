import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { JobListingTranslationStatus } from '../job-listings.enums';

// `job_listing_translations` (Gói C phần 1/2, 17/10/2026 — xem migration InitJobListingTranslations
// cho lý do thiết kế đầy đủ: MỘT row/locale cho cả 4 trường dịch, KHÔNG field-granular, KHÔNG giữ
// lịch sử nhiều revision — khác hẳn place_translations, một bộ máy riêng KHÔNG tái dùng).
@Entity('job_listing_translations')
@Index('idx_job_listing_translations_status', ['status'])
export class JobListingTranslation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  jobListingId!: string;

  // CHECK locale='en' ở DB — cột giữ cho rõ nghĩa/không phải đổi schema lớn nếu cần locale khác
  // sau này, KHÔNG phải một bộ máy đa-locale đang dùng (xem migration).
  @Column({ type: 'varchar', length: 10 })
  locale!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 4000, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  requirements!: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  benefits!: string | null;

  @Column({ type: 'enum', enum: JobListingTranslationStatus, enumName: 'job_listing_translation_status', default: JobListingTranslationStatus.DRAFT })
  status!: JobListingTranslationStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  reviewNote!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewerId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  // sha256 của {title,description,requirements,benefits} TIẾNG VIỆT (job_listings, không phải
  // chính bản dịch này) tại thời điểm bản dịch này được lưu lần gần nhất — phát hiện lỗi thời khi
  // nội dung gốc đổi sau đó (xem job-listing-translation-hash.ts).
  @Column({ type: 'char', length: 64 })
  sourceContentHash!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
