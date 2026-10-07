import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealEstateListing } from '../entities/real-estate-listing.entity';
import { RealEstateDealStatus, RealEstateListingStatus } from '../real-estate-listings.enums';

export interface ListPublicRealEstateFilter {
  transactionType?: string;
  propertyType?: string;
  ward?: string;
}

@Injectable()
export class RealEstateListingsRepository {
  constructor(@InjectRepository(RealEstateListing) private readonly repo: Repository<RealEstateListing>) {}

  create(data: Partial<RealEstateListing>): Promise<RealEstateListing> {
    return this.repo.save(this.repo.create(data));
  }

  findById(id: string): Promise<RealEstateListing | null> {
    return this.repo.findOne({ where: { id } });
  }

  save(entity: RealEstateListing): Promise<RealEstateListing> {
    return this.repo.save(entity);
  }

  listMine(createdBy: string): Promise<RealEstateListing[]> {
    return this.repo.find({ where: { createdBy }, order: { createdAt: 'DESC' } });
  }

  // Công khai: PUBLISHED, deal_status=AVAILABLE (chưa thuê/đã bán — "còn giao dịch", xem §13u),
  // và chưa hết hạn TẠI THỜI ĐIỂM ĐỌC — cùng nguyên tắc job_listings, không chỉ dựa cron.
  private publicQuery(filter: ListPublicRealEstateFilter) {
    const qb = this.repo
      .createQueryBuilder('r')
      .where('r.status = :status', { status: RealEstateListingStatus.PUBLISHED })
      .andWhere('r.dealStatus = :dealStatus', { dealStatus: RealEstateDealStatus.AVAILABLE })
      .andWhere('(r.expiresAt IS NULL OR r.expiresAt >= CURRENT_DATE)');
    if (filter.transactionType) qb.andWhere('r.transactionType = :transactionType', { transactionType: filter.transactionType });
    if (filter.propertyType) qb.andWhere('r.propertyType = :propertyType', { propertyType: filter.propertyType });
    if (filter.ward) qb.andWhere('r.ward = :ward', { ward: filter.ward });
    return qb;
  }

  listPublic(filter: ListPublicRealEstateFilter, limit: number, offset: number): Promise<RealEstateListing[]> {
    return this.publicQuery(filter).orderBy('r.publishedAt', 'DESC').addOrderBy('r.id', 'ASC').limit(limit).offset(offset).getMany();
  }

  countPublic(filter: ListPublicRealEstateFilter): Promise<number> {
    return this.publicQuery(filter).getCount();
  }

  async getPublicById(id: string): Promise<RealEstateListing | null> {
    return this.publicQuery({}).andWhere('r.id = :id', { id }).getOne();
  }

  listPending(): Promise<RealEstateListing[]> {
    return this.repo.find({ where: { status: RealEstateListingStatus.PENDING }, order: { createdAt: 'ASC' } });
  }
}
