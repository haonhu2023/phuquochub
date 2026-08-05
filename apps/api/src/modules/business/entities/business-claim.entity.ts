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
import { ClaimReasonCode, ClaimStatus } from '../business.enums';
import type { BusinessClaimEvidenceItem } from '../business-claim-evidence';
import { Place } from '../../places/entities/place.entity';
import { User } from '../../users/entities/user.entity';

// Bảng `business_claims` (ADR-015 §2, business.md §2, prisma/schema.prisma:780-799) — yêu cầu
// nhận quyền quản lý cơ sở, state machine `pending → approved | rejected | disputed | withdrawn`.
// `place_id` KHÔNG phải business_id độc lập — Model A (ADR-015): business = Place đã claim.
@Entity('business_claims')
@Index(['placeId', 'status'])
export class BusinessClaim {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  @Column({ type: 'uuid' })
  requesterId!: string;

  @Column({ type: 'jsonb' })
  evidence!: BusinessClaimEvidenceItem[];

  @Column({ type: 'enum', enum: ClaimStatus, enumName: 'business_claim_status', default: ClaimStatus.PENDING })
  status!: ClaimStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewerId!: string | null;

  @Column({ type: 'enum', enum: ClaimReasonCode, enumName: 'business_claim_reason_code', nullable: true })
  reasonCode!: ClaimReasonCode | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  decisionNote!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => Place, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place!: Place;

  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'requester_id' })
  requester!: User;

  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer!: User | null;
}
