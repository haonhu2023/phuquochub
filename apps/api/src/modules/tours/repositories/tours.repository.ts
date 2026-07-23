import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ToursRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async tourCategoryId(): Promise<string | null> {
    const rows = await this.ds.query(`SELECT id FROM categories WHERE slug = 'tour' LIMIT 1`);
    return rows[0]?.id ?? null;
  }

  listTours(limit: number, offset: number) {
    return this.ds.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.rating_avg, p.rating_count,
              td.tour_type, td.duration_minutes, td.difficulty,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM places p JOIN place_tour_details td ON td.place_id = p.id
       WHERE p.deleted_at IS NULL AND p.status = 'published'
       ORDER BY p.rating_avg DESC NULLS LAST, p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
  }

  countTours(): Promise<number> {
    return this.ds
      .query(
        `SELECT count(*)::int AS c FROM places p JOIN place_tour_details td ON td.place_id = p.id
         WHERE p.deleted_at IS NULL AND p.status = 'published'`,
      )
      .then((r) => Number(r[0]?.c ?? 0));
  }

  async detail(placeId: string) {
    const rows = await this.ds.query(
      `SELECT tour_type, duration_minutes, difficulty, organizer_id
       FROM place_tour_details WHERE place_id = $1`,
      [placeId],
    );
    return rows[0] ?? null;
  }

  stops(placeId: string) {
    return this.ds.query(
      `SELECT id, name, sort_order, "time", note,
              CASE WHEN location IS NULL THEN NULL ELSE ST_Y(location::geometry) END AS lat,
              CASE WHEN location IS NULL THEN NULL ELSE ST_X(location::geometry) END AS lng
       FROM tour_stops WHERE place_id = $1 ORDER BY sort_order ASC`,
      [placeId],
    );
  }

  schedules(placeId: string) {
    return this.ds.query(
      `SELECT id, "date", capacity, price, currency, valid_from, valid_to
       FROM tour_schedules WHERE place_id = $1 ORDER BY "date" ASC`,
      [placeId],
    );
  }

  async createDetails(placeId: string, d: {
    tourType: string;
    durationMinutes?: number | null;
    difficulty?: string | null;
  }): Promise<void> {
    await this.ds.query(
      `INSERT INTO place_tour_details (place_id, tour_type, duration_minutes, difficulty)
       VALUES ($1,$2,$3,$4)`,
      [placeId, d.tourType, d.durationMinutes ?? null, d.difficulty ?? null],
    );
  }
}
