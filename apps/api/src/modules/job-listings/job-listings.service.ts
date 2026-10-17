import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RichDoc, RichDocValidationError, flattenRichDocToPlainText } from '@phuquochub/shared-types';
import { clampLimit, clampPage, paginate } from '../../common/pagination';
import { todayInVietnam } from '../../common/vn-today';
import { parseRichDoc } from '../../common/rich-doc';
import { AuthorizationService } from '../authz/authorization.service';
import { JobListingsRepository } from './repositories/job-listings.repository';
import { JobListingTranslationsRepository } from './repositories/job-listing-translations.repository';
import { JobListing } from './entities/job-listing.entity';
import { JobListingStatus } from './job-listings.enums';
import {
  AdminListJobListingsQueryDto,
  DecideJobListingDto,
  GetJobListingDetailQueryDto,
  ListJobListingsQueryDto,
  UpsertJobListingDto,
} from './dto/job-listings.dto';
import { toJobListingAdminView, toJobListingModeratorView, toJobListingPublicView, toJobListingSenderView } from './job-listings.mapper';
import { isJobListingTranslationStale } from './job-listing-translation-hash';
import { JobListingTranslation } from './entities/job-listing-translation.entity';

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
    // Chỉ cho overlay đọc công khai (getPublicById) — KHÔNG inject JobListingTranslationsService
    // (service kia mới có logic viết/CAS-nhẹ, dùng ở đây sẽ tạo phụ thuộc hai chiều không cần
    // thiết; đọc repo trực tiếp là đủ cho một overlay thuần đọc).
    private readonly translationsRepo: JobListingTranslationsRepository,
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
  // một tin, NHƯNG kiểm này KHÔNG được chặn việc sửa một trường KHÁC của một tin đã hết hạn nếu
  // payload không đổi `expires_at` (phát hiện 17/10/2026: bản đầu chặn MỌI update() có expires_at
  // cũ đã qua, kể cả khi người dùng chỉ sửa lỗi chính tả mô tả — một tin published-đã-hết-hạn hay
  // draft/rejected để lâu chưa gửi lại đều có expires_at cũ, không nên tự nhiên không sửa/lưu nháp
  // được nữa). Vì vậy: chỉ chặn khi dto ĐANG ĐẶT một giá trị KHÁC với giá trị đang lưu (đang chủ động
  // chọn hạn mới) và giá trị đó đã ở quá khứ; giữ nguyên giá trị cũ (dù đã qua) hoặc xoá về null đều
  // luôn hợp lệ ở BƯỚC NÀY — "hạn phải còn hiệu lực" là điều kiện ĐĂNG LẠI, kiểm riêng ở submit()/
  // decide() approve (xem hai hàm đó), không phải điều kiện LƯU. `currentValue` là `expiresAt` đang
  // lưu trong DB (null khi tạo mới — create() luôn truyền currentValue=null).
  private static assertValidExpiry(dto: UpsertJobListingDto, currentValue: string | null): void {
    if (dto.expires_at != null && dto.expires_at !== currentValue && dto.expires_at < todayInVietnam()) {
      throw new BadRequestException('Hạn tuyển không được là một ngày trong quá khứ — chọn hôm nay hoặc sau đó');
    }
  }

  // Gate THẬT của "hạn phải còn hiệu lực để đăng lại": kiểm ở submit() (gửi duyệt) VÀ decide()
  // approve (duyệt) — KHÔNG đủ chỉ kiểm ở create()/update(), vì một tin có thể còn hạn lúc sửa
  // nhưng hết hạn trong lúc chờ duyệt (hàng chờ có thể để lâu). Không kiểm ở đây thì moderator có
  // thể "duyệt thành công" một tin sẽ published nhưng KHÔNG BAO GIỜ hiện công khai (publicQuery()
  // loại ngay) — một trạng thái mâu thuẫn, khó phát hiện sau đó.
  private static assertNotAlreadyExpired(row: JobListing, message: string): void {
    if (row.expiresAt != null && row.expiresAt < todayInVietnam()) {
      throw new BadRequestException(message);
    }
  }

  // Gói D — quy tắc nguồn-sự-thật MỘT CHIỀU giữa `description` (plain, cũ) và `description_rich`
  // (RichDoc, mới), tránh "RichDoc cũ âm thầm che nội dung plain text mới" (owner yêu cầu rõ):
  //
  //  1. `dto.description_rich` CÓ MẶT trong payload (object HOẶC null tường minh) → AUTHORITATIVE.
  //     - object: validate (throw 400 nếu sai), lưu, và `description` ĐƯỢC GHI ĐÈ bằng bản phẳng
  //       dẫn xuất (flatten) — plain text KHÔNG BAO GIỜ được phép lệch khỏi RichDoc khi RichDoc tồn
  //       tại, nhờ vậy mọi nơi đọc `description` trần (JSON-LD, meta, thẻ danh sách, hash lỗi thời)
  //       tiếp tục đúng mà không cần biết gì về RichDoc.
  //     - null tường minh = XOÁ CÓ CHỦ Ý → cả hai cột đều về null (owner: "chủ động xoá nội dung
  //       phải xoá đúng cả phần biểu diễn liên quan" — không để `description` trần còn sót lại).
  //  2. `dto.description_rich` VẮNG MẶT (undefined — client không biết/không đụng rich text):
  //     - Nếu đang KHÔNG có `descriptionRich` lưu sẵn → ghi `description` bình thường, không gì
  //       khác để đồng bộ.
  //     - Nếu ĐANG CÓ `descriptionRich` lưu sẵn: so `dto.description` mới với bản flatten của
  //       RichDoc đang lưu — KHỚP (client chỉ gửi lại y nguyên bản đã đọc, không thực sự sửa) → GIỮ
  //       NGUYÊN RichDoc, không demote. LỆCH (client cũ vừa ghi đè một nội dung plain text THỰC SỰ
  //       khác) → coi là ghi đè có chủ ý qua đường cũ: xoá `descriptionRich` (demote về plain-only),
  //       không được để RichDoc cũ tiếp tục "che" bản plain text mới hơn.
  private static applyDescription(entity: JobListing, dto: UpsertJobListingDto): void {
    if (dto.description_rich !== undefined) {
      if (dto.description_rich === null) {
        entity.descriptionRich = null;
        entity.description = null;
        return;
      }
      let doc: RichDoc;
      try {
        doc = parseRichDoc(dto.description_rich);
      } catch (err) {
        if (err instanceof RichDocValidationError) throw new BadRequestException(`description_rich: ${err.message}`);
        throw err;
      }
      entity.descriptionRich = doc;
      entity.description = flattenRichDocToPlainText(doc) || null;
      return;
    }
    const newPlain = dto.description ?? null;
    const existingRich = entity.descriptionRich ?? null;
    if (existingRich != null) {
      const currentFlatten = flattenRichDocToPlainText(existingRich) || null;
      if (newPlain !== currentFlatten) {
        entity.descriptionRich = null; // demote: client cũ vừa ghi đè nội dung thực sự khác
      }
      // else: round-trip không đổi — giữ nguyên existingRich (đã có sẵn trên entity, không gán lại).
    } else {
      // Chưa từng có rich text — gán tường minh null (không để `undefined` lọt tới tầng lưu, dù
      // TypeORM/Postgres coi hai giá trị này như nhau khi INSERT — entity trong bộ nhớ nên phản ánh
      // ĐÚNG trạng thái sẽ được lưu, để code gọi sau (vd mapper) đọc được giá trị nhất quán).
      entity.descriptionRich = null;
    }
    entity.description = newPlain;
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
    JobListingsService.applyDescription(entity, dto);
    entity.contactMethod = dto.contact_method;
    entity.contactValue = dto.contact_value;
    entity.expiresAt = dto.expires_at ?? null;
  }

  async create(dto: UpsertJobListingDto, userId: string): Promise<ReturnType<typeof toJobListingSenderView>> {
    JobListingsService.assertSalaryRange(dto);
    JobListingsService.assertValidExpiry(dto, null);
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
    const row = await this.loadOwned(id, userId);
    JobListingsService.assertValidExpiry(dto, row.expiresAt);
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
    JobListingsService.assertNotAlreadyExpired(
      row,
      `Không thể gửi duyệt — hạn tuyển (${row.expiresAt}) đã qua. Sửa tin và đặt hạn mới trước khi gửi duyệt lại.`,
    );
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
    if (dto.decision === 'approve') {
      JobListingsService.assertNotAlreadyExpired(
        row,
        `Không thể duyệt — hạn tuyển (${row.expiresAt}) đã qua trong lúc chờ duyệt. Từ chối để người đăng sửa hạn rồi gửi lại, hoặc chờ họ tự sửa trước.`,
      );
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

  // Gói C §3 (17/10/2026) — `locale=en` overlay ĐÚNG `title` cho mỗi thẻ tin (owner chỉ ra đúng:
  // trước đó chi tiết có overlay nhưng danh sách không, khiến thẻ tin hiện tiếng Việt dù trang chi
  // tiết của ĐÚNG tin đó đã hiện tiếng Anh — một mâu thuẫn ngay trên cùng một lượt xem). Batch MỘT
  // truy vấn cho CẢ TRANG (`findByJobListingIds`) — KHÔNG N+1 (N truy vấn riêng mỗi thẻ tin). Chỉ
  // overlay `title` (danh sách không hiện description/requirements/benefits).
  async listPublic(query: ListJobListingsQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const filter = { jobCategory: query.job_category, ward: query.ward, employmentType: query.employment_type };
    const [items, total] = await Promise.all([
      this.repo.listPublic(filter, limit, (page - 1) * limit),
      this.repo.countPublic(filter),
    ]);
    const translations =
      query.locale === 'en' ? await this.translationsRepo.findByJobListingIds(items.map((i) => i.id)) : new Map<string, JobListingTranslation>();
    const views = items.map((row) => {
      const base = toJobListingPublicView(row);
      const translation = translations.get(row.id);
      if (query.locale === 'en' && translation?.publishedTitle != null) {
        return { ...base, title: translation.publishedTitle, locale: 'en' as const };
      }
      return { ...base, locale: 'vi' as const };
    });
    return paginate(views, page, limit, total);
  }

  // Gói C (17/10/2026, thiết kế lại sau phản hồi owner) — `locale` TÙY CHỌN overlay bản dịch tiếng
  // Anh ĐÃ DUYỆT. Đọc đúng vùng `published*` của job_listing_translations (KHÔNG đọc
  // title/description/requirements/benefits trần của bảng đó — đó là vùng NHÁP đang soạn, có thể
  // khác hẳn bản đang công khai, xem job-listing-translations.service.ts's ghi chú đầu file) — kiểm
  // `publishedTitle != null`, KHÔNG kiểm `status` (một bản dịch có thể đang `draft` mới vì chủ tin
  // sửa tiếp, nhưng published* từ lần duyệt trước VẪN còn và vẫn phải phục vụ công khai).
  //
  // KHÔNG dùng `LocalesService`/`supported_locales` của places (owner yêu cầu rõ: "không ép place
  // model vào listing"). Response LUÔN có `locale` phản ánh NỘI DUNG THỰC SỰ đã trả (không phải
  // locale được YÊU CẦU) — yêu cầu 'en' nhưng chưa có bản dịch đã duyệt → trả `locale:'vi'`, không
  // "nhận vơ" là tiếng Anh. `is_translation_stale` (chỉ có nghĩa khi `locale==='en'`) báo bản đang
  // công khai có còn khớp dữ kiện tiếng Việt HIỆN TẠI không — vẫn PHỤC VỤ bản cũ (một bản đã qua
  // duyệt không nên bị rút khỏi công khai chỉ vì một dữ kiện phụ trợ đổi), nhưng không giả vờ không
  // có vấn đề gì — web đọc cờ này để hiện ghi chú cho người đọc, không chỉ im lặng trong JSON.
  //
  // Phạm vi ngôn ngữ (addendum Gói C 17/10/2026, trả lời owner điểm 1b/1e): `locale:'vi'` trong
  // response này là TÊN CỦA CỘT ĐƯỢC PHỤC VỤ (cột gốc title/description/...), KHÔNG phải xác nhận
  // đã kiểm tra nội dung cột đó thực sự viết bằng tiếng Việt — hệ thống KHÔNG lưu ngôn ngữ gốc người
  // đăng đã dùng (không có cột `source_language`, không phát hiện ngôn ngữ). Hệ quả: nếu một chủ tin
  // gõ tin gốc bằng tiếng Anh, cột gốc đã LÀ tiếng Anh — hệ thống phục vụ ĐÚNG NGUYÊN VĂN cho cả hai
  // route (/vi lẫn /en khi chưa có bản dịch), chỉ nhãn nội bộ `locale` vẫn ghi 'vi' (tên cột, không
  // phải tuyên bố ngôn ngữ) — KHÔNG có sai lệch nội dung, chỉ có khả năng gây hiểu nhầm ở tên trường
  // nội bộ, không lộ ra `GET` response's các trường khác và KHÔNG ảnh hưởng JSON-LD (JobPosting không
  // phát `inLanguage`). Vì vậy bản tiếng Anh route `/en` fallback cột gốc KHÔNG được ghi "shown in
  // Vietnamese" ở banner Web — chỉ ghi "as originally posted", đúng mức bằng chứng thực có. Tin cũ
  // chưa rõ ngôn ngữ xử lý CÙNG quy tắc này — không có nhánh riêng, không suy diễn thêm. Không có cơ
  // chế "khai báo ngôn ngữ gốc là tiếng Anh" tách riêng — với tin gốc tiếng Anh, chủ tin ĐƠN GIẢN
  // KHÔNG CẦN tạo bản dịch EN (cột gốc đã phục vụ đúng); tạo thêm một trường "nguồn là EN" sẽ là một
  // tính năng phát hiện/khai báo ngôn ngữ mới, ngoài phạm vi đã giao.
  async getPublicById(
    id: string,
    locale?: GetJobListingDetailQueryDto['locale'],
  ): Promise<
    ReturnType<typeof toJobListingPublicView> & {
      place: { id: string; name: string; slug: string } | null;
      locale: 'vi' | 'en';
      is_translation_stale: boolean;
    }
  > {
    const row = await this.repo.getPublicById(id);
    // 404 đồng nhất cho "không tồn tại" và "tồn tại nhưng chưa/không còn công khai" — không rò trạng
    // thái nội bộ qua sự khác biệt giữa hai loại lỗi. Áp dụng BẤT KỂ locale — một bản dịch published
    // không bao giờ "vượt qua" được tin gốc pending/rejected/closed/hết hạn/xoá (repo.getPublicById()
    // đã lọc đúng các điều kiện đó CHO TIN GỐC trước khi tới đây; overlay bản dịch chỉ chạy SAU khi
    // tin gốc đã được xác nhận công khai).
    if (!row) throw new NotFoundException('Không tìm thấy tin tuyển dụng');
    const withPlace = await this.attachPlace(toJobListingPublicView(row));

    if (locale === 'en') {
      const translation = await this.translationsRepo.findByJobListingId(id);
      if (translation && translation.publishedTitle != null) {
        const stale = translation.publishedSourceContentHash
          ? isJobListingTranslationStale(translation.publishedSourceContentHash, row)
          : false;
        return {
          ...withPlace,
          title: translation.publishedTitle,
          description: translation.publishedDescription ?? withPlace.description,
          // Gói D — bản dịch EN CHƯA hỗ trợ rich text (ngoài phạm vi luồng đầu tiên, xem
          // ADR-DELIVERY-002 điểm 5 "mở rộng tuần tự"). PHẢI đặt về null ở NHÁNH NÀY — nếu không,
          // `...withPlace` phía trên sẽ để lọt RichDoc của bản TIẾNG VIỆT vào response đang phục vụ
          // tiếng Anh (renderer sẽ hiện nhầm nội dung tiếng Việt có định dạng thay vì bản dịch tiếng
          // Anh dạng chữ thường) — lỗi thật, không phải phòng hờ.
          description_rich: null,
          requirements: translation.publishedRequirements ?? withPlace.requirements,
          benefits: translation.publishedBenefits ?? withPlace.benefits,
          locale: 'en',
          is_translation_stale: stale,
        };
      }
    }
    return { ...withPlace, locale: 'vi', is_translation_stale: false };
  }
}
