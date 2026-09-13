import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlaceEditProposalsRepository, ListProposalsFilter } from './repositories/place-edit-proposals.repository';
import { PlaceEditProposalDecision, PlaceEditProposalFieldKey, PlaceEditProposalStatus } from './place-edit-proposals.enums';
import { CreatePlaceEditProposalDto, DecidePlaceEditProposalDto } from './dto/place-edit-proposal.dto';
import { toPlaceEditProposalView } from './place-edit-proposals.mapper';
import { PlacesRepository } from '../places/repositories/places.repository';
import { PlacesService } from '../places/places.service';
import { PlaceStatus } from '../places/place.enums';
import { LocalesService } from '../locales/locales.service';
import { RevisionOrigin } from '../revisions/revision.enums';
import { computeFieldValueHash } from '../evidence/field-value-hash';
import { openingHoursErrors } from '../../common/opening-hours';

const SCALAR_VALUE_MAX_LENGTH = 300; // same limit as UpdatePlaceDto.address/.short_description

// "Đề xuất chỉnh sửa địa điểm" MVP — see InitPlaceEditProposals migration header for the full
// "why a new table, not wiki_revisions" reasoning. This service owns the proposal's OWN lifecycle
// (pending/approved/rejected/needs_changes/conflict); applying an approved proposal delegates
// entirely to the EXISTING `PlacesService.update()` — no parallel write path to `places`, no new
// gate, no touching `verification_status`/evidence tables (task requirement: "chỉ áp dụng qua
// service và các gate hiện có... không tự nâng evidence/place thành VERIFIED").
@Injectable()
export class PlaceEditProposalsService {
  constructor(
    private readonly proposalsRepo: PlaceEditProposalsRepository,
    private readonly placesRepo: PlacesRepository,
    private readonly placesService: PlacesService,
    private readonly localesService: LocalesService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Gửi đề xuất — CHỈ ghi vào `place_edit_proposals` với status PENDING. KHÔNG BAO GIỜ gọi
   * `PlacesService.update()` ở đây (task requirement: "không nới quyền PATCH .../ hoặc gọi
   * update() khi gửi đề xuất") — places/translations/field-evidence-links/verification_status đều
   * không đổi bởi việc gửi đề xuất, chỉ khi một reviewer sau này quyết định approve.
   */
  async submit(placeId: string, dto: CreatePlaceEditProposalDto, proposerId: string): Promise<ReturnType<typeof toPlaceEditProposalView>> {
    const place = await this.placesRepo.getCardByIdIncludingInactive(placeId);
    if (!place) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    // Task requirement: "gửi đề xuất cho địa điểm đang công khai" — chỉ nhận đề xuất cho place
    // đã published, cùng ranh giới `getDetailBySlug()` (đường đọc công khai) đã áp dụng.
    if (place.status !== PlaceStatus.PUBLISHED) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }

    this.validateProposedValue(dto.field_key, dto.proposed_value);

    const existingPending = await this.proposalsRepo.findPendingByProposerFieldPlace(
      placeId,
      dto.field_key,
      proposerId,
    );
    if (existingPending) {
      throw new ConflictException(
        'Bạn đã có một đề xuất đang chờ xử lý cho trường này của địa điểm này.',
      );
    }

    let localeCode: string | null = null;
    if (dto.locale_code) {
      try {
        await this.localesService.getKnownLocale(dto.locale_code);
        localeCode = dto.locale_code;
      } catch {
        // Informational field only (xem entity/migration comment) — mã locale không nhận diện
        // được không được phép chặn cả đề xuất, chỉ bỏ qua giá trị đó.
        localeCode = null;
      }
    }

    const currentValue = (place as unknown as Record<string, unknown>)[dto.field_key];
    const baseValueHash = computeFieldValueHash(currentValue);

    const row = this.proposalsRepo.create({
      placeId,
      fieldKey: dto.field_key,
      localeCode,
      proposedValue: dto.proposed_value,
      baseValueHash,
      reason: dto.reason,
      sourceUrl: dto.source_url ?? null,
      status: PlaceEditProposalStatus.PENDING,
      proposerId,
    });
    const saved = await this.proposalsRepo.save(row);
    return toPlaceEditProposalView(saved);
  }

  async list(filter: ListProposalsFilter): Promise<ReturnType<typeof toPlaceEditProposalView>[]> {
    const rows = await this.proposalsRepo.list(filter);
    return rows.map(toPlaceEditProposalView);
  }

  async getById(id: string): Promise<ReturnType<typeof toPlaceEditProposalView>> {
    const row = await this.proposalsRepo.findById(id);
    if (!row) {
      throw new NotFoundException('Không tìm thấy đề xuất');
    }
    return toPlaceEditProposalView(row);
  }

  /**
   * Duyệt/từ chối/yêu cầu bổ sung. `pessimistic_write` (findByIdForUpdate) khoá đúng MỘT hàng
   * proposal trong SUỐT giao dịch — bao gồm cả lúc gọi `PlacesService.update()` bên trong — nên
   * một lượt decide() thứ hai trên CÙNG proposal phải đợi giao dịch đầu tiên commit/rollback rồi
   * mới đọc lại được trạng thái (khi đó không còn PENDING) → tự chặn double-apply, không cần cờ
   * khoá riêng (task requirement: "duyệt đồng thời không áp dụng hai lần").
   *
   * Conflict theo giá trị gốc: so hash giá trị HIỆN TẠI (đọc lại tại thời điểm duyệt) với
   * `base_value_hash` đã lưu lúc gửi đề xuất — khác thì đánh dấu CONFLICT, KHÔNG áp dụng, KHÔNG
   * ghi đè (task requirement thứ hai).
   */
  async decide(
    proposalId: string,
    dto: DecidePlaceEditProposalDto,
    reviewerId: string,
  ): Promise<ReturnType<typeof toPlaceEditProposalView>> {
    return this.dataSource.transaction(async (manager) => {
      const proposal = await this.proposalsRepo.findByIdForUpdate(proposalId, manager);
      if (!proposal) {
        throw new NotFoundException('Không tìm thấy đề xuất');
      }
      if (proposal.status !== PlaceEditProposalStatus.PENDING) {
        throw new ConflictException('Đề xuất này đã được xử lý.');
      }

      if (dto.decision === PlaceEditProposalDecision.REJECT) {
        proposal.status = PlaceEditProposalStatus.REJECTED;
      } else if (dto.decision === PlaceEditProposalDecision.NEEDS_CHANGES) {
        proposal.status = PlaceEditProposalStatus.NEEDS_CHANGES;
      } else {
        // APPROVE — re-check the live current value BEFORE applying anything.
        const place = await this.placesRepo.getCardByIdIncludingInactive(proposal.placeId);
        if (!place) {
          throw new NotFoundException('Không tìm thấy địa điểm (đã bị xoá?)');
        }
        const currentValue = (place as unknown as Record<string, unknown>)[proposal.fieldKey];
        const currentHash = computeFieldValueHash(currentValue);
        if (currentHash !== proposal.baseValueHash) {
          proposal.status = PlaceEditProposalStatus.CONFLICT;
          proposal.reviewerId = reviewerId;
          proposal.reviewedAt = new Date();
          proposal.reviewNote =
            dto.note ?? 'Dữ liệu gốc đã thay đổi kể từ khi đề xuất được gửi — không tự động ghi đè.';
          const saved = await this.proposalsRepo.save(proposal, manager);
          return toPlaceEditProposalView(saved);
        }

        // Áp dụng qua ĐÚNG service/gate hiện có — KHÔNG ghi trực tiếp `places`, KHÔNG chạm
        // verification_status/evidence. `RevisionOrigin.COMMUNITY_EDIT`: nội dung xuất phát từ
        // cộng đồng, dù người bấm duyệt là staff — origin ghi kênh phát sinh nội dung, không phải
        // ai thực hiện thao tác ghi (đúng phân biệt update()'s own doc comment đã nêu).
        await this.placesService.update(
          proposal.placeId,
          { [proposal.fieldKey]: proposal.proposedValue } as never,
          reviewerId,
          RevisionOrigin.COMMUNITY_EDIT,
        );
        proposal.status = PlaceEditProposalStatus.APPROVED;
      }

      proposal.reviewerId = reviewerId;
      proposal.reviewedAt = new Date();
      proposal.reviewNote = dto.note ?? null;
      const saved = await this.proposalsRepo.save(proposal, manager);
      return toPlaceEditProposalView(saved);
    });
  }

  private validateProposedValue(fieldKey: PlaceEditProposalFieldKey, value: unknown): void {
    if (fieldKey === PlaceEditProposalFieldKey.OPENING_HOURS) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new BadRequestException('proposed_value phải là object opening_hours');
      }
      const errors = openingHoursErrors(value);
      if (errors.length > 0) {
        throw new BadRequestException(`proposed_value không hợp lệ: ${errors.join('; ')}`);
      }
      return;
    }

    // address / short_description — cùng giới hạn UpdatePlaceDto đã áp cho hai trường này.
    if (typeof value !== 'string') {
      throw new BadRequestException('proposed_value phải là chuỗi cho trường này');
    }
    const trimmed = value.trim();
    if (trimmed === '') {
      throw new BadRequestException('proposed_value không được để trống');
    }
    if (trimmed.length > SCALAR_VALUE_MAX_LENGTH) {
      throw new BadRequestException(`proposed_value vượt quá ${SCALAR_VALUE_MAX_LENGTH} ký tự`);
    }
  }
}
