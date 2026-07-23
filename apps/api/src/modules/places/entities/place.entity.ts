import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlaceStatus, PriceRange, VerificationStatus, GeoJSONPoint } from '../place.enums';
import { Category } from '../../categories/entities/category.entity';
import { Media } from '../../media/entities/media.entity';
import { PlaceFaq } from './place-faq.entity';
import { PlaceSeo } from './place-seo.entity';
import { PlaceAiSummary } from './place-ai-summary.entity';

// Bảng `places` — thực thể lõi (ADR-001). Chỉ dữ liệu ổn định + cache đọc nhanh.
// location = PostGIS geography(Point,4326); GIST + FTS index tạo ở migration.
// idx_places_status_active — BTREE(status) WHERE deleted_at IS NULL (places.md §3) — cũng
// chỉ tạo ở migration (AddPlacesStatusPartialIndex1720001900000): @Index dưới đây phản ánh
// index thường, index partial WHERE để ở migration (cùng quy ước với Source entity).
@Entity('places')
@Index(['categoryId', 'status'])
export class Place {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 220, unique: true })
  slug!: string;

  @Column({ type: 'uuid' })
  categoryId!: string;

  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326 })
  location!: GeoJSONPoint;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  ward!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  shortDescription!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  openingHours!: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: PriceRange, enumName: 'price_range', nullable: true })
  priceRange!: PriceRange | null;

  @Column({ type: 'uuid', nullable: true })
  coverImageId!: string | null;

  // Cache job-synced (denormalize có kiểm soát).
  @Column({ type: 'decimal', precision: 2, scale: 1, nullable: true })
  ratingAvg!: string | null;

  @Column({ type: 'int', default: 0 })
  ratingCount!: number;

  @Column({ type: 'bigint', default: 0 })
  viewCount!: string;

  @Column({ type: 'enum', enum: PlaceStatus, enumName: 'place_status' })
  status!: PlaceStatus;

  @Column({
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status',
    default: VerificationStatus.PENDING,
  })
  verificationStatus!: VerificationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: 'bigint', nullable: true })
  osmId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => Category, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'category_id' })
  category!: Category;

  @ManyToOne(() => Media, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'cover_image_id' })
  coverImage!: Media | null;

  @OneToMany(() => PlaceFaq, (faq) => faq.place)
  faqs!: PlaceFaq[];

  @OneToOne(() => PlaceSeo, (seo) => seo.place)
  seo!: PlaceSeo;

  @OneToOne(() => PlaceAiSummary, (s) => s.place)
  aiSummary!: PlaceAiSummary;
}
