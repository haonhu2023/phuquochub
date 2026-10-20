import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { RichDoc } from '@phuquochub/shared-types';
import { RealEstateListingTranslationStatus } from '../real-estate-listings.enums';

// `real_estate_listing_translations` (Gói C phần 2/2, 17/10/2026 — xem migration
// InitRealEstateListingTranslations cho lý do thiết kế đầy đủ; cùng khuôn JobListingTranslation,
// field dịch khác do schema BĐS khác: title/description/utilitiesNote/legalStatusNote).
@Entity('real_estate_listing_translations')
@Index('idx_re_listing_translations_status', ['status'])
export class RealEstateListingTranslation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  realEstateListingId!: string;

  @Column({ type: 'varchar', length: 10 })
  locale!: string;

  // --- Bản nháp đang soạn (KHÔNG phải nội dung công khai) ---
  @Column({ type: 'varchar', length: 200, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 4000, nullable: true })
  description!: string | null;

  // Gói D (18/10/2026) — CHỈ `description` bản dịch có rich text (cùng phạm vi job_listings:
  // "mô tả bản dịch EN", không mở rộng utilitiesNote/legalStatusNote bản dịch).
  @Column({ type: 'jsonb', nullable: true })
  descriptionRich!: RichDoc | null;

  @Column({ type: 'char', length: 64, nullable: true })
  descriptionRichHash!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  utilitiesNote!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  legalStatusNote!: string | null;

  @Column({ type: 'char', length: 64 })
  sourceContentHash!: string;

  @Column({
    type: 'enum',
    enum: RealEstateListingTranslationStatus,
    enumName: 'real_estate_listing_translation_status',
    default: RealEstateListingTranslationStatus.DRAFT,
  })
  status!: RealEstateListingTranslationStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  reviewNote!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewerId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  // --- Bản ĐÃ DUYỆT gần nhất — nội dung công khai thật ---
  @Column({ type: 'varchar', length: 200, nullable: true })
  publishedTitle!: string | null;

  @Column({ type: 'varchar', length: 4000, nullable: true })
  publishedDescription!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  publishedDescriptionRich!: RichDoc | null;

  @Column({ type: 'char', length: 64, nullable: true })
  publishedDescriptionRichHash!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  publishedUtilitiesNote!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  publishedLegalStatusNote!: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  publishedSourceContentHash!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ type: 'int', default: 1 })
  contentVersion!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
