import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Role } from './role.entity';

// Bảng `role_parents` — kế thừa vai trò (DAG). PK ghép (role_id, parent_role_id).
// CHECK(role_id <> parent_role_id) + không chu trình: cưỡng chế ở tầng nghiệp vụ + migration.
@Entity('role_parents')
export class RoleParent {
  @PrimaryColumn({ type: 'uuid' })
  roleId!: string; // vai trò con

  @PrimaryColumn({ type: 'uuid' })
  parentRoleId!: string; // vai trò cha

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Role, (role) => role.parentLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @ManyToOne(() => Role, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'parent_role_id' })
  parent!: Role;
}
