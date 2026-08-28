import { Injectable } from '@nestjs/common';
import { PlacesService } from '../places/places.service';
import { HotelsRepository } from './repositories/hotels.repository';
import { ListHotelsQueryDto, UpdateHotelRoomsDto } from './dto/hotels.dto';
import { paginate, clampLimit, clampPage } from '../../common/pagination';

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
  ) {}

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

  async getBySlug(slug: string) {
    // `place` đã được PlacesService.getBySlug() redact price_range/prices[].amount theo đúng
    // trust — không cần lặp lại logic ở đây (cascade từ một điểm sửa duy nhất). Rooms là public
    // (không route riêng, ghép thẳng vào chi tiết công khai) → publicResponse=true.
    const place = await this.placesService.getBySlug(slug);
    const [hotelDetails, rooms, amenities] = await Promise.all([
      this.repo.detail(place.id),
      this.repo.listRooms(place.id),
      this.repo.listAmenities(place.id),
    ]);
    return {
      ...place,
      hotel_details: hotelDetails,
      rooms: rooms.map((r: RoomRow) => mapRoom(r, true)),
      amenities,
    };
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
