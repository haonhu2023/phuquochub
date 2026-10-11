import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { JobListing } from '../entities/job-listing.entity';
import { JobListingStatus } from '../job-listings.enums';

export interface ListPublicJobListingsFilter {
  jobCategory?: string;
  ward?: string;
  employmentType?: string;
}

@Injectable()
export class JobListingsRepository {
  constructor(@InjectRepository(JobListing) private readonly repo: Repository<JobListing>) {}

  create(data: Partial<JobListing>): Promise<JobListing> {
    return this.repo.save(this.repo.create(data));
  }

  findById(id: string): Promise<JobListing | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByIdForUpdate(id: string, manager: EntityManager): Promise<JobListing | null> {
    return manager.getRepository(JobListing).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  save(entity: JobListing, manager?: EntityManager): Promise<JobListing> {
    return (manager ? manager.getRepository(JobListing) : this.repo).save(entity);
  }

  listMine(createdBy: string): Promise<JobListing[]> {
    return this.repo.find({ where: { createdBy }, order: { createdAt: 'DESC' } });
  }

  // Công khai: chỉ PUBLISHED và chưa hết hạn — xét `expires_at` TẠI THỜI ĐIỂM ĐỌC (không đổi cột status),
  // cùng nguyên tắc "cache không làm tin hết hạn tiếp tục hiện như còn hoạt động" áp cho tầng truy vấn.
  private publicQuery(filter: ListPublicJobListingsFilter) {
    const qb = this.repo
      .createQueryBuilder('j')
      .where('j.status = :status', { status: JobListingStatus.PUBLISHED })
      .andWhere('(j.expiresAt IS NULL OR j.expiresAt >= CURRENT_DATE)');
    if (filter.jobCategory) qb.andWhere('j.jobCategory = :jobCategory', { jobCategory: filter.jobCategory });
    if (filter.ward) qb.andWhere('j.ward = :ward', { ward: filter.ward });
    if (filter.employmentType) qb.andWhere('j.employmentType = :employmentType', { employmentType: filter.employmentType });
    return qb;
  }

  async listPublic(filter: ListPublicJobListingsFilter, limit: number, offset: number): Promise<JobListing[]> {
    return this.publicQuery(filter).orderBy('j.publishedAt', 'DESC').addOrderBy('j.id', 'ASC').limit(limit).offset(offset).getMany();
  }

  async countPublic(filter: ListPublicJobListingsFilter): Promise<number> {
    return this.publicQuery(filter).getCount();
  }

  // Chi tiết công khai: cùng điều kiện PUBLISHED + chưa hết hạn — một tin đã đóng/hết hạn/nháp 404,
  // không phân biệt với "không tồn tại" (không lộ trạng thái nội bộ qua khác biệt 403 và 404).
  async getPublicById(id: string): Promise<JobListing | null> {
    return this.publicQuery({}).andWhere('j.id = :id', { id }).getOne();
  }

  // Hàng chờ duyệt cho moderator.
  listPending(): Promise<JobListing[]> {
    return this.repo.find({ where: { status: JobListingStatus.PENDING }, order: { createdAt: 'ASC' } });
  }

  // "Place tùy chọn" (mục V đợt 3) — chỉ tên/slug để hiện một liên kết có ý nghĩa, KHÔNG injected
  // PlacesService/PlacesRepository (tránh coupling module không cần thiết cho một lookup đơn giản,
  // cùng mẫu MediaRepository.placeExists() đã dùng raw SQL trực tiếp vào bảng places). `place_id`
  // không được validate tồn tại lúc ghi (DTO chỉ kiểm UUID) — trả `null` nếu không khớp hàng nào,
  // KHÔNG throw, vì liên kết này không cấp quyền gì và không phải điều kiện bắt buộc.
  async findPlaceSummary(placeId: string): Promise<{ id: string; name: string; slug: string } | null> {
    const rows = await this.repo.manager.query(
      `SELECT id, name, slug FROM places WHERE id = $1 AND deleted_at IS NULL`,
      [placeId],
    );
    return rows[0] ?? null;
  }
}
