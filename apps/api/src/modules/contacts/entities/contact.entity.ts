import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VerificationStatus } from '../../places/place.enums';

// Bảng `contacts` — POLYMORPHIC (owner_type/owner_id, ngoại lệ ADR-003/ADR-005).
// Không FK cứng; toàn vẹn cưỡng chế ở tầng ứng dụng. owner_type lowercase (B-3): place, business…
@Entity('contacts')
@Index(['ownerType', 'ownerId'])
@Index(['ownerType', 'ownerId', 'contactType'])
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30 })
  ownerType!: string;

  @Column({ type: 'uuid' })
  ownerId!: string;

  @Column({ type: 'varchar', length: 30 })
  contactType!: string; // HOTLINE, PHONE, EMAIL, WEBSITE, FACEBOOK…

  @Column({ type: 'varchar', length: 300 })
  value!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  label!: string | null;

  @Column({ type: 'boolean', default: false })
  isPrimary!: boolean;

  @Column({
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status',
    default: VerificationStatus.PENDING,
  })
  verificationStatus!: VerificationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  displayOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
