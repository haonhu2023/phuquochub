import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VerificationStatus } from '../../places/place.enums';
import { VerificationMethod, VerificationReasonCode } from '../verification.enums';

// Bảng `verifications` (ADR-008, verification.md §4) — exclusive arc (Place/Contact/PriceHistory,
// FK thật + CHECK đúng-một, KHÔNG polymorphic). Một bản ghi = trạng thái xác minh HIỆN HÀNH của
// một mẩu dữ liệu; vòng đời `expired -> pending -> …` tái sử dụng CÙNG một dòng (không insert mới),
// toàn bộ lịch sử ở `verification_events`. `assignedTo`/`verifiedBy`/`createdBy` là uuid thường
// (FK thật ở migration, ON DELETE SET NULL) KHÔNG có quan hệ ORM — cùng quy ước
// `ModerationCase.assignedTo`/`Source.verifiedBy` (service tự đối chiếu qua repository khi cần).
@Entity('verifications')
@Index(['status'])
export class Verification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  placeId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  contactId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  priceHistoryId!: string | null;

  @Column({
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status',
    default: VerificationStatus.PENDING,
  })
  status!: VerificationStatus;

  @Column({ type: 'enum', enum: VerificationMethod, enumName: 'verification_method' })
  method!: VerificationMethod;

  @Column({ type: 'uuid', nullable: true })
  sourceId!: string | null;

  @Column({ type: 'smallint', nullable: true })
  confidence!: number | null;

  @Column({ type: 'int', default: 0 })
  confirmCount!: number;

  @Column({ type: 'int', default: 0 })
  disputeCount!: number;

  @Column({ type: 'enum', enum: VerificationReasonCode, enumName: 'verification_reason_code', nullable: true })
  reasonCode!: VerificationReasonCode | null;

  @Column({ type: 'uuid', nullable: true })
  verifiedBy!: string | null;

  @Column({ type: 'uuid', nullable: true })
  assignedTo!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  assignedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  slaDueAt!: Date | null;

  @Column({ type: 'smallint', default: 0 })
  priority!: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  rejectedReason!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  validFrom!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  // Optimistic lock (§5C) — compare-and-set trên MỌI transition, chống ghi đè giữa moderator/job
  // cộng đồng/job hết hạn chạy song song. KHÔNG dùng `@VersionColumn()` (TypeORM tự CAS trên MỌI
  // save(), kể cả field không liên quan trạng thái) — CAS tường minh trong repository, chỉ áp dụng
  // đúng lúc chuyển `status`.
  @Column({ type: 'int', default: 0 })
  lockVersion!: number;

  @Column({ type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
