import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { VerificationVoteChoice } from '../verification.enums';

// Bảng `verification_votes` (verification.md §5B) — sổ phiếu cộng đồng, MỘT người MỘT phiếu
// (`uq_vote_user` ở migration). Đổi phiếu = UPDATE dòng hiện có (không insert dòng mới) — nguồn sự
// thật cho `community_verified`; `verifications.confirmCount`/`disputeCount` chỉ là cache dẫn xuất.
@Entity('verification_votes')
@Index(['verificationId'])
export class VerificationVote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  verificationId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'enum', enum: VerificationVoteChoice, enumName: 'verification_vote_choice' })
  vote!: VerificationVoteChoice;

  @Column({ type: 'smallint', default: 1 })
  weight!: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
