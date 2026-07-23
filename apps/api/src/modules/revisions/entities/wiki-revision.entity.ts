import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RevisionEntityType, RevisionOrigin, RevisionStatus } from '../revision.enums';

// Bảng `wiki_revisions` — phiên bản & lịch sử (ADR-014, source.md §6, data-dictionary §4).
// Polymorphic (entity_type/entity_id) — toàn vẹn ở tầng app (ngoại lệ ADR-003).
// Append-only, BẤT BIẾN: không updated_at / deleted_at; KHÔNG cascade từ entity đích
// (giữ lịch sử kể cả khi Place bị archive/soft-delete).
@Entity('wiki_revisions')
@Index('uq_wiki_rev_number', ['entityType', 'entityId', 'revisionNumber'], { unique: true })
@Index('idx_wiki_rev_entity_status', ['entityType', 'entityId', 'status'])
export class WikiRevision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: RevisionEntityType, enumName: 'revision_entity_type' })
  entityType!: RevisionEntityType;

  // Không FK (polymorphic) — trỏ tới places.id ở giai đoạn đầu.
  @Column({ type: 'uuid' })
  entityId!: string;

  @Column({ type: 'int' })
  revisionNumber!: number;

  @Column({ type: 'uuid', nullable: true })
  parentRevisionId!: string | null;

  @Column({ type: 'jsonb' })
  snapshot!: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  diff!: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: RevisionOrigin, enumName: 'revision_origin' })
  origin!: RevisionOrigin;

  @Column({ type: 'varchar', length: 300, nullable: true })
  changeNote!: string | null;

  @Column({ type: 'uuid', nullable: true })
  editorId!: string | null;

  @Column({ type: 'enum', enum: RevisionStatus, enumName: 'revision_status' })
  status!: RevisionStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  // Cây phiên bản (diff): cha là bản ghi cùng entity. NO ACTION — audit bất biến.
  @ManyToOne(() => WikiRevision, { onDelete: 'NO ACTION', nullable: true })
  @JoinColumn({ name: 'parent_revision_id' })
  parentRevision!: WikiRevision | null;
}
