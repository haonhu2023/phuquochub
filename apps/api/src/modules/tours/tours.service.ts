import { BadRequestException, Injectable } from '@nestjs/common';
import { PlacesService } from '../places/places.service';
import { PlaceStatus } from '../places/place.enums';
import { ToursRepository } from './repositories/tours.repository';
import { CreateTourDto, ListToursQueryDto, UpdateTourDetailsDto, UpdateTourStopsDto } from './dto/tours.dto';
import type { CreatePlaceDto } from '../places/dto/places.dto';
import { paginate, clampLimit, clampPage } from '../../common/pagination';
import { redactUntrustedPriceRange } from '../../common/price-trust';
import { AuditService } from '../../core/audit/audit.service';
import { CacheInvalidationService } from '../../core/cache-invalidation/cache-invalidation.service';

function mapStop(s: Record<string, unknown>) {
  const lat = s.lat as number | null;
  const lng = s.lng as number | null;
  return {
    id: s.id,
    name: s.name,
    sort_order: s.sort_order,
    time: s.time,
    note: s.note,
    location: lat !== null && lng !== null ? { lat: Number(lat), lng: Number(lng) } : null,
  };
}

// Public Beta price trust gate (2026-08-28): `tour_schedules.price` KHÔNG có cột verification/
// trust nào ở DB (migration InitTour) — không có bằng chứng theo TỪNG chuyến để gate, và không
// có đường ghi/phản ánh đặc quyền nào đọc lại giá trị này (không có ToursService.updateSchedule).
// Fail-closed vô điều kiện: raw price KHÔNG BAO GIỜ lộ ra, kể cả cho actor đã đăng nhập.
function mapSchedule(s: Record<string, unknown>) {
  return {
    id: s.id,
    date: s.date,
    capacity: s.capacity,
    price: null,
    currency: s.currency,
    valid_from: s.valid_from,
    valid_to: s.valid_to,
  };
}

// Tour = Place (category='tour') + satellite (ADR-002). create → tạo Place (pending) + tour_details.
@Injectable()
export class ToursService {
  constructor(
    private readonly placesService: PlacesService,
    private readonly repo: ToursRepository,
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

  async list(query: ListToursQueryDto = {}) {
    const p = clampPage(query.page);
    const l = clampLimit(query.limit);
    const filters = {
      type: query.type,
      difficulty: query.difficulty,
      priceRange: query.price_range,
      maxDurationMinutes: query.max_duration_minutes,
      departureArea: query.departure_area,
      sort: query.sort,
    };
    const [rows, total] = await Promise.all([
      this.repo.listTours(l, (p - 1) * l, filters),
      this.repo.countTours(filters),
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
      ward: r.ward,
      tour_type: r.tour_type,
      duration_minutes: r.duration_minutes,
      difficulty: r.difficulty,
      location: { lat: Number(r.lat), lng: Number(r.lng) },
      // Public Beta price trust gate (2026-08-28): raw price_range chỉ lộ khi trạng thái tin cậy.
    })).map(redactUntrustedPriceRange);
    return paginate(items, p, l, total);
  }

  async getBySlug(slug: string) {
    // `place` đã được PlacesService.getBySlug() redact price_range/prices[].amount theo đúng
    // trust — không cần lặp lại logic ở đây (cascade từ một điểm sửa duy nhất).
    const place = await this.placesService.getBySlug(slug);
    const details = await this.repo.detail(place.id);
    return { ...place, tour_details: details };
  }

  async getItinerary(placeId: string) {
    return (await this.repo.stops(placeId)).map(mapStop);
  }

  async getSchedule(placeId: string) {
    return (await this.repo.schedules(placeId)).map(mapSchedule);
  }

  async create(dto: CreateTourDto, userId: string) {
    const categoryId = await this.repo.tourCategoryId();
    if (!categoryId) {
      throw new BadRequestException('Danh mục "tour" chưa được khởi tạo');
    }
    const placeDto: CreatePlaceDto = {
      name: dto.name,
      category_id: categoryId,
      location: dto.location,
      short_description: dto.short_description,
      description: dto.description,
    } as CreatePlaceDto;
    const place = await this.placesService.create(placeDto, userId);
    await this.repo.createDetails(place.id as string, {
      tourType: dto.tour_type,
      durationMinutes: dto.duration_minutes ?? null,
      difficulty: dto.difficulty ?? null,
    });
    return { ...place, tour_details: await this.repo.detail(place.id as string) };
  }

  // Đặc quyền (Place.Edit.Managed). Xem ToursRepository.updateDetails's ghi chú.
  async updateDetails(placeId: string, dto: UpdateTourDetailsDto, userId: string) {
    await this.repo.updateDetails(placeId, dto);
    await this.recordWriteAndInvalidate('place.tour_details_updated', placeId, userId, {
      tour_type_changed: dto.tour_type !== undefined,
      duration_minutes_changed: dto.duration_minutes !== undefined,
      difficulty_changed: dto.difficulty !== undefined,
      organizer_id_changed: dto.organizer_id !== undefined,
      pickup_point_changed: dto.pickup_point !== undefined,
      inclusions_changed: dto.inclusions !== undefined,
      exclusions_changed: dto.exclusions !== undefined,
      cancellation_policy_changed: dto.cancellation_policy !== undefined,
    });
    return this.repo.detail(placeId);
  }

  // Đặc quyền (Place.Edit.Managed). Thay TOÀN BỘ itinerary — cùng khuôn updateRooms/updateMenu.
  async updateItinerary(placeId: string, dto: UpdateTourStopsDto, userId: string) {
    await this.repo.replaceStops(placeId, dto.stops);
    await this.recordWriteAndInvalidate('place.tour_itinerary_replaced', placeId, userId, { stop_count: dto.stops.length });
    return this.getItinerary(placeId);
  }
}
