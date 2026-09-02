import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { slugify } from '@phuquochub/utils';
import { PlacesRepository } from './repositories/places.repository';
import { CategoriesRepository } from '../categories/repositories/categories.repository';
import { ContactsRepository } from '../contacts/repositories/contacts.repository';
import { PricesRepository } from '../prices/repositories/prices.repository';
import { MediaRepository } from '../media/repositories/media.repository';
import { toMedia } from '../media/media.mapper';
import { SourceAttributionsRepository } from '../sources/repositories/source-attributions.repository';
import { SourcesRepository } from '../sources/repositories/sources.repository';
import { PlaceTranslationsService } from '../place-translations/place-translations.service';
import { LocalesService } from '../locales/locales.service';
import { RevisionsService } from '../revisions/revisions.service';
import { RevisionOrigin, RevisionStatus } from '../revisions/revision.enums';
import { AuditService } from '../../core/audit/audit.service';
import { MediaUrlService } from '../../core/media-url/media-url.service';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { AuthorizationService } from '../authz/authorization.service';
import { grantSatisfies } from '../authz/authorization.util';
import type { AuthorizationContext } from '../authz/authorization-context';
import { PlaceStatus } from './place.enums';
import { CreatePlaceDto, GeoPointDto, ListPlacesQueryDto, UpdatePlaceDto } from './dto/places.dto';
import { toPlaceCard, toPlaceDetail } from './places.mapper';
import { paginate, clampLimit, clampPage } from '../../common/pagination';
import { outOfProvisionalBounds } from '../../common/geo-bounds';
import { canDisclosePrice, redactUntrustedPriceRange } from '../../common/price-trust';

// Permission edit-managed dùng để enumerate "địa điểm tôi quản lý" (listMine, PLACE-041) —
// CÙNG chuỗi permission mà route PATCH /places/:id đã yêu cầu (places.controller.ts), nên
// "quản lý được" ở danh sách này với "sửa được" ở route PATCH luôn là ĐÚNG MỘT định nghĩa.
const PLACE_EDIT_MANAGED = 'Place.Edit.Managed';

// Discriminator đa hình lowercase (B-3) cho contacts.owner_type / price_history.entity_type.
const PLACE_DISCRIMINATOR = 'place';

// Public Place i18n Read Path — field_key mà place_translations dùng cho phần mô tả ngắn công
// khai (khớp field_key do multilingual importer ghi, xem 11_TRANSLATABLE_FIELDS.field_key).
// Hằng số duy nhất, không lặp lại chuỗi 'short_description' ở nhiều nơi trong luồng đọc này.
const SHORT_DESCRIPTION_FIELD_KEY = 'short_description';

// Discriminator đa hình cho source_attributions.entity_type — KHÔNG 'place' mà 'place_field':
// đối chiếu nguồn diễn ra Ở CẤP TỪNG TRƯỜNG (vd `province`, `admin_area`), không phải một nguồn
// đại diện cho toàn bộ place (administrative-backfill.service.ts dùng cùng giá trị này — không
// export được từ đó vì file kia là script nội bộ, không phải module dùng chung).
const PLACE_FIELD_ATTRIBUTION_ENTITY_TYPE = 'place_field';

