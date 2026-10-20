import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { RichDoc } from '@phuquochub/shared-types';
import { JobListingEmploymentType, JobListingSalaryPeriod, JobListingStatus } from '../job-listings.enums';

// `job_listings` (InitJobListings, đợt 3 — 2026-10-07). Xem migration cho bảng chuyển trạng thái đầy đủ.
@Entity('job_listings')
@Index('idx_job_listings_status', ['status'])
@Index('idx_job_listings_created_by', ['createdBy'])
export class JobListing {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  createdBy!: string;

  @Column({ type: 'uuid', nullable: true })
  placeId!: string | null;

  @Column({ type: 'varchar', length: 200 })
  employerName!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  employerRole!: string | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 80 })
  jobCategory!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ward!: string | null;

  @Column({ type: 'varchar', length: 300 })
  workLocation!: string;

  @Column({ type: 'enum', enum: JobListingEmploymentType, enumName: 'job_listing_employment_type' })
  employmentType!: JobListingEmploymentType;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  salaryMin!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  salaryMax!: string | null;

  @Column({ type: 'boolean', default: false })
  salaryNegotiable!: boolean;

  @Column({ type: 'varchar', length: 3, nullable: true })
  salaryCurrency!: string | null;

  @Column({ type: 'enum', enum: JobListingSalaryPeriod, enumName: 'job_listing_salary_period', nullable: true })
  salaryPeriod!: JobListingSalaryPeriod | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  shiftInfo!: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  requirements!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  requirementsRich!: RichDoc | null;

  @Column({ type: 'char', length: 64, nullable: true })
  requirementsRichHash!: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  benefits!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  benefitsRich!: RichDoc | null;

  @Column({ type: 'char', length: 64, nullable: true })
  benefitsRichHash!: string | null;

  @Column({ type: 'varchar', length: 4000, nullable: true })
  description!: string | null;

  // Gói D (AddJobListingDescriptionRich + AddJobListingRichTextHashes) — khi KHÔNG NULL, đây là
  // nguồn sự thật của mô tả; cột `description` phía trên luôn là PROJECTION phẳng dẫn xuất từ cột
  // này (xem apps/api/src/common/rich-text-field.ts's applyRichTextField()). `descriptionRichHash`
  // = sha256(description) TẠI THỜI ĐIỂM descriptionRich được ghi có thẩm quyền — đọc phải so khớp
  // qua `serveRichDoc()` trước khi phục vụ (cơ chế đóng rủi ro rollback: lệch = coi như chưa có,
  // KHÔNG phục vụ RichDoc lỗi thời — xem rich-text-field.ts's ghi chú đầy đủ).
  @Column({ type: 'jsonb', nullable: true })
  descriptionRich!: RichDoc | null;

  @Column({ type: 'char', length: 64, nullable: true })
  descriptionRichHash!: string | null;

  @Column({ type: 'varchar', length: 30 })
  contactMethod!: string;

  @Column({ type: 'varchar', length: 200 })
  contactValue!: string;

  @Column({ type: 'enum', enum: JobListingStatus, enumName: 'job_listing_status', default: JobListingStatus.DRAFT })
  status!: JobListingStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  reviewNote!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewerId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'date', nullable: true })
  expiresAt!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
