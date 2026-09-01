import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Bảng `place_translation_seo` (ADR-020 §"Decision 4", MAP-032). KHÔNG chạm/đọc `place_seo` hiện
// hữu (single-locale) — cutover là quyết định để ngỏ, xem ADR "Coexistence with place_seo".
// robots_index mặc định false; CHECK ở migration (ck_place_seo_index_index_needs_translation) buộc
// translation_id_title khác NULL khi robots_index=true — đây là dạng thực thi ở tầng schema của
// MAP-032 "Không fallback SEO tiếng Anh sang tiếng Việt": một hàng SEO chỉ được đánh index khi có
// bản dịch thật đứng sau, không bao giờ rơi về nội dung tiếng Việt.
@Entity('place_translation_seo')
@Index('idx_place_seo_hreflang', ['hreflangGroupId'])
export class PlaceTranslationSeo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  placeId!: string;

  @Column({ type: 'varchar', length: 35 })
  localeCode!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  seoTitle!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  seoDescription!: string | null;

  @Column({ type: 'varchar', length: 300 })
  canonicalUrl!: string;

  // Cùng một uuid ở mọi locale-row của MỘT trang logic — nhóm hreflang (vi/en/…) và đích x-default
  // được tính bằng cách gom theo cột này, không cần bảng hreflang riêng cho hai locale.
  @Column({ type: 'uuid' })
  hreflangGroupId!: string;

  @Column({ type: 'boolean', default: false })
  robotsIndex!: boolean;

  @Column({ type: 'boolean', default: true })
  robotsFollow!: boolean;

  @Column({ type: 'varchar', length: 160, nullable: true })
  ogTitle!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  ogDescription!: string | null;

  // Xuất xứ: bản dịch nào tạo ra title/description này — không tự nhân bản text, chỉ trỏ FK.
  @Column({ type: 'uuid', nullable: true })
  translationIdTitle!: string | null;

  @Column({ type: 'uuid', nullable: true })
  translationIdDescription!: string | null;

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
