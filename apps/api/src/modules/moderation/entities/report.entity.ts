import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReportReason, ReportStatus, ModerationTargetType } from '../moderation.enums';
import { ModerationCase } from './moderation-case.entity';

// Bảng `reports` (ADR-018 §D1/D9, migration InitModeration) — KHẲNG ĐỊNH của một người dùng rằng
// nội dung vi phạm. KHÔNG có vòng đời độc lập; kết quả (`status`) được đặt khi case cha đóng
// (moderation-design.md §5.2). case_id là FK THẬT + CASCADE (report không có case thì vô nghĩa,
// khác target_id — cùng khuôn booking_items.bookingId có cả @Column scalar lẫn @ManyToOne relation
// trên cùng cột vật lý).
//
// target_type/target_id denormalize từ case (truy vấn không cần join) — ĐA HÌNH, KHÔNG FK cứng,
// cùng ngoại lệ ADR-018 D9 áp cho moderation_cases. reporter_id CÓ FK thật tới users (ON DELETE
// CASCADE — report của một user bị xoá tài khoản không còn ý nghĩa giữ lại) nhưng KHÔNG có quan hệ
// ORM, cùng quy ước ModerationCase.assignedTo/resolvedBy.
@Entity('reports')
@Index(['targetType', 'targetId'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  caseId!: string;

  @Column({ type: 'enum', enum: ModerationTargetType, enumName: 'moderation_target_type' })
  targetType!: ModerationTargetType;

  @Column({ type: 'uuid' })
  targetId!: string;

  @Column({ type: 'uuid' })
  reporterId!: string;

  @Column({ type: 'enum', enum: ReportReason, enumName: 'report_reason' })
  reason!: ReportReason;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: ReportStatus, enumName: 'report_status', default: ReportStatus.OPEN })
  status!: ReportStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => ModerationCase, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'case_id' })
  case!: ModerationCase;
}
