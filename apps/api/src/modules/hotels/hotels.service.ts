import { ConflictException, Injectable } from '@nestjs/common';
import { PlacesService } from '../places/places.service';
import { PlaceStatus } from '../places/place.enums';
import { HotelsRepository } from './repositories/hotels.repository';
import { ListHotelsQueryDto, UpdateHotelDetailsDto, UpdateHotelRoomsDto } from './dto/hotels.dto';
import { paginate, clampLimit, clampPage } from '../../common/pagination';
import { AuditService } from '../../core/audit/audit.service';
import { CacheInvalidationService } from '../../core/cache-invalidation/cache-invalidation.service';

interface HotelDetailsRow {
  star_rating: number | null;
  hotel_type: string;
  check_in: string | null;
  check_out: string | null;
  star_rating_source_id: string | null;
  star_rating_verified_at: Date | null;
  star_rating_source_title: string | null;
  star_rating_source_url: string | null;
}

// "Hạng sao có nguồn" hiển thị dưới dạng object rời (title/url) thay vì id trần — client không
// cần gọi thêm API nào để biết nguồn là gì.
function mapHotelDetails(row: HotelDetailsRow | null) {
  if (!row) return null;
  return {
    star_rating: row.star_rating,
    hotel_type: row.hotel_type,
    check_in: row.check_in,
    check_out: row.check_out,
    star_rating_source:
      row.star_rating_source_id != null
        ? { title: row.star_rating_source_title, url: row.star_rating_source_url, verified_at: row.star_rating_verified_at }
        : null,
  };
}

interface RoomRow {
  id: string;
  name: string;
  capacity: number | null;
  price_ref: string | null;
  currency: string;
  valid_from: Date | null;
  valid_to: Date | null;
  sort_order: number;
}

// Public Beta price trust gate (2026-08-28): `hotel_room_types.price_ref` KHÔNG có cột
// verification/trust nào ở DB (migration InitHotel) — không có bằng chứng theo TỪNG loại phòng
// để gate. Fail-closed: `publicResponse: true` (route @Public() GET :id/rooms + getBySlug) luôn
// null hoá `price_ref`; `publicResponse: false` (mặc định — dùng bởi `updateRooms()`, đặc quyền)
// giữ giá trị thật để actor thấy đúng giá họ vừa lưu. KHÔNG dùng place.verification_status làm
// proxy: khách sạn đã xác minh không có nghĩa từng mức giá phòng đã được đối chiếu.
function mapRoom(r: RoomRow, publicResponse: boolean) {
  return {
    id: r.id,
    name: r.name,
    capacity: r.capacity,
    price_ref: publicResponse ? null : r.price_ref !== null ? Number(r.price_ref) : null,
    currency: r.currency,
    valid_from: r.valid_from,
    valid_to: r.valid_to,
    sort_order: r.sort_order,
  };
}

