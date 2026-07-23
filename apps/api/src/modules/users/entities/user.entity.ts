import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserProvider } from '../user.enums';
import { UserRole } from '../../rbac/entities/user-role.entity';

// Bảng `users` (ADR-007: KHÔNG có cột `role` ENUM — vai trò gán qua `user_roles`).
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  // null khi đăng nhập OAuth (không có mật khẩu cục bộ).
  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 120 })
  displayName!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'enum', enum: UserProvider, enumName: 'user_provider', default: UserProvider.LOCAL })
  provider!: UserProvider;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  // AI Agent / service principal (rbac.md §4.10).
  @Column({ type: 'boolean', default: false })
  isServiceAccount!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => UserRole, (userRole) => userRole.user)
  userRoles!: UserRole[];
}
