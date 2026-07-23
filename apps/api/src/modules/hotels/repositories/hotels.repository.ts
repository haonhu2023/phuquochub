import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface RoomInput {
  name: string;
  capacity?: number | null;
  price_ref?: number | null;
  currency?: string;
  valid_from?: string | null;
  valid_to?: string | null;
  sort_order?: number;
}

// Repository Hotel (satellite của places) — raw SQL tham số hóa (geo/extension tập trung).
@Injectable()
export class HotelsRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  listHotels(limit: number, offset: number) {
    return this.ds.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.rating_avg, p.rating_count,
              hd.star_rating, hd.hotel_type,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM places p JOIN place_hotel_details hd ON hd.place_id = p.id
       WHERE p.deleted_at IS NULL AND p.status = 'published'
       ORDER BY p.rating_avg DESC NULLS LAST, p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
  }

  countHotels(): Promise<number> {
    return this.ds
      .query(
        `SELECT count(*)::int AS c FROM places p JOIN place_hotel_details hd ON hd.place_id = p.id
         WHERE p.deleted_at IS NULL AND p.status = 'published'`,
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
