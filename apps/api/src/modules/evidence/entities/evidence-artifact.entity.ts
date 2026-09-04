import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Bảng `evidence_artifacts` (2026-09-03 data-SSOT remediation, Phase 2). Một hàng = MỘT lần capture
// cụ thể của một `sources` row, tại một thời điểm, có hash — khác `sources` (danh mục nguồn tái sử
// dụng) và khác `source_attributions` (gắn một source vào một entity, không có hash/license/capture
// timestamp). `businessKey` là evidence_id gốc trong workbook (05_Evidence_Archive) — khóa idempotency
// khi import lại cùng một hàng workbook.
@Entity('evidence_artifacts')
@Index('idx_evidence_artifacts_source', ['sourceId'])
@Index('idx_evidence_artifacts_verification_status', ['verificationStatus'])
@Index('idx_evidence_artifacts_content_hash', ['contentHashSha256'])
export class EvidenceArtifact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  businessKey!: string;

  @Column({ type: 'varchar', length: 60 })
  evidenceType!: string;

  @Column({ type: 'varchar', length: 500 })
  sourceUrl!: string;

  @Column({ type: 'timestamptz' })
  capturedAt!: Date;

  @Column({ type: 'char', length: 64 })
  contentHashSha256!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  storageReference!: string | null;

  // Vocabulary from the workbook (CAPTURED / NEEDS_REVIEW / VERIFIED / ...) — varchar, same
  // "importer-defined, not a closed enum" convention as place_translations' status columns.
  // MUST NOT be upgraded to VERIFIED by import code — only a real human review changes this.
  @Column({ type: 'varchar', length: 40 })
  verificationStatus!: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  licenseStatus!: string | null;

  @Column({ type: 'uuid', nullable: true })
  verifiedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
