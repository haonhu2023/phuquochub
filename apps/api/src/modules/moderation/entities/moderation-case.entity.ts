import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  MediaModerationReasonCode,
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
  //
  // NỘI BỘ, KHÔNG BAO GIỜ lộ cho chủ nội dung (media.md §16) — text tự do moderator gõ, có thể
  // nhắc tới case khác/nghi vấn gian lận/phán đoán nội bộ. Muốn nói gì với chủ nội dung thì dùng
  // `reasonCode` bên dưới. Hai trường KHÁC MỤC ĐÍCH, không thay thế nhau.
  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  // Mã lý do CÓ KIỂM SOÁT — phần DUY NHẤT của quyết định được phép lộ cho chủ nội dung (Controlled
  // Media Rejection Reason, 2026-08-12; cùng khuôn `business_claims.reason_code` vs
  // `decision_note`). Bắt buộc khi decision = `reject` trên target MEDIA — cưỡng chế ở tầng
  // service, KHÔNG bằng CHECK ở CSDL: hàng LỊCH SỬ (mọi case đã resolved trước milestone này) có
  // `reason != null` nhưng `reason_code = null`, và một CHECK sẽ biến chúng thành dữ liệu không
  // hợp lệ. Cùng lý do INV-11 cũng chỉ sống ở service.
  //
  // `null` với: case của target REVIEW (taxonomy này mô tả thuộc tính của một BỨC ẢNH, không áp
  // được cho bài đánh giá), quyết định approve/hide/restore/dismiss, và mọi case lịch sử.
  @Column({
    type: 'enum',
    enum: MediaModerationReasonCode,
    enumName: 'media_moderation_reason_code',
    nullable: true,
  })
  reasonCode!: MediaModerationReasonCode | null;

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
