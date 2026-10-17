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

export interface ListAdminJobListingsFilter {
  status?: JobListingStatus;
  createdBy?: string;
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
  //
  // Bug thật đã sửa 2026-10-17: `CURRENT_DATE` lấy theo timezone PHIÊN/SERVER Postgres, đã xác nhận
  // production chạy `Etc/UTC` (`SHOW timezone`) — KHÔNG phải Asia/Ho_Chi_Minh mà dashboard chủ tin
  // dùng để tính "hôm nay"/trạng thái hết hạn (xem apps/web/src/lib/listingExpiry.ts). Hệ quả đo
  // được: trong khung ~7 giờ đầu mỗi ngày giờ Việt Nam (00:00–07:00, ứng với UTC 17:00–24:00hôm
  // trước), một tin đã hết hạn theo lịch Việt Nam (dashboard đã báo "Đã hết hạn") vẫn bị
  // `CURRENT_DATE` (còn ở "hôm qua" theo UTC) coi là CÒN HẠN — API công khai tiếp tục phục vụ tin
  // đó quá hạn tới 7 giờ. Xác nhận trực tiếp bằng SQL thật trên production (chỉ đọc, không ghi):
  // `('2026-10-17 23:00+00'::timestamptz)::date` = 2026-10-17 (UTC) nhưng
  // `(... AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` = 2026-10-18 (VN, đã sang ngày mới).
  // Sửa bằng cách tính "hôm nay" tường minh theo Asia/Ho_Chi_Minh NGAY TRONG câu SQL — khớp đúng
  // quy ước `todayInVietnam()` phía dashboard, không phụ thuộc timezone cấu hình của session/server
  // Postgres. KHÔNG đổi giá trị `expires_at` nào đã lưu — chỉ đổi điều kiện so sánh tại thời điểm đọc.
  private publicQuery(filter: ListPublicJobListingsFilter) {
    const qb = this.repo
      .createQueryBuilder('j')
      .where('j.status = :status', { status: JobListingStatus.PUBLISHED })
      .andWhere("(j.expiresAt IS NULL OR j.expiresAt >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)");
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

  // Màn hình quản lý TOÀN BỘ tin (admin) — khác hẳn listPending(): mọi status, lọc theo người đăng.
  // Gói B (17/10/2026): owner xác nhận "hàng chờ duyệt" (pending-only) KHÔNG phải màn hình quản lý
  // tổng thể — moderator không có cách nào tìm tin đã published/closed/expired của người khác.
  private adminQuery(filter: ListAdminJobListingsFilter) {
    const qb = this.repo.createQueryBuilder('j');
    if (filter.status) qb.andWhere('j.status = :status', { status: filter.status });
    if (filter.createdBy) qb.andWhere('j.createdBy = :createdBy', { createdBy: filter.createdBy });
    return qb;
  }

  listAllForAdmin(filter: ListAdminJobListingsFilter, limit: number, offset: number): Promise<JobListing[]> {
    return this.adminQuery(filter).orderBy('j.createdAt', 'DESC').limit(limit).offset(offset).getMany();
  }

  countAllForAdmin(filter: ListAdminJobListingsFilter): Promise<number> {
    return this.adminQuery(filter).getCount();
  }

  // Tra tên hiển thị/email người đăng cho màn hình admin — một truy vấn batch (cùng mẫu tránh N+1
  // của ReviewsRepository.listPublishedByPlace() JOIN users), KHÔNG N truy vấn riêng cho mỗi tin.
  // `created_by` không có FK đến users ở tầng entity (chỉ cột uuid trần, xem job-listing.entity.ts)
  // nên tra trực tiếp bằng raw SQL, cùng mẫu findPlaceSummary() ở trên.
  async findCreatorSummaries(userIds: string[]): Promise<Map<string, { email: string; display_name: string }>> {
    if (userIds.length === 0) return new Map();
    const rows: Array<{ id: string; email: string; display_name: string }> = await this.repo.manager.query(
      `SELECT id, email, display_name FROM users WHERE id = ANY($1)`,
      [userIds],
    );
    return new Map(rows.map((r) => [r.id, { email: r.email, display_name: r.display_name }]));
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
