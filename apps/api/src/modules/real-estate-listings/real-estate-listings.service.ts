import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { clampLimit, clampPage, paginate } from '../../common/pagination';
import { AuthorizationService } from '../authz/authorization.service';
import { RealEstateListingsRepository } from './repositories/real-estate-listings.repository';
import { RealEstateListing } from './entities/real-estate-listing.entity';
import { RealEstateAddressPrecision, RealEstateDealStatus, RealEstateListingStatus, RealEstateTransactionType } from './real-estate-listings.enums';
import {
  DecideRealEstateListingDto,
  ListRealEstateListingsQueryDto,
  UpsertRealEstateListingDto,
} from './dto/real-estate-listings.dto';
import {
  toRealEstateListingModeratorView,
  toRealEstateListingPublicView,
  toRealEstateListingSenderView,
} from './real-estate-listings.mapper';

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
  ) {}

  private static assertTransactionScopedFields(dto: UpsertRealEstateListingDto): void {
    if (dto.transaction_type === RealEstateTransactionType.RENT) {
      if (dto.sale_price_basis != null || dto.legal_status_note != null) {
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
    entity.utilitiesNote = dto.utilities_note ?? null;
    entity.furnitureStatus = dto.furniture_status ?? null;
    entity.moveInDate = dto.move_in_date ?? null;
    entity.leaseTermMonths = dto.lease_term_months ?? null;
    entity.legalStatusNote = dto.legal_status_note ?? null;
    entity.description = dto.description ?? null;
    entity.contactMethod = dto.contact_method;
    entity.contactValue = dto.contact_value;
    entity.expiresAt = dto.expires_at ?? null;
  }

  async create(dto: UpsertRealEstateListingDto, userId: string): Promise<ReturnType<typeof toRealEstateListingSenderView>> {
    RealEstateListingsService.assertTransactionScopedFields(dto);
    RealEstateListingsService.assertPriceAndLocation(dto);
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

  async listMine(userId: string): Promise<ReturnType<typeof toRealEstateListingSenderView>[]> {
    const rows = await this.repo.listMine(userId);
    return rows.map(toRealEstateListingSenderView);
  }

  async getMine(id: string, userId: string): Promise<ReturnType<typeof toRealEstateListingSenderView>> {
    const row = await this.loadOwned(id, userId);
    return toRealEstateListingSenderView(row);
  }

  async listPublic(query: ListRealEstateListingsQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const filter = { transactionType: query.transaction_type, propertyType: query.property_type, ward: query.ward };
    const [items, total] = await Promise.all([
      this.repo.listPublic(filter, limit, (page - 1) * limit),
      this.repo.countPublic(filter),
    ]);
    return paginate(items.map(toRealEstateListingPublicView), page, limit, total);
  }

  async getPublicById(id: string): Promise<ReturnType<typeof toRealEstateListingPublicView>> {
    const row = await this.repo.getPublicById(id);
    if (!row) throw new NotFoundException('Không tìm thấy tin bất động sản');
    return toRealEstateListingPublicView(row);
  }
}
