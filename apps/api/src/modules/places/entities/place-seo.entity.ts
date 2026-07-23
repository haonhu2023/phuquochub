import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Place } from './place.entity';

// 1–1 với places: PK = FK (place_id).
@Entity('place_seo')
export class PlaceSeo {
  @PrimaryColumn({ type: 'uuid' })
  placeId!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  metaTitle!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  metaDescription!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  metaKeywords!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  canonicalUrl!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  ogTitle!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  ogDescription!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  ogImageUrl!: string | null;

  @Column({ type: 'boolean', default: false })
  noIndex!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  structuredData!: Record<string, unknown> | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToOne(() => Place, (place) => place.seo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place!: Place;
}
