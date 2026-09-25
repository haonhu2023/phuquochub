import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { slugify } from '@phuquochub/utils';
import { PlacesRepository } from './repositories/places.repository';
import type { PlaceDetailRow } from './repositories/places.repository';
import { CategoriesRepository } from '../categories/repositories/categories.repository';
import { ContactsRepository } from '../contacts/repositories/contacts.repository';
import { PricesRepository } from '../prices/repositories/prices.repository';
import { MediaRepository } from '../media/repositories/media.repository';
import { toMedia } from '../media/media.mapper';
import { SourceAttributionsRepository } from '../sources/repositories/source-attributions.repository';
import { SourcesRepository } from '../sources/repositories/sources.repository';
import { PlaceTranslationsService } from '../place-translations/place-translations.service';
import { TranslationReviewService } from '../place-translations/translation-review.service';
import { TextFormat, TranslationMethod } from '../place-translations/place-translations.enums';
import type { PublishTranslationItem } from '../place-translations/dto/place-translation.dto';
import {
  HumanReviewStatus,
  QualityGateStatus,
  TranslationApprovalStatus,
} from '../multilingual-import/multilingual-import.enums';
import { LocalesService } from '../locales/locales.service';
import { RevisionsService } from '../revisions/revisions.service';
import { RevisionOrigin, RevisionStatus } from '../revisions/revision.enums';
import { AuditService } from '../../core/audit/audit.service';
import { MediaUrlService } from '../../core/media-url/media-url.service';
import { CacheInvalidationService } from '../../core/cache-invalidation/cache-invalidation.service';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { AuthorizationService } from '../authz/authorization.service';
import { grantSatisfies } from '../authz/authorization.util';
import type { AuthorizationContext } from '../authz/authorization-context';
import { PlaceStatus } from './place.enums';
import { CreatePlaceDto, GeoPointDto, ListPlacesQueryDto, RightNowQueryDto, UpdatePlaceDto } from './dto/places.dto';
import { toPlaceCard, toPlaceDetail, toPlaceNowCard } from './places.mapper';
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

// Public Place i18n Read Path (2026-09-03, đóng khoảng trống integration): field_key bản dịch tên
// hiển thị. Hợp đồng phản hồi công khai KHÔNG có khoá `display_name` — field công khai là `name`
// (khớp toPlaceCard/toPlaceDetail hiện có) — nên bản dịch được overlay vào ĐÚNG khoá `name`, không
// thêm khoá mới, cùng nguyên tắc `short_description` bên dưới.
const DISPLAY_NAME_FIELD_KEY = 'display_name';

// Public Place i18n Read Path — field_key cho mô tả DÀI (`description`), field thứ ba dùng chung
// đúng seam `resolveLocalizedField`/`getCurrentPublicTranslatedText` với `short_description` và
// `display_name` ở trên — không có nhánh riêng, không đổi eligibility filter (current + public +
// production, tại repository). CHỈ overlay trong `getBySlug()`: `description` không tồn tại trên
// PlaceCard/PlaceNowCard (toPlaceCard/toPlaceNowCard không có khoá này — xem places.mapper.ts),
// nên `list()`/`listRightNow()` không cần và không được gọi field_key này.
const DESCRIPTION_FIELD_KEY = 'description';

