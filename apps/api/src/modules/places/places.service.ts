import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { slugify } from '@phuquochub/utils';
import { PlacesRepository } from './repositories/places.repository';
import { CategoriesRepository } from '../categories/repositories/categories.repository';
import { ContactsRepository } from '../contacts/repositories/contacts.repository';
import { PricesRepository } from '../prices/repositories/prices.repository';
import { MediaRepository } from '../media/repositories/media.repository';
import { toMedia } from '../media/media.mapper';
import { RevisionsService } from '../revisions/revisions.service';
import { RevisionOrigin, RevisionStatus } from '../revisions/revision.enums';
import { AuditService } from '../../core/audit/audit.service';
import { PlaceStatus } from './place.enums';
import { CreatePlaceDto, GeoPointDto, ListPlacesQueryDto, UpdatePlaceDto } from './dto/places.dto';
import { toPlaceCard, toPlaceDetail } from './places.mapper';
import { paginate, clampLimit, clampPage } from '../../common/pagination';
import { outOfProvisionalBounds } from '../../common/geo-bounds';

// Discriminator đa hình lowercase (B-3) cho contacts.owner_type / price_history.entity_type.
const PLACE_DISCRIMINATOR = 'place';

// Trường nội dung Place được ghi vết diff trong wiki_revisions (tên trường snake_case
// khớp contract/DB — openapi PlaceInput).
const REVISABLE_FIELDS = [
  'name',
  'category_id',
  'address',
  'ward',
  'description',
  'short_description',
  'opening_hours',
  'price_range',
  'location',
] as const;

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  constructor(
    private readonly placesRepo: PlacesRepository,
    private readonly categoriesRepo: CategoriesRepository,
    private readonly contactsRepo: ContactsRepository,
    private readonly pricesRepo: PricesRepository,
    private readonly mediaRepo: MediaRepository,
    private readonly revisionsService: RevisionsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListPlacesQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    // Không truyền `status`: kênh công khai luôn dùng mặc định `published` của repository.
    // Lọc theo trạng thái là đặc quyền (hàng đợi kiểm duyệt — Sprint 4), không lấy từ query công khai.
    const { items, total } = await this.placesRepo.list({
      category: query.category,
      ward: query.ward,
      priceRange: query.price_range,
      limit,
      offset: (page - 1) * limit,
    });
    return paginate(items.map(toPlaceCard), page, limit, total);
  }

  async getBySlug(slug: string) {
    const row = await this.placesRepo.getDetailBySlug(slug);
    if (!row) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    // Ghép đủ contract openapi Place: scalar chi tiết + contacts/prices/media/faqs.
    const [contacts, prices, media, faqs] = await Promise.all([
      this.contactsRepo.listByOwner(PLACE_DISCRIMINATOR, row.id),
      this.pricesRepo.current(PLACE_DISCRIMINATOR, row.id),
      this.mediaRepo.listPublishedByPlace(row.id),
      this.placesRepo.listFaqs(row.id),
    ]);
    return {
      ...toPlaceDetail(row),
      contacts: contacts.map((c) => ({
        id: c.id,
        contact_type: c.contactType,
        value: c.value,
        label: c.label,
        is_primary: c.isPrimary,
        verification_status: c.verificationStatus,
        display_order: c.displayOrder,
      })),
      prices: prices.map((p) => ({
        id: p.id,
        service_name: p.serviceName,
        amount: Number(p.amount),
        currency: p.currency,
        unit: p.unit,
        is_free: p.isFree,
        valid_from: p.validFrom,
        valid_to: p.validTo,
        verification_status: p.verificationStatus,
      })),
      media: media.map(toMedia),
      faqs,
    };
  }

  /**
   * F-1 / OD-F-1: toạ độ ngoài hộp PROVISIONAL KHÔNG bị từ chối, nhưng phải để lại dấu vết
   * kiểm toán được. Ghi structured log (không ném lỗi, không đổi luồng) để người vận hành
   * thấy được dữ liệu nằm ngoài vùng dự kiến — đây là phần "bù" cho việc bỏ chặn cứng.
   * Log nêu rõ hộp là PROVISIONAL để không ai đọc nó như một vi phạm biên chính thức.
   */
  private signalOutOfProvisionalBounds(
    location: GeoPointDto | undefined,
    context: { action: 'create' | 'update'; placeId?: string; actorId: string },
  ): void {
    if (!location) {
      return;
    }
    const outside = outOfProvisionalBounds(location);
    if (outside.length === 0) {
      return;
    }
    this.logger.warn({
      event: 'place.coordinate.outside_provisional_bounds',
      finding: 'F-1',
      decision: 'OD-F-1',
      boundary_status: 'PROVISIONAL',
      accepted: true,
      needs_review: true,
      action: context.action,
      place_id: context.placeId ?? null,
      actor_id: context.actorId,
      location: { lat: location.lat, lng: location.lng },
      outside_fields: outside,
    });
  }

  async create(dto: CreatePlaceDto, userId: string) {
    this.signalOutOfProvisionalBounds(dto.location, { action: 'create', actorId: userId });
    const category = await this.categoriesRepo.findById(dto.category_id);
    if (!category) {
      throw new BadRequestException('category_id không tồn tại');
    }
    const slug = await this.uniqueSlug(dto.name);
    // Đóng góp cộng đồng → trạng thái pending chờ kiểm duyệt (WF-06/WF-14).
    // Tích hợp contribution/wiki_revision đầy đủ thuộc Sprint 4 (Moderation).
    const id = await this.placesRepo.createPlace({
      name: dto.name,
      slug,
      categoryId: dto.category_id,
      lng: dto.location.lng,
      lat: dto.location.lat,
      address: dto.address ?? null,
      ward: dto.ward ?? null,
      description: dto.description ?? null,
      shortDescription: dto.short_description ?? null,
      openingHours: dto.opening_hours ?? null,
      priceRange: dto.price_range ?? null,
      status: PlaceStatus.PENDING,
      createdBy: userId,
    });
    const row = await this.placesRepo.getCardById(id);
    const card = toPlaceCard(row!);
    // WF-14: mỗi thay đổi nội dung sinh một wiki_revision. Place tạo mới ở trạng thái
    // `pending` (chờ kiểm duyệt) → revision khởi tạo cũng `pending`. Vòng đời duyệt đầy
    // đủ (materialize snapshot khi approved) thuộc Sprint 4.
    await this.revisionsService.recordPlaceRevision({
      placeId: id,
      snapshot: card,
      diff: null,
      origin: RevisionOrigin.COMMUNITY_EDIT,
      changeNote: 'Tạo địa điểm',
      editorId: userId,
      status: RevisionStatus.PENDING,
    });
    return card;
  }

  async update(id: string, dto: UpdatePlaceDto, userId: string) {
    const existing = await this.placesRepo.getCardById(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    this.signalOutOfProvisionalBounds(dto.location, { action: 'update', placeId: id, actorId: userId });
    if (dto.category_id) {
      const category = await this.categoriesRepo.findById(dto.category_id);
      if (!category) {
        throw new BadRequestException('category_id không tồn tại');
      }
    }
    // DTO snake_case (contract) → thuộc tính entity camelCase (updateScalars ánh xạ cột qua ORM).
    const patch: Record<string, unknown> = { updatedBy: userId };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.category_id !== undefined) patch.categoryId = dto.category_id;
    if (dto.address !== undefined) patch.address = dto.address;
    if (dto.ward !== undefined) patch.ward = dto.ward;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.short_description !== undefined) patch.shortDescription = dto.short_description;
    if (dto.opening_hours !== undefined) patch.openingHours = dto.opening_hours;
    if (dto.price_range !== undefined) patch.priceRange = dto.price_range;
    await this.placesRepo.updateScalars(id, patch);
    if (dto.location) {
      await this.placesRepo.updateLocation(id, dto.location.lng, dto.location.lat);
    }
    const row = await this.placesRepo.getCardById(id);
    const card = toPlaceCard(row!);
    // WF-14: ghi vết phiên bản. Ở giai đoạn này bản sửa được áp trực tiếp → revision
    // `approved`; Sprint 4 sẽ chuyển sang luồng `pending` chờ duyệt trước khi materialize.
    const changedFields = REVISABLE_FIELDS.filter((f) => dto[f] !== undefined);
    if (changedFields.length > 0) {
      await this.revisionsService.recordPlaceRevision({
        placeId: id,
        snapshot: card,
        diff: { fields: changedFields },
        origin: RevisionOrigin.COMMUNITY_EDIT,
        changeNote: null,
        editorId: userId,
        status: RevisionStatus.APPROVED,
      });
    }
    return card;
  }

  async archive(id: string, actorId: string) {
    const existing = await this.placesRepo.getCardById(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    await this.placesRepo.archive(id);
    // ADR-016: đổi trạng thái Place là hành động đặc quyền → ghi audit `place.status_changed`.
    await this.audit.record({
      event: 'place.status_changed',
      entityType: 'place',
      entityId: id,
      actorId,
      permission: 'Place.Archive',
      context: { from: existing.status, to: PlaceStatus.ARCHIVED },
    });
    return null;
  }

  async approve(id: string, actorId: string) {
    const existing = await this.placesRepo.getCardById(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    await this.placesRepo.setStatus(id, PlaceStatus.PUBLISHED);
    await this.audit.record({
      event: 'place.status_changed',
      entityType: 'place',
      entityId: id,
      actorId,
      permission: 'Place.Approve',
      context: { from: existing.status, to: PlaceStatus.PUBLISHED },
    });
    return null;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'place';
    let slug = base;
    while (await this.placesRepo.existsBySlug(slug)) {
      slug = `${base}-${randomUUID().slice(0, 6)}`;
    }
    return slug;
  }
}
