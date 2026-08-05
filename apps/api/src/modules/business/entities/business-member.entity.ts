import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MemberRole } from '../business.enums';
import { Place } from '../../places/entities/place.entity';
import { User } from '../../users/entities/user.entity';
import { BusinessClaim } from './business-claim.entity';

// Bảng `business_members` (ADR-015 §3, business.md §3, prisma/schema.prisma:802-820) — sở hữu/ủy
// quyền hiệu lực. Thu hồi = soft (`revoked_at`), KHÔNG xoá cứng — giữ lịch sử sở hữu.
// BR-B2 (một Owner hiệu lực/cơ sở) + "một vai trò hiệu lực/người/cơ sở" cưỡng chế bằng partial
// unique index ở migration, KHÔNG dựa vào logic ứng dụng.
@Entity('business_members')
@Index(['userId'])
export class BusinessMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'enum', enum: MemberRole, enumName: 'business_member_role' })
  role!: MemberRole;

  @Column({ type: 'uuid', nullable: true })
  claimId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  grantedBy!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  grantedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @ManyToOne(() => Place, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place!: Place;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => BusinessClaim, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'claim_id' })
  claim!: BusinessClaim | null;

  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'granted_by' })
  grantedByUser!: User | null;
}
