import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { MultilingualImportRowOutcome } from '../multilingual-import.enums';

// Per-row audit record. Written AFTER the batch transaction commits (or fails).
// Rows are append-only — do not update or delete.
@Entity('multilingual_import_rows')
@Index('idx_import_row_batch', ['batchRecordId'])
@Index('idx_import_row_place', ['placeId', 'localeCode'])
export class MultilingualImportRow {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // FK to multilingual_import_batches.id (the DB pk, not batchId from contract).
  @Column({ type: 'uuid' })
  batchRecordId!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  @Column({ type: 'varchar', length: 60 })
  fieldKey!: string;

  @Column({ type: 'varchar', length: 35 })
  localeCode!: string;

  @Column({ type: 'char', length: 64 })
  rowHash!: string;

  // place_translations.id created/found — null for held/failed rows.
  @Column({ type: 'uuid', nullable: true })
  translationId!: string | null;

  @Column({
    type: 'enum',
    enum: MultilingualImportRowOutcome,
    enumName: 'multilingual_import_row_outcome',
  })
  outcome!: MultilingualImportRowOutcome;

  @Column({ type: 'text', nullable: true })
  errorDetail!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
