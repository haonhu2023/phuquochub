import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { RichDoc } from '@phuquochub/shared-types';
import {
  RealEstateAddressPrecision,
  RealEstateDealStatus,
  RealEstateFurnitureStatus,
  RealEstateListingStatus,
  RealEstatePosterRole,
  RealEstatePropertyType,
  RealEstateRentPeriod,
  RealEstateSalePriceBasis,
  RealEstateTransactionType,
} from '../real-estate-listings.enums';

// `real_estate_listings` (InitRealEstateListings, đợt 4 — 2026-10-07). Xem migration cho bảng
// CHECK constraint đầy đủ và docs §13u cho bảng chuyển trạng thái/thiết kế field theo giao dịch.
@Entity('real_estate_listings')
@Index('idx_real_estate_listings_status', ['status'])
@Index('idx_real_estate_listings_created_by', ['createdBy'])
export class RealEstateListing {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  createdBy!: string;

  @Column({ type: 'enum', enum: RealEstatePosterRole, enumName: 'real_estate_poster_role' })
  posterRole!: RealEstatePosterRole;

  @Column({ type: 'enum', enum: RealEstateTransactionType, enumName: 'real_estate_transaction_type' })
  transactionType!: RealEstateTransactionType;

  @Column({ type: 'enum', enum: RealEstatePropertyType, enumName: 'real_estate_property_type' })
  propertyType!: RealEstatePropertyType;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ward!: string | null;

  @Column({
    type: 'enum',
    enum: RealEstateAddressPrecision,
    enumName: 'real_estate_address_precision',
    default: RealEstateAddressPrecision.AREA,
  })
  addressPrecision!: RealEstateAddressPrecision;

  @Column({ type: 'varchar', length: 300, nullable: true })
  addressText!: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  lat!: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  lng!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  areaSqm!: string | null;

  @Column({ type: 'numeric', precision: 16, scale: 2, nullable: true })
  price!: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  priceCurrency!: string | null;

  @Column({ type: 'enum', enum: RealEstateRentPeriod, enumName: 'real_estate_rent_period', nullable: true })
  rentPeriod!: RealEstateRentPeriod | null;

  @Column({ type: 'enum', enum: RealEstateSalePriceBasis, enumName: 'real_estate_sale_price_basis', nullable: true })
  salePriceBasis!: RealEstateSalePriceBasis | null;

  @Column({ type: 'numeric', precision: 16, scale: 2, nullable: true })
  depositAmount!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  utilitiesNote!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  utilitiesNoteRich!: RichDoc | null;

  @Column({ type: 'char', length: 64, nullable: true })
  utilitiesNoteRichHash!: string | null;

  @Column({ type: 'enum', enum: RealEstateFurnitureStatus, enumName: 'real_estate_furniture_status', nullable: true })
  furnitureStatus!: RealEstateFurnitureStatus | null;

  @Column({ type: 'date', nullable: true })
  moveInDate!: string | null;

  @Column({ type: 'int', nullable: true })
  leaseTermMonths!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  legalStatusNote!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  legalStatusNoteRich!: RichDoc | null;

  @Column({ type: 'char', length: 64, nullable: true })
  legalStatusNoteRichHash!: string | null;

  // Gói D (18/10/2026, mở rộng sau job_listings) — cùng mẫu + cơ chế hash chống rollback với
  // job_listings (apps/api/src/common/rich-text-field.ts) — không viết lại logic, chỉ nhân bản cột.
  @Column({ type: 'varchar', length: 4000, nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  descriptionRich!: RichDoc | null;

  @Column({ type: 'char', length: 64, nullable: true })
  descriptionRichHash!: string | null;

  @Column({ type: 'varchar', length: 30 })
  contactMethod!: string;

  @Column({ type: 'varchar', length: 200 })
  contactValue!: string;

  @Column({
    type: 'enum',
    enum: RealEstateListingStatus,
    enumName: 'real_estate_listing_status',
    default: RealEstateListingStatus.DRAFT,
  })
  status!: RealEstateListingStatus;

  @Column({
    type: 'enum',
    enum: RealEstateDealStatus,
    enumName: 'real_estate_deal_status',
    default: RealEstateDealStatus.AVAILABLE,
  })
  dealStatus!: RealEstateDealStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  reviewNote!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewerId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'date', nullable: true })
  expiresAt!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
