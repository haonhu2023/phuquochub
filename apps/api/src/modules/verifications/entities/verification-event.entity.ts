import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { VerificationStatus } from '../../places/place.enums';
import { VerificationMethod } from '../verification.enums';

// Bảng `verification_events` (verification.md §5) — lịch sử chuyển trạng thái, APPEND-ONLY, bất
// biến (không UPDATE/DELETE). Con của `verifications` qua MỘT FK duy nhất (không polymorphic),
// `ON DELETE CASCADE` ở migration. `actorId = null` nghĩa là hệ thống (job hết hạn/job cộng đồng).
@Entity('verification_events')
@Index(['verificationId', 'createdAt'])
export class VerificationEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  verificationId!: string;

  @Column({ type: 'enum', enum: VerificationStatus, enumName: 'verification_status', nullable: true })
  fromStatus!: VerificationStatus | null;

  @Column({ type: 'enum', enum: VerificationStatus, enumName: 'verification_status' })
  toStatus!: VerificationStatus;

  @Column({ type: 'enum', enum: VerificationMethod, enumName: 'verification_method' })
  method!: VerificationMethod;

  @Column({ type: 'uuid', nullable: true })
  sourceId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
