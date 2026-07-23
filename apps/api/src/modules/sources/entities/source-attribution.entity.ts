import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Bảng `source_attributions` — quy chiếu nguồn ĐA HÌNH (source.md §5), append-mostly.
// entity_type lowercase VARCHAR (B-3) — KHÔNG FK/relation tới place/media/…, toàn vẹn
// ở tầng ứng dụng, giống contacts (owner_type/owner_id) và price_history (entity_type/entity_id).
// source_id LÀ FK thật (một target duy nhất: sources) — quan hệ khai báo ở SourcesRepository,
// không dùng @ManyToOne ở đây để tránh import chéo module con trỏ ngược (giữ đơn giản: cột
// scalar, repository tự join khi cần reliability/retrieved_at cho §7).
@Entity('source_attributions')
@Index(['entityType', 'entityId'])
@Index(['sourceId'])
export class SourceAttribution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  sourceId!: string;

  @Column({ type: 'varchar', length: 30 })
  entityType!: string; // place, place_field, contact, media, price_history, place_faq, review, wiki_revision

  @Column({ type: 'uuid' })
  entityId!: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  field!: string | null;

  @Column({ type: 'smallint', nullable: true })
  confidence!: number | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  @Column({ type: 'boolean', default: false })
  isPrimary!: boolean;

  @Column({ type: 'uuid', nullable: true })
  verifiedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
