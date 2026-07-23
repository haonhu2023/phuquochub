import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ScopeType } from '../rbac.enums';
import { Role } from './role.entity';
import { User } from '../../users/entities/user.entity';

// Bảng `user_roles` — gán vai trò cho principal kèm scope.
// business_id → places (Place đã claim) chỉ khi scope_type=managed (ADR-015).
// PARTIAL UNIQUE(user_id, role_id, business_id) WHERE revoked_at IS NULL → raw SQL migration.
@Entity('user_roles')
@Index(['userId'])
export class UserRole {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  roleId!: string;

  @Column({
    type: 'enum',
    enum: ScopeType,
    enumName: 'scope_type',
    default: ScopeType.GLOBAL,
  })
  scopeType!: ScopeType;

  @Column({ type: 'uuid', nullable: true })
  businessId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  grantedBy!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  grantedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @ManyToOne(() => User, (user) => user.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Role, (role) => role.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: Role;
}
