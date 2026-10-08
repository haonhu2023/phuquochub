import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ListableTargetType } from '../../../common/listable-target-type.enum';
import { ListingReportReason, ListingReportStatus } from '../listing-reports.enums';

// `listing_reports` (InitListingReports, 2026-10-08). target_id KHÔNG có FK cứng — đa hình, cùng
// quy ước `reports`/`moderation_cases` (ADR-018 §D9) NHƯNG là bảng RIÊNG, không tái dùng
// `moderation_cases` — xem migration comment cho lý do đầy đủ (ModerationTargetType bị khoá theo
// ADR-018, không có vòng đời case/claim nào cần ở đây).
@Entity('listing_reports')
@Index('idx_listing_reports_target', ['targetType', 'targetId'])
@Index('idx_listing_reports_status_target_type', ['status', 'targetType'])
@Index('idx_listing_reports_reporter_id', ['reporterId'])
export class ListingReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  reporterId!: string;

  @Column({ type: 'enum', enum: ListableTargetType, enumName: 'listable_target_type' })
  targetType!: ListableTargetType;

  @Column({ type: 'uuid' })
  targetId!: string;

  @Column({ type: 'enum', enum: ListingReportReason, enumName: 'listing_report_reason' })
  reason!: ListingReportReason;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: ListingReportStatus, enumName: 'listing_report_status', default: ListingReportStatus.OPEN })
  status!: ListingReportStatus;

  @Column({ type: 'uuid', nullable: true })
  resolverId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
