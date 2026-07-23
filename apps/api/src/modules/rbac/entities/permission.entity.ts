import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Bảng `permissions` — quyền nguyên tử `Module.Action[.Scope]` (rbac.md §3.1).
@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // vd `Place.Edit.Own`; hỗ trợ wildcard `Place.*`, `*`.
  @Column({ type: 'varchar', length: 120, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 60 })
  module!: string;

  @Column({ type: 'varchar', length: 60 })
  action!: string;

  // Own | Managed | Any | null (mức chung).
  @Column({ type: 'varchar', length: 20, nullable: true })
  scope!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  description!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