// Hotel = Place (category='hotel') + satellite (ADR-002). getBySlug tái dùng PlacesService để
// ghép base detail (contacts/prices/media/faqs) rồi bổ sung hotel_details/rooms/amenities.
@Injectable()
export class HotelsService {
  constructor(
    private readonly placesService: PlacesService,
    private readonly repo: HotelsRepository,
    private readonly audit: AuditService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  /**
   * Sau khi ghi thành công category-specific detail: audit `place.<event>` (ADR-016 — hành động
   * sửa nội dung đặc quyền, cùng chủ trương PlacesService.archive/approve's record()) + invalidate
   * cache place (chỉ khi đã published — bản draft chưa từng được cache). KHÔNG await
   * invalidatePlace: một lần revalidate lỗi không được biến một ghi đã thành công thành lỗi 5xx,
   * cùng lý do PlacesService.update()'s comment.
   */
  private async recordWriteAndInvalidate(event: string, placeId: string, userId: string, context: Record<string, unknown>) {
    await this.audit.record({ event, entityType: 'place', entityId: placeId, actorId: userId, permission: 'Place.Edit.Managed', context });
    const place = await this.placesService.getSlugAndStatus(placeId);
    if (place?.status === PlaceStatus.PUBLISHED) {
      void this.cacheInvalidation.invalidatePlace(place.slug);
    }
  }

  async list(query: ListHotelsQueryDto = {}) {
    const p = clampPage(query.page);
    const l = clampLimit(query.limit);
    const filters = { stars: query.stars, sort: query.sort };
    const [rows, total] = await Promise.all([
      this.repo.listHotels(l, (p - 1) * l, filters),
      this.repo.countHotels(filters),
    ]);
    const items = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      short_description: r.short_description,
      cover_image_url: r.cover_image_url,
      rating_avg: r.rating_avg !== null ? Number(r.rating_avg) : null,
      rating_count: r.rating_count,
      star_rating: r.star_rating,
      hotel_type: r.hotel_type,
      location: { lat: Number(r.lat), lng: Number(r.lng) },
    }));
    return paginate(items, p, l, total);
  }

  // Locale forwarding (2026-09): trước đây KHÔNG nhận/forward `locale`, nên `PlacesService.getBySlug()`
  // luôn thấy `undefined` và trả về bản dịch mặc định bất kể route/client yêu cầu gì —
  // `GET /hotels/:slug?locale=en` bị bỏ qua hoàn toàn. Sửa bằng cách forward NGUYÊN VẸN xuống
  // `PlacesService.getBySlug(slug, locale)` — ĐÚNG seam `PlacesController`/`GET /places/:slug` đã
  // dùng, không tự viết validation/default/fallback riêng: `LocalesService.resolveRequestLocale()`
  // (gọi bên trong `PlacesService.getBySlug()`) đã xử lý cả hai việc đó cho MỌI field/place, dùng
  // lại nguyên, không nhân đôi logic. `locale` optional, không đổi hành vi cho lời gọi không truyền.
  async getBySlug(slug: string, locale?: string) {
    // `place` đã được PlacesService.getBySlug() redact price_range/prices[].amount theo đúng
    // trust — không cần lặp lại logic ở đây (cascade từ một điểm sửa duy nhất). Rooms là public
    // (không route riêng, ghép thẳng vào chi tiết công khai) → publicResponse=true.
    const place = await this.placesService.getBySlug(slug, locale);
    const [hotelDetails, rooms, amenities] = await Promise.all([
      this.repo.detail(place.id),
      this.repo.listRooms(place.id),
      this.repo.listAmenities(place.id),
    ]);
    return {
      ...place,
      hotel_details: mapHotelDetails(hotelDetails),
      rooms: rooms.map((r: RoomRow) => mapRoom(r, true)),
      amenities,
    };
  }

  // Đặc quyền (Place.Edit.Managed) — đọc hotel_details bất kể place đang draft/pending/published.
  // `GET /hotels/:slug` (@Public) chỉ trả place ĐÃ published (PlacesService.getBySlug lọc status),
  // nên form sửa một hotel CHƯA xuất bản không có cách nào tải lại giá trị hiện tại nếu thiếu route
  // này — đây KHÔNG phải chỉ "thiếu wiring", mà là một khoảng trống đọc thật sự.
  //
  // `content_version` (2026-09-30) — token CAS mà client PHẢI đọc TRƯỚC KHI sửa, gửi lại nguyên
  // vẹn qua `expected_content_version` ở PATCH. Đọc từ `places` (PlacesService.getSlugAndStatus),
  // KHÔNG phải từ place_hotel_details — token này thuộc về place, không phải satellite table, và
  // PHẢI có mặt ngay cả khi place_hotel_details chưa từng tồn tại (hotel vừa tạo).
  async getDetails(placeId: string) {
    const [details, place] = await Promise.all([this.repo.detail(placeId), this.placesService.getSlugAndStatus(placeId)]);
    return { ...mapHotelDetails(details), content_version: place?.content_version ?? null };
  }

  // Đặc quyền (Place.Edit.Managed). UPSERT thật (xem ghi chú UpdateHotelDetailsDto/
  // HotelsRepository.upsertDetails) — hàng place_hotel_details có thể chưa tồn tại với một hotel
  // vừa tạo, PATCH đầu tiên chính là lúc nó được sinh ra.
  //
  // CAS (2026-09-30): `dto.expected_content_version` phải khớp `places.content_version` HIỆN TẠI
  // (kiểm + tăng trong CÙNG transaction ở repository) — không khớp → 409, KHÔNG ghi gì, KHÔNG audit,
  // KHÔNG invalidate cache. Đây là điểm khác iệt với "SELECT ... FOR UPDATE" trước đây (chỉ chặn
  // race đồng thời, không chặn ghi đè từ một request đọc dữ liệu đã cũ).
  async updateDetails(placeId: string, dto: UpdateHotelDetailsDto, userId: string) {
    const result = await this.repo.upsertDetails(placeId, dto, dto.expected_content_version);
    if (result.conflict) {
      throw new ConflictException(
        `Địa điểm vừa được người khác sửa (mong đợi content_version=${dto.expected_content_version}) — tải lại và thử lại.`,
      );
    }
    await this.recordWriteAndInvalidate('place.hotel_details_updated', placeId, userId, {
      hotel_type: dto.hotel_type,
      star_rating_changed: dto.star_rating !== undefined,
      star_rating_source_changed: dto.star_rating_source_id !== undefined,
      check_in_changed: dto.check_in !== undefined,
      check_out_changed: dto.check_out !== undefined,
    });
    const details = await this.repo.detail(placeId);
    return { ...mapHotelDetails(details), content_version: result.newVersion };
  }

  async listRooms(placeId: string, opts: { publicResponse?: boolean } = {}) {
    const publicResponse = opts.publicResponse ?? false;
    return (await this.repo.listRooms(placeId)).map((r: RoomRow) => mapRoom(r, publicResponse));
  }

  listAmenities(placeId: string) {
    return this.repo.listAmenities(placeId);
  }

  // Đặc quyền (Place.Edit.Managed) — actor phải thấy đúng giá họ vừa lưu, KHÔNG redact
  // (publicResponse mặc định false).
  async updateRooms(placeId: string, dto: UpdateHotelRoomsDto) {
    await this.repo.replaceRooms(placeId, dto.rooms);
    return this.listRooms(placeId);
  }
}
