import { Injectable } from '@nestjs/common';
import { PlacesService } from '../places/places.service';
import { PlaceStatus } from '../places/place.enums';
import { BeachesRepository } from './repositories/beaches.repository';
import { ListBeachesQueryDto, UpdateBeachDetailsDto } from './dto/beaches.dto';
import { paginate, clampLimit, clampPage } from '../../common/pagination';
import { redactUntrustedPriceRange } from '../../common/price-trust';
import { AuditService } from '../../core/audit/audit.service';
import { CacheInvalidationService } from '../../core/cache-invalidation/cache-invalidation.service';

interface BeachDetailsRow {
  access_route: string | null;
  characteristics: string | null;
  services: string | null;
  best_season: string | null;
  best_season_source_id: string | null;
  best_season_verified_at: Date | null;
  best_season_source_title: string | null;
  best_season_source_url: string | null;
  lifeguard_info: string | null;
  lifeguard_info_source_id: string | null;
  lifeguard_info_verified_at: Date | null;
  lifeguard_info_source_title: string | null;
  lifeguard_info_source_url: string | null;
  sourced_notes: string | null;
  sourced_notes_source_id: string | null;
  sourced_notes_verified_at: Date | null;
  sourced_notes_source_title: string | null;
  sourced_notes_source_url: string | null;
}

function sourceOf(row: BeachDetailsRow, field: 'best_season' | 'lifeguard_info' | 'sourced_notes') {
  const sourceId = row[`${field}_source_id`];
  if (sourceId == null) return null;
  return {
    title: row[`${field}_source_title`],
    url: row[`${field}_source_url`],
    verified_at: row[`${field}_verified_at`],
  };
}

// "Đường vào"/"đặc điểm bãi"/"dịch vụ" hiển thị nguyên văn. "Mùa tham khảo"/"thông tin cứu
// hộ"/"lưu ý có nguồn" LUÔN đi kèm object nguồn rời (title/url/verified_at) hoặc null — KHÔNG BAO
// GIỜ suy ra trạng thái "an toàn" từ chuỗi text (đúng yêu cầu brief).
function mapBeachDetails(row: BeachDetailsRow | null) {
  if (!row) return null;
  return {
    access_route: row.access_route,
    characteristics: row.characteristics,
    services: row.services,
    best_season: row.best_season,
    best_season_source: sourceOf(row, 'best_season'),
    lifeguard_info: row.lifeguard_info,
    lifeguard_info_source: sourceOf(row, 'lifeguard_info'),
    sourced_notes: row.sourced_notes,
    sourced_notes_source: sourceOf(row, 'sourced_notes'),
  };
}

/**
 * Beach = Place có `categories.slug = 'beach'` — không có bảng vệ tinh CHO ĐẾN
 * InitBeachDetails1720007700000 (product spec, 2026-09-29): nay có `place_beach_details`, nên
 * module này thêm GET/PATCH :slug/:id/details, cùng khuôn Hotels/Restaurants (ADR-002). Chi tiết
 * cơ bản của Place vẫn là `GET /places/{slug}` — `GET /beaches/{slug}` CHỈ ghép thêm
 * `beach_details`, không nhân bản nội dung base.
 */
@Injectable()
export class BeachesService {
  constructor(
    private readonly placesService: PlacesService,
    private readonly repo: BeachesRepository,
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

  async list(query: ListBeachesQueryDto = {}) {
    const p = clampPage(query.page);
    const l = clampLimit(query.limit);
    const filters = { ward: query.ward, priceRange: query.price_range, sort: query.sort };
    const [rows, total] = await Promise.all([
      this.repo.listBeaches(l, (p - 1) * l, filters),
      this.repo.countBeaches(filters),
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
      ward: r.ward,
      verification_status: r.verification_status,
      location: { lat: Number(r.lat), lng: Number(r.lng) },
      // Public Beta price trust gate (2026-08-28): raw price_range chỉ lộ khi trạng thái tin cậy.
    })).map(redactUntrustedPriceRange);
    return paginate(items, p, l, total);
  }

  async getBySlug(slug: string, locale?: string) {
    const place = await this.placesService.getBySlug(slug, locale);
    const details = await this.repo.detail(place.id);
    return { ...place, beach_details: mapBeachDetails(details) };
  }

  // Đặc quyền (Place.Edit.Managed). UPSERT — xem BeachesRepository.upsertDetails.
  async updateDetails(placeId: string, dto: UpdateBeachDetailsDto, userId: string) {
    await this.repo.upsertDetails(placeId, dto);
    await this.recordWriteAndInvalidate('place.beach_details_updated', placeId, userId, {
      access_route_changed: dto.access_route !== undefined,
      characteristics_changed: dto.characteristics !== undefined,
      services_changed: dto.services !== undefined,
      best_season_changed: dto.best_season !== undefined,
      best_season_source_changed: dto.best_season_source_id !== undefined,
      lifeguard_info_changed: dto.lifeguard_info !== undefined,
      lifeguard_info_source_changed: dto.lifeguard_info_source_id !== undefined,
      sourced_notes_changed: dto.sourced_notes !== undefined,
      sourced_notes_source_changed: dto.sourced_notes_source_id !== undefined,
    });
    return mapBeachDetails(await this.repo.detail(placeId));
  }
}
