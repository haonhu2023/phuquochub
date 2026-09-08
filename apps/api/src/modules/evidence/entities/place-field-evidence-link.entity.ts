import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Generic field-level evidence linkage — place + a named scalar/contact field (e.g. opening_hours,
// phone, website, address, price) + the evidence_artifact that supports a SPECIFIC VALUE of that
// field, pinned by `fieldValueHash`. Deliberately separate from PlaceTranslationEvidenceLink (links
// a place_translations ROW, a different entity, to evidence) and from SourceAttribution (links an
// entity to a SOURCE, not a captured evidence_artifact — a source can have many evidence_artifacts
// over time, so SourceAttribution alone cannot say which specific capture backs a given field
// claim). No FK/relation decorators here — same house style as
// PlaceTranslationEvidenceLink/SourceAttribution: real FKs live in the migrations
// (1720005300000-InitPlaceFieldEvidenceLinks, 1720005400000-AddFieldValueHashToPlaceFieldEvidenceLinks),
// integrity enforced by the DB, application never needs a hydrated relation object.
//
// A row alone does NOT prove current-value support — (place_id, field_name, evidence_artifact_id)
// without a value binding cannot distinguish "supports the value from before it changed" from
// "supports the value right now." `fieldValueHash` is what makes a CURRENT-value claim provable:
// EvidenceService.listCurrentEvidenceForPlaceField() compares it against a hash of the field's live
// value (field-value-hash.ts). Rows whose hash no longer matches the live value are real, retained
// history — never deleted, just excluded from "current" lookups.
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

  // sha256(canonicalJson(value)) of the field's value AT LINK TIME — see field-value-hash.ts. Part
  // of the composite UNIQUE constraint (place_id, field_name, evidence_artifact_id, field_value_hash):
  // the same artifact re-linked after the field's value changes is a NEW row (it now supports a
  // different value), not a duplicate of the old one.
  @Column({ type: 'char', length: 64 })
  fieldValueHash!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
