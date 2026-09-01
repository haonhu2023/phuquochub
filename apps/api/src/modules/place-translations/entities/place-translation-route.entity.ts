import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Bảng `place_translation_routes` (ADR-020 §"Decision 3", MAP-031). Slug duy nhất THEO LOCALE
// (partial unique index (locale_code, localized_slug) WHERE is_current ở migration) — vi và en có
// thể trùng chuỗi slug mà không xung đột nhau. Đổi slug KHÔNG BAO GIỜ xoá hàng cũ: hàng cũ được giữ
// lại với is_redirect=true, is_current=false để URL cũ vẫn resolve được (MAP-031 "giữ redirect khi
// thay đổi").
@Entity('place_translation_routes')
@Index('idx_place_route_place', ['placeId', 'localeCode'])
export class PlaceTranslationRoute {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  @Column({ type: 'varchar', length: 35 })
  localeCode!: string;

  @Column({ type: 'varchar', length: 220 })
  localizedSlug!: string;

  @Column({ type: 'varchar', length: 300 })
  fullPath!: string;

  @Column({ type: 'varchar', length: 300 })
  canonicalUrl!: string;

  @Column({ type: 'boolean', default: true })
  isCanonical!: boolean;

  @Column({ type: 'varchar', length: 220, nullable: true })
  redirectFromSlug!: string | null;

  @Column({ type: 'boolean', default: false })
  isRedirect!: boolean;

  @Column({ type: 'uuid' })
  revisionId!: string;

  @Column({ type: 'boolean', default: false })
  isCurrent!: boolean;

  @Column({ type: 'boolean', default: false })
  isPublic!: boolean;

  @Column({ type: 'boolean', default: false })
  isProductionData!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
