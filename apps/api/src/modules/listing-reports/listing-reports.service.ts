import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingReportsRepository } from './repositories/listing-reports.repository';
import { ListableTargetType } from '../../common/listable-target-type.enum';
import { ListingReportStatus } from './listing-reports.enums';
import { CreateListingReportDto, ResolveListingReportDto } from './dto/listing-reports.dto';
import { ListingReport } from './entities/listing-report.entity';
import { JobListingsService } from '../job-listings/job-listings.service';
import { RealEstateListingsService } from '../real-estate-listings/real-estate-listings.service';
import { PlacesService } from '../places/places.service';
import { AuthorizationService } from '../authz/authorization.service';

// Giai đoạn 1 (21/10/2026) — 'place' tái dùng ĐÚNG permission đã xử lý mọi đóng góp cộng đồng khác
// về địa điểm (`place_edit_proposals`), cùng role (content_owner) đã quen xử lý loại việc này —
// không xin permission mới.
const MODERATE_PERMISSION: Record<ListableTargetType, string> = {
  [ListableTargetType.JOB_LISTING]: 'JobListing.Moderate',
  [ListableTargetType.REAL_ESTATE_LISTING]: 'RealEstateListing.Moderate',
  [ListableTargetType.PLACE]: 'PlaceEditProposal.Moderate',
};

function toView(row: ListingReport, listing: unknown | null = null) {
  return {
    id: row.id,
    target_type: row.targetType,
    target_id: row.targetId,
    reason: row.reason,
    description: row.description,
    status: row.status,
    resolved_at: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    // Chỉ listPending() điền trường này (hàng chờ moderator cần thấy tiêu đề/giá, không chỉ UUID).
    // null khi tin không còn công khai tại thời điểm xem hàng chờ (đã đóng/hết hạn sau khi bị báo
    // cáo) — cùng hợp đồng "listing: null" đã dùng ở saved-items, không phải lỗi.
    listing,
  };
}

// "Báo sai/báo trùng" — bảng MỚI, polymorphic, KHÔNG tái dùng `reports`/`ModerationCase` (xem
// migration InitListingReports's comment: ModerationTargetType bị khoá theo ADR-018, mở rộng là
// sửa ADR). Quyền xử lý TÁI DÙNG ĐÚNG permission duyệt tin đã có của từng module
// (`JobListing.Moderate`/`RealEstateListing.Moderate`) — không có permission "xem mọi báo cáo"
// chung nào, một moderator chỉ thấy/được xử lý báo cáo của loại tin họ vốn đã có quyền duyệt.
@Injectable()
export class ListingReportsService {
  constructor(
    private readonly repo: ListingReportsRepository,
    private readonly jobListingsService: JobListingsService,
    private readonly realEstateListingsService: RealEstateListingsService,
    private readonly placesService: PlacesService,
    private readonly authz: AuthorizationService,
  ) {}

  private async resolveTargetPublic(targetType: ListableTargetType, targetId: string): Promise<unknown | null> {
    try {
      if (targetType === ListableTargetType.JOB_LISTING) {
        return await this.jobListingsService.getPublicById(targetId);
      }
      if (targetType === ListableTargetType.REAL_ESTATE_LISTING) {
        return await this.realEstateListingsService.getPublicById(targetId);
      }
      // 'place' (phủ cả hotel/restaurant/tour — cùng id, xem ADR-002): tra slug qua đường đặc
      // quyền (getSlugAndStatus, không lọc status) CHỈ để biết slug, sau đó đọc qua getBySlug() —
      // CHÍNH đường công khai thật đang dùng — để quyết định "có công khai không" luôn chỉ có MỘT
      // nơi quyết (getDetailBySlug()'s status filter), không tự suy một luật thứ hai ở đây.
      const meta = await this.placesService.getSlugAndStatus(targetId);
      if (!meta) return null;
      return await this.placesService.getBySlug(meta.slug);
    } catch {
      return null;
    }
  }

