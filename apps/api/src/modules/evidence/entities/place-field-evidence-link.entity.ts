import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Generic field-level evidence linkage — place + a named scalar/contact field (e.g. opening_hours,
// phone, website, address, price) + the evidence_artifact that supports the CURRENT value of that
// field. Deliberately separate from PlaceTranslationEvidenceLink (links a place_translations ROW,
// a different entity, to evidence) and from SourceAttribution (links an entity to a SOURCE, not a
// captured evidence_artifact — a source can have many evidence_artifacts over time, so
// SourceAttribution alone cannot say which specific capture backs a given field claim). No
// FK/relation decorators here — same house style as PlaceTranslationEvidenceLink/SourceAttribution:
// real FKs live in the migration (1720005300000-InitPlaceFieldEvidenceLinks), integrity enforced by
// the DB, application never needs a hydrated relation object.
@Entity('place_field_evidence_links')
@Index('idx_place_field_evidence_link_place_field', ['placeId', 'fieldName'])
@Index('idx_place_field_evidence_link_evidence', ['evidenceArtifactId'])
export class PlaceFieldEvidenceLink {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  // Free-form, not a closed enum — same ADR-020 reasoning as SourceAttribution.field: the set of
  // evidenceable fields is product-defined and growing (opening_hours today; phone/website/address/
  // price/operating status later), not a fixed vocabulary this migration should own.
  @Column({ type: 'varchar', length: 60 })
  fieldName!: string;

  @Column({ type: 'uuid' })
  evidenceArtifactId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
