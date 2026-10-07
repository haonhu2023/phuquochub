import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { clampLimit, clampPage, paginate } from '../../common/pagination';
import { AuthorizationService } from '../authz/authorization.service';
import { JobListingsRepository } from './repositories/job-listings.repository';
import { JobListing } from './entities/job-listing.entity';
import { JobListingStatus } from './job-listings.enums';
import { DecideJobListingDto, ListJobListingsQueryDto, UpsertJobListingDto } from './dto/job-listings.dto';

// Bảng chuyển trạng thái đã chốt (docs/delivery/release-web-candidate-2026-10-04.md §13r):
//   draft --submit--> pending
//   pending --decide(approve)--> published ; --decide(reject)--> rejected
//   rejected --submit--> pending (gửi lại trực tiếp, KHÔNG qua lại draft)
//   draft|pending --update--> draft (sửa nội dung rút khỏi hàng đợi, không phải status-bypass)
//   published --close--> closed (chủ tin hoặc moderator)
//   closed --reopen--> pending (mở lại LUÔN cần duyệt lại — không có đường tắt về published)
// Hết hạn (`expires_at`) KHÔNG phải một status — chỉ lọc ở thời điểm đọc công khai (repository),
// cột status của một tin published-nhưng-quá-hạn không đổi; chủ tin vẫn thấy tin đó ở "Tin của tôi".
@Injectable()
export class JobListingsService {
  constructor(
    private readonly repo: JobListingsRepository,
    private readonly authz: AuthorizationService,
  ) {}

  private static assertSalaryRange(dto: UpsertJobListingDto): void {
    if (dto.salary_min != null && dto.salary_max != null && dto.salary_min > dto.salary_max) {
      throw new BadRequestException('salary_min không được lớn hơn salary_max');
    }
    const hasAnySalaryField = dto.salary_min != null || dto.salary_max != null;
    if (hasAnySalaryField && !dto.salary_negotiable && !dto.salary_currency) {
      throw new BadRequestException('Có mức lương thì phải có salary_currency (hoặc đánh dấu salary_negotiable)');
    }
  }

  private static applyDto(entity: JobListing, dto: UpsertJobListingDto): void {
    entity.employerName = dto.employer_name;
    entity.employerRole = dto.employer_role ?? null;
    entity.placeId = dto.place_id ?? null;
    entity.title = dto.title;
    entity.jobCategory = dto.job_category;
    entity.ward = dto.ward ?? null;
    entity.workLocation = dto.work_location;
    entity.employmentType = dto.employment_type;
    entity.salaryMin = dto.salary_min != null ? String(dto.salary_min) : null;
    entity.salaryMax = dto.salary_max != null ? String(dto.salary_max) : null;
    entity.salaryNegotiable = dto.salary_negotiable ?? false;
    entity.salaryCurrency = dto.salary_currency ?? null;
    entity.salaryPeriod = dto.salary_period ?? null;
    entity.shiftInfo = dto.shift_info ?? null;
    entity.requirements = dto.requirements ?? null;
    entity.benefits = dto.benefits ?? null;
    entity.description = dto.description ?? null;
    entity.contactMethod = dto.contact_method;
    entity.contactValue = dto.contact_value;
    entity.expiresAt = dto.expires_at ?? null;
  }

  async create(dto: UpsertJobListingDto, userId: string): Promise<JobListing> {
    JobListingsService.assertSalaryRange(dto);
    const entity = new JobListing();
    JobListingsService.applyDto(entity, dto);
    entity.createdBy = userId;
    entity.status = JobListingStatus.DRAFT;
    return this.repo.create(entity);
  }

  private async loadOwned(id: string, userId: string): Promise<JobListing> {
    const row = await this.repo.findById(id);
    if (!row || row.createdBy !== userId) throw new NotFoundException('Không tìm thấy tin tuyển dụng');
    return row;
  }

