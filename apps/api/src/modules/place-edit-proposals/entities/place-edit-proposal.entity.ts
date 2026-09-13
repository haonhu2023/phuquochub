import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PlaceEditProposalFieldKey, PlaceEditProposalStatus } from '../place-edit-proposals.enums';

// `place_edit_proposals` (InitPlaceEditProposals, 1720005700000) — an UNAPPLIED, pending correction
// awaiting review, deliberately separate from `wiki_revisions` (which only records changes already
// applied to `places`). See the migration's own header comment for the full "why a new table"
// reasoning.
@Entity('place_edit_proposals')
@Index('idx_place_edit_proposals_place', ['placeId'])
@Index('idx_place_edit_proposals_status', ['status'])
export class PlaceEditProposal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  @Column({ type: 'enum', enum: PlaceEditProposalFieldKey, enumName: 'place_edit_proposal_field_key' })
  fieldKey!: PlaceEditProposalFieldKey;

  // Informational only for MVP (see migration comment) — the write target is always the base
  // `places` column, never `place_translations`.
  @Column({ type: 'varchar', length: 35, nullable: true })
  localeCode!: string | null;

  @Column({ type: 'jsonb' })
  proposedValue!: unknown;

  // computeFieldValueHash(currentValueAtSubmissionTime) — reused from evidence/field-value-hash.ts.
  // Conflict detection at approval time re-hashes the LIVE current value and compares.
  @Column({ type: 'char', length: 64 })
  baseValueHash!: string;

  @Column({ type: 'varchar', length: 1000 })
  reason!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceUrl!: string | null;

  @Column({ type: 'enum', enum: PlaceEditProposalStatus, enumName: 'place_edit_proposal_status', default: PlaceEditProposalStatus.PENDING })
  status!: PlaceEditProposalStatus;

  @Column({ type: 'uuid' })
  proposerId!: string;

  @Column({ type: 'uuid', nullable: true })
  reviewerId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  reviewNote!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