  // true nếu reporterId CHÍNH LÀ chủ tin — dùng getMine() đã có sẵn của từng module (ném
  // NotFoundException khi không sở hữu, cùng ĐÚNG đường kiểm quyền "Tin của tôi" đang dùng, không
  // tự đọc created_by qua đường khác). Địa điểm KHÔNG có khái niệm "chủ tin" đơn (cộng đồng/
  // business_members cùng quản lý) — luôn trả `false`, không chặn tự báo cáo cho loại này.
  private async isOwnListing(targetType: ListableTargetType, targetId: string, userId: string): Promise<boolean> {
    try {
      if (targetType === ListableTargetType.JOB_LISTING) {
        await this.jobListingsService.getMine(targetId, userId);
      } else if (targetType === ListableTargetType.REAL_ESTATE_LISTING) {
        await this.realEstateListingsService.getMine(targetId, userId);
      } else {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async create(reporterId: string, dto: CreateListingReportDto): Promise<ReturnType<typeof toView>> {
    const target = await this.resolveTargetPublic(dto.target_type, dto.target_id);
    if (!target) throw new NotFoundException('Không tìm thấy tin để báo cáo, hoặc tin không còn công khai');

    if (await this.isOwnListing(dto.target_type, dto.target_id, reporterId)) {
      throw new BadRequestException('Không thể tự báo cáo tin của chính mình');
    }

    const saved = await this.repo.create({
      reporterId,
      targetType: dto.target_type,
      targetId: dto.target_id,
      reason: dto.reason,
      description: dto.description ?? null,
      status: ListingReportStatus.OPEN,
    });
    return toView(saved);
  }

  // Trả về báo cáo đang mở cho MỌI loại target mà caller có quyền duyệt (member bình thường gọi
  // route này nhận mảng rỗng, không phải 403 — họ không giữ permission nào trong MODERATE_PERMISSION
  // nên không loại nào được thêm vào).
  async listPending(callerId: string): Promise<ReturnType<typeof toView>[]> {
    const allowed: ListableTargetType[] = [];
    for (const targetType of Object.values(ListableTargetType)) {
      if (await this.authz.can(callerId, MODERATE_PERMISSION[targetType])) {
        allowed.push(targetType);
      }
    }
    const lists = await Promise.all(allowed.map((t) => this.repo.listOpenByTargetType(t)));
    const rows = lists.flat();
    return Promise.all(rows.map(async (row) => toView(row, await this.resolveTargetPublic(row.targetType, row.targetId))));
  }

  async resolve(id: string, dto: ResolveListingReportDto, resolverId: string): Promise<ReturnType<typeof toView>> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Không tìm thấy báo cáo');
    if (!(await this.authz.can(resolverId, MODERATE_PERMISSION[row.targetType]))) {
      throw new ForbiddenException();
    }
    if (row.status !== ListingReportStatus.OPEN) {
      throw new ConflictException(`Báo cáo này đã được xử lý (trạng thái hiện tại: "${row.status}")`);
    }
    row.status = dto.decision === 'resolved' ? ListingReportStatus.RESOLVED : ListingReportStatus.DISMISSED;
    row.resolverId = resolverId;
    row.resolvedAt = new Date();
    const saved = await this.repo.save(row);
    return toView(saved);
  }

  // Giai đoạn 2 (21/10/2026) — báo cáo đang mở trên CHÍNH tin của userId, để người đăng tự xem và
  // xác nhận "vẫn còn" (xem confirmStillValid() bên dưới). Server TỰ SUY tập id tin của userId qua
  // listMine() đã có sẵn (cùng đường "Tin của tôi" đang dùng) — KHÔNG tin id nào client tự gửi lên,
  // tránh một người dò được báo cáo của tin người khác qua tham số target_id tự chọn.
  //
  // Chỉ job_listing hôm nay (owner yêu cầu rõ: áp dụng TRƯỚC cho tin tuyển dụng) — real_estate_listing
  // dùng được NGAY nếu mở rộng sau (cùng listMine() shape), 'place' không có khái niệm chủ tin đơn
  // (xem isOwnListing()'s comment) nên trả mảng rỗng, không lỗi.
  async listMineOpen(userId: string, targetType: ListableTargetType): Promise<ReturnType<typeof toView>[]> {
    let myIds: string[];
    if (targetType === ListableTargetType.JOB_LISTING) {
      myIds = (await this.jobListingsService.listMine(userId)).map((j) => j.id);
    } else if (targetType === ListableTargetType.REAL_ESTATE_LISTING) {
      myIds = (await this.realEstateListingsService.listMine(userId)).map((r) => r.id);
    } else {
      return [];
    }
    const rows = await this.repo.listOpenByTargetTypeAndIds(targetType, myIds);
    return Promise.all(rows.map(async (row) => toView(row, await this.resolveTargetPublic(row.targetType, row.targetId))));
  }

  // Giai đoạn 2 (21/10/2026) — người ĐĂNG (không phải moderator) tự xác nhận tin của mình vẫn đúng.
  // Trạng thái riêng SELF_CONFIRMED (không dùng RESOLVED) — xem migration
  // AddListingReportStillValidLoop1720010300000's ghi chú: lời tự khai một phía KHÔNG mang trọng
  // lượng như một quyết định moderator độc lập, không gộp chung để tránh hiểu nhầm đã được bên thứ
  // ba xác minh. Dùng ĐÚNG isOwnListing() đã có (không tự suy luật sở hữu thứ hai) — 'place' luôn
  // `false` nên luôn bị chặn ở đây, nhất quán với isOwnListing()'s thiết kế.
  async confirmStillValid(id: string, userId: string): Promise<ReturnType<typeof toView>> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Không tìm thấy báo cáo');
    if (!(await this.isOwnListing(row.targetType, row.targetId, userId))) {
      throw new ForbiddenException();
    }
    if (row.status !== ListingReportStatus.OPEN) {
      throw new ConflictException(`Báo cáo này đã được xử lý (trạng thái hiện tại: "${row.status}")`);
    }
    row.status = ListingReportStatus.SELF_CONFIRMED;
    row.resolverId = userId;
    row.resolvedAt = new Date();
    const saved = await this.repo.save(row);
    return toView(saved);
  }
}
