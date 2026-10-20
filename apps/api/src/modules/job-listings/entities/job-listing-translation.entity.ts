import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { RichDoc } from '@phuquochub/shared-types';
import { JobListingTranslationStatus } from '../job-listings.enums';

// `job_listing_translations` (Gói C phần 1/2, 17/10/2026 — xem migration InitJobListingTranslations
// + AddJobListingTranslationCasAndSnapshot cho lý do thiết kế đầy đủ).
//
// HAI vùng dữ liệu TÁCH BIỆT trong cùng một row — đây là điểm mấu chốt (sửa sau phản hồi owner,
// bản đầu KHÔNG tách, khiến lưu nháp xoá mất nội dung đang công khai):
//   - title/description/requirements/benefits + sourceContentHash: BẢN NHÁP đang soạn (draft/
//     pending/rejected) — KHÔNG phải nội dung công khai, đọc công khai KHÔNG BAO GIỜ đụng tới.
//   - publishedTitle/publishedDescription/publishedRequirements/publishedBenefits +
//     publishedSourceContentHash + publishedAt: bản ĐÃ DUYỆT gần nhất — ĐÂY là nội dung công khai
//     thật. Chỉ `decide()` approve viết vào nhóm này; `save()`/`submit()` không bao giờ đụng tới.
//   - `contentVersion`: CAS (cùng khuôn `places.contentVersion`/`updateScalarsWithCas()`, KHÔNG
//     dùng TypeORM `@VersionColumn()`) — bảo vệ chống ghi đè khi hai tab cùng sửa hoặc moderator
//     duyệt trong lúc người đăng sửa.
@Entity('job_listing_translations')
@Index('idx_job_listing_translations_status', ['status'])
export class JobListingTranslation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  jobListingId!: string;

  // CHECK locale='en' ở DB — cột giữ cho rõ nghĩa/không phải đổi schema lớn nếu cần locale khác
  // sau này, KHÔNG phải một bộ máy đa-locale đang dùng (xem migration InitJobListingTranslations).
  @Column({ type: 'varchar', length: 10 })
  locale!: string;

  // --- Bản nháp đang soạn (KHÔNG phải nội dung công khai) ---
  @Column({ type: 'varchar', length: 200, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 4000, nullable: true })
  description!: string | null;

  // Gói D (mở rộng 18/10/2026) — rich-text CHỈ cho `description` bản dịch (owner yêu cầu rõ:
  // "Bổ sung rich-text cho mô tả bản dịch EN tuyển dụng" — requirements/benefits bản dịch NGOÀI
  // phạm vi). Cùng quy tắc nguồn-sự-thật + cơ chế hash chống rollback với job_listings.description,
  // xem apps/api/src/common/rich-text-field.ts. `descriptionRichHash` cho vùng NHÁP;
  // `publishedDescriptionRichHash` (dưới) cho vùng ĐÃ DUYỆT — hai hash ĐỘC LẬP, đúng tinh thần tách
  // nháp/công khai đã có của entity này.
  @Column({ type: 'jsonb', nullable: true })
  descriptionRich!: RichDoc | null;

  @Column({ type: 'char', length: 64, nullable: true })
  descriptionRichHash!: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  requirements!: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  benefits!: string | null;

  // sha256 các trường NGUỒN liên quan (xem job-listing-translation-hash.ts — KHÔNG chỉ 4 trường
  // dịch, còn cả lương/ca làm/nơi làm/hình thức làm việc có thể được tham chiếu trong câu chữ dịch)
  // TẠI THỜI ĐIỂM bản nháp này được lưu lần gần nhất.
  @Column({ type: 'char', length: 64 })
  sourceContentHash!: string;

  @Column({ type: 'enum', enum: JobListingTranslationStatus, enumName: 'job_listing_translation_status', default: JobListingTranslationStatus.DRAFT })
  status!: JobListingTranslationStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  reviewNote!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewerId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  // --- Bản ĐÃ DUYỆT gần nhất — nội dung công khai thật (xem ghi chú đầu file) ---
  @Column({ type: 'varchar', length: 200, nullable: true })
  publishedTitle!: string | null;

  @Column({ type: 'varchar', length: 4000, nullable: true })
  publishedDescription!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  publishedDescriptionRich!: RichDoc | null;

  @Column({ type: 'char', length: 64, nullable: true })
  publishedDescriptionRichHash!: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  publishedRequirements!: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  publishedBenefits!: string | null;

  // sha256 các trường nguồn TẠI THỜI ĐIỂM DUYỆT — khác `sourceContentHash` (tại thời điểm LƯU
  // NHÁP gần nhất): cái này đo "bản ĐANG CÔNG KHAI có còn khớp dữ kiện hiện tại không", cái kia đo
  // "bản nháp đang soạn có còn khớp dữ kiện hiện tại không" — hai câu hỏi khác nhau.
  @Column({ type: 'char', length: 64, nullable: true })
  publishedSourceContentHash!: string | null;

  // Gói D điểm 4 (18/10/2026) — hash HẸP chỉ phủ "ca làm/địa điểm/giá/điều kiện giao dịch" (xem
  // job-listing-translation-hash.ts's criticalFields()) — TÁCH biệt với publishedSourceContentHash
  // (hash TỔNG, phủ cả văn xuôi) để biết CHÍNH XÁC khi nào một bản dịch cũ mâu thuẫn với dữ kiện
  // QUAN TRỌNG (phải ẩn/fallback, không chỉ cảnh báo chung) thay vì chỉ "có gì đó đổi" (vẫn phục vụ
  // kèm cảnh báo như trước). NULL = bản dịch được duyệt TRƯỚC khi tính năng này tồn tại — không suy
  // diễn, coi như chưa biết (không ẩn).
  @Column({ type: 'char', length: 64, nullable: true })
  publishedCriticalFieldsHash!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  // CAS — xem ghi chú đầu file.
  @Column({ type: 'int', default: 1 })
  contentVersion!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
