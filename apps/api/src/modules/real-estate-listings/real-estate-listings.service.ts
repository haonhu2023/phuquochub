import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { clampLimit, clampPage, paginate } from '../../common/pagination';
import { todayInVietnam } from '../../common/vn-today';
import { applyRichTextField, RichTextFieldAccessors, serveRichDoc } from '../../common/rich-text-field';
import { AuthorizationService } from '../authz/authorization.service';
import { RealEstateListingsRepository } from './repositories/real-estate-listings.repository';
import { RealEstateListingTranslationsRepository } from './repositories/real-estate-listing-translations.repository';
import { RealEstateListing } from './entities/real-estate-listing.entity';
import { RealEstateListingTranslation } from './entities/real-estate-listing-translation.entity';
import { RealEstateAddressPrecision, RealEstateDealStatus, RealEstateListingStatus, RealEstateTransactionType } from './real-estate-listings.enums';
import {
  AdminListRealEstateListingsQueryDto,
  DecideRealEstateListingDto,
  GetRealEstateListingDetailQueryDto,
  ListRealEstateListingsQueryDto,
  UpsertRealEstateListingDto,
} from './dto/real-estate-listings.dto';
import {
  toRealEstateListingAdminView,
  toRealEstateListingModeratorView,
  toRealEstateListingPublicView,
  toRealEstateListingSenderView,
} from './real-estate-listings.mapper';
import { isRealEstateListingTranslationCriticallyStale, isRealEstateListingTranslationStale } from './real-estate-listing-translation-hash';

// Bảng chuyển trạng thái — CÙNG job_listings (§13r/§13u), cộng deal_status ĐỘC LẬP:
//   status: draft --submit--> pending --decide--> published/rejected ; rejected --submit--> pending
//     (trực tiếp) ; draft|pending --update--> draft ; published --update--> pending NGAY (không
//     overlay) ; published --close--> closed ; closed --reopen--> pending (luôn qua duyệt lại).
//   deal_status: available --markRented/markSold--> rented/sold --markAvailable--> available.
//     ĐỘC LẬP hoàn toàn với status — đổi deal_status KHÔNG đi qua update(), KHÔNG kéo tin về pending
//     (đánh dấu "đã thuê/đã bán" không phải sửa nội dung).
@Injectable()
export class RealEstateListingsService {
  constructor(
    private readonly repo: RealEstateListingsRepository,
    private readonly authz: AuthorizationService,
    private readonly translationsRepo: RealEstateListingTranslationsRepository,
  ) {}

  private static assertTransactionScopedFields(dto: UpsertRealEstateListingDto): void {
    if (dto.transaction_type === RealEstateTransactionType.RENT) {
      // Gói D — `legal_status_note_rich` cùng phạm vi chỉ-tin-bán với `legal_status_note` (kiểm cả
      // hai, không để client gửi rich text "lách" qua kiểm tra này bằng cách chỉ gửi mỗi field rich).
      if (dto.sale_price_basis != null || dto.legal_status_note != null || dto.legal_status_note_rich !== undefined) {
        throw new BadRequestException('sale_price_basis/legal_status_note chỉ áp dụng cho tin bán, không phải tin thuê');
      }
    } else {
      if (
        dto.rent_period != null ||
        dto.deposit_amount != null ||
        dto.move_in_date != null ||
        dto.lease_term_months != null
      ) {
        throw new BadRequestException(
          'rent_period/deposit_amount/move_in_date/lease_term_months chỉ áp dụng cho tin thuê, không phải tin bán',
        );
      }
    }
  }

  private static assertPriceAndLocation(dto: UpsertRealEstateListingDto): void {
    if (dto.price != null && !dto.price_currency) {
      throw new BadRequestException('Có price thì phải có price_currency');
    }
    const precision = dto.address_precision ?? RealEstateAddressPrecision.AREA;
    if (precision === RealEstateAddressPrecision.EXACT && !dto.address_text && (dto.lat == null || dto.lng == null)) {
      throw new BadRequestException('address_precision="exact" cần address_text hoặc cả lat/lng');
    }
  }

