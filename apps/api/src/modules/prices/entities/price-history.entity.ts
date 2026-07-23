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
import { VerificationStatus } from '../../places/place.enums';
import { Source } from '../../sources/entities/source.entity';

// Bảng `price_history` — POLYMORPHIC (entity_type/entity_id, ngoại lệ ADR-003/ADR-006),
// append-only. Thay `place_tickets`. source_id FK → sources.id (migration InitSources).
@Entity('price_history')
@Index(['entityType', 'entityId'])
@Index(['entityType', 'entityId', 'serviceName'])
@Index(['entityType', 'entityId', 'validTo'])
export class PriceHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30 })
  entityType!: string; // lowercase (B-3): place, hotel, tour, event…

  @Column({ type: 'uuid' })
  entityId!: string;

  @Column({ type: 'varchar', length: 120 })
  serviceName!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'char', length: 3, default: 'VND' })
  currency!: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  unit!: string | null;

  @Column({ type: 'boolean', default: false })
  isFree!: boolean;

  @Column({ type: 'varchar', length: 300, nullable: true })
  description!: string | null;

  @Column({ type: 'int', default: 0 })
  displayOrder!: number;

  @Column({ type: 'timestamptz', nullable: true })
  validFrom!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  validTo!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  sourceId!: string | null;

  @ManyToOne(() => Source, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'source_id' })
  source!: Source | null;

  @Column({
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status',
    default: VerificationStatus.PENDING,
  })
  verificationStatus!: VerificationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
