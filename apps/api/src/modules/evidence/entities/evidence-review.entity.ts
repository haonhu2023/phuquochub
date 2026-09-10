import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type EvidenceReviewDecision = 'APPROVE' | 'NEEDS_CHANGES' | 'REJECT';

// `evidence_reviews` (Opening-Hours Evidence Governance v1, InitEvidenceReviews 1720005500000) —
// append-only audit trail for a human review of one `evidence_artifacts` row. Every decision is a
// NEW row, never an update to a previous one (mirrors `verification_events`, not `verifications` —
// there is no mutable "current" row here; `evidence_artifacts`'s own verificationExpiresAt/
// approvalArtifactSha256/freshnessPolicyKey/freshnessPolicyVersion columns are the denormalized
// current-state mirror, written in the same transaction as the review row that justifies them).
@Entity('evidence_reviews')
@Index('idx_evidence_reviews_evidence_artifact', ['evidenceArtifactId'])
@Index('idx_evidence_reviews_reviewed_at', ['reviewedAt'])
export class EvidenceReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  evidenceArtifactId!: string;

  @Column({ type: 'varchar', length: 20 })
  decision!: EvidenceReviewDecision;

  @Column({ type: 'varchar', length: 150 })
  reviewerName!: string;

  @Column({ type: 'timestamptz' })
  reviewedAt!: Date;

  // Digest of the approval receipt itself (the artifact recording the human's decision) — the
  // idempotency/conflict key, paired with evidenceArtifactId. NOT the same value as
  // evidenceContentSha256 (which is the hash of the EVIDENCE the receipt attests to).
  @Column({ type: 'char', length: 64 })
  approvalArtifactSha256!: string;

  @Column({ type: 'varchar', length: 60 })
  claimType!: string;

  @Column({ type: 'varchar', length: 80 })
  policyKey!: string;

  @Column({ type: 'varchar', length: 20 })
  policyVersion!: string;

  // The evidence_artifacts.contentHashSha256 this specific approval receipt attests it reviewed —
  // compared at review time against the artifact's actual current content hash
  // (EVIDENCE_HASH_MISMATCH in the policy evaluator when they differ).
  @Column({ type: 'char', length: 64 })
  evidenceContentSha256!: string;

  @Column({ type: 'timestamptz', nullable: true })
  verificationExpiresAt!: Date | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  reviewNote!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