  // §13r đã chốt: sửa khi đang `pending` rút tin về `draft` (ra khỏi hàng đợi); sửa khi đang
  // `published` đẩy NGAY về `pending` (ẩn khỏi công khai tức thì, buộc duyệt lại nội dung mới —
  // quyết định có ý thức KHÔNG xây overlay "bản sửa chờ duyệt song song bản public" cho MVP này, xem
  // lý do trong §13r). `closed` KHÔNG nằm trong bảng chuyển trạng thái của update() — phải `reopen()`
  // (→ pending, luôn qua duyệt lại) trước khi sửa, tránh một hành vi ngầm gộp "mở lại" và "sửa".
  async update(id: string, dto: UpsertJobListingDto, userId: string): Promise<JobListing> {
    JobListingsService.assertSalaryRange(dto);
    const row = await this.loadOwned(id, userId);
    if (row.status === JobListingStatus.CLOSED) {
      throw new ConflictException('Không thể sửa tin đã đóng — hãy mở lại tin trước (sẽ cần duyệt lại)');
    }
    const wasPublished = row.status === JobListingStatus.PUBLISHED;
    JobListingsService.applyDto(row, dto);
    if (row.status === JobListingStatus.PENDING) {
      row.status = JobListingStatus.DRAFT;
      row.reviewNote = null;
      row.reviewerId = null;
      row.reviewedAt = null;
    } else if (wasPublished) {
      row.status = JobListingStatus.PENDING;
      row.reviewNote = null;
      row.reviewerId = null;
      row.reviewedAt = null;
      row.publishedAt = null;
    }
    return this.repo.save(row);
  }

  async submit(id: string, userId: string): Promise<JobListing> {
    const row = await this.loadOwned(id, userId);
    if (row.status !== JobListingStatus.DRAFT && row.status !== JobListingStatus.REJECTED) {
      throw new ConflictException(`Không thể gửi duyệt từ trạng thái "${row.status}"`);
    }
    row.status = JobListingStatus.PENDING;
    row.reviewNote = null;
    row.reviewerId = null;
    row.reviewedAt = null;
    return this.repo.save(row);
  }

  // Đóng/mở lại: chủ tin HOẶC moderator (`JobListing.Moderate`) — quyết định quyền nằm TẠI ĐÂY, một
  // chỗ duy nhất (cùng lý do ModerationService.decide() dùng authz.can() tại service thay vì
  // @RequirePermissions tĩnh: hành vi phụ thuộc bản ghi, không biết trước lúc route được khai).
  private async loadOwnedOrModerated(id: string, userId: string): Promise<JobListing> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Không tìm thấy tin tuyển dụng');
    if (row.createdBy === userId) return row;
    if (await this.authz.can(userId, 'JobListing.Moderate')) return row;
    throw new ForbiddenException();
  }

  async close(id: string, userId: string): Promise<JobListing> {
    const row = await this.loadOwnedOrModerated(id, userId);
    if (row.status !== JobListingStatus.PUBLISHED) {
      throw new ConflictException(`Không thể đóng từ trạng thái "${row.status}"`);
    }
    row.status = JobListingStatus.CLOSED;
    return this.repo.save(row);
  }

  async reopen(id: string, userId: string): Promise<JobListing> {
    const row = await this.loadOwnedOrModerated(id, userId);
    if (row.status !== JobListingStatus.CLOSED) {
      throw new ConflictException(`Không thể mở lại từ trạng thái "${row.status}"`);
    }
    row.status = JobListingStatus.PENDING;
    row.reviewNote = null;
    row.reviewerId = null;
    row.reviewedAt = null;
    row.publishedAt = null;
    return this.repo.save(row);
  }

  async decide(id: string, dto: DecideJobListingDto, moderatorId: string): Promise<JobListing> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Không tìm thấy tin tuyển dụng');
    if (row.status !== JobListingStatus.PENDING) {
      throw new ConflictException(`Không thể duyệt từ trạng thái "${row.status}"`);
    }
    row.reviewerId = moderatorId;
    row.reviewedAt = new Date();
    row.reviewNote = dto.note ?? null;
    if (dto.decision === 'approve') {
      row.status = JobListingStatus.PUBLISHED;
      row.publishedAt = new Date();
    } else {
      row.status = JobListingStatus.REJECTED;
    }
    return this.repo.save(row);
  }

  listPending(): Promise<JobListing[]> {
    return this.repo.listPending();
  }

  listMine(userId: string): Promise<JobListing[]> {
    return this.repo.listMine(userId);
  }

  async getMine(id: string, userId: string): Promise<JobListing> {
    return this.loadOwned(id, userId);
  }

  async listPublic(query: ListJobListingsQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const filter = { jobCategory: query.job_category, ward: query.ward, employmentType: query.employment_type };
    const [items, total] = await Promise.all([
      this.repo.listPublic(filter, limit, (page - 1) * limit),
      this.repo.countPublic(filter),
    ]);
    return paginate(items, page, limit, total);
  }

  async getPublicById(id: string): Promise<JobListing> {
    const row = await this.repo.getPublicById(id);
    // 404 đồng nhất cho "không tồn tại" và "tồn tại nhưng chưa/không còn công khai" — không rò trạng
    // thái nội bộ qua sự khác biệt giữa hai loại lỗi.
    if (!row) throw new NotFoundException('Không tìm thấy tin tuyển dụng');
    return row;
  }
}
