import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealEstateListingPhoto } from '../entities/real-estate-listing-photo.entity';

export interface CreateRealEstateListingPhotoParams {
  listingId: string;
  objectKey: string;
  bucket: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  sortOrder: number;
  uploadedBy: string;
}

const MAX_PHOTOS_PER_LISTING = 10;

@Injectable()
export class RealEstateListingPhotosRepository {
  constructor(@InjectRepository(RealEstateListingPhoto) private readonly repo: Repository<RealEstateListingPhoto>) {}

  get maxPerListing(): number {
    return MAX_PHOTOS_PER_LISTING;
  }

  countByListing(listingId: string): Promise<number> {
    return this.repo.count({ where: { listingId } });
  }

  async nextSortOrder(listingId: string): Promise<number> {
    const { max } = (await this.repo
      .createQueryBuilder('p')
      .select('MAX(p.sortOrder)', 'max')
      .where('p.listingId = :listingId', { listingId })
      .getRawOne<{ max: number | null }>()) ?? { max: null };
    return (max ?? -1) + 1;
  }

  listByListing(listingId: string): Promise<RealEstateListingPhoto[]> {
    return this.repo.find({ where: { listingId }, order: { sortOrder: 'ASC' } });
  }

  findByIdAndListing(id: string, listingId: string): Promise<RealEstateListingPhoto | null> {
    return this.repo.findOne({ where: { id, listingId } });
  }

  async create(params: CreateRealEstateListingPhotoParams): Promise<RealEstateListingPhoto> {
    const row = this.repo.create(params);
    return this.repo.save(row);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
