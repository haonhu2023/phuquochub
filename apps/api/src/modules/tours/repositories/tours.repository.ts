import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PriceRange } from '../../places/place.enums';
import { TourDifficultyDto, TourSort, TourTypeDto } from '../dto/tours.dto';

export interface TourListFilters {
  type?: TourTypeDto;
  difficulty?: TourDifficultyDto;
  priceRange?: PriceRange;
  maxDurationMinutes?: number;
  departureArea?: string;
  sort?: TourSort;
}

// Cùng chủ trương PlacesRepository.list/HotelsRepository.listHotels/RestaurantsRepository —
// ORDER BY cố định phía server (client không truyền tên cột), `p.id ASC` là khoá phụ chốt cuối
// cho MỌI nhánh (lớp lỗi GAP-12: nhiều tour hoà rating_avg/name/duration sẽ bị LIMIT/OFFSET cắt
// không xác định). `duration_minutes` nullable ⇒ NULLS LAST để tour chưa khai thời lượng luôn
// nằm cuối thay vì đứng đầu (mặc định ASC của Postgres).
const TOUR_ORDER_BY: Record<TourSort, string> = {
  rating_desc: 'p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC',
  name_asc: 'p.name ASC, p.id ASC',
  duration_asc: 'td.duration_minutes ASC NULLS LAST, p.id ASC',
};

function tourWhere(filters: TourListFilters, args: unknown[]): string {
  const conds = [`p.deleted_at IS NULL`, `p.status = 'published'`];
  if (filters.type) {
    args.push(filters.type);
    conds.push(`td.tour_type = $${args.length}`);
  }
  if (filters.difficulty) {
    args.push(filters.difficulty);
    conds.push(`td.difficulty = $${args.length}`);
  }
  if (filters.priceRange) {
    args.push(filters.priceRange);
    conds.push(`p.price_range = $${args.length}`);
  }
  if (filters.maxDurationMinutes) {
    args.push(filters.maxDurationMinutes);
    // `duration_minutes` nullable: tour chưa khai thời lượng KHÔNG được coi là "đủ ngắn".
    conds.push(`td.duration_minutes IS NOT NULL AND td.duration_minutes <= $${args.length}`);
  }
  if (filters.departureArea) {
    args.push(filters.departureArea);
    conds.push(`p.ward = $${args.length}`);
  }
  return conds.join(' AND ');
}

@Injectable()
export class ToursRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async tourCategoryId(): Promise<string | null> {
    const rows = await this.ds.query(`SELECT id FROM categories WHERE slug = 'tour' LIMIT 1`);
    return rows[0]?.id ?? null;
  }

  listTours(limit: number, offset: number, filters: TourListFilters = {}) {
    const args: unknown[] = [];
    const where = tourWhere(filters, args);
    const orderBy = TOUR_ORDER_BY[filters.sort ?? 'rating_desc'];
    const limitIdx = args.length + 1;
    const offsetIdx = args.length + 2;
    // Một correlated subquery cho ảnh bìa — KHÔNG phải N+1 (không có query riêng theo từng hàng ở
    // tầng application; toàn bộ chạy trong một round-trip SQL).
    return this.ds.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.rating_avg, p.rating_count,
              p.price_range, p.ward,
              (SELECT m.url FROM media m WHERE m.id = p.cover_image_id AND m.deleted_at IS NULL AND m.status = 'published') AS cover_image_url,
              td.tour_type, td.duration_minutes, td.difficulty,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM places p JOIN place_tour_details td ON td.place_id = p.id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...args, limit, offset],
    );
  }

  countTours(filters: TourListFilters = {}): Promise<number> {
    const args: unknown[] = [];
    const where = tourWhere(filters, args);
    return this.ds
      .query(
        `SELECT count(*)::int AS c FROM places p JOIN place_tour_details td ON td.place_id = p.id
         WHERE ${where}`,
        args,
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
