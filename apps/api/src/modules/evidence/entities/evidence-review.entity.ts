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
// Evidence Field-Binding V2 (AddFieldBindingToEvidenceReviews 1720005600000) — mirrors that
// migration's partial index exactly (see placeId's own column comment below).
@Index('idx_evidence_reviews_field_binding_tuple', ['evidenceArtifactId', 'placeId', 'fieldName', 'fieldValueHash', 'reviewedAt'], {
  where: '"place_id" IS NOT NULL',
})
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

  // Evidence Field-Binding V2 (AddFieldBindingToEvidenceReviews 1720005600000) — all three or none
  // (DB CHECK constraint, never a partial binding). NULL on every legacy V1 row and on any review
  // EvidenceService.reviewEvidenceArtifact records WITHOUT a placeId/fieldName/fieldValueHash input
  // (V1 semantics preserved unchanged for those calls — see that method's own comment). When set,
  // this is the EXACT (place, field, value) tuple this review is bound to: `fieldValueHash` is what
  // the RECEIPT ITSELF ASSERTS (an immutable record of what was actually attested to), never
  // silently substituted with the service's independently-recomputed current value — that
  // recomputation exists purely to decide ELIGIBILITY at review time (a mismatch fails the review,
  // FIELD_VALUE_HASH_MISMATCH), not to decide what gets persisted here. The two are the SAME value
  // whenever a review is actually eligible (eligibility literally requires them to be equal), so
  // this distinction only matters for an ineligible/mismatched row — and matters there specifically
  // to keep replay identity correct (see reviewEvidenceArtifact's own comment on this column). The
  // hardened opening_hours read gate (PlacesRepository) and the link-write guard
  // (EvidenceService.linkEvidenceToPlaceField) both require a LATEST review matching this exact
  // tuple to be APPROVE and unexpired — a review bound to a different place/field/value, or an
  // unbound legacy row, can never satisfy that match (NULL never equals NULL in the join predicate).
  @Column({ type: 'uuid', nullable: true })
  placeId!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  fieldName!: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  fieldValueHash!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
