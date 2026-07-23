import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RolePermission } from './role-permission.entity';
import { RoleParent } from './role-parent.entity';
import { UserRole } from './user-role.entity';

// Bảng `roles` — vai trò dạng dữ liệu (ADR-007). `code` là định danh máy.
@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 60, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', default: true })
  isSystem!: boolean;

  @Column({ type: 'boolean', default: true })
  isAssignable!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => RolePermission, (rp) => rp.role)
  rolePermissions!: RolePermission[];

  // Liên kết kế thừa: role này là con (trỏ tới cha).
  @OneToMany(() => RoleParent, (rp) => rp.role)
  parentLinks!: RoleParent[];

  @OneToMany(() => UserRole, (ur) => ur.role)
  userRoles!: UserRole[];
}
