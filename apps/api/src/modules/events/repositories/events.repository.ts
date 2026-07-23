import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const COLS = `id, title, slug, description, cover_media_id, start_at, end_at, timezone,
  place_id, organizer_id, event_category, status, status_override, recurrence_rule, created_at`;

export interface CreateEventRow {
  title: string;
  slug: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  timezone?: string;
  placeId?: string | null;
  organizerId?: string | null;
  eventCategory?: string | null;
  recurrenceRule?: string | null;
  createdBy: string;
}

@Injectable()
export class EventsRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  listEvents(limit: number, offset: number) {
    return this.ds.query(
      `SELECT ${COLS} FROM events WHERE deleted_at IS NULL AND status = 'published'
       ORDER BY start_at ASC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
  }

  count(): Promise<number> {
    return this.ds
      .query(`SELECT count(*)::int AS c FROM events WHERE deleted_at IS NULL AND status = 'published'`)
      .then((r) => Number(r[0]?.c ?? 0));
  }

  async getBySlug(slug: string) {
    const rows = await this.ds.query(
      `SELECT ${COLS} FROM events WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`,
      [slug],
    );
    return rows[0] ?? null;
  }

  /** Sự kiện chồng lấn cửa sổ [from, to). */
  calendar(from: string, to: string) {
    return this.ds.query(
      `SELECT ${COLS} FROM events
       WHERE deleted_at IS NULL AND status = 'published' AND start_at < $2 AND end_at > $1
       ORDER BY start_at ASC`,
      [from, to],
    );
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const rows = await this.ds.query(`SELECT 1 FROM events WHERE slug = $1 LIMIT 1`, [slug]);
    return rows.length > 0;
  }

  async create(input: CreateEventRow): Promise<string> {
    const rows = await this.ds.query(
      `INSERT INTO events
         (title, slug, description, start_at, end_at, timezone, place_id, organizer_id,
          event_category, recurrence_rule, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)
       RETURNING id`,
      [
        input.title,
        input.slug,
        input.description ?? null,
        input.startAt,
        input.endAt,
        input.timezone ?? 'Asia/Ho_Chi_Minh',
        input.placeId ?? null,
        input.organizerId ?? null,
        input.eventCategory ?? null,
        input.recurrenceRule ?? null,
        input.createdBy,
      ],
    );
    return rows[0].id;
  }
}
