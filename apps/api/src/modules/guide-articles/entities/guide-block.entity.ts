import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GuideBlockType } from '../guide-article.enums';

// Phú Quốc Guide CMS candidate (2026-09-18). `content` is JSONB, shape validated at the
// service/DTO layer per `blockType` (see GuideArticlesService's block-content validators) — it is
// NEVER a raw HTML string. This is the literal enforcement of "không dùng HTML tự do": there is no
// markup to sanitize because none is ever stored, and the web renderer never calls
// dangerouslySetInnerHTML for any block type.
@Entity('guide_blocks')
@Index(['articleId', 'position'])
export class GuideBlock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  articleId!: string;

  @Column({ type: 'int' })
  position!: number;

  @Column({ type: 'enum', enum: GuideBlockType, enumName: 'guide_block_type' })
  blockType!: GuideBlockType;

  @Column({ type: 'jsonb' })
  content!: Record<string, unknown>;

  // Set by GuideArticlesService.flagContentGap() — an editor (or a future automated check) marked
  // this block as missing a confirmable fact. Paired with an OwnerDecisionQueueService.enqueue()
  // call; see that method's doc for why ODQ, not a new table.
  @Column({ type: 'boolean', default: false })
  needsDecision!: boolean;

  @Column({ type: 'varchar', length: 300, nullable: true })
  decisionNote!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
