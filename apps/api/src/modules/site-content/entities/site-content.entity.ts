import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// S1 (2026-09-22). One row per (key, locale) — see SiteContentSchema1720006400000's migration
// comment for why `locale` is never NULL (sentinel `'*'` for locale-independent keys instead).
@Entity('site_content')
export class SiteContentEntity {
  @PrimaryColumn({ type: 'varchar', length: 60 })
  key!: string;

  @PrimaryColumn({ type: 'varchar', length: 5 })
  locale!: string;

  @Column({ type: 'jsonb' })
  value!: Record<string, unknown>;

  @Column({ type: 'int', default: 1 })
  contentVersion!: number;

  @Column({ type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