  // "Sửa và gửi đăng lại" — cùng lý do/mẫu JobListingsService.assertValidExpiry() (xem ghi chú đầy
  // đủ ở đó): chỉ chặn khi dto ĐANG ĐẶT một `expires_at` KHÁC giá trị đang lưu và giá trị đó đã ở
  // quá khứ — KHÔNG chặn việc sửa trường khác khi giữ nguyên/xoá một hạn cũ đã qua. "Hạn phải còn
  // hiệu lực để đăng lại" là gate THẬT ở submit()/decide() approve (assertNotAlreadyExpired), không
  // phải ở đây.
  private static assertValidExpiry(dto: UpsertRealEstateListingDto, currentValue: string | null): void {
    if (dto.expires_at != null && dto.expires_at !== currentValue && dto.expires_at < todayInVietnam()) {
      throw new BadRequestException('Hạn đăng không được là một ngày trong quá khứ — chọn hôm nay hoặc sau đó');
    }
  }

  private static assertNotAlreadyExpired(row: RealEstateListing, message: string): void {
    if (row.expiresAt != null && row.expiresAt < todayInVietnam()) {
      throw new BadRequestException(message);
    }
  }

  // Gói D — accessor dùng chung cho cả ba trường dài (description/utilities_note/legal_status_note),
  // xem apps/api/src/common/rich-text-field.ts cho logic applyRichTextField() đầy đủ.
  private static readonly DESCRIPTION_ACCESSORS: RichTextFieldAccessors<RealEstateListing> = {
    setPlain: (e, v) => (e.description = v),
    getRich: (e) => e.descriptionRich,
    setRich: (e, v) => (e.descriptionRich = v),
    setRichHash: (e, v) => (e.descriptionRichHash = v),
  };

  private static readonly UTILITIES_NOTE_ACCESSORS: RichTextFieldAccessors<RealEstateListing> = {
    setPlain: (e, v) => (e.utilitiesNote = v),
    getRich: (e) => e.utilitiesNoteRich,
    setRich: (e, v) => (e.utilitiesNoteRich = v),
    setRichHash: (e, v) => (e.utilitiesNoteRichHash = v),
  };

  private static readonly LEGAL_STATUS_NOTE_ACCESSORS: RichTextFieldAccessors<RealEstateListing> = {
    setPlain: (e, v) => (e.legalStatusNote = v),
    getRich: (e) => e.legalStatusNoteRich,
    setRich: (e, v) => (e.legalStatusNoteRich = v),
    setRichHash: (e, v) => (e.legalStatusNoteRichHash = v),
  };

  private static applyDto(entity: RealEstateListing, dto: UpsertRealEstateListingDto): void {
    entity.posterRole = dto.poster_role;
    entity.transactionType = dto.transaction_type;
    entity.propertyType = dto.property_type;
    entity.title = dto.title;
    entity.ward = dto.ward ?? null;
    entity.addressPrecision = dto.address_precision ?? RealEstateAddressPrecision.AREA;
    entity.addressText = dto.address_text ?? null;
    entity.lat = dto.lat != null ? String(dto.lat) : null;
    entity.lng = dto.lng != null ? String(dto.lng) : null;
    entity.areaSqm = dto.area_sqm != null ? String(dto.area_sqm) : null;
    entity.price = dto.price != null ? String(dto.price) : null;
    entity.priceCurrency = dto.price_currency ?? null;
    entity.rentPeriod = dto.rent_period ?? null;
    entity.salePriceBasis = dto.sale_price_basis ?? null;
    entity.depositAmount = dto.deposit_amount != null ? String(dto.deposit_amount) : null;
    applyRichTextField(entity, RealEstateListingsService.UTILITIES_NOTE_ACCESSORS, dto.utilities_note_rich, dto.utilities_note, 'utilities_note_rich');
    entity.furnitureStatus = dto.furniture_status ?? null;
    entity.moveInDate = dto.move_in_date ?? null;
    entity.leaseTermMonths = dto.lease_term_months ?? null;
    applyRichTextField(entity, RealEstateListingsService.LEGAL_STATUS_NOTE_ACCESSORS, dto.legal_status_note_rich, dto.legal_status_note, 'legal_status_note_rich');
    applyRichTextField(entity, RealEstateListingsService.DESCRIPTION_ACCESSORS, dto.description_rich, dto.description, 'description_rich');
    entity.contactMethod = dto.contact_method;
    entity.contactValue = dto.contact_value;
    entity.expiresAt = dto.expires_at ?? null;
  }

