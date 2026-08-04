import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ModerationDecision } from '../moderation.enums';
import { ModerationCase } from './moderation-case.entity';

// Bảng `ai_recommendations` (Moderation M7 — AI Shadow Mode). MỘT gợi ý của AI cho MỘT case kiểm
// duyệt — KHÔNG BAO GIỜ là quyết định. `decision`/`moderator_decision` tái dùng type Postgres
// `moderation_decision` đã có (không enum mới) để hai cột so sánh được trực tiếp bằng `=`.
//
// case_id là FK THẬT + CASCADE (cùng khuôn `reports.case_id`) — một recommendation không gắn với
// case nào thì vô nghĩa, và case bị xoá (không xảy ra trong thiết kế hiện tại, không có DELETE nào
// trên moderation_cases) kéo theo recommendation của nó biến mất theo, đúng ngữ nghĩa "bằng chứng
// phụ thuộc sự kiện chính".
//
// KHÔNG có cột nào ảnh hưởng `media.status`/`reviews.status`/`moderation_cases.status` — đây là
// TOÀN BỘ bề mặt ghi của M7 shadow mode. Service (`AiRecommendationsService`) không bao giờ UPDATE
// bảng nào khác ngoài bảng này.
@Entity('ai_recommendations')
@Index(['caseId', 'createdAt'])
export class AiRecommendation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  caseId!: string;

  @Column({ type: 'varchar', length: 100 })
  provider!: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  // Gợi ý của AI — KHÔNG BAO GIỜ áp dụng, chỉ lưu để so sánh với `moderator_decision` sau này.
  @Column({ type: 'enum', enum: ModerationDecision, enumName: 'moderation_decision' })
  decision!: ModerationDecision;

  @Column({ type: 'decimal', precision: 4, scale: 3 })
  confidence!: string;

  @Column({ type: 'jsonb', nullable: true })
  labels!: unknown | null;

  @Column({ type: 'text', nullable: true })
  reasoning!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  promptVersion!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  // Đặt khi moderator hoàn tất T2 cho ĐÚNG case này (so sánh sau, KHÔNG lúc tạo recommendation).
  @Column({ type: 'timestamptz', nullable: true })
  evaluatedAt!: Date | null;

  @Column({ type: 'enum', enum: ModerationDecision, enumName: 'moderation_decision', nullable: true })
  moderatorDecision!: ModerationDecision | null;

  @Column({ type: 'boolean', nullable: true })
  matched!: boolean | null;

  @Column({ type: 'int', nullable: true })
  latencyMs!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @ManyToOne(() => ModerationCase, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'case_id' })
  case!: ModerationCase;
}
