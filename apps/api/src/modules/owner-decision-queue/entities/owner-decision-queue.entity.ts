import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Câu hỏi có cấu trúc chờ owner/moderator quyết định — source-first publish pipeline (2026-09-18).
// Mỗi hàng = MỘT câu hỏi cụ thể: place_id/candidate_key + field + hai nguồn xung đột + đề xuất.
// Pipeline tự publish khi không có xung đột; HOLD chỉ khi không thể tự phân xử. Một câu hỏi cũ
// đã có quyết định hợp lệ KHÔNG hỏi lại cùng field/place_id.
export type OdqStatus = 'pending' | 'resolved' | 'expired' | 'withdrawn';
export type OdqQuestionType =
  | 'identity_conflict'
  | 'address_conflict'
  | 'hours_conflict'
  | 'contact_conflict'
  | 'insufficient_sources'
  | 'photo_rights'
  | 'primary_selection';
export type OdqFailSafe = 'hold_publish' | 'use_source_a' | 'use_source_b' | 'skip_field' | 'publish_anyway';

@Entity('owner_decision_queue')
@Index('idx_odq_place_pending', ['placeId', 'status'], { where: "place_id IS NOT NULL AND status = 'pending'" })
@Index('idx_odq_candidate', ['candidateKey'], { where: 'candidate_key IS NOT NULL' })
export class OwnerDecisionQueueItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // FK → places ON DELETE SET NULL. Null = candidate chưa được tạo thành place.
  @Column({ type: 'uuid', nullable: true })
  placeId!: string | null;

  // Idempotency key cho candidate chưa thành place — khớp CandidateInput.candidateKey.
  @Column({ type: 'varchar', length: 200, nullable: true })
  candidateKey!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  field!: string | null;

  @Column({ type: 'varchar', length: 40 })
  questionType!: OdqQuestionType;

  // Nguồn A (thường là nguồn ưu tiên cao hơn).
  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceAUrl!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  sourceAType!: string | null;

  // Nguồn B (nguồn xung đột).
  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceBUrl!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  sourceBType!: string | null;

  @Column({ type: 'text', nullable: true })
  conflictSummary!: string | null;

  @Column({ type: 'text', nullable: true })
  recommendation!: string | null;

  // Hành động fail-safe khi quá hạn mà chưa có quyết định.
  @Column({ type: 'varchar', length: 80, nullable: true })
  failSafe!: OdqFailSafe | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: OdqStatus;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  // Quyết định thực tế: { action, chosenSourceUrl, note, actorId }
  @Column({ type: 'jsonb', nullable: true })
  resolution!: Record<string, unknown> | null;

  // Phạm vi áp dụng của quyết định này, ví dụ: "place:abc123:field:phone"
  @Column({ type: 'varchar', length: 200, nullable: true })
  actorScope!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
