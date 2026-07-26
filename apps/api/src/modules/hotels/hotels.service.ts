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

function mapRoom(r: RoomRow) {
  return {
    id: r.id,
    name: r.name,
    capacity: r.capacity,
    price_ref: r.price_ref !== null ? Number(r.price_ref) : null,
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
    const place = await this.placesService.getBySlug(slug);
    const [hotelDetails, rooms, amenities] = await Promise.all([
      this.repo.detail(place.id),
      this.repo.listRooms(place.id),
      this.repo.listAmenities(place.id),
    ]);
    return { ...place, hotel_details: hotelDetails, rooms: rooms.map(mapRoom), amenities };
  }

  async listRooms(placeId: string) {
    return (await this.repo.listRooms(placeId)).map(mapRoom);
  }

  listAmenities(placeId: string) {
    return this.repo.listAmenities(placeId);
  }

  async updateRooms(placeId: string, dto: UpdateHotelRoomsDto) {
    await this.repo.replaceRooms(placeId, dto.rooms);
    return this.listRooms(placeId);
  }
}
