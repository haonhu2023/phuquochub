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

export interface ListAdminRealEstateFilter {
  status?: RealEstateListingStatus;
  createdBy?: string;
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
  //
  // Bug thật đã sửa 2026-10-17 — CÙNG nguyên nhân/cách sửa với JobListingsRepository.publicQuery()
  // (xem ghi chú đầy đủ ở đó): `CURRENT_DATE` theo UTC (production), lệch với "hôm nay" theo
  // Asia/Ho_Chi_Minh mà dashboard dùng — tới 7 giờ/ngày tin đã hết hạn theo lịch VN vẫn bị API công
  // khai phục vụ tiếp. Không đổi `expires_at` đã lưu, chỉ đổi điều kiện so sánh.
  private publicQuery(filter: ListPublicRealEstateFilter) {
    const qb = this.repo
      .createQueryBuilder('r')
      .where('r.status = :status', { status: RealEstateListingStatus.PUBLISHED })
      .andWhere('r.dealStatus = :dealStatus', { dealStatus: RealEstateDealStatus.AVAILABLE })
      .andWhere("(r.expiresAt IS NULL OR r.expiresAt >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)");
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

  // Màn hình quản lý TOÀN BỘ tin (admin) — cùng lý do/mẫu JobListingsRepository.listAllForAdmin()
  // (xem ghi chú đầy đủ ở đó): khác listPending() (chỉ pending), mọi status, lọc theo người đăng.
  private adminQuery(filter: ListAdminRealEstateFilter) {
    const qb = this.repo.createQueryBuilder('r');
    if (filter.status) qb.andWhere('r.status = :status', { status: filter.status });
    if (filter.createdBy) qb.andWhere('r.createdBy = :createdBy', { createdBy: filter.createdBy });
    return qb;
  }

  listAllForAdmin(filter: ListAdminRealEstateFilter, limit: number, offset: number): Promise<RealEstateListing[]> {
    return this.adminQuery(filter).orderBy('r.createdAt', 'DESC').limit(limit).offset(offset).getMany();
  }

  countAllForAdmin(filter: ListAdminRealEstateFilter): Promise<number> {
    return this.adminQuery(filter).getCount();
  }

  async findCreatorSummaries(userIds: string[]): Promise<Map<string, { email: string; display_name: string }>> {
    if (userIds.length === 0) return new Map();
    const rows: Array<{ id: string; email: string; display_name: string }> = await this.repo.manager.query(
      `SELECT id, email, display_name FROM users WHERE id = ANY($1)`,
      [userIds],
    );
    return new Map(rows.map((r) => [r.id, { email: r.email, display_name: r.display_name }]));
  }
}
