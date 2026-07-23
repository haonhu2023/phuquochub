import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MediaProvider, MediaStatus, MediaType } from '../media.enums';
import { Place } from '../../places/entities/place.entity';

// Bảng `media` — exclusive arc 5 nhánh (place/review/post/business/event), thay `place_media`
// (ADR-009, +event_id theo ADR-003/ADR-002 — database.md §3.5). CHECK đúng-một chủ sở hữu áp ở
// migration. review_id/post_id/event_id chưa FK (bảng đích thuộc Wave sau).
@Entity('media')
@Index(['placeId'])
@Index(['status'])
export class Media {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  placeId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  postId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  businessId!: string | null; // → places (media chính thức cơ sở đã claim)

  @Column({ type: 'uuid', nullable: true })
  eventId!: string | null; // → events (Wave 2/ADR-002); FK thêm khi bảng events tồn tại

  @Column({ type: 'enum', enum: MediaType, enumName: 'media_type' })
  type!: MediaType;

  @Column({ type: 'varchar', length: 500 })
  url!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnailUrl!: string | null;

  @Column({ type: 'enum', enum: MediaProvider, enumName: 'media_provider' })
  provider!: MediaProvider;

  @Column({ type: 'varchar', length: 100, nullable: true })
  externalId!: string | null;

  @Column({ type: 'int', nullable: true })
  width!: number | null;

  @Column({ type: 'int', nullable: true })
  height!: number | null;

  @Column({ type: 'int', nullable: true })
  duration!: number | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  caption!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  altText!: string | null;

  @Column({ type: 'int', nullable: true })
  sortOrder!: number | null;

  @Column({ type: 'enum', enum: MediaStatus, enumName: 'media_status', default: MediaStatus.PENDING })
  status!: MediaStatus;

  @Column({ type: 'decimal', precision: 4, scale: 3, nullable: true })
  aiModerationScore!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  aiLabels!: Record<string, unknown> | null;

  @Column({ type: 'uuid', nullable: true })
  uploadedBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => Place, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'place_id' })
  place!: Place | null;
}
