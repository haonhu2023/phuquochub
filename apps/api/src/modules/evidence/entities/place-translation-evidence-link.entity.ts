import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Junction table many-to-many thật: một evidence có thể hỗ trợ nhiều translation field, một
// translation có thể dựa trên nhiều evidence. `UNIQUE(translation_id, evidence_id)` ở migration
// (không phải composite PK) để giữ một `id` riêng — cùng phong cách source_attributions.
@Entity('place_translation_evidence_links')
@Index('idx_place_trans_evidence_link_translation', ['translationId'])
@Index('idx_place_trans_evidence_link_evidence', ['evidenceId'])
export class PlaceTranslationEvidenceLink {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  translationId!: string;

  @Column({ type: 'uuid' })
  evidenceId!: string;

  @Column({ type: 'varchar', length: 40, default: 'SUPPORTS' })
  relationshipType!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
