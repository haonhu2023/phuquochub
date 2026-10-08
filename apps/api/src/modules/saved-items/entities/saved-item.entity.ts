import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { SavedItemTargetType } from '../saved-items.enums';

// `saved_items` (InitSavedItems, 2026-10-08). target_id KHÔNG có FK cứng — đa hình, cùng quy ước
// `reports`/`moderation_cases` (ADR-018 §D9). Xem migration cho lý do đầy đủ. Postgres type của
// `target_type` đổi tên thành "listable_target_type" trong InitListingReports (dùng chung với
// `listing_reports`, consumer thứ hai) — `enumName` dưới đây khớp tên THẬT sau đổi tên.
@Entity('saved_items')
@Index('idx_saved_items_user_id', ['userId'])
@Index('idx_saved_items_target', ['targetType', 'targetId'])
@Unique('uq_saved_items_user_target', ['userId', 'targetType', 'targetId'])
export class SavedItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'enum', enum: SavedItemTargetType, enumName: 'listable_target_type' })
  targetType!: SavedItemTargetType;

  @Column({ type: 'uuid' })
  targetId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
