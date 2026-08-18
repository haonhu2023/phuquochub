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

  /**
   * NHÃN KHU VỰC hiển thị/lọc (vd `Dương Đông`, `Bãi Trường`) — KHÔNG phải đơn vị hành chính.
   *
   * Tên cột là di sản: khi seed, các giá trị này ĐANG là phường/xã. Từ 01/7/2025 (Nghị quyết
   * 1654/NQ-UBTVQH15) 2 phường + 6 xã của Phú Quốc nhập thành MỘT `đặc khu Phú Quốc` thuộc tỉnh
   * An Giang, nên chúng không còn là đơn vị hành chính — nhưng vẫn là địa danh có thật và vẫn là
   * cách khách định vị ("ở Dương Đông"), nên vẫn dùng cho `?ward=` và ô lọc bản đồ/tìm kiếm.
   *
   * Cột KHÔNG đổi tên vì nó nằm trong hợp đồng công khai (PlaceCard/PlaceDetail + tham số lọc);
   * đơn vị hành chính có cột riêng bên dưới. Đừng ghi `đặc khu Phú Quốc`/`An Giang` vào đây.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  ward!: string | null;

  /**
   * Tỉnh/thành phố trực thuộc trung ương (vd `An Giang`) → schema.org `addressRegion`.
   *
   * Tồn tại để tầng SEO không phải hard-code địa danh: trước đây `structured-data.ts` gắn cứng
   * `addressRegion: 'Kiên Giang'` cho MỌI place, và giá trị đó đã sai kể từ 01/7/2025 mà không có
   * cột nào sửa được. NULL = chưa xác minh → tầng SEO bỏ trường đó đi, không đoán.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  province!: string | null;

  /**
   * Đơn vị hành chính cấp xã hiện hành (vd `Đặc khu Phú Quốc`) → schema.org `addressLocality`.
   *
   * Tách khỏi `ward` có chủ đích: `ward` là nhãn khu vực cho người đọc, cột này là đơn vị hành
   * chính theo pháp luật. Không gộp, vì đó chính là cách dữ liệu hành chính lẫn vào trường khu
   * vực rồi phải sửa hàng loạt bằng thay-chuỗi mỗi lần địa giới thay đổi.
   *
   * Biến thiên thật, không phải hằng số: An Giang còn `đặc khu Thổ Châu` — cũng là đảo, cũng có
   * thể vào phạm vi nội dung của site.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  adminArea!: string | null;

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
