import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { clampLimit, clampPage, paginate } from '../../common/pagination';
import { todayInVietnam } from '../../common/vn-today';
import { AuthorizationService } from '../authz/authorization.service';
import { JobListingsRepository } from './repositories/job-listings.repository';
import { JobListing } from './entities/job-listing.entity';
import { JobListingStatus } from './job-listings.enums';
import { AdminListJobListingsQueryDto, DecideJobListingDto, ListJobListingsQueryDto, UpsertJobListingDto } from './dto/job-listings.dto';
import { toJobListingAdminView, toJobListingModeratorView, toJobListingPublicView, toJobListingSenderView } from './job-listings.mapper';

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

  // "Sửa và gửi đăng lại" (Gói B, 17/10/2026) — owner yêu cầu RÕ "chọn hạn mới hợp lệ" khi gửi lại
  // một tin. KHÔNG phải chính sách 30/60/90 ngày (vẫn chưa được duyệt, không tự áp dụng) — chỉ một
  // kiểm tra tối thiểu, độc lập với chính sách đó: không cho lưu một `expires_at` đã ở QUÁ KHỨ theo
  // lịch Việt Nam (so với `todayInVietnam()`, CÙNG quy ước repository dùng để lọc công khai). Trước
  // khi có kiểm này, một tin có thể được gửi duyệt lại với hạn cũ đã qua — nếu được duyệt, tin
  // "published" nhưng KHÔNG BAO GIỜ hiện công khai (bị publicQuery() loại ngay), một trạng thái mâu
  // thuẫn khó phát hiện. `expires_at` null (không đặt hạn) vẫn hợp lệ — không bắt buộc phải có hạn.
  private static assertValidExpiry(dto: UpsertJobListingDto): void {
    if (dto.expires_at != null && dto.expires_at < todayInVietnam()) {
      throw new BadRequestException('Hạn tuyển không được là một ngày trong quá khứ — chọn hôm nay hoặc sau đó');
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

  async create(dto: UpsertJobListingDto, userId: string): Promise<ReturnType<typeof toJobListingSenderView>> {
    JobListingsService.assertSalaryRange(dto);
    JobListingsService.assertValidExpiry(dto);
    const entity = new JobListing();
    JobListingsService.applyDto(entity, dto);
    entity.createdBy = userId;
    entity.status = JobListingStatus.DRAFT;
    const saved = await this.repo.create(entity);
    return toJobListingSenderView(saved);
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
  async update(id: string, dto: UpsertJobListingDto, userId: string): Promise<ReturnType<typeof toJobListingSenderView>> {
    JobListingsService.assertSalaryRange(dto);
    JobListingsService.assertValidExpiry(dto);
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
    const saved = await this.repo.save(row);
    return toJobListingSenderView(saved);
  }

  async submit(id: string, userId: string): Promise<ReturnType<typeof toJobListingSenderView>> {
    const row = await this.loadOwned(id, userId);
    if (row.status !== JobListingStatus.DRAFT && row.status !== JobListingStatus.REJECTED) {
      throw new ConflictException(`Không thể gửi duyệt từ trạng thái "${row.status}"`);
    }
    row.status = JobListingStatus.PENDING;
    row.reviewNote = null;
    row.reviewerId = null;
    row.reviewedAt = null;
    const saved = await this.repo.save(row);
    return toJobListingSenderView(saved);
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

  async close(id: string, userId: string): Promise<ReturnType<typeof toJobListingSenderView>> {
    const row = await this.loadOwnedOrModerated(id, userId);
    if (row.status !== JobListingStatus.PUBLISHED) {
      throw new ConflictException(`Không thể đóng từ trạng thái "${row.status}"`);
    }
    row.status = JobListingStatus.CLOSED;
    const saved = await this.repo.save(row);
    return toJobListingSenderView(saved);
  }

  async reopen(id: string, userId: string): Promise<ReturnType<typeof toJobListingSenderView>> {
    const row = await this.loadOwnedOrModerated(id, userId);
    if (row.status !== JobListingStatus.CLOSED) {
      throw new ConflictException(`Không thể mở lại từ trạng thái "${row.status}"`);
    }
    row.status = JobListingStatus.PENDING;
    row.reviewNote = null;
    row.reviewerId = null;
    row.reviewedAt = null;
    row.publishedAt = null;
    const saved = await this.repo.save(row);
    return toJobListingSenderView(saved);
  }

  async decide(id: string, dto: DecideJobListingDto, moderatorId: string): Promise<ReturnType<typeof toJobListingModeratorView>> {
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
    const saved = await this.repo.save(row);
    return toJobListingModeratorView(saved);
  }

  async listPending(): Promise<ReturnType<typeof toJobListingModeratorView>[]> {
    const rows = await this.repo.listPending();
    return rows.map(toJobListingModeratorView);
  }

  // Khác listPending() (chỉ pending): mọi status, lọc tuỳ chọn theo status/người đăng — màn hình
  // "quản lý tất cả tin" admin cần, PHÂN BIỆT rõ với hàng chờ duyệt (xem job-listings.repository.ts).
  async listAllForAdmin(query: AdminListJobListingsQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const filter = { status: query.status, createdBy: query.created_by };
    const [items, total] = await Promise.all([
      this.repo.listAllForAdmin(filter, limit, (page - 1) * limit),
      this.repo.countAllForAdmin(filter),
    ]);
    const creators = await this.repo.findCreatorSummaries([...new Set(items.map((row) => row.createdBy))]);
    return paginate(
      items.map((row) => toJobListingAdminView(row, creators.get(row.createdBy) ?? null)),
      page,
      limit,
      total,
    );
  }

  async listMine(userId: string): Promise<ReturnType<typeof toJobListingSenderView>[]> {
    const rows = await this.repo.listMine(userId);
    return rows.map(toJobListingSenderView);
  }

  // "Place tùy chọn" (mục V đợt 3) — ghép tên/slug để chủ tin thấy ĐÚNG địa điểm đang liên kết khi
  // mở lại form sửa (place_id trần không đủ để hiện lại cho người dùng chọn gì). `null` nếu
  // placeId null hoặc không khớp hàng nào (không throw — liên kết này không bắt buộc tồn tại).
  private async attachPlace<T extends { place_id: string | null }>(view: T): Promise<T & { place: { id: string; name: string; slug: string } | null }> {
    const place = view.place_id ? await this.repo.findPlaceSummary(view.place_id) : null;
    return { ...view, place };
  }

  async getMine(id: string, userId: string): Promise<ReturnType<typeof toJobListingSenderView> & { place: { id: string; name: string; slug: string } | null }> {
    const row = await this.loadOwned(id, userId);
    return this.attachPlace(toJobListingSenderView(row));
  }

  async listPublic(query: ListJobListingsQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const filter = { jobCategory: query.job_category, ward: query.ward, employmentType: query.employment_type };
    const [items, total] = await Promise.all([
      this.repo.listPublic(filter, limit, (page - 1) * limit),
      this.repo.countPublic(filter),
    ]);
    return paginate(items.map(toJobListingPublicView), page, limit, total);
  }

  async getPublicById(id: string): Promise<ReturnType<typeof toJobListingPublicView> & { place: { id: string; name: string; slug: string } | null }> {
    const row = await this.repo.getPublicById(id);
    // 404 đồng nhất cho "không tồn tại" và "tồn tại nhưng chưa/không còn công khai" — không rò trạng
    // thái nội bộ qua sự khác biệt giữa hai loại lỗi.
    if (!row) throw new NotFoundException('Không tìm thấy tin tuyển dụng');
    return this.attachPlace(toJobListingPublicView(row));
  }
}
