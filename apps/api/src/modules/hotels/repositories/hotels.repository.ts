import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HotelSort } from '../dto/hotels.dto';

export interface RoomInput {
  name: string;
  capacity?: number | null;
  price_ref?: number | null;
  currency?: string;
  valid_from?: string | null;
  valid_to?: string | null;
  sort_order?: number;
}

export interface HotelListFilters {
  stars?: number;
  sort?: HotelSort;
}

// Sắp xếp cố định phía server (cùng chủ trương với PlacesRepository.list — client không tự ý
// điều khiển ORDER BY bằng chuỗi tự do). `p.id ASC` là khoá phụ chốt cuối cho cả hai nhánh: mọi
// hotel cùng rating_avg (rất phổ biến — nhiều NULL) hoặc cùng name sẽ được LIMIT/OFFSET cắt xác
// định, tránh lớp lỗi GAP-12 (PLACE-007) mà bản gốc endpoint này chưa có.
const HOTEL_ORDER_BY: Record<HotelSort, string> = {
  rating_desc: 'p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC',
  name_asc: 'p.name ASC, p.id ASC',
};

function hotelWhere(filters: HotelListFilters, args: unknown[]): string {
  const conds = [`p.deleted_at IS NULL`, `p.status = 'published'`];
  if (filters.stars) {
    args.push(filters.stars);
    conds.push(`hd.star_rating = $${args.length}`);
  }
  return conds.join(' AND ');
}

// Repository Hotel (satellite của places) — raw SQL tham số hóa (geo/extension tập trung).
@Injectable()
export class HotelsRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  listHotels(limit: number, offset: number, filters: HotelListFilters = {}) {
    const args: unknown[] = [];
    const where = hotelWhere(filters, args);
    const orderBy = HOTEL_ORDER_BY[filters.sort ?? 'rating_desc'];
    const limitIdx = args.length + 1;
    const offsetIdx = args.length + 2;
    return this.ds.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.rating_avg, p.rating_count,
              (SELECT m.url FROM media m WHERE m.id = p.cover_image_id AND m.deleted_at IS NULL AND m.status = 'published') AS cover_image_url,
              hd.star_rating, hd.hotel_type,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM places p JOIN place_hotel_details hd ON hd.place_id = p.id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...args, limit, offset],
    );
  }

  countHotels(filters: HotelListFilters = {}): Promise<number> {
    const args: unknown[] = [];
    const where = hotelWhere(filters, args);
    return this.ds
      .query(
        `SELECT count(*)::int AS c FROM places p JOIN place_hotel_details hd ON hd.place_id = p.id
         WHERE ${where}`,
        args,
      )
      .then((r) => Number(r[0]?.c ?? 0));
  }

  async detail(placeId: string) {
    const rows = await this.ds.query(
      `SELECT star_rating, hotel_type, check_in, check_out FROM place_hotel_details WHERE place_id = $1`,
      [placeId],
    );
    return rows[0] ?? null;
  }

  listRooms(placeId: string) {
    return this.ds.query(
      `SELECT id, name, capacity, price_ref, currency, valid_from, valid_to, sort_order
       FROM hotel_room_types WHERE place_id = $1 ORDER BY sort_order ASC`,
      [placeId],
    );
  }

  listAmenities(placeId: string) {
    return this.ds.query(
      `SELECT a.id, a.code, a.label_vi, a.label_en, a.icon, a."group"
       FROM place_amenities pa JOIN amenities a ON a.id = pa.amenity_id
       WHERE pa.place_id = $1 ORDER BY a."group", a.code`,
      [placeId],
    );
  }

  /** Thay toàn bộ room types của một place (transaction). */
  async replaceRooms(placeId: string, rooms: RoomInput[]): Promise<void> {
    await this.ds.transaction(async (m) => {
      await m.query(`DELETE FROM hotel_room_types WHERE place_id = $1`, [placeId]);
      for (const [i, r] of rooms.entries()) {
        await m.query(
          `INSERT INTO hotel_room_types
             (place_id, name, capacity, price_ref, currency, valid_from, valid_to, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            placeId,
            r.name,
            r.capacity ?? null,
            r.price_ref ?? null,
            r.currency ?? 'VND',
            r.valid_from ?? null,
            r.valid_to ?? null,
            r.sort_order ?? i,
          ],
        );
      }
    });
  }
}
