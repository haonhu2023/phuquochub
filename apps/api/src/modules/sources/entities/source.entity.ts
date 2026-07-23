import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SourceType, SourceKind } from '../sources.enums';

// Bảng `sources` — danh mục nguồn tái sử dụng (source.md §4). type/kind là enum thật
// (tập đóng), khác owner_type/entity_type đa hình (VARCHAR) ở các bảng khác.
// Index đầy đủ (gồm 2 index partial WHERE) tạo ở migration; @Index dưới đây chỉ phản
// ánh index thường (đồng bộ tài liệu — synchronize=false nên không có tác dụng DDL).
@Entity('sources')
@Index(['type'])
export class Source {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: SourceType, enumName: 'source_type' })
  type!: SourceType;

  @Column({ type: 'enum', enum: SourceKind, enumName: 'source_kind' })
  kind!: SourceKind;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  url!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  externalRef!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  publisher!: string | null;

  @Column({ type: 'uuid', nullable: true })
  authorUserId!: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  license!: string | null;

  @Column({ type: 'smallint' })
  reliability!: number;

  @Column({ type: 'char', length: 2, nullable: true })
  language!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  retrievedAt!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