// "Right Now" MVP — khối trang chủ CÓ CHẶN TRÊN (không phải trang duyệt), nên trần nhỏ hơn hẳn
// clampLimit mặc định (20/100) của `list()`.
const RIGHT_NOW_DEFAULT_LIMIT = 6;
const RIGHT_NOW_MAX_LIMIT = 12;

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
    private readonly translationReviewService: TranslationReviewService,
    private readonly localesService: LocalesService,
    private readonly cacheInvalidation: CacheInvalidationService,
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
   * "Right Now" MVP — GET /places/now. Trust + opening-hours-presence filtering happens in SQL
   * (`PlacesRepository.rightNow()`, before LIMIT) — this method never computes open/closed itself;
   * the web client owns that reading via `getOpeningToday()`, same as GET /geo/nearby-trusted.
   *
   * Locale overlay reuses the EXACT same seam as `getBySlug()` below (`resolveLocalizedField`) —
   * no parallel translation mechanism. Bounded result set (`RIGHT_NOW_MAX_LIMIT`), so resolving
   * name/short_description per place via `Promise.all` stays a small, fixed-size fan-out, not an
   * unbounded N+1.
   */
  async listRightNow(query: RightNowQueryDto) {
    const limit = clampLimit(query.limit, RIGHT_NOW_DEFAULT_LIMIT, RIGHT_NOW_MAX_LIMIT);
    const rows = await this.placesRepo.rightNow({ limit });
    const cards = rows.map(toPlaceNowCard).map(redactUntrustedPriceRange);
    return Promise.all(
      cards.map(async (card) => {
        const [name, shortDescription] = await Promise.all([
          this.resolveLocalizedField(card.id, DISPLAY_NAME_FIELD_KEY, query.locale),
          this.resolveLocalizedField(card.id, SHORT_DESCRIPTION_FIELD_KEY, query.locale),
        ]);
        return {
          ...card,
          name: name ?? card.name,
          short_description: shortDescription ?? card.short_description,
        };
      }),
    );
  }

  /**
   * P1 (Owner self-publish, 2026-09-22) — danh sách MỌI place (mọi status) cho đội biên tập toàn
   * cục. Route gọi hàm này gác bằng `Place.Edit.Any` — không dùng lại `list()` (luôn ép `published`
   * khi không truyền status) vì route đó là `@Public()`, không phải nơi để mở khoá lọc status theo
   * quyền. Vẫn áp `redactUntrustedPriceRange` cho nhất quán với mọi đường đọc khác — biên tập viên
   * không phải một ngoại lệ về price trust gate.
   */
  async listEditorial(query: ListPlacesQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const { items, total } = await this.placesRepo.listEditorial({ limit, offset: (page - 1) * limit });
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
   * Ghi đè `name` (bản dịch `display_name`), `short_description` và `description`: BA field
   * multilingual importer có thể ghi tới hôm nay qua cùng seam field-agnostic (xem ADR-020,
   * 11_TRANSLATABLE_FIELDS — `description` dùng chung cơ chế, không phải bảng/cột mới). Không tìm
   * thấy bản dịch đủ điều kiện (current + public + production) cho field nào → giữ nguyên giá trị
   * gốc từ `places.name` / `places.short_description` / `places.description` cho ĐÚNG field đó,
   * không phải lỗi — cả ba field fallback độc lập với nhau (thiếu bản dịch field này không kéo
   * theo mất bản dịch field khác). `description` CHỈ overlay ở route chi tiết này — không tồn tại
   * trên PlaceCard/PlaceNowCard nên `list()`/`listRightNow()` không cần đường này.
   */
  async getBySlug(slug: string, locale?: string) {
    const row = await this.placesRepo.getDetailBySlug(slug);
    if (!row) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    return this.buildDetailResponse(row, locale);
  }

  /**
   * P3 (Preview riêng tư, 2026-09-22) — ĐÚNG hình dạng PlaceDetail mà `getBySlug` trả cho khách,
   * nhưng đọc qua `getCardByIdIncludingInactive` (đặc quyền, không lọc status) thay vì
   * `getDetailBySlug` (chỉ published) — owner xem trước place `draft`/`pending` y hệt cách nó sẽ
   * hiện ra khi publish, không phải một hình dạng response riêng phải bảo trì song song.
   * Route đã gác bằng `Place.Edit.Managed` (controller) — hàm này không tự kiểm quyền lần hai.
   */
  // SEO1 (2026-09-22) — SITEMAP-ONLY batched gate: which of these place ids (place/hotel/
  // restaurant/tour are all rows in `places`, category-filtered — see hotels.service.ts's own
  // "Hotel = Place + satellite" comment) have an EN detail page eligible for indexing. Thin
  // pass-through to PlaceTranslationsService — this method exists so the controller only needs
  // PlacesService, not a second injected service.
  async listEnIndexableIds(ids: string[]): Promise<string[]> {
    return this.placeTranslationsService.listEnIndexablePlaceIds(ids);
  }

  async preview(id: string) {
    const row = await this.placesRepo.getCardByIdIncludingInactive(id);
    if (!row) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    // Preview không có `?locale=` của request khách — bỏ trống để resolveLocalizedField dùng
    // locale mặc định hệ thống (đúng seam LocalesService.resolveRequestLocale(undefined) hiện có).
    return this.buildDetailResponse(row);
  }

  // Thân của getBySlug/preview — TÁCH RA vì hai route chỉ khác nguồn đọc row (published-only vs
  // đặc quyền không lọc status), không khác cách ghép response. Một định nghĩa response, hai
  // đường vào — không lệch được như từng lệch (F-17/F-19 đều là loại lỗi "một cột quên map ở một
  // trong hai chỗ").
  private async buildDetailResponse(row: PlaceDetailRow, locale?: string) {
    // Ghép đủ contract openapi Place: scalar chi tiết + contacts/prices/media/faqs.
    const [
      contacts,
      prices,
      media,
      faqs,
      trustSources,
      localizedDisplayName,
      localizedShortDescription,
      localizedDescription,
      hasQualifiedOpeningHoursEvidence,
      enDisplayNameApproved,
      enShortDescriptionApproved,
    ] = await Promise.all([
      this.contactsRepo.listByOwner(PLACE_DISCRIMINATOR, row.id),
      this.pricesRepo.current(PLACE_DISCRIMINATOR, row.id),
      this.mediaRepo.listPublishedByPlace(row.id),
      this.placesRepo.listFaqs(row.id),
      this.resolveTrustSources(row.id),
      this.resolveLocalizedField(row.id, DISPLAY_NAME_FIELD_KEY, locale),
      this.resolveLocalizedField(row.id, SHORT_DESCRIPTION_FIELD_KEY, locale),
      this.resolveLocalizedField(row.id, DESCRIPTION_FIELD_KEY, locale),
      // Public detail opening-hours evidence gate (2026-09-09 fix/public-opening-hours-evidence-gate):
      // Right Now/Nearby already refuse to show an opening_hours claim without a gate-passing,
      // source-authoritative CURRENT-value evidence link (PlacesRepository's shared
      // getVerifiedOpeningHoursHashes()/hasVerifiedOpeningHours() helpers) — this route was the one
      // public opening_hours consumer that did not, letting the detail page assert hours Right Now
      // would refuse (VinWonders Phú Quốc: production detail exposes its full weekly schedule while
      // its one evidence row sits at NEEDS_REVIEW). Response-level only: the DB value is untouched,
      // and getDetailBySlug() stays a raw pass-through for its other, privileged callers (audit/
      // ingestion — see that method's own comment) that must keep seeing the real stored value.
      this.placesRepo.hasCurrentQualifiedOpeningHoursEvidence(row.id, row.opening_hours),
      // EN indexation gate (Phase 20 v2) — CỐ Ý luôn tra cứu locale 'en' cố định ở đây, KHÔNG
      // theo `locale` của request: một trang /vi cũng cần biết bản EN có đủ điều kiện index hay
      // không để dựng đúng hreflang="en" (xem web `isEnDetailIndexable`). Dùng lại ĐÚNG seam
      // "current+public+production" đã có (`getCurrentPublicTranslatedText`) — không tự viết một
      // truy vấn is_public riêng ở đây, để không có hai định nghĩa "công khai" lệch nhau.
      this.placeTranslationsService
        .getCurrentPublicTranslatedText(row.id, DISPLAY_NAME_FIELD_KEY, 'en')
        .then((text) => text !== null),
      this.placeTranslationsService
        .getCurrentPublicTranslatedText(row.id, SHORT_DESCRIPTION_FIELD_KEY, 'en')
        .then((text) => text !== null),
    ]);
    return {
      // Public Beta price trust gate (2026-08-28): raw `price_range` chỉ lộ ra khi place đã tin
      // cậy — trước đây route công khai này luôn trả raw price_range trong response JSON.
      ...redactUntrustedPriceRange(toPlaceDetail(row)),
      // Public Place i18n Read Path: overlay SAU cùng, ghi đè bất kỳ giá trị nào toPlaceDetail đã
      // đặt — bản dịch hợp lệ nếu có, nếu không thì giữ nguyên giá trị gốc. `id`/`slug` KHÔNG bao
      // giờ nằm trong overlay này — identity không đổi theo locale.
      name: localizedDisplayName ?? row.name,
      short_description: localizedShortDescription ?? row.short_description,
      description: localizedDescription ?? row.description,
      // `null` khi opening_hours đã có giá trị nhưng KHÔNG có bằng chứng hiện hành đạt gate — không
      // đổi giá trị trong DB, không 404 place, không ẩn field nào khác.
      opening_hours: hasQualifiedOpeningHoursEvidence ? row.opening_hours : null,
      en_display_name_approved: enDisplayNameApproved,
      en_short_description_approved: enShortDescriptionApproved,
      trust_sources: trustSources,
      // KHÔNG kèm `version` (CAS token) — trường TUỲ CHỌN trên PlaceContact (shared-types), chỉ
      // ContactsService.toResponse() (kênh chủ cơ sở) trả; kênh công khai chỉ đọc, thêm một round-
      // trip đọc `xmin` ở đây là lãng phí không cần thiết trên đường đọc tần suất cao.
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
   * Không hardcode place nào: nhận placeId + fieldKey bất kỳ, tra
   * `LocalesService.resolveRequestLocale()` rồi
   * `PlaceTranslationsService.getCurrentPublicTranslatedText()` — cùng một đường cho MỌI field/
   * place, không có nhánh riêng cho field hay địa điểm cụ thể nào. Dùng chung cho cả `name`
   * (display_name), `short_description` và `description` — thêm field dịch được mới trong tương
   * lai chỉ cần gọi lại hàm này với fieldKey khác, không cần một private method riêng cho từng field.
   */
  private async resolveLocalizedField(
    placeId: string,
    fieldKey: string,
    requestedLocale?: string,
  ): Promise<string | null> {
    const locale = await this.localesService.resolveRequestLocale(requestedLocale);
    return this.placeTranslationsService.getCurrentPublicTranslatedText(placeId, fieldKey, locale.localeCode);
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

    // P1 (Owner self-publish, 2026-09-22): người tạo giữ `Place.Approve` (content_owner/moderator+)
    // KHÔNG chờ ai duyệt — place của họ khởi tạo `draft`, tự bấm "Xuất bản" khi sẵn sàng (§5/§7).
    // Người tạo KHÔNG giữ quyền đó (member/contributor — đóng góp cộng đồng, WF-06/WF-14) GIỮ
    // NGUYÊN hành vi cũ: `pending`, chờ một content_owner/moderator duyệt. Kiểm rank thuần global
    // (không AuthorizationContext) — đúng định nghĩa "tự duyệt được place của CHÍNH MÌNH tạo",
    // place vừa tạo chưa có business_id nào để scope `.Managed` vào.
    const canSelfPublish = await this.authz.can(userId, 'Place.Approve');
    const initialStatus = canSelfPublish ? PlaceStatus.DRAFT : PlaceStatus.PENDING;

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
      status: initialStatus,
      createdBy: userId,
    });
    const row = await this.placesRepo.getCardByIdIncludingInactive(id);
    const card = toPlaceCard(row!);
    // WF-14: mỗi thay đổi nội dung sinh một wiki_revision. `draft` tự-xuất-bản-được → revision
    // `approved` ngay (không ai khác cần duyệt bản nháp của chính người tạo — cùng lý lẽ `update()`
    // dùng cho sửa trực tiếp). `pending` (đóng góp cộng đồng) giữ nguyên revision `pending`.
    await this.revisionsService.recordPlaceRevision({
      placeId: id,
      snapshot: card,
      diff: null,
      origin: canSelfPublish ? RevisionOrigin.OWNER_UPDATE : RevisionOrigin.COMMUNITY_EDIT,
      changeNote: 'Tạo địa điểm',
      editorId: userId,
      status: canSelfPublish ? RevisionStatus.APPROVED : RevisionStatus.PENDING,
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
   *
   * `manager` TÙY CHỌN (Place Edit Proposals atomicity fix) — truyền vào khi caller cần TOÀN BỘ
   * chuỗi đọc/ghi/ghi-revision này chạy trong MỘT transaction của họ, khoá ĐÚNG hàng place đó cho
   * suốt thời gian đó. Không có nó, một caller làm "kiểm tra giá trị gốc rồi gọi update()" (như
   * `PlaceEditProposalsService.decide()`) sẽ kiểm tra trên MỘT connection rồi ghi trên một
   * connection KHÁC — hai bước tách rời, một writer khác có thể chen vào giữa mà không ai phát
   * hiện được. Khi có `manager`: đọc trước/sau dùng bản khoá (`getCardByIdIncludingInactiveForUpdate`,
   * SELECT ... FOR UPDATE) thay vì bản đọc thường, và revision cũng ghi qua CHÍNH manager đó — nên
   * nếu bất cứ bước nào ném lỗi, transaction của caller rollback TOÀN BỘ (không có "place đã đổi
   * nhưng revision chưa ghi" hay ngược lại). Bỏ trống giữ nguyên hành vi cho mọi caller hiện có
   * (route PATCH /places/:id) — không caller nào khác cần đổi.
   */
  async update(
    id: string,
    dto: UpdatePlaceDto,
    userId: string,
    origin: RevisionOrigin = RevisionOrigin.COMMUNITY_EDIT,
    manager?: EntityManager,
  ) {
    const existing = manager
      ? await this.placesRepo.getCardByIdIncludingInactiveForUpdate(id, manager)
      : await this.placesRepo.getCardByIdIncludingInactive(id);
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
    // CAS (AddPlaceContentVersion, 2026-09-22): conditional UPDATE on content_version, same shape
    // as GuideArticlesService.saveDraft(). `affected === 0` means either the place vanished between
    // the read above and here (already ruled out — this is the same request), or someone else's
    // write already bumped the token — either way, NOT a silent overwrite. Location is applied only
    // AFTER the CAS succeeds, so a stale caller's location never lands even when the scalar patch
    // is empty (a location-only edit still runs updateScalarsWithCas with an empty patch to claim
    // the version bump under the SAME check).
    //
    // `manager` passthrough (PlaceEditProposalsService.decide()): updateScalarsWithCas() already
    // accepts an optional manager (runs the UPDATE through it instead of the module's own repo) —
    // the caller there reads the place under `SELECT ... FOR UPDATE` in the SAME transaction just
    // before calling update(), so it can supply that exact row's live content_version as
    // `expected_content_version`; the CAS check can't spuriously fail (nothing else can have
    // changed the row while this transaction holds the lock), and a genuine race is still caught
    // for free — a second decide() on a different pending proposal for the same field blocks on the
    // row lock, then re-reads the ALREADY-bumped version and its own CAS check fails correctly.
    const casOk = await this.placesRepo.updateScalarsWithCas(id, patch, dto.expected_content_version, manager);
    if (!casOk) {
      throw new ConflictException(
        `Địa điểm ${id} vừa được người khác sửa (mong đợi content_version=${dto.expected_content_version}) — tải lại và thử lại.`,
      );
    }
    if (dto.location) {
      await this.placesRepo.updateLocation(id, dto.location.lng, dto.location.lat);
    }
    const row = manager
      ? await this.placesRepo.getCardByIdIncludingInactiveForUpdate(id, manager)
      : await this.placesRepo.getCardByIdIncludingInactive(id);
    const card = toPlaceCard(row!);
    // WF-14: ghi vết phiên bản. Ở giai đoạn này bản sửa được áp trực tiếp → revision
    // `approved`; Sprint 4 sẽ chuyển sang luồng `pending` chờ duyệt trước khi materialize.
    const changedFields = REVISABLE_FIELDS.filter((f) => dto[f] !== undefined);
    if (changedFields.length > 0) {
      await this.revisionsService.recordPlaceRevision(
        {
          placeId: id,
          snapshot: card,
          diff: { fields: changedFields },
          origin,
          changeNote: null,
          editorId: userId,
          status: RevisionStatus.APPROVED,
        },
        manager,
      );
    }
    // C1 follow-up — server-side, write-boundary invalidation: fires for EVERY caller that reaches
    // this method (web UI, a direct API write, a future AI agent), not just the one that happens
    // to also call the web app's revalidate endpoint itself. Only when the edited place is already
    // public — a draft's cache was never populated, so there's nothing stale to invalidate. Never
    // awaited into the response — a downstream revalidate failure must not turn this successful
    // write into an error (see CacheInvalidationService's own comment).
    //
    // `manager` present → SKIP: found 2026-09-25 (PlaceEditProposalsService.decide() review) —
    // when a caller supplies `manager`, this write is one step inside THEIR still-open transaction;
    // invalidating here fires before that transaction COMMITs. The revalidate call reaches the web
    // app, which re-fetches from the API on a SEPARATE connection that (read-committed) cannot see
    // the uncommitted row yet — the "freshly revalidated" cache entry ends up caching the OLD value,
    // and if the caller's transaction later rolls back, a change that never happened just got
    // invalidated for nothing. The caller owns the transaction boundary, so it owns firing this
    // AFTER its own commit succeeds — see decide()'s post-transaction invalidatePlace() call.
    if (card.status === PlaceStatus.PUBLISHED && !manager) {
      void this.cacheInvalidation.invalidatePlace(card.slug);
    }
    return card;
  }

  // Trường DRAFT-ABLE qua saveDraft()/publishDraft() (content_owner scalar draft/publish,
  // 2026-09-16, mở rộng `location` 2026-09-17) — CHỦ Ý KHÔNG bao gồm name/short_description/
  // description: ba trường đó có lớp phủ i18n (place_translations, xem getBySlug()/
  // resolveLocalizedField()) — sửa chúng phải đi qua save{Name,ShortDescription,Description}
  // Draft()/publish...Draft() (thật sự ghi vào place_translations), không phải patch cột
  // `places.<col>` ở đây (một patch scalar cho các trường đó có thể hoàn toàn KHÔNG hiển thị công
  // khai nếu đã có bản dịch override cho locale đó — lỗi im lặng, không được phép). `location`
  // KHÔNG có lớp phủ i18n nào (toạ độ không được dịch) nên không có nguy cơ đó — nay CÓ CAS thật
  // qua nhánh riêng trong PlacesRepository.updateScalarsIfUnchanged().
  private readonly DRAFT_SCALAR_FIELDS = [
    'category_id',
    'address',
    'ward',
    'province',
    'admin_area',
    'opening_hours',
    'price_range',
    'location',
  ] as const;

  private buildDraftScalarPatch(dto: UpdatePlaceDto, userId: string): Record<string, unknown> {
    const patch: Record<string, unknown> = { updatedBy: userId };
    if (dto.category_id !== undefined) patch.categoryId = dto.category_id;
    if (dto.address !== undefined) patch.address = dto.address;
    if (dto.ward !== undefined) patch.ward = dto.ward;
    if (dto.province !== undefined) patch.province = dto.province;
    if (dto.admin_area !== undefined) patch.adminArea = dto.admin_area;
    if (dto.opening_hours !== undefined) patch.openingHours = dto.opening_hours;
    if (dto.price_range !== undefined) patch.priceRange = dto.price_range;
    return patch;
  }

  /**
   * Lưu nháp (content_owner draft/publish, 2026-09-16) — ghi MỘT wiki_revisions row mới
   * (origin=OWNER_UPDATE, status=pending) mang snapshot ỨNG VIÊN cho các trường SCALAR (không bao
   * gồm name/short_description/description — xem DRAFT_SCALAR_FIELDS ở trên); dòng `places` LIVE
   * KHÔNG bị đụng tới. CAS token cho publishDraft() sau này (`places.xmin::text` đọc TẠI ĐÂY, xem
   * `row_version`) đi kèm trong `diff` (cột jsonb tự do đã có sẵn, không cần cột mới).
   *
   * Cùng permission/scope với PATCH /places/:id (Place.Edit.Managed) — không phải quyền riêng cho
   * content_owner, đúng chủ trương "backend-enforced bằng permission thật".
   */
  async saveDraft(id: string, dto: UpdatePlaceDto, userId: string) {
    if (dto.name !== undefined || dto.short_description !== undefined || dto.description !== undefined) {
      throw new BadRequestException(
        'Lưu nháp cho tên/mô tả ngắn/mô tả phải qua POST /places/:id/{name,short-description,description}/draft (place_translations), không qua đường này.',
      );
    }
    const existing = await this.placesRepo.getCardByIdIncludingInactive(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    if (dto.category_id) {
      const category = await this.categoriesRepo.findById(dto.category_id);
      if (!category) {
        throw new BadRequestException('category_id không tồn tại');
      }
    }
    // Cùng tín hiệu giám sát mà update() đã phát khi location đổi (F-1/OD-F-1) — thuần log, không
    // chặn lưu nháp; phát TẠI ĐÂY (lúc đề xuất) hợp lý hơn lúc publish.
    this.signalOutOfProvisionalBounds(dto.location, { action: 'update', placeId: id, actorId: userId });
    const changedFields = this.DRAFT_SCALAR_FIELDS.filter((f) => (dto as unknown as Record<string, unknown>)[f] !== undefined);
    if (changedFields.length === 0) {
      throw new BadRequestException('Không có trường nào để lưu nháp.');
    }
    const dtoSnapshotFields: Record<string, unknown> = {};
    for (const field of changedFields) {
      dtoSnapshotFields[field] = (dto as unknown as Record<string, unknown>)[field];
    }
    const candidateSnapshot = { ...existing, ...dtoSnapshotFields };
    return this.revisionsService.recordPlaceRevision({
      placeId: id,
      snapshot: candidateSnapshot,
      // `baseVersion` (2026-09-17) — `places.xmin::text` đọc TẠI ĐÂY, KHÔNG PHẢI `updated_at`. Xem
      // PlacesRepository.updateScalarsIfUnchanged()'s ghi chú đầy đủ: một token lấy từ JS `Date`
      // (kể cả làm tròn mili-giây) để lọt một cửa sổ đua thật giữa hai ghi cùng mili-giây — `xmin`
      // đổi ở MỌI lần UPDATE bất kể đồng hồ hệ thống, đóng cửa sổ đó triệt để.
      diff: { fields: changedFields, baseVersion: existing.row_version },
      origin: RevisionOrigin.OWNER_UPDATE,
      changeNote: dto.change_note ?? null,
      editorId: userId,
      status: RevisionStatus.PENDING,
    });
  }

  /**
   * Công khai một bản nháp: đọc lại revision `pending` ĐÚNG place này, áp patch lên dòng live
   * CHỈ KHI `places.xmin` vẫn khớp giá trị đã đọc lúc lưu nháp (CAS) — 409 nếu đã trôi (nơi khác
   * cập nhật place sau khi nháp được tạo, KỂ CẢ khi lần ghi đó xảy ra trong cùng mili-giây với lúc
   * đọc nháp — xem PlacesRepository.updateScalarsIfUnchanged()'s ghi chú đầy đủ). Đánh dấu
   * revision `approved` CHỈ khi áp thành công.
   */
  async publishDraft(id: string, revisionId: string, userId: string) {
    const revision = await this.revisionsService.getPendingPlaceRevision(id, revisionId);
    if (!revision) {
      throw new NotFoundException('Không tìm thấy bản nháp');
    }
    if (revision.status !== RevisionStatus.PENDING) {
      throw new ConflictException('Bản nháp đã được xử lý (công khai hoặc từ chối) — tải lại.');
    }
    const diff = revision.diff as { fields?: string[]; baseVersion?: string } | null;
    const baseVersion = diff?.baseVersion;
    if (!baseVersion) {
      throw new ConflictException('Bản nháp thiếu mốc đối chiếu — không thể công khai an toàn, tạo nháp mới.');
    }
    const patch = this.extractDraftPatchFromSnapshot(revision.snapshot as Record<string, unknown>, diff?.fields ?? []);
    const applied = await this.placesRepo.updateScalarsIfUnchanged(id, { ...patch, updatedBy: userId }, baseVersion);
    if (!applied) {
      throw new ConflictException('Địa điểm đã được người khác cập nhật từ khi tạo bản nháp — tải lại và thử lại.');
    }
    const marked = await this.revisionsService.markApproved(revisionId, userId);
    if (!marked) {
      this.logger.warn(`publishDraft: revision ${revisionId} đã đổi status trước khi markApproved (đua hiếm)`);
    }
    const row = await this.placesRepo.getCardByIdIncludingInactive(id);
    return toPlaceCard(row!);
  }

  /** Trích patch camelCase từ snapshot đã lưu trong revision, chỉ cho các trường thực sự đổi. */
  private extractDraftPatchFromSnapshot(snapshot: Record<string, unknown>, fields: string[]): Record<string, unknown> {
    const FIELD_TO_PATCH_KEY: Record<string, string> = {
      category_id: 'categoryId',
      address: 'address',
      ward: 'ward',
      province: 'province',
      admin_area: 'adminArea',
      opening_hours: 'openingHours',
      price_range: 'priceRange',
      // `location` (2026-09-17) — khoá patch TRÙNG khoá field (không camelCase riêng): repository
      // nhận diện đặc biệt bằng chính tên `location`, xem updateScalarsIfUnchanged()'s ghi chú.
      location: 'location',
    };
    const patch: Record<string, unknown> = {};
    for (const field of fields) {
      const patchKey = FIELD_TO_PATCH_KEY[field];
      if (patchKey && field in snapshot) {
        patch[patchKey] = snapshot[field];
      }
    }
    return patch;
  }

  /**
   * Xem trước bản nháp mô tả VI/EN (content_owner, 2026-09-16) — trả về bản dịch HIỆN HÀNH của
   * `description` cho mỗi locale, bất kể đã công khai hay chưa (owner cần thấy CHÍNH nháp mình
   * vừa lưu, không phải bản công khai — PlaceTranslationsService.getCurrentTranslation(), KHÁC
   * getCurrentPublicTranslatedText() mà route công khai dùng). `null` cho locale chưa từng có bản
   * dịch nào — khi đó giá trị hiệu lực là `places.description` gốc (xem getBySlug()).
   */
  async getDescriptionDraft(id: string) {
    const existing = await this.placesRepo.getCardByIdIncludingInactive(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    const draft = await this.getFieldTranslationDraft(id, DESCRIPTION_FIELD_KEY);
    return { fallback_description: existing.description, ...draft };
  }

  /**
   * Xem trước bản nháp tên hiển thị VI/EN (2026-09-17) — CÙNG khuôn getDescriptionDraft(), field_key
   * `display_name` (DISPLAY_NAME_FIELD_KEY). `fallback_name` là `places.name` gốc (dùng khi chưa có
   * bản dịch nào current+public+production — xem getBySlug()'s resolveLocalizedField()).
   */
  async getNameDraft(id: string) {
    const existing = await this.placesRepo.getCardByIdIncludingInactive(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    const draft = await this.getFieldTranslationDraft(id, DISPLAY_NAME_FIELD_KEY);
    return { fallback_name: existing.name, ...draft };
  }

  /**
   * Xem trước bản nháp mô tả ngắn VI/EN (2026-09-17) — CÙNG khuôn getDescriptionDraft(), field_key
   * `short_description` (SHORT_DESCRIPTION_FIELD_KEY).
   */
  async getShortDescriptionDraft(id: string) {
    const existing = await this.placesRepo.getCardByIdIncludingInactive(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    const draft = await this.getFieldTranslationDraft(id, SHORT_DESCRIPTION_FIELD_KEY);
    return { fallback_short_description: existing.short_description, ...draft };
  }

  /** Phần dùng chung của getDescriptionDraft/getNameDraft/getShortDescriptionDraft (2026-09-17). */
  private async getFieldTranslationDraft(id: string, fieldKey: string) {
    const [vi, en] = await Promise.all([
      this.placeTranslationsService.getCurrentTranslation(id, fieldKey, 'vi'),
      this.placeTranslationsService.getCurrentTranslation(id, fieldKey, 'en'),
    ]);
    return {
      vi: vi
        ? { id: vi.id, text: vi.translatedText, human_review_status: vi.humanReviewStatus, is_public: vi.isPublic }
        : null,
      en: en
        ? { id: en.id, text: en.translatedText, human_review_status: en.humanReviewStatus, is_public: en.isPublic }
        : null,
    };
  }

  /**
   * Lưu nháp mô tả VI/EN (content_owner, 2026-09-16) — ĐI QUA place_translations THẬT
   * (PlaceTranslationsService.publishTranslationBundle()), KHÔNG đụng tới cột `places.description`.
   * Đây chính là "Public Place i18n Read Path" mà getBySlug() đã đọc — một bản dịch mới luôn bắt
   * đầu ở `human_review_status=PENDING`/`is_public=false` (GOVERNANCE HARDENING, cưỡng chế BÊN
   * TRONG publishOneTranslation() bất kể gì được truyền vào đây), nên gọi hàm này KHÔNG làm gì đó
   * hiển thị công khai ngay — đúng ngữ nghĩa "lưu nháp, không ảnh hưởng public".
   *
   * `vi`/`en` đều TUỲ CHỌN nhưng phải có ÍT NHẤT MỘT. `sourceLocaleCode` luôn `'vi'` (ngôn ngữ gốc
   * của nền tảng) cho CẢ HAI mục — với chính bản ghi `vi`, `TranslationMethod.ORIGINAL` đúng nghĩa
   * "đây LÀ ngôn ngữ nguồn", không phải một bản dịch của gì khác.
   */
  async saveDescriptionDraft(id: string, dto: { vi?: string; en?: string }, userId: string) {
    const existing = await this.placesRepo.getCardByIdIncludingInactive(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    return this.saveFieldTranslationDraft(id, DESCRIPTION_FIELD_KEY, dto, existing.description, userId);
  }

  /** Lưu nháp TÊN HIỂN THỊ VI/EN (2026-09-17) — CÙNG khuôn saveDescriptionDraft(), field_key `display_name`. */
  async saveNameDraft(id: string, dto: { vi?: string; en?: string }, userId: string) {
    const existing = await this.placesRepo.getCardByIdIncludingInactive(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    return this.saveFieldTranslationDraft(id, DISPLAY_NAME_FIELD_KEY, dto, existing.name, userId);
  }

  /** Lưu nháp MÔ TẢ NGẮN VI/EN (2026-09-17) — CÙNG khuôn saveDescriptionDraft(), field_key `short_description`. */
  async saveShortDescriptionDraft(id: string, dto: { vi?: string; en?: string }, userId: string) {
    const existing = await this.placesRepo.getCardByIdIncludingInactive(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    return this.saveFieldTranslationDraft(id, SHORT_DESCRIPTION_FIELD_KEY, dto, existing.short_description, userId);
  }

  /**
   * Phần dùng chung của saveDescriptionDraft/saveNameDraft/saveShortDescriptionDraft (2026-09-17).
   * `fallbackForEnSource` — giá trị VI gốc dùng làm `sourceText` cho bản EN khi caller không gửi vi
   * trong CÙNG lần gọi này (giữ đúng hành vi cũ của saveDescriptionDraft).
   */
  private async saveFieldTranslationDraft(
    id: string,
    fieldKey: string,
    dto: { vi?: string; en?: string },
    fallbackForEnSource: string | null,
    userId: string,
  ) {
    if (dto.vi === undefined && dto.en === undefined) {
      throw new BadRequestException('Cần ít nhất một trong hai trường vi/en.');
    }
    const items: PublishTranslationItem[] = [];
    if (dto.vi !== undefined) {
      items.push({
        fieldKey,
        localeCode: 'vi',
        sourceLocaleCode: 'vi',
        translatedText: dto.vi,
        sourceText: dto.vi,
        textFormat: TextFormat.PLAIN_TEXT,
        translationMethod: TranslationMethod.ORIGINAL,
        translationStatus: TranslationApprovalStatus.PENDING,
        humanReviewStatus: HumanReviewStatus.PENDING,
        qualityGate: QualityGateStatus.PASS,
        isPublic: false,
        isProductionData: false,
        productionEligible: false,
      });
    }
    if (dto.en !== undefined) {
      items.push({
        fieldKey,
        localeCode: 'en',
        sourceLocaleCode: 'vi',
        translatedText: dto.en,
        sourceText: dto.vi ?? fallbackForEnSource ?? '',
        textFormat: TextFormat.PLAIN_TEXT,
        translationMethod: TranslationMethod.HUMAN,
        translationStatus: TranslationApprovalStatus.PENDING,
        humanReviewStatus: HumanReviewStatus.PENDING,
        qualityGate: QualityGateStatus.PASS,
        isPublic: false,
        isProductionData: false,
        productionEligible: false,
      });
    }
    const rows = await this.placeTranslationsService.publishTranslationBundle({
      placeId: id,
      items,
      origin: RevisionOrigin.OWNER_UPDATE,
      editorId: userId,
      changeNote: null,
    });
    return rows.map((r) => ({ id: r.id, locale_code: r.localeCode, human_review_status: r.humanReviewStatus }));
  }

  /**
   * Công khai bản nháp mô tả VI/EN — duyệt CHÍNH bản nháp hiện hành cho mỗi locale qua
   * TranslationReviewService.reviewTranslation() (đường THẬT, duy nhất được tin cậy để đặt
   * is_public/is_production_data=true — xem GOVERNANCE HARDENING trong place-translations.service.ts).
   * `reviewTranslation()` tự kiểm tra actor giữ PlaceTranslation.Review.Any (content_owner có qua
   * SeedContentOwnerModerationPermissions) — route này KHÔNG tự đặt is_public, KHÔNG bỏ qua kiểm
   * duyệt, KHÔNG có đường tắt nào khác.
   *
   * KHÔNG PHẢI một giao dịch DUY NHẤT giữa vi/en (mỗi review() là transaction RIÊNG của chính nó,
   * translation-review.service.ts không hỗ trợ manager dùng chung) — nếu vi thành công nhưng en
   * lỗi, vi VẪN được công khai (không rollback). Đây là một GIỚI HẠN THẬT của thiết kế vòng này,
   * không phải một giả định che giấu — kết quả trả về liệt kê CHÍNH XÁC locale nào thành công/lỗi
   * để caller biết và có thể thử lại đúng phần còn thiếu.
   */
  async publishDescriptionDraft(id: string, userId: string) {
    return this.publishFieldTranslationDraft(id, DESCRIPTION_FIELD_KEY, userId, 'Không có bản nháp mô tả nào đang chờ công khai.');
  }

  /** Công khai bản nháp TÊN HIỂN THỊ VI/EN (2026-09-17) — CÙNG khuôn publishDescriptionDraft(). */
  async publishNameDraft(id: string, userId: string) {
    return this.publishFieldTranslationDraft(id, DISPLAY_NAME_FIELD_KEY, userId, 'Không có bản nháp tên nào đang chờ công khai.');
  }

  /** Công khai bản nháp MÔ TẢ NGẮN VI/EN (2026-09-17) — CÙNG khuôn publishDescriptionDraft(). */
  async publishShortDescriptionDraft(id: string, userId: string) {
    return this.publishFieldTranslationDraft(
      id,
      SHORT_DESCRIPTION_FIELD_KEY,
      userId,
      'Không có bản nháp mô tả ngắn nào đang chờ công khai.',
    );
  }

  /** Phần dùng chung của publishDescriptionDraft/publishNameDraft/publishShortDescriptionDraft (2026-09-17). */
  private async publishFieldTranslationDraft(id: string, fieldKey: string, userId: string, emptyMessage: string) {
    const [vi, en] = await Promise.all([
      this.placeTranslationsService.getCurrentTranslation(id, fieldKey, 'vi'),
      this.placeTranslationsService.getCurrentTranslation(id, fieldKey, 'en'),
    ]);
    const targets = [vi, en].filter(
      (t): t is NonNullable<typeof t> =>
        t !== null && (t.humanReviewStatus === HumanReviewStatus.PENDING || t.humanReviewStatus === HumanReviewStatus.NEEDS_CHANGES),
    );
    if (targets.length === 0) {
      throw new NotFoundException(emptyMessage);
    }
    const results: Array<{ locale_code: string; ok: boolean; error?: string }> = [];
    for (const t of targets) {
      try {
        await this.translationReviewService.reviewTranslation(t.id, userId, HumanReviewStatus.APPROVED, null);
        results.push({ locale_code: t.localeCode, ok: true });
      } catch (err) {
        results.push({ locale_code: t.localeCode, ok: false, error: (err as Error).message });
      }
    }
    return results;
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
    // C1 follow-up — just became public for the first time (or republished after unpublish): the
    // public detail page + every listing/sitemap carrying `places:list` must stop serving a stale
    // 404/absence.
    void this.cacheInvalidation.invalidatePlace(existing.slug);
    return null;
  }

  /**
   * P1 (Owner self-publish, 2026-09-22) — gỡ công khai (§3: "Gỡ công khai = draft, hồi được",
   * KHÁC `archive()` là soft-delete không hồi được từ UI). Cùng permission với `approve()`
   * (`Place.Approve`, symmetric — ai duyệt được thì gỡ được), cùng khuôn audit
   * `place.status_changed`. `getCardByIdIncludingInactive` đã tự loại place đã `archive()`
   * (soft-delete đặt `deleted_at`) → gọi unpublish trên một place đã lưu trữ tự động 404, không
   * cần guard riêng — không có đường nào "hồi sinh" một place đã lưu trữ qua endpoint này.
   */
  async unpublish(id: string, actorId: string) {
    const existing = await this.placesRepo.getCardByIdIncludingInactive(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy địa điểm');
    }
    await this.placesRepo.setStatus(id, PlaceStatus.DRAFT);
    await this.audit.record({
      event: 'place.status_changed',
      entityType: 'place',
      entityId: id,
      actorId,
      permission: 'Place.Approve',
      context: { from: existing.status, to: PlaceStatus.DRAFT },
    });
    // C1 follow-up — was public a moment ago, must stop being served (detail 404s, drops out of
    // every listing/sitemap) without waiting for the 60s safety-net window.
    void this.cacheInvalidation.invalidatePlace(existing.slug);
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
