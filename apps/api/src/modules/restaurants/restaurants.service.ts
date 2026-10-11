import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PlacesService } from '../places/places.service';
import { PlaceStatus } from '../places/place.enums';
import { RestaurantsRepository } from './repositories/restaurants.repository';
import { ListRestaurantsQueryDto, UpdateRestaurantDetailsDto, UpdateRestaurantMenuDto } from './dto/restaurants.dto';
import { paginate, clampLimit, clampPage } from '../../common/pagination';
import { redactUntrustedPriceRange } from '../../common/price-trust';
import { AuditService } from '../../core/audit/audit.service';
import { CacheInvalidationService } from '../../core/cache-invalidation/cache-invalidation.service';

// Public Beta price trust gate (2026-08-28): `restaurant_menu_items.price` KHÔNG có cột
// verification/trust nào ở DB (migration InitRestaurant) — không có bằng chứng theo TỪNG món để
// gate. Fail-closed: `publicResponse: true` (route @Public() GET :id/menu) luôn null hoá `price`;
// `publicResponse: false` (mặc định — dùng bởi `updateMenu()`, đặc quyền) giữ giá trị thật để actor
// thấy đúng giá họ vừa lưu. KHÔNG dùng place.verification_status làm proxy: place đã xác minh
// không có nghĩa từng giá món trong thực đơn đã được đối chiếu.
// Giá món công khai (quyết định sản phẩm 07/10/2026): hiển thị giá đã được cơ sở/nguồn cung cấp qua
// quyền Place.Edit.Managed. Thiếu đơn vị/ngày/nguồn KHÔNG bị điền: trả null để giao diện nói 'chưa rõ'.
// Giá null = chưa biết (không phải miễn phí). `publicResponse` không còn xoá giá.
function mapItem(i: Record<string, unknown>, _publicResponse: boolean) {
  return {
    id: i.id,
    name: i.name,
    price: i.price !== null && i.price !== undefined ? Number(i.price) : null,
    currency: i.currency,
    price_unit: i.price_unit ?? null,
    price_recorded_on: i.price_recorded_on ?? null,
    price_source: i.price_source_id
      ? { id: i.price_source_id, title: i.price_source_title ?? null, url: i.price_source_url ?? null }
      : null,
    tags: i.tags ?? null,
    is_signature: i.is_signature ?? false,
    sort_order: i.sort_order,
  };
}

