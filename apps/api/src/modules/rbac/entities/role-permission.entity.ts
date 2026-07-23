import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { RolePermEffect } from '../rbac.enums';
import { Role } from './role.entity';
import { Permission } from './permission.entity';

// Bảng `role_permissions` — N–N Role↔Permission + `effect` (deny thắng). PK ghép.
@Entity('role_permissions')
export class RolePermission {
  @PrimaryColumn({ type: 'uuid' })
  roleId!: string;

  @PrimaryColumn({ type: 'uuid' })
  permissionId!: string;

  @Column({
    type: 'enum',
    enum: RolePermEffect,
    enumName: 'role_perm_effect',
    default: RolePermEffect.ALLOW,
  })
  effect!: RolePermEffect;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Role, (role) => role.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission!: Permission;
}
