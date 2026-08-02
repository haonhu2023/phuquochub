import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationCaseStatus,
  ModerationDecision,
  ModerationTargetType,
} from '../moderation.enums';

// Bảng `moderation_cases` (ADR-018 §D1/D2/D9, migration InitModeration). Một ĐƠN VỊ CÔNG VIỆC
// của moderator — KHÔNG bao giờ lưu trạng thái hiển thị của nội dung (INV-2). Trạng thái hiển thị
// duy nhất vẫn là media.status/reviews.status; đọc công khai không bao giờ join bảng này (INV-1).
//
// target_type/target_id là tham chiếu ĐA HÌNH, KHÔNG FK cứng, KHÔNG cascade (ADR-018 D9, cùng
// ngoại lệ ADR-016 đã áp cho audit_logs) — case phải sống sót khi target bị xoá để giữ nguyên
// bằng chứng đã từng xử lý. assigned_to/resolved_by CÓ FK thật tới users (ON DELETE SET NULL,
// giống customer_user_id của Booking) nhưng KHÔNG có quan hệ ORM (@ManyToOne) — cùng quy ước
// Booking.customerUserId: service tự đối chiếu qua UsersRepository khi cần, tránh join không cần
// thiết ở tầng entity.
@Entity('moderation_cases')
@Index(['targetType', 'targetId'])
export class ModerationCase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: ModerationTargetType, enumName: 'moderation_target_type' })
  targetType!: ModerationTargetType;

  @Column({ type: 'uuid' })
  targetId!: string;

  @Column({
    type: 'enum',
    enum: ModerationCaseStatus,
    enumName: 'moderation_case_status',
    default: ModerationCaseStatus.OPEN,
  })
  status!: ModerationCaseStatus;

  @Column({ type: 'enum', enum: ModerationCaseSource, enumName: 'moderation_case_source' })
  source!: ModerationCaseSource;

  // §4.1 thiết kế: severity là phân loại lưu trữ, priority suy ra XÁC ĐỊNH từ severity lúc ghi —
  // không bao giờ nhập tay, không phải biểu thức tính lúc truy vấn (giữ hàng chờ là một index scan).
  @Column({
    type: 'enum',
    enum: ModerationCaseSeverity,
    enumName: 'moderation_case_severity',
    default: ModerationCaseSeverity.LOW,
  })
  severity!: ModerationCaseSeverity;

  @Column({ type: 'smallint', default: 0 })
  priority!: number;

  // Denormalize từ `reports` (số report gắn với case này) — tránh COUNT(*) mỗi lần đọc hàng chờ.
  @Column({ type: 'int', default: 0 })
  reportCount!: number;

  @Column({ type: 'uuid', nullable: true })
  assignedTo!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  claimedAt!: Date | null;

  @Column({ type: 'enum', enum: ModerationDecision, enumName: 'moderation_decision', nullable: true })
  decision!: ModerationDecision | null;

  // Bắt buộc khác rỗng khi decision = reject|hide (INV-11) — cưỡng chế ở tầng service (M3/M4),
  // KHÔNG ở entity/migration (cùng lý do reviews.content không NOT NULL dù có ràng buộc nghiệp vụ).
  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  // Ảnh chụp media.ai_moderation_score/ai_labels lúc gắn cờ (source=ai_flag) — KHÔNG phải nguồn
  // sự thật, chỉ lưu ngữ cảnh tại thời điểm case được tạo.
  @Column({ type: 'decimal', precision: 4, scale: 3, nullable: true })
  aiScore!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  aiLabels!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
