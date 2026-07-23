import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

// Bảng `categories` — phân loại địa điểm, cây phân cấp qua parent_id (self-ref).
// Khớp prisma/schema.prisma: KHÔNG có created_at/updated_at.
@Entity('categories')
@Index(['parentId'])
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 120 })
  nameVi!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  nameEn!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  icon!: string | null;

  @Column({ type: 'uuid', nullable: true })
  parentId!: string | null;

  @ManyToOne(() => Category, (category) => category.children, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'parent_id' })
  parent!: Category | null;

  @OneToMany(() => Category, (category) => category.parent)
  children!: Category[];
}
