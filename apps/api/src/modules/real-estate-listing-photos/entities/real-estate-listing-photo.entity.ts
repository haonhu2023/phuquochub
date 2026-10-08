import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('real_estate_listing_photos')
@Index(['listingId', 'sortOrder'])
export class RealEstateListingPhoto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  listingId!: string;

  // Never an absolute/signed URL — same object-storage-metadata-only convention as media.entity.ts.
  @Column({ type: 'varchar', length: 300, unique: true })
  objectKey!: string;

  @Column({ type: 'varchar', length: 100 })
  bucket!: string;

  @Column({ type: 'varchar', length: 100 })
  contentType!: string;

  @Column({ type: 'int' })
  sizeBytes!: number;

  @Column({ type: 'char', length: 64 })
  checksumSha256!: string;

  @Column({ type: 'int' })
  sortOrder!: number;

  @Column({ type: 'uuid' })
  uploadedBy!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
