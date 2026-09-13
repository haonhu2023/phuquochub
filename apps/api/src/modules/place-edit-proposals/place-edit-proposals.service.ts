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
import { PlaceTranslationsService } from '../place-translations/place-translations.service';
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
    private readonly placeTranslationsService: PlaceTranslationsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * short_description is publicly readable via a `place_translations` overlay row — and, unlike
   * every other locale, that overlay CAN exist for the default locale ('vi') too (no schema/service
   * rule forbids a translation row whose locale_code equals the source locale — e.g. an editorial/
   * AI-reviewed VI rewrite that supersedes the legacy base column, see PlacesService.getBySlug():
   * `short_description: localizedShortDescription ?? row.short_description` — the overlay wins
   * whenever one exists, REGARDLESS of which locale was requested). This service's apply path only
   * ever writes `places.short_description` (the base column) — it does not touch `place_translations`
   * and has no gate/service integration with the translation pipeline. So whenever an overlay is in
   * play, base_value_hash (read from the base column) is not what the proposer actually saw, and
   * approving would silently no-op from the public's point of view: the overlay keeps shadowing the
   * base column's new value, yet the proposal would report APPROVED. Detected via the SAME seam the
   * public read path uses (`getCurrentPublicTranslatedText` against the default locale) — a non-null
   * result means an overlay is active, regardless of whether its text happens to match the base
   * column right now (a coincidental match today is not a guarantee it stays that way).
   */
  private async shortDescriptionHasTranslationOverlay(placeId: string): Promise<boolean> {
    const defaultLocale = await this.localesService.getDefaultLocale();
    const overlay = await this.placeTranslationsService.getCurrentPublicTranslatedText(
      placeId,
      PlaceEditProposalFieldKey.SHORT_DESCRIPTION,
      defaultLocale.localeCode,
    );
    return overlay !== null;
  }

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

    // Chặn TRƯỚC KHI tính base_value_hash — xem doc comment của shortDescriptionHasTranslationOverlay():
    // nếu một overlay đang che cột gốc (kể cả cho locale mặc định), hash tính từ cột gốc không phải
    // giá trị người đề xuất thực sự đang thấy, và áp dụng sau này sẽ không đổi gì trên trang công khai.
    if (
      dto.field_key === PlaceEditProposalFieldKey.SHORT_DESCRIPTION &&
      (await this.shortDescriptionHasTranslationOverlay(placeId))
    ) {
      throw new BadRequestException(
        'Mô tả ngắn của địa điểm này hiện được quản lý qua hệ thống bản dịch — MVP chưa hỗ trợ đề xuất chỉnh sửa cho trường hợp này.',
      );
    }

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
      let locale: Awaited<ReturnType<LocalesService['getKnownLocale']>> | null = null;
      try {
        locale = await this.localesService.getKnownLocale(dto.locale_code);
      } catch {
        // Mã locale không tồn tại: field chỉ mang tính thông tin (xem entity/migration comment),
        // không được phép chặn cả đề xuất vì một chuỗi rác — bỏ qua giá trị đó, coi như không gửi.
        locale = null;
      }
      if (locale) {
        // `short_description` là field CÓ dịch (place_translations) — write target của MVP này
        // LUÔN LUÔN là cột gốc `places.short_description` (tiếng Việt), KHÔNG BAO GIỜ một bản dịch
        // (xem migration header). Một đề xuất khai rõ locale KHÔNG PHẢI locale gốc cho field này
        // nghĩa là người dùng đang sửa bản DỊCH họ đang xem — nếu ta lặng lẽ ghi giá trị đó vào cột
        // gốc, nội dung ngôn ngữ khác sẽ đè lên nguồn tiếng Việt (và mọi bản dịch tương lai dịch từ
        // đó). Task requirement "không silently ignore locale": từ chối rõ ràng thay vì đoán hoặc
        // âm thầm bỏ qua locale khi nó THỰC SỰ ảnh hưởng tới việc ghi. `address`/`opening_hours`
        // không có bảng dịch nào — không áp dụng chặn này.
        if (dto.field_key === PlaceEditProposalFieldKey.SHORT_DESCRIPTION && !locale.isDefault) {
          throw new BadRequestException(
            'MVP hiện chỉ nhận đề xuất sửa mô tả ngắn cho bản gốc (locale mặc định) — chưa hỗ trợ đề xuất áp dụng cho một bản dịch cụ thể.',
          );
        }
        localeCode = locale.localeCode;
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
        // Safety net for proposals that predate this guard (or where an overlay appears WHILE one
        // is pending) — submit() already refuses new short_description proposals under an active
        // translation overlay, but an existing PENDING one must be re-checked here too, or approving
        // it would silently no-op on the public page while still reporting APPROVED (xem doc comment
        // shortDescriptionHasTranslationOverlay()). Throwing here rolls back the whole transaction
        // (proven: Scenario 3 in code review) — the proposal is left exactly PENDING, not decided.
        if (
          proposal.fieldKey === PlaceEditProposalFieldKey.SHORT_DESCRIPTION &&
          (await this.shortDescriptionHasTranslationOverlay(proposal.placeId))
        ) {
          throw new ConflictException(
            'Mô tả ngắn của địa điểm này hiện được quản lý qua hệ thống bản dịch — không thể tự động áp dụng đề xuất này. Đề xuất vẫn ở trạng thái chờ xử lý.',
          );
        }

        // APPROVE — lock the PLACE row itself for the rest of THIS transaction (same manager, same
        // duration as the proposal row's own lock above), THEN re-check the live value against
        // base_value_hash. Locking is what actually makes "check, then apply" atomic: a plain read
        // here (as before) would let a second decide() on a DIFFERENT pending proposal for the
        // SAME (place, field) read the same pre-change value, pass its own check, and overwrite
        // this write after it lands — both proposals marked APPROVED, one silently lost. With the
        // lock, a concurrent decide() on the same place blocks on this SELECT ... FOR UPDATE until
        // THIS transaction commits or rolls back, then re-reads the ALREADY-updated value — so its
        // own hash check correctly sees the mismatch and reports CONFLICT instead of overwriting.
        const place = await this.placesRepo.getCardByIdIncludingInactiveForUpdate(proposal.placeId, manager);
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
        // verification_status/evidence. `manager` truyền xuống để update()'s đọc/ghi/ghi-revision
        // chạy TRONG CHÍNH transaction này (cùng khoá ở trên) — không phải một connection riêng mà
        // ta "coi như" atomic; nếu update() ném lỗi, toàn bộ transaction (kể cả trạng thái
        // proposal) rollback, không để lại một proposal APPROVED mà nội dung chưa thật sự đổi.
        // `RevisionOrigin.COMMUNITY_EDIT`: nội dung xuất phát từ cộng đồng, dù người bấm duyệt là
        // staff — origin ghi kênh phát sinh nội dung, không phải ai thực hiện thao tác ghi (đúng
        // phân biệt update()'s own doc comment đã nêu).
        await this.placesService.update(
          proposal.placeId,
          { [proposal.fieldKey]: proposal.proposedValue } as never,
          reviewerId,
          RevisionOrigin.COMMUNITY_EDIT,
          manager,
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
