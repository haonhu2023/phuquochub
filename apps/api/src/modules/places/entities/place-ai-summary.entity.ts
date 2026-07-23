import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { AiSummaryStatus } from '../place.enums';
import { Place } from './place.entity';

// 1–1 với places: bản tóm tắt AI (human-in-the-loop; is_approved gate).
@Entity('place_ai_summary')
export class PlaceAiSummary {
  @PrimaryColumn({ type: 'uuid' })
  placeId!: string;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  highlights!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  promptVersion!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sourceHash!: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  language!: string | null;

  @Column({
    type: 'enum',
    enum: AiSummaryStatus,
    enumName: 'ai_summary_status',
    default: AiSummaryStatus.GENERATING,
  })
  status!: AiSummaryStatus;

  @Column({ type: 'boolean', default: false })
  isApproved!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  generatedAt!: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToOne(() => Place, (place) => place.aiSummary, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place!: Place;
}
