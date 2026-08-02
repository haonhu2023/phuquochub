import { Injectable, NotFoundException } from '@nestjs/common';
import { clampLimit, clampPage, paginate } from '../../common/pagination';
import { ModerationCasesRepository } from './repositories/moderation-cases.repository';
import { ReportsRepository } from './repositories/reports.repository';
import { ListModerationCasesQueryDto } from './dto/moderation.dto';
import { ModerationCaseStatus } from './moderation.enums';
import { toModerationCaseDetail, toModerationCaseSummary } from './moderation.mapper';

// M2 (Moderation Queue Read API) — CHỈ ĐỌC. Không status nào bị đổi ở đây; không audit event nào
// được ghi (đọc thuần không thuộc chính sách audit ADR-016 — chỉ hành động đặc quyền/đổi trạng
// thái mới ghi audit, xem AuditService).
@Injectable()
export class ModerationService {
  constructor(
    private readonly casesRepo: ModerationCasesRepository,
    private readonly reportsRepo: ReportsRepository,
  ) {}

  async list(query: ListModerationCasesQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    // Bỏ trống status -> mặc định hàng chờ (open+claimed), đúng định nghĩa "hàng chờ" ở thiết kế
    // §4 — quyết định mặc định này thuộc service (repository chỉ nhận mảng statuses tường minh).
    const statuses = query.status ? [query.status] : [ModerationCaseStatus.OPEN, ModerationCaseStatus.CLAIMED];

    const { items, total } = await this.casesRepo.list({
      statuses,
      targetType: query.target_type,
      source: query.source,
      severity: query.severity,
      assignedTo: query.assigned_to,
      limit,
      offset: (page - 1) * limit,
    });

    return paginate(items.map(toModerationCaseSummary), page, limit, total);
  }

  async getById(id: string) {
    const found = await this.casesRepo.findById(id);
    if (!found) {
      throw new NotFoundException('Không tìm thấy case kiểm duyệt');
    }

    const [reports, preview] = await Promise.all([
      this.reportsRepo.findByCaseId(found.id),
      this.casesRepo.findTargetPreview(found.targetType, found.targetId),
    ]);

    // KHÔNG tự bọc {success,data} — TransformInterceptor tự bọc mọi giá trị trả về chưa có sẵn
    // hình dạng đó (common/interceptors/transform.interceptor.ts), cùng quy ước mọi service khác.
    return toModerationCaseDetail(found, reports, preview);
  }
}
