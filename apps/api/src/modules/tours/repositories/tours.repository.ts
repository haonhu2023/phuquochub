import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PriceRange } from '../../places/place.enums';
import { TourDifficultyDto, TourSort, TourTypeDto } from '../dto/tours.dto';
import { MediaUrlService } from '../../../core/media-url/media-url.service';
import { COVER_IMAGE_COLS, CoverImageColumns, withCoverImageUrl } from '../../../core/media-url/cover-image';

/** Row thô của truy vấn card — chỉ ghim phần ảnh bìa; các cột khác vẫn được service tự đọc. */
type CardRow = Record<string, unknown> & CoverImageColumns;

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
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly mediaUrl: MediaUrlService,
  ) {}

  async tourCategoryId(): Promise<string | null> {
    const rows = await this.ds.query(`SELECT id FROM categories WHERE slug = 'tour' LIMIT 1`);
    return rows[0]?.id ?? null;
  }

  async listTours(limit: number, offset: number, filters: TourListFilters = {}): Promise<CardRow[]> {
    const args: unknown[] = [];
    const where = tourWhere(filters, args);
    const orderBy = TOUR_ORDER_BY[filters.sort ?? 'rating_desc'];
    const limitIdx = args.length + 1;
    const offsetIdx = args.length + 2;
    // Correlated subquery cho ảnh bìa — KHÔNG phải N+1 (không có query riêng theo từng hàng ở tầng
    // application; toàn bộ chạy trong một round-trip SQL). `withCoverImageUrl` chỉ dựng URL từ dữ
    // liệu ĐÃ có trong row, cũng không truy vấn thêm.
    const rows: CardRow[] = await this.ds.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.rating_avg, p.rating_count,
              p.price_range, p.ward, p.verification_status,
              ${COVER_IMAGE_COLS},
              td.tour_type, td.duration_minutes, td.difficulty,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM places p JOIN place_tour_details td ON td.place_id = p.id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...args, limit, offset],
    );
    return withCoverImageUrl(rows, this.mediaUrl);
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
      `SELECT td.tour_type, td.duration_minutes, td.difficulty, td.organizer_id,
              td.pickup_point, td.inclusions, td.exclusions, td.cancellation_policy,
              op.name AS organizer_name, op.slug AS organizer_slug
       FROM place_tour_details td
       LEFT JOIN places op ON op.id = td.organizer_id
       WHERE td.place_id = $1`,
      [placeId],
    );
    return rows[0] ?? null;
  }

  /**
   * UPDATE place_tour_details — hàng LUÔN tồn tại từ lúc tạo (createDetails, khác hotel/
   * restaurant/beach) nên đây là UPDATE thẳng, không cần UPSERT. PATCH TỪNG PHẦN thật:
   * `dto.<field> !== undefined` phân biệt "không gửi" (giữ nguyên) với "gửi null" (xoá) với "gửi
   * giá trị" — chỉ cột THỰC SỰ có mặt trong DTO mới vào SET clause. Bug đã sửa (2026-09-30): bản
   * cũ dùng COALESCE trên tham số đã `?? null` hoá — omit và "gửi null để xoá" cùng thành NULL,
   * không thể xoá organizer_id/pickup_point/... một khi đã set. `SELECT ... FOR UPDATE` khoá hàng
   * cho suốt lệnh, cùng khuôn Hotels/Restaurants/BeachesRepository.
   */
  async updateDetails(
    placeId: string,
    dto: {
      tour_type?: string;
      duration_minutes?: number | null;
      difficulty?: string | null;
      organizer_id?: string | null;
      pickup_point?: string | null;
      inclusions?: string | null;
      exclusions?: string | null;
      cancellation_policy?: string | null;
    },
  ): Promise<void> {
    await this.ds.transaction(async (m) => {
      await m.query(`SELECT 1 FROM place_tour_details WHERE place_id = $1 FOR UPDATE`, [placeId]);

      const patch: Record<string, unknown> = {};
      if (dto.tour_type !== undefined) patch.tour_type = dto.tour_type;
      if (dto.duration_minutes !== undefined) patch.duration_minutes = dto.duration_minutes;
      if (dto.difficulty !== undefined) patch.difficulty = dto.difficulty;
      if (dto.organizer_id !== undefined) patch.organizer_id = dto.organizer_id;
      if (dto.pickup_point !== undefined) patch.pickup_point = dto.pickup_point;
      if (dto.inclusions !== undefined) patch.inclusions = dto.inclusions;
      if (dto.exclusions !== undefined) patch.exclusions = dto.exclusions;
      if (dto.cancellation_policy !== undefined) patch.cancellation_policy = dto.cancellation_policy;

      if (Object.keys(patch).length === 0) return;
      const setClauses = Object.keys(patch)
        .map((k, i) => `"${k}" = $${i + 2}`)
        .join(', ');
      await m.query(`UPDATE place_tour_details SET ${setClauses} WHERE place_id = $1`, [
        placeId,
        ...Object.values(patch),
      ]);
    });
  }

  /** Thay TOÀN BỘ tour_stops — cùng khuôn HotelsRepository.replaceRooms. Đường ghi ĐẦU TIÊN cho bảng này. */
  async replaceStops(
    placeId: string,
    stops: Array<{ name: string; time?: string | null; note?: string | null; location?: { lat: number; lng: number } | null; sort_order?: number }>,
  ): Promise<void> {
    await this.ds.transaction(async (m) => {
      await m.query(`DELETE FROM tour_stops WHERE place_id = $1`, [placeId]);
      for (const [i, s] of stops.entries()) {
        await m.query(
          `INSERT INTO tour_stops (place_id, name, location, sort_order, "time", note)
           VALUES ($1, $2, CASE WHEN $3::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($3,$4),4326)::geography END, $5, $6, $7)`,
          [placeId, s.name, s.location?.lng ?? null, s.location?.lat ?? null, s.sort_order ?? i, s.time ?? null, s.note ?? null],
        );
      }
    });
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