  async create(dto: UpsertRealEstateListingDto, userId: string): Promise<ReturnType<typeof toRealEstateListingSenderView>> {
    RealEstateListingsService.assertTransactionScopedFields(dto);
    RealEstateListingsService.assertPriceAndLocation(dto);
    RealEstateListingsService.assertValidExpiry(dto, null);
    const entity = new RealEstateListing();
    RealEstateListingsService.applyDto(entity, dto);
    entity.createdBy = userId;
    entity.status = RealEstateListingStatus.DRAFT;
    entity.dealStatus = RealEstateDealStatus.AVAILABLE;
    const saved = await this.repo.create(entity);
    return toRealEstateListingSenderView(saved);
  }

  private async loadOwned(id: string, userId: string): Promise<RealEstateListing> {
    const row = await this.repo.findById(id);
    if (!row || row.createdBy !== userId) throw new NotFoundException('Không tìm thấy tin bất động sản');
    return row;
  }

  async update(id: string, dto: UpsertRealEstateListingDto, userId: string): Promise<ReturnType<typeof toRealEstateListingSenderView>> {
    RealEstateListingsService.assertTransactionScopedFields(dto);
    RealEstateListingsService.assertPriceAndLocation(dto);
    const row = await this.loadOwned(id, userId);
    RealEstateListingsService.assertValidExpiry(dto, row.expiresAt);
    if (row.status === RealEstateListingStatus.CLOSED) {
      throw new ConflictException('Không thể sửa tin đã đóng — hãy mở lại tin trước (sẽ cần duyệt lại)');
    }
    const wasPublished = row.status === RealEstateListingStatus.PUBLISHED;
    RealEstateListingsService.applyDto(row, dto);
    if (row.status === RealEstateListingStatus.PENDING) {
      row.status = RealEstateListingStatus.DRAFT;
      row.reviewNote = null;
      row.reviewerId = null;
      row.reviewedAt = null;
    } else if (wasPublished) {
      row.status = RealEstateListingStatus.PENDING;
      row.reviewNote = null;
      row.reviewerId = null;
      row.reviewedAt = null;
      row.publishedAt = null;
    }
    const saved = await this.repo.save(row);
    return toRealEstateListingSenderView(saved);
  }

  async submit(id: string, userId: string): Promise<ReturnType<typeof toRealEstateListingSenderView>> {
    const row = await this.loadOwned(id, userId);
    if (row.status !== RealEstateListingStatus.DRAFT && row.status !== RealEstateListingStatus.REJECTED) {
      throw new ConflictException(`Không thể gửi duyệt từ trạng thái "${row.status}"`);
    }
    RealEstateListingsService.assertNotAlreadyExpired(
      row,
      `Không thể gửi duyệt — hạn đăng (${row.expiresAt}) đã qua. Sửa tin và đặt hạn mới trước khi gửi duyệt lại.`,
    );
    row.status = RealEstateListingStatus.PENDING;
    row.reviewNote = null;
    row.reviewerId = null;
    row.reviewedAt = null;
    const saved = await this.repo.save(row);
    return toRealEstateListingSenderView(saved);
  }

