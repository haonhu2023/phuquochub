import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PlaceSuggestionsRepository } from './place-suggestions.repository';
import { PlaceEditSuggestion, PlaceSuggestionStatus } from './entities/place-edit-suggestion.entity';
import { PlacesRepository, PlaceDetailRow } from '../places/repositories/places.repository';
import { AuditService } from '../../core/audit/audit.service';
import { AuditResult } from '../../core/audit/audit.enums';
import { AuthorizationService } from '../authz/authorization.service';

// "Báo thông tin sai / Đề xuất chỉnh sửa" — bản tối thiểu (2026-09-24). Xem entity để biết vì sao
// KHÔNG có code path nào ghi `proposedValue` xuống `places`: resolve() chỉ đổi status/reviewNote.

// Allow-list trường được phép đề xuất sửa — CHÍNH XÁC tập trường có editor CAS hiện có
// (PlaceForm.tsx cho scalar, PlaceDescriptionEditor.tsx cho ba trường i18n) để người dùng chỉ
// được đề xuất thứ owner THỰC SỰ có nơi để áp dụng. Không mở rộng thêm field nào ở đây mà chưa có
// editor tương ứng — mở rộng allow-list không đồng nghĩa có chỗ để owner ghi lại giá trị đó.
export const SUGGESTABLE_FIELDS = [
  'name',
  'short_description',
  'description',
  'address',
  'ward',
  'price_range',
  'opening_hours',
] as const;
export type SuggestableField = (typeof SUGGESTABLE_FIELDS)[number];

export interface CreateSuggestionInput {
  placeId: string;
  field: SuggestableField;
  proposedValue: string;
  sourceUrl: string;
  sourceNote?: string;
}

export interface ResolveSuggestionInput {
  id: string;
  reviewedBy: string;
  action: 'applied' | 'rejected';
  note?: string;
}

@Injectable()
export class PlaceSuggestionsService {
  constructor(
    private readonly repo: PlaceSuggestionsRepository,
    private readonly placesRepo: PlacesRepository,
    private readonly auditService: AuditService,
    private readonly authzService: AuthorizationService,
  ) {}

  async create(input: CreateSuggestionInput, submittedBy: string): Promise<PlaceEditSuggestion> {
    const place = await this.placesRepo.getCardByIdIncludingInactive(input.placeId);
    if (!place) throw new NotFoundException(`Place ${input.placeId} not found`);

    const currentValue = extractFieldSnapshot(place, input.field);
    const item = this.repo.create({
      placeId: input.placeId,
      field: input.field,
      currentValue,
      proposedValue: input.proposedValue,
      sourceUrl: input.sourceUrl,
      sourceNote: input.sourceNote ?? null,
      submittedBy,
      status: 'pending',
    });
    const saved = await this.repo.save(item);

    await this.auditService.record({
      event: 'place_suggestion.created',
      entityType: 'place_edit_suggestion',
      entityId: saved.id,
      actorId: submittedBy,
      result: AuditResult.SUCCESS,
      context: { placeId: input.placeId, field: input.field },
    });

    return saved;
  }

  // Cùng scoped-authorization với OwnerDecisionQueueService.assertResolutionAccess(): Place.Approve
  // toàn cục HOẶC Place.Edit.Managed khoanh vùng đúng place này — cho phép business_owner tự xử lý
  // đề xuất trên place của họ mà không cần Place.Approve toàn cục.
  private async assertPlaceAccess(actorId: string, placeId: string): Promise<void> {
    const isGlobal = await this.authzService.can(actorId, 'Place.Approve');
    if (isGlobal) return;

    const isScoped = await this.authzService.can(
      actorId,
      'Place.Edit.Managed',
      async () => ({ resourceType: 'place', resourceId: placeId, businessId: placeId, ownerId: null }),
    );
    if (isScoped) return;

    throw new ForbiddenException(`No managed access to place ${placeId}`);
  }

  async listForPlace(
    placeId: string,
    actorId: string,
    status?: PlaceSuggestionStatus,
  ): Promise<PlaceEditSuggestion[]> {
    await this.assertPlaceAccess(actorId, placeId);
    return this.repo.findByPlace(placeId, status);
  }

  // Danh sách toàn cục — quyền cưỡng chế Ở TẦNG CONTROLLER (@RequirePermissions('Place.Approve'),
  // cùng cách OwnerDecisionQueueController.list()/OwnerDecisionQueueService.list() KHÔNG kiểm tra
  // lại lần hai ở service: guard đã chạy trước khi handler này được gọi). Không có biến thể khoanh
  // vùng "mọi place tôi quản lý gộp lại" — cùng giới hạn ODQ đã chấp nhận, business_owner dùng
  // listForPlace() theo từng place thay vì một trang tổng hợp.
  listPending(limit = 50, offset = 0): Promise<PlaceEditSuggestion[]> {
    return this.repo.findAll('pending', limit, offset);
  }

  async resolve(input: ResolveSuggestionInput): Promise<PlaceEditSuggestion> {
    const item = await this.repo.findById(input.id);
    if (!item) throw new NotFoundException(`Suggestion ${input.id} not found`);

    await this.assertPlaceAccess(input.reviewedBy, item.placeId);

    const before = { status: item.status, reviewedBy: item.reviewedBy, reviewedAt: item.reviewedAt };
    item.status = input.action;
    item.reviewedBy = input.reviewedBy;
    item.reviewedAt = new Date();
    item.reviewNote = input.note ?? null;
    const saved = await this.repo.save(item);

    await this.auditService.record({
      event: `place_suggestion.${input.action}`,
      entityType: 'place_edit_suggestion',
      entityId: item.id,
      actorId: input.reviewedBy,
      permission: 'Place.Approve',
      result: AuditResult.SUCCESS,
      before,
      after: { status: input.action, reviewedBy: input.reviewedBy, reviewedAt: saved.reviewedAt },
      context: { placeId: item.placeId, field: item.field },
    });

    return saved;
  }
}

// place là PlaceCardRow | PlaceDetailRow (getCardByIdIncludingInactive) — chỉ đọc các trường
// SUGGESTABLE_FIELDS, ép về string | null để lưu vào cột `text`. `price_range`/`opening_hours` là
// giá trị có cấu trúc (enum/object), JSON.stringify() để so sánh cũ/mới còn đọc được, KHÔNG parse
// lại: currentValue chỉ hiển thị, không bao giờ được ghi ngược vào places (xem ghi chú đầu file).
function extractFieldSnapshot(place: PlaceDetailRow, field: SuggestableField): string | null {
  const raw = place[field];
  if (raw == null) return null;
  if (typeof raw === 'string') return raw;
  return JSON.stringify(raw);
}