// Restaurant = Place (category='restaurant') + satellite (ADR-002).
@Injectable()
export class RestaurantsService {
  constructor(
    private readonly placesService: PlacesService,
    private readonly repo: RestaurantsRepository,
    private readonly audit: AuditService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  /** Xem HotelsService.recordWriteAndInvalidate's ghi chú đầy đủ — cùng khuôn. */
  private async recordWriteAndInvalidate(event: string, placeId: string, userId: string, context: Record<string, unknown>) {
    await this.audit.record({ event, entityType: 'place', entityId: placeId, actorId: userId, permission: 'Place.Edit.Managed', context });
    const place = await this.placesService.getSlugAndStatus(placeId);
    if (place?.status === PlaceStatus.PUBLISHED) {
      void this.cacheInvalidation.invalidatePlace(place.slug);
    }
  }

  listAllCuisines() {
    return this.repo.listAllCuisines();
  }

  async list(query: ListRestaurantsQueryDto = {}) {
    const p = clampPage(query.page);
    const l = clampLimit(query.limit);
    const filters = { priceRange: query.price_range, cuisine: query.cuisine, sort: query.sort };
    const [rows, total] = await Promise.all([
      this.repo.listRestaurants(l, (p - 1) * l, filters),
      this.repo.countRestaurants(filters),
    ]);
    const items = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      short_description: r.short_description,
      cover_image_url: r.cover_image_url,
      rating_avg: r.rating_avg !== null ? Number(r.rating_avg) : null,
      rating_count: r.rating_count,
      price_range: r.price_range,
      verification_status: r.verification_status,
      is_local_specialty: r.is_local_specialty,
      cuisines: r.cuisines ?? [],
      location: { lat: Number(r.lat), lng: Number(r.lng) },
      // Public Beta price trust gate (2026-08-28): raw price_range chỉ lộ khi trạng thái đã tin cậy.
    })).map(redactUntrustedPriceRange);
    return paginate(items, p, l, total);
  }

  async getBySlug(slug: string) {
    // `place` đã được PlacesService.getBySlug() redact price_range/prices[].amount theo đúng
    // trust — không cần lặp lại logic ở đây (cascade từ một điểm sửa duy nhất).
    const place = await this.placesService.getBySlug(slug);
    // `amenities` (cùng khuôn HotelsService.getBySlug()) — bảng `place_amenities` dùng chung mọi
    // category; owner đã có thể gán "gửi xe" v.v. cho nhà hàng qua AmenitiesEditor từ trước, nhưng
    // response công khai chưa từng trả lại field này (bug thiếu, không phải chưa thiết kế).
    const [details, cuisines, amenities] = await Promise.all([
      this.repo.detail(place.id),
      this.repo.listCuisines(place.id),
      this.repo.listAmenities(place.id),
    ]);
    return { ...place, restaurant_details: details, cuisines, amenities };
  }

  async getMenu(placeId: string, opts: { publicResponse?: boolean } = {}) {
    const publicResponse = opts.publicResponse ?? false;
    const sections = await this.repo.sections(placeId);
    const items = await this.repo.itemsBySection(sections.map((s: { id: string }) => s.id));
    return sections.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      sort_order: s.sort_order,
      items: items
        .filter((i: { section_id: string }) => i.section_id === s.id)
        .map((i: Record<string, unknown>) => mapItem(i, publicResponse)),
    }));
  }

  // Đặc quyền (Place.Edit.Managed) — actor phải thấy đúng giá họ vừa lưu, KHÔNG redact
  // (publicResponse mặc định false). CAS thật (2026-10-01) — xem UpdateRestaurantMenuDto's ghi chú
  // đầy đủ: cùng khuôn updateDetails(), 409 trước khi ghi gì, không audit, không invalidate cache.
  async updateMenu(placeId: string, dto: UpdateRestaurantMenuDto, userId: string) {
    // Món chưa có giá không được mang đơn vị/ngày ghi nhận/nguồn giá: không ghi "đã có" cho giá không tồn tại.
    for (const sec of dto.sections) {
      for (const it of sec.items) {
        const hasPrice = it.price !== undefined && it.price !== null;
        const hasMeta = it.price_unit || it.price_recorded_on || it.price_source_id;
        if (!hasPrice && hasMeta) {
          throw new BadRequestException(`Món "${it.name}" chưa có giá: không gửi đơn vị, ngày ghi nhận hoặc nguồn giá.`);
        }
      }
    }
    const result = await this.repo.replaceMenu(placeId, dto.sections, dto.expected_content_version);
    if (result.conflict) {
      throw new ConflictException(
        `Địa điểm vừa được người khác sửa (mong đợi content_version=${dto.expected_content_version}) — tải lại và thử lại.`,
      );
    }
    await this.recordWriteAndInvalidate('place.menu_updated', placeId, userId, {
      sections_count: dto.sections.length,
    });
    const sections = await this.getMenu(placeId);
    return { sections, content_version: result.newVersion };
  }

  // Đặc quyền (Place.Edit.Managed) — đọc details+cuisines bất kể place đang draft/pending/published.
  // Cùng lý do HotelsService.getDetails: `GET /restaurants/:slug` (@Public) chỉ trả place ĐÃ
  // published, nên form sửa một nhà hàng chưa xuất bản không có cách nào tải lại giá trị hiện tại
  // nếu thiếu route này.
  // content_version (2026-09-30) — xem HotelsService.getDetails's ghi chú đầy đủ, cùng khuôn.
  async getDetails(placeId: string) {
    const [details, cuisines, place] = await Promise.all([
      this.repo.detail(placeId),
      this.repo.listCuisines(placeId),
      this.placesService.getSlugAndStatus(placeId),
    ]);
    return { ...details, cuisines, content_version: place?.content_version ?? null };
  }

  // Đặc quyền (Place.Edit.Managed). UPSERT — xem RestaurantsRepository.upsertDetails. cuisine_codes
  // là TÙY CHỌN trong DTO nhưng khi có mặt thì thay toàn bộ gán hiện có (CÙNG transaction CAS bên
  // dưới — mã không tồn tại trong `cuisines` bị từ chối 400 và rollback TOÀN BỘ, không còn ghi nửa
  // vời is_local_specialty/dietary đã commit trước khi cuisine bị từ chối như bản cũ).
  //
  // CAS (2026-09-30): `dto.expected_content_version` không khớp `places.content_version` hiện tại
  // → 409, không ghi gì, không audit, không invalidate cache — xem HotelsService.updateDetails.
  async updateDetails(placeId: string, dto: UpdateRestaurantDetailsDto, userId: string) {
    const result = await this.repo.upsertDetails(placeId, dto, dto.expected_content_version);
    if (result.conflict) {
      throw new ConflictException(
        `Địa điểm vừa được người khác sửa (mong đợi content_version=${dto.expected_content_version}) — tải lại và thử lại.`,
      );
    }
    await this.recordWriteAndInvalidate('place.restaurant_details_updated', placeId, userId, {
      is_local_specialty_changed: dto.is_local_specialty !== undefined,
      dietary_changed: dto.dietary !== undefined,
      cuisine_codes_changed: dto.cuisine_codes !== undefined,
    });
    const [details, cuisines] = await Promise.all([this.repo.detail(placeId), this.repo.listCuisines(placeId)]);
    return { ...details, cuisines, content_version: result.newVersion };
  }
}
