import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FaqStatus } from '../place.enums';
import { Place } from './place.entity';

@Entity('place_faqs')
@Index(['placeId'])
export class PlaceFaq {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  @Column({ type: 'varchar', length: 300 })
  question!: string;

  @Column({ type: 'text' })
  answer!: string;

  @Column({ type: 'int', nullable: true })
  sortOrder!: number | null;

  @Column({ type: 'boolean', default: false })
  isAiGenerated!: boolean;

  @Column({ type: 'enum', enum: FaqStatus, enumName: 'faq_status', default: FaqStatus.PENDING })
  status!: FaqStatus;

  @Column({ type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Place, (place) => place.faqs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place!: Place;
}
