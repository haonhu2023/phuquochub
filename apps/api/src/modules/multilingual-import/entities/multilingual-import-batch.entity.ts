import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { MultilingualImportBatchStatus } from '../multilingual-import.enums';

// Audit record for one import run. Once status=succeeded/failed this record is immutable;
// rollback is expressed as a new succeeded batch that inserts new place_translations rows.
@Entity('multilingual_import_batches')
@Index('idx_import_batch_status', ['status'])
export class MultilingualImportBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // batchId from the contract JSON — globally unique, drives idempotency checks.
  @Column({ type: 'uuid', unique: true })
  batchId!: string;

  @Column({ type: 'varchar', length: 60 })
  contractVersion!: string;

  @Column({ type: 'char', length: 64 })
  sourceChecksum!: string;

  @Column({ type: 'char', length: 64 })
  approvalEvidenceChecksum!: string;

  @Column({ type: 'char', length: 64 })
  publishManifestChecksum!: string;

  @Column({ type: 'int' })
  totalRows!: number;

  @Column({
    type: 'enum',
    enum: MultilingualImportBatchStatus,
    enumName: 'multilingual_import_batch_status',
    default: MultilingualImportBatchStatus.PENDING,
  })
  status!: MultilingualImportBatchStatus;

  @Column({ type: 'boolean', default: true })
  dryRun!: boolean;

  @Column({ type: 'uuid' })
  actorId!: string;

  @Column({ type: 'int', nullable: true })
  succeededRows!: number | null;

  @Column({ type: 'int', nullable: true })
  failedRows!: number | null;

  @Column({ type: 'int', nullable: true })
  heldRows!: number | null;

  @Column({ type: 'int', nullable: true })
  alreadyCurrentRows!: number | null;

  @Column({ type: 'text', nullable: true })
  errorSummary!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