  private async loadOwnedOrModerated(id: string, userId: string): Promise<RealEstateListing> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Không tìm thấy tin bất động sản');
    if (row.createdBy === userId) return row;
    if (await this.authz.can(userId, 'RealEstateListing.Moderate')) return row;
    throw new ForbiddenException();
  }

  async close(id: string, userId: string): Promise<ReturnType<typeof toRealEstateListingSenderView>> {
    const row = await this.loadOwnedOrModerated(id, userId);
    if (row.status !== RealEstateListingStatus.PUBLISHED) {
      throw new ConflictException(`Không thể đóng từ trạng thái "${row.status}"`);
    }
    row.status = RealEstateListingStatus.CLOSED;
    const saved = await this.repo.save(row);
    return toRealEstateListingSenderView(saved);
  }

  async reopen(id: string, userId: string): Promise<ReturnType<typeof toRealEstateListingSenderView>> {
    const row = await this.loadOwnedOrModerated(id, userId);
    if (row.status !== RealEstateListingStatus.CLOSED) {
      throw new ConflictException(`Không thể mở lại từ trạng thái "${row.status}"`);
    }
    row.status = RealEstateListingStatus.PENDING;
    row.reviewNote = null;
    row.reviewerId = null;
    row.reviewedAt = null;
    row.publishedAt = null;
    const saved = await this.repo.save(row);
    return toRealEstateListingSenderView(saved);
  }

  // Đánh dấu còn/hết giao dịch — ĐỘC LẬP với vòng đời kiểm duyệt (§13u). KHÔNG đi qua update(),
  // KHÔNG đổi status/reviewer — chỉ hợp lệ khi tin đang published (nơi deal_status thực sự có ý
  // nghĩa với người tìm kiếm).
  private async setDealStatus(id: string, userId: string, dealStatus: RealEstateDealStatus): Promise<ReturnType<typeof toRealEstateListingSenderView>> {
    const row = await this.loadOwnedOrModerated(id, userId);
    if (row.status !== RealEstateListingStatus.PUBLISHED) {
      throw new ConflictException(`Chỉ đánh dấu giao dịch cho tin đang published (hiện tại: "${row.status}")`);
    }
    row.dealStatus = dealStatus;
    const saved = await this.repo.save(row);
    return toRealEstateListingSenderView(saved);
  }

  markRented(id: string, userId: string) {
    return this.setDealStatus(id, userId, RealEstateDealStatus.RENTED);
  }

  markSold(id: string, userId: string) {
    return this.setDealStatus(id, userId, RealEstateDealStatus.SOLD);
  }

  markAvailable(id: string, userId: string) {
    return this.setDealStatus(id, userId, RealEstateDealStatus.AVAILABLE);
  }

  async decide(id: string, dto: DecideRealEstateListingDto, moderatorId: string): Promise<ReturnType<typeof toRealEstateListingModeratorView>> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException('Không tìm thấy tin bất động sản');
    if (row.status !== RealEstateListingStatus.PENDING) {
      throw new ConflictException(`Không thể duyệt từ trạng thái "${row.status}"`);
    }
    if (dto.decision === 'approve') {
      RealEstateListingsService.assertNotAlreadyExpired(
        row,
        `Không thể duyệt — hạn đăng (${row.expiresAt}) đã qua trong lúc chờ duyệt. Từ chối để người đăng sửa hạn rồi gửi lại, hoặc chờ họ tự sửa trước.`,
      );
    }
    row.reviewerId = moderatorId;
    row.reviewedAt = new Date();
    row.reviewNote = dto.note ?? null;
    if (dto.decision === 'approve') {
      row.status = RealEstateListingStatus.PUBLISHED;
      row.publishedAt = new Date();
    } else {
      row.status = RealEstateListingStatus.REJECTED;
    }
    const saved = await this.repo.save(row);
    return toRealEstateListingModeratorView(saved);
  }

  async listPending(): Promise<ReturnType<typeof toRealEstateListingModeratorView>[]> {
    const rows = await this.repo.listPending();
    return rows.map(toRealEstateListingModeratorView);
  }

  // Khác listPending() (chỉ pending): mọi status, lọc tuỳ chọn theo status/người đăng — màn hình
  // "quản lý tất cả tin" cho admin (Gói B, 17/10/2026), cùng mẫu JobListingsService.listAllForAdmin().
  async listAllForAdmin(query: AdminListRealEstateListingsQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const filter = { status: query.status, createdBy: query.created_by };
    const [items, total] = await Promise.all([
      this.repo.listAllForAdmin(filter, limit, (page - 1) * limit),
      this.repo.countAllForAdmin(filter),
    ]);
    const creators = await this.repo.findCreatorSummaries([...new Set(items.map((row) => row.createdBy))]);
    return paginate(
      items.map((row) => toRealEstateListingAdminView(row, creators.get(row.createdBy) ?? null)),
      page,
      limit,
      total,
    );
  }

  async listMine(userId: string): Promise<ReturnType<typeof toRealEstateListingSenderView>[]> {
    const rows = await this.repo.listMine(userId);
    return rows.map(toRealEstateListingSenderView);
  }

  async getMine(id: string, userId: string): Promise<ReturnType<typeof toRealEstateListingSenderView>> {
    const row = await this.loadOwned(id, userId);
    return toRealEstateListingSenderView(row);
  }

  // Gói C §3 (17/10/2026) — cùng lý do JobListingsService.listPublic() (xem ghi chú đầy đủ ở đó):
  // overlay title theo locale, batch MỘT truy vấn cho cả trang — không N+1.
  async listPublic(query: ListRealEstateListingsQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const filter = { transactionType: query.transaction_type, propertyType: query.property_type, ward: query.ward };
    const [items, total] = await Promise.all([
      this.repo.listPublic(filter, limit, (page - 1) * limit),
      this.repo.countPublic(filter),
    ]);
    const translations =
      query.locale === 'en'
        ? await this.translationsRepo.findByRealEstateListingIds(items.map((i) => i.id))
        : new Map<string, RealEstateListingTranslation>();
    const views = items.map((row) => {
      const base = toRealEstateListingPublicView(row);
      const translation = translations.get(row.id);
      // Gói D điểm 4 — cùng lý do job_listings: thẻ tin phải nhất quán với chi tiết.
      if (
        query.locale === 'en' &&
        translation?.publishedTitle != null &&
        !isRealEstateListingTranslationCriticallyStale(translation.publishedCriticalFieldsHash, row)
      ) {
        return { ...base, title: translation.publishedTitle, locale: 'en' as const };
      }
      return { ...base, locale: 'vi' as const };
    });
    return paginate(views, page, limit, total);
  }

  // Gói C (17/10/2026) — cùng lý do JobListingsService.getPublicById() (xem ghi chú đầy đủ ở đó):
  // đọc published* (KHÔNG title/description trần của bảng dịch — đó là vùng nháp), kiểm
  // `publishedTitle != null` KHÔNG kiểm `status`. `locale` trong response LUÔN phản ánh nội dung
  // THỰC SỰ đã trả.
  async getPublicById(
    id: string,
    locale?: GetRealEstateListingDetailQueryDto['locale'],
  ): Promise<
    ReturnType<typeof toRealEstateListingPublicView> & {
      locale: 'vi' | 'en';
      is_translation_stale: boolean;
      // Gói D điểm 4 — cùng ý nghĩa JobListingsService.getPublicById()'s field cùng tên.
      translation_hidden_reason: 'critical_fact_mismatch' | null;
    }
  > {
    const row = await this.repo.getPublicById(id);
    if (!row) throw new NotFoundException('Không tìm thấy tin bất động sản');
    const base = toRealEstateListingPublicView(row);

    if (locale === 'en') {
      const translation = await this.translationsRepo.findByRealEstateListingId(id);
      if (translation && translation.publishedTitle != null) {
        // Gói D điểm 4 — cùng lý do job_listings: kiểm dữ kiện QUAN TRỌNG (địa điểm/giá/điều kiện
        // giao dịch) TRƯỚC, lệch → fallback tiếng Việt hẳn (không chỉ cảnh báo chung).
        const criticallyStale = isRealEstateListingTranslationCriticallyStale(translation.publishedCriticalFieldsHash, row);
        if (!criticallyStale) {
          const stale = translation.publishedSourceContentHash
            ? isRealEstateListingTranslationStale(translation.publishedSourceContentHash, row)
            : false;
          return {
            ...base,
            title: translation.publishedTitle,
            description: translation.publishedDescription ?? base.description,
            description_rich: serveRichDoc(
              translation.publishedDescription,
              translation.publishedDescriptionRich,
              translation.publishedDescriptionRichHash,
            ),
            utilities_note: translation.publishedUtilitiesNote ?? base.utilities_note,
            // utilities_note/legal_status_note bản dịch CHƯA hỗ trợ rich text (chỉ `description` bản
            // dịch có, cùng phạm vi job_listings). PHẢI đặt null tường minh — nếu không, `...base` phía
            // trên sẽ để lọt RichDoc của bản TIẾNG VIỆT (utilities_note/legal_status_note NGUỒN) vào
            // response đang phục vụ tiếng Anh — cùng lớp lỗi đã tìm thấy và sửa ở job_listings.
            utilities_note_rich: null,
            legal_status_note: translation.publishedLegalStatusNote ?? base.legal_status_note,
            legal_status_note_rich: null,
            locale: 'en',
            is_translation_stale: stale,
            translation_hidden_reason: null,
          };
        }
        return { ...base, locale: 'vi', is_translation_stale: false, translation_hidden_reason: 'critical_fact_mismatch' };
      }
    }
    return { ...base, locale: 'vi', is_translation_stale: false, translation_hidden_reason: null };
  }
}