// Trường nội dung Place được ghi vết diff trong wiki_revisions (tên trường snake_case
// khớp contract/DB — openapi PlaceInput).
const REVISABLE_FIELDS = [
  'name',
  'category_id',
  'address',
  'ward',
  // Đơn vị hành chính đi vào wiki_revisions cùng `address`/`ward`: khi địa giới thay đổi (Nghị
  // quyết 1654/NQ-UBTVQH15) sẽ có một đợt sửa hàng loạt, và mỗi lần sửa PHẢI truy được ai đổi,
  // đổi từ giá trị nào — đó chính là thứ phân biệt "chuẩn hoá theo văn bản pháp luật" với "ai đó
  // gõ nhầm tên tỉnh".
  'province',
  'admin_area',
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
    private readonly mediaUrl: MediaUrlService,
    private readonly userRolesRepo: UserRolesRepository,
    private readonly authz: AuthorizationService,
    private readonly sourceAttributionsRepo: SourceAttributionsRepository,
    private readonly sourcesRepo: SourcesRepository,
    private readonly placeTranslationsService: PlaceTranslationsService,
    private readonly localesService: LocalesService,
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
    // Public Beta price trust gate (2026-08-28): raw `price_range` chỉ được lộ ra khi
    // verification_status đã tin cậy — trước đây route công khai này luôn trả raw price_range,
    // bất kể trạng thái (web chỉ ẩn nó ở tầng render, không phải ở response JSON).
    return paginate(items.map(toPlaceCard).map(redactUntrustedPriceRange), page, limit, total);
  }

  /**
   * Public Place i18n Read Path (2026-09-02) — `locale` TÙY CHỌN, giữ nguyên hợp đồng phản hồi
   * hiện có (`short_description: string | null`, không thêm khoá mới). Nguồn locale DUY NHẤT là
   * `?locale=` querystring; mọi việc chuẩn hoá/kiểm hợp lệ/fallback đều đi qua
   * `LocalesService.resolveRequestLocale()` — locale sai/không hỗ trợ (unknown, không public,
   * không production) không được phép làm sập route công khai này, rơi về locale mặc định thay vì
   * throw. Lỗi hạ tầng (DB/repository) vẫn propagate như bình thường — đây không phải một
   * guarantee "never throws" tuyệt đối cho mọi loại lỗi.
   *
   * Chỉ ghi đè `short_description`: đây là field DUY NHẤT multilingual importer đã ghi tới hôm
   * nay (xem ADR-020, 11_TRANSLATABLE_FIELDS). Không tìm thấy bản dịch đủ điều kiện (current +
   * public + production) → giữ nguyên giá trị gốc từ `places.short_description`, không phải lỗi.
   */
  async getBySlug(slug: string, locale?: string) {
    const row = await this.placesRepo.getDetailBySlug(slug);
    if (!row) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    // Ghép đủ contract openapi Place: scalar chi tiết + contacts/prices/media/faqs.
    const [contacts, prices, media, faqs, trustSources, localizedShortDescription] = await Promise.all([
      this.contactsRepo.listByOwner(PLACE_DISCRIMINATOR, row.id),
      this.pricesRepo.current(PLACE_DISCRIMINATOR, row.id),
      this.mediaRepo.listPublishedByPlace(row.id),
      this.placesRepo.listFaqs(row.id),
      this.resolveTrustSources(row.id),
      this.resolveLocalizedShortDescription(row.id, locale),
    ]);
    return {
      // Public Beta price trust gate (2026-08-28): raw `price_range` chỉ lộ ra khi place đã tin
      // cậy — trước đây route công khai này luôn trả raw price_range trong response JSON.
      ...redactUntrustedPriceRange(toPlaceDetail(row)),
      // Public Place i18n Read Path: overlay SAU cùng, ghi đè bất kỳ giá trị nào toPlaceDetail đã
      // đặt — bản dịch hợp lệ nếu có, nếu không thì giữ nguyên `places.short_description` gốc.
      short_description: localizedShortDescription ?? row.short_description,
      trust_sources: trustSources,
      contacts: contacts.map((c) => ({
        id: c.id,
        contact_type: c.contactType,
        value: c.value,
        label: c.label,
        is_primary: c.isPrimary,
        verification_status: c.verificationStatus,
        display_order: c.displayOrder,
      })),
      // Public Beta price trust gate (2026-08-28): mỗi dòng `price_history` mang
      // `verification_status` RIÊNG của chính bản ghi giá đó — dùng ĐÚNG field đó
      // (canDisclosePrice), KHÔNG suy trust của một dòng giá từ trust của place chứa nó. `amount`
      // redact thành `null` khi chưa tin cậy; các trường khác (service_name/currency/is_free/…)
      // không phải "raw price" nên vẫn giữ nguyên.
      prices: prices.map((p) => ({
        id: p.id,
        service_name: p.serviceName,
        amount: canDisclosePrice(p.verificationStatus) ? Number(p.amount) : null,
        currency: p.currency,
        unit: p.unit,
        is_free: p.isFree,
        valid_from: p.validFrom,
        valid_to: p.validTo,
        verification_status: p.verificationStatus,
      })),
      media: media.map((m) => toMedia(m, (id) => this.mediaUrl.fileUrl(id))),
      faqs,
    };
  }

  /**
   * Public Place i18n Read Path — seam DUY NHẤT nơi PlacesService chạm vào locale/translation.
   * Không hardcode place nào: nhận placeId bất kỳ, tra `LocalesService.resolveRequestLocale()`
   * rồi `PlaceTranslationsService.getCurrentPublicTranslatedText()` — cùng một đường cho MỌI
   * place, không có nhánh riêng cho địa điểm cụ thể nào.
   */
  private async resolveLocalizedShortDescription(placeId: string, requestedLocale?: string): Promise<string | null> {
    const locale = await this.localesService.resolveRequestLocale(requestedLocale);
    return this.placeTranslationsService.getCurrentPublicTranslatedText(
      placeId,
      SHORT_DESCRIPTION_FIELD_KEY,
      locale.localeCode,
    );
  }

  /**
   * Place Trust & Freshness Surface (2026-08-19) — "nguồn thông tin" của trang chi tiết. Đọc từ
   * `source_attributions`/`sources` (ADR-008/source.md §5) — subsystem ĐÃ CÓ, đây chỉ là một
   * đường ĐỌC mới ghép vào response công khai, không có bảng/entity nào được tạo thêm.
   *
   * KHÔNG dùng bảng `verifications` (method/source_id ở đó) — `VerificationsModule` import ngược
   * `PlacesModule` (đồng bộ cache verification_status/verified_at), nên import chiều ngược lại ở
   * đây sẽ tạo vòng lặp module. `source_attributions` đạt cùng mục đích ("nguồn nào đứng sau
   * thông tin này") mà không cần chạm tới `VerificationsModule`.
   *
   * Trả mảng RỖNG khi place chưa có attribution nào — KHÔNG bịa một nguồn mặc định (Phase 2C:
   * "Nếu không có: không tạo nguồn giả"). Attribution trỏ tới source đã bị xoá mềm (`findById`
   * lọc `deleted_at IS NULL`) bị bỏ qua lặng lẽ — một tham chiếu gãy không phải một nguồn hợp lệ.
   */
  private async resolveTrustSources(placeId: string): Promise<
    Array<{ field: string | null; publisher: string | null; title: string | null; url: string | null; retrieved_at: string | null }>
  > {
    const attributions = await this.sourceAttributionsRepo.listByEntity(
      PLACE_FIELD_ATTRIBUTION_ENTITY_TYPE,
      placeId,
    );
    if (attributions.length === 0) {
      return [];
    }
    const uniqueSourceIds = [...new Set(attributions.map((a) => a.sourceId))];
    const sources = await Promise.all(uniqueSourceIds.map((id) => this.sourcesRepo.findById(id)));
    const sourceById = new Map(sources.filter((s) => s !== null).map((s) => [s.id, s]));

    const resolved: Array<{
      field: string | null;
      publisher: string | null;
      title: string | null;
      url: string | null;
      retrieved_at: string | null;
    }> = [];
    for (const attribution of attributions) {
      const source = sourceById.get(attribution.sourceId);
      if (!source) {
        continue;
      }
      resolved.push({
        field: attribution.field,
        publisher: source.publisher,
        title: source.title,
        url: source.url,
        retrieved_at: source.retrievedAt ? source.retrievedAt.toISOString() : null,
      });
    }
    return resolved;
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
      province: dto.province ?? null,
      adminArea: dto.admin_area ?? null,
      description: dto.description ?? null,
      shortDescription: dto.short_description ?? null,
      openingHours: dto.opening_hours ?? null,
      priceRange: dto.price_range ?? null,
      status: PlaceStatus.PENDING,
      createdBy: userId,
    });
    const row = await this.placesRepo.getCardByIdIncludingInactive(id);
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

  /**
   * `origin` (Administrative Data Backfill, 2026-08-18) — kênh kỹ thuật ghi vào wiki_revisions.
   * TÙY CHỌN, mặc định `COMMUNITY_EDIT` để giữ nguyên hành vi cho MỌI caller hiện có (route PATCH
   * /places/:id, nơi người sửa luôn là chủ cơ sở/cộng tác viên qua UI thường).
   *
   * Trước đây tham số này không tồn tại — origin bị hard-code `COMMUNITY_EDIT` cho MỌI lần PATCH,
   * kể cả những đợt sửa hàng loạt theo văn bản pháp luật (không phải "chỉnh sửa cộng đồng" theo
   * đúng nghĩa của nhãn đó — source.md §6 định nghĩa `origin` là "kênh phát sinh", tách biệt với
   * `source_attributions` là "bằng chứng nội dung"). Ghi sai kênh là nói dối về NGUỒN GỐC của một
   * thay đổi, dù giá trị cuối cùng có đúng đến đâu. Không thêm giá trị enum mới: `revision_origin`
   * (CSDL) đã sẵn có `import`, đúng ngữ nghĩa cho một đợt backfill có nguồn xác định, chạy hàng
   * loạt, không phải quyết định biên tập của một cá nhân.
   */
  async update(id: string, dto: UpdatePlaceDto, userId: string, origin: RevisionOrigin = RevisionOrigin.COMMUNITY_EDIT) {
    const existing = await this.placesRepo.getCardByIdIncludingInactive(id);
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
    if (dto.province !== undefined) patch.province = dto.province;
    if (dto.admin_area !== undefined) patch.adminArea = dto.admin_area;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.short_description !== undefined) patch.shortDescription = dto.short_description;
    if (dto.opening_hours !== undefined) patch.openingHours = dto.opening_hours;
    if (dto.price_range !== undefined) patch.priceRange = dto.price_range;
    await this.placesRepo.updateScalars(id, patch);
    if (dto.location) {
      await this.placesRepo.updateLocation(id, dto.location.lng, dto.location.lat);
    }
    const row = await this.placesRepo.getCardByIdIncludingInactive(id);
    const card = toPlaceCard(row!);
    // WF-14: ghi vết phiên bản. Ở giai đoạn này bản sửa được áp trực tiếp → revision
    // `approved`; Sprint 4 sẽ chuyển sang luồng `pending` chờ duyệt trước khi materialize.
    const changedFields = REVISABLE_FIELDS.filter((f) => dto[f] !== undefined);
    if (changedFields.length > 0) {
      await this.revisionsService.recordPlaceRevision({
        placeId: id,
        snapshot: card,
        diff: { fields: changedFields },
        origin,
        changeNote: null,
        editorId: userId,
        status: RevisionStatus.APPROVED,
      });
    }
    return card;
  }

  async archive(id: string, actorId: string) {
    const existing = await this.placesRepo.getCardByIdIncludingInactive(id);
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
    const existing = await this.placesRepo.getCardByIdIncludingInactive(id);
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

  /**
   * PLACE-041 (Place Content Management MVP) — GET /places/mine. "Địa điểm tôi quản lý" = tập
   * `business_id` (ADR-015 Model A: business_id === places.id) mà chính user đang có grant
   * `Place.Edit.Managed` hiệu lực — CÙNG ĐỊNH NGHĨA mà `PATCH /places/:id` đã dùng để cho phép
   * sửa (places.controller.ts, `@RequirePermissions('Place.Edit.Managed')` +
   * `@AuthorizationContext` qua `IDENTITY_PLACE_RESOLVER`). Không có khái niệm sở hữu nào khác
   * (vd `created_by`) được dùng ở đây: tạo một place (`Place.Create`, mở cho mọi `member`) KHÔNG
   * tự cấp quyền quản lý nó — quyền quản lý chỉ đến qua luồng Business Claim được duyệt
   * (`BusinessClaimsService.decide()` gán role scope `managed` trên đúng `business_id` đó). Đây
   * là chủ đích chống giả mạo của ADR-015, KHÔNG phải một lỗ hổng cần vá ở đây.
   *
   * Hai bước:
   *  1. Liệt kê ỨNG VIÊN: `businessId` (khác null) trên MỌI grant `allow`, `scope_type='managed'`
   *     mà mã permission của CHÍNH grant đó thoả `Place.Edit.Managed` (`grantSatisfies`, y hệt PDP).
   *  2. XÁC NHẬN từng ứng viên qua ĐÚNG PDP đang sống (`AuthorizationService.canWithGrants`, cùng
   *     `grants` đã nạp — không truy vấn DB lần hai) thay vì tự suy luận riêng deny/rank ở đây —
   *     "một PDP duy nhất" (authorization.service.ts). Với dữ liệu hôm nay (không role nào từng bị
   *     gán deny trên `Place.Edit.Managed`) bước 2 luôn khớp bước 1, nhưng giữ bước 2 để không có
   *     hai nguồn sự thật về "quản lý được" nếu sau này có deny grant.
   *
   * Đọc chi tiết từng place qua CHÍNH `getCardByIdIncludingInactive` mà create/update/archive/
   * approve đã dùng (privileged, xem places-privileged-access.arch.spec.ts — `listMine` nằm
   * trong allowlist đã duyệt của guard đó) — hàng đã bị archive (soft-delete, `deleted_at` được
   * set bởi `archive()`) tự động biến mất khỏi danh sách này, không cần lọc thêm.
   */
  async listMine(userId: string) {
    const grants = await this.userRolesRepo.getScopedGrants(userId);
    const candidateIds = [
      ...new Set(
        grants
          .filter((g) => g.effect === 'allow' && g.scopeType === 'managed' && g.businessId !== null)
          .filter((g) => grantSatisfies(g.code, PLACE_EDIT_MANAGED))
          .map((g) => g.businessId as string),
      ),
    ];

    const confirmed = await Promise.all(
      candidateIds.map(async (placeId) => {
        const context: AuthorizationContext = {
          resourceType: 'place',
          resourceId: placeId,
          businessId: placeId,
          ownerId: null,
        };
        const canManage = await this.authz.canWithGrants(grants, userId, PLACE_EDIT_MANAGED, () =>
          Promise.resolve(context),
        );
        return canManage ? placeId : null;
      }),
    );
    const manageableIds = confirmed.filter((id): id is string => id !== null);

    const rows = await Promise.all(
      manageableIds.map((id) => this.placesRepo.getCardByIdIncludingInactive(id)),
    );
    return rows.filter((row): row is NonNullable<typeof row> => row !== null).map(toPlaceDetail);
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
