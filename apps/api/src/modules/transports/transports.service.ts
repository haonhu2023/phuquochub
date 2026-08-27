import { Injectable, NotFoundException } from '@nestjs/common';
import { PlacesService } from '../places/places.service';
import { TransportsRepository } from './repositories/transports.repository';
import { ListTransportsQueryDto } from './dto/transports.dto';
import { paginate, clampLimit, clampPage } from '../../common/pagination';

function mapTransportType(r: Record<string, unknown>) {
  return {
    code: r.transport_type_code,
    label_vi: r.transport_type_label_vi,
    label_en: r.transport_type_label_en ?? null,
  };
}

// Public Beta price trust gate — Transport (2026-08-28): `place_transport_details.price_ref` and
// `transport_service_options.price_ref` carry NO verification/trust column at the DB level
// (migration InitTransport1720002300000 never added one, and none since) — same class of gap
// already closed UI-side for restaurant menu items / tour schedules / hotel rooms, but this is the
// runtime RESPONSE boundary for a fully `@Public()` REST API (list + detail), so redaction has to
// happen here, not in a web component that doesn't exist for this domain yet. Fail-closed:
// `price_ref` is ALWAYS `null` in every public response — never read from the row, never derived
// from `places.verification_status` (that would be a false proxy: a verified transport listing
// doesn't mean its price was individually checked). `model`/`currency`/`unit` describe the pricing
// STRUCTURE, not an amount, so they stay — only the numeric value is redacted. `price_ref` was
// already `number | null` in the response contract, so returning `null` unconditionally is not a
// breaking shape change for any consumer.
function mapPricing(r: Record<string, unknown>) {
  return {
    model: r.pricing_model ?? null,
    price_ref: null,
    currency: r.price_currency,
    unit: r.price_unit ?? null,
  };
}

function mapServiceOption(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    capacity_passengers: r.capacity_passengers,
    // Public Beta price trust gate (2026-08-28) — see mapPricing() above; same fail-closed policy.
    price_ref: null,
    price_currency: r.price_currency,
    price_unit: r.price_unit ?? null,
    valid_from: r.valid_from,
    valid_to: r.valid_to,
    sort_order: r.sort_order,
  };
}

function mapRoute(r: Record<string, unknown>) {
  const originLat = r.origin_lat as number | null;
  const originLng = r.origin_lng as number | null;
  const destLat = r.destination_lat as number | null;
  const destLng = r.destination_lng as number | null;
  return {
    id: r.id,
    origin_label: r.origin_label,
    origin_location: originLat !== null && originLng !== null ? { lat: Number(originLat), lng: Number(originLng) } : null,
    destination_label: r.destination_label,
    destination_location: destLat !== null && destLng !== null ? { lat: Number(destLat), lng: Number(destLng) } : null,
    note: r.note ?? null,
    sort_order: r.sort_order,
  };
}

/**
 * Transport = Place (category='transport') + satellite `place_transport_details` (ADR-017).
 * Nhiệm vụ nền tảng: chỉ đọc (list/detail/type-lookup). Mọi thao tác ghi vẫn đi qua
 * PlacesService — repository/service này không có phương thức create/update.
 */
@Injectable()
export class TransportsService {
  constructor(
    private readonly placesService: PlacesService,
    private readonly repo: TransportsRepository,
  ) {}

  async list(query: ListTransportsQueryDto = {}) {
    const p = clampPage(query.page);
    const l = clampLimit(query.limit);
    const sort = query.sort ?? 'rating_desc';
    // Transport Browse Filters (2026-07-30) — cùng cách Search Filters truyền filters dạng
    // object rời để không phá signature (limit, offset, sort) hiện có.
    const filters = {
      transportType: query.transport_type,
      ward: query.ward,
      pricingModel: query.pricing_model,
      bookingRequired: query.booking_required,
      airportTransfer: query.airport_transfer,
    };
    const [rows, total] = await Promise.all([
      this.repo.listTransports(l, (p - 1) * l, sort, filters),
      this.repo.countTransports(filters),
    ]);
    const items = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      short_description: r.short_description,
      cover_image_url: r.cover_image_url,
      ward: r.ward,
      rating_avg: r.rating_avg !== null ? Number(r.rating_avg) : null,
      rating_count: r.rating_count,
      verification_status: r.verification_status,
      transport_type: mapTransportType(r),
      pricing: mapPricing(r),
      capacity_passengers: r.capacity_passengers,
      booking_required: r.booking_required,
      airport_transfer: r.airport_transfer,
      location: { lat: Number(r.lat), lng: Number(r.lng) },
    }));
    return paginate(items, p, l, total);
  }

  async getBySlug(slug: string) {
    const place = await this.placesService.getBySlug(slug);
    const [detail, serviceOptions, routes, serviceAreas] = await Promise.all([
      this.repo.detail(place.id),
      this.repo.listServiceOptions(place.id),
      this.repo.listRoutes(place.id),
      this.repo.listServiceAreas(place.id),
    ]);
    if (!detail) {
      // Place thuộc category='transport' nhưng thiếu hàng vệ tinh — toàn vẹn dữ liệu bị lệch
      // (không nên xảy ra qua đường ghi hợp lệ), xử lý như "không tìm thấy" thay vì trả record hỏng.
      throw new NotFoundException('Không tìm thấy dịch vụ vận chuyển');
    }
    return {
      ...place,
      transport_details: {
        transport_type: mapTransportType(detail),
        provider_business_id: detail.provider_business_id ?? null,
        pricing: mapPricing(detail),
        capacity_passengers: detail.capacity_passengers,
        booking_required: detail.booking_required,
        airport_transfer: detail.airport_transfer,
        booking_note: detail.booking_note ?? null,
      },
      service_options: serviceOptions.map(mapServiceOption),
      routes: routes.map(mapRoute),
      service_areas: serviceAreas.map((a: { ward: string }) => a.ward),
    };
  }

  /** Đường đọc nội bộ (chưa lộ qua controller nào) — cho consumer tương lai đã có sẵn place_id. */
  async findByPlaceId(placeId: string) {
    const detail = await this.repo.detail(placeId);
    if (!detail) {
      throw new NotFoundException('Không tìm thấy dịch vụ vận chuyển');
    }
    return {
      transport_type: mapTransportType(detail),
      provider_business_id: detail.provider_business_id ?? null,
      pricing: mapPricing(detail),
      capacity_passengers: detail.capacity_passengers,
      booking_required: detail.booking_required,
      airport_transfer: detail.airport_transfer,
      booking_note: detail.booking_note ?? null,
    };
  }

  async listTypes() {
    const rows = await this.repo.listTypes();
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      code: r.code,
      label_vi: r.label_vi,
      label_en: r.label_en ?? null,
      icon: r.icon ?? null,
      parent_id: r.parent_id ?? null,
      sort_order: r.sort_order,
    }));
  }
}
