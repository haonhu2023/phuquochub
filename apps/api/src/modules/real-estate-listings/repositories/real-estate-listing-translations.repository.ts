import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RealEstateListingTranslation } from '../entities/real-estate-listing-translation.entity';
import { RealEstateListingTranslationStatus } from '../real-estate-listings.enums';

const LOCALE_EN = 'en';

// Cùng khuôn job-listing-translations.repository.ts (xem ghi chú đầy đủ ở đó) — CAS qua
// content_version (hand-rolled, cùng PlacesRepository.updateScalarsWithCas()).
@Injectable()
export class RealEstateListingTranslationsRepository {
  constructor(@InjectRepository(RealEstateListingTranslation) private readonly repo: Repository<RealEstateListingTranslation>) {}

  findByRealEstateListingId(realEstateListingId: string): Promise<RealEstateListingTranslation | null> {
    return this.repo.findOne({ where: { realEstateListingId, locale: LOCALE_EN } });
  }

  insertNew(entity: RealEstateListingTranslation): Promise<RealEstateListingTranslation> {
    return this.repo.save(entity);
  }

  create(realEstateListingId: string): RealEstateListingTranslation {
    const entity = new RealEstateListingTranslation();
    entity.realEstateListingId = realEstateListingId;
    entity.locale = LOCALE_EN;
    entity.status = RealEstateListingTranslationStatus.DRAFT;
    return entity;
  }

  async updateWithCas(id: string, patch: Partial<RealEstateListingTranslation>, expectedVersion: number): Promise<boolean> {
    const result = await this.repo.update({ id, contentVersion: expectedVersion }, { ...patch, contentVersion: expectedVersion + 1 });
    return (result.affected ?? 0) > 0;
  }

  listPending(): Promise<RealEstateListingTranslation[]> {
    return this.repo.find({ where: { status: RealEstateListingTranslationStatus.PENDING }, order: { createdAt: 'ASC' } });
  }

  async findByRealEstateListingIds(realEstateListingIds: string[]): Promise<Map<string, RealEstateListingTranslation>> {
    if (realEstateListingIds.length === 0) return new Map();
    const rows = await this.repo.find({ where: { realEstateListingId: In(realEstateListingIds), locale: LOCALE_EN } });
    return new Map(rows.map((r) => [r.realEstateListingId, r]));
  }
}
