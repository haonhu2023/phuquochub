import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HotelSort, UpdateHotelDetailsDto } from '../dto/hotels.dto';
import { MediaUrlService } from '../../../core/media-url/media-url.service';
import { COVER_IMAGE_COLS, CoverImageColumns, withCoverImageUrl } from '../../../core/media-url/cover-image';

/** Row thô của truy vấn card — chỉ ghim phần ảnh bìa; các cột khác vẫn được service tự đọc. */
type CardRow = Record<string, unknown> & CoverImageColumns;

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
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly mediaUrl: MediaUrlService,
  ) {}

  async listHotels(limit: number, offset: number, filters: HotelListFilters = {}): Promise<CardRow[]> {
    const args: unknown[] = [];
    const where = hotelWhere(filters, args);
    const orderBy = HOTEL_ORDER_BY[filters.sort ?? 'rating_desc'];
    const limitIdx = args.length + 1;
    const offsetIdx = args.length + 2;
    const rows: CardRow[] = await this.ds.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.rating_avg, p.rating_count,
              ${COVER_IMAGE_COLS},
              hd.star_rating, hd.hotel_type,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM places p JOIN place_hotel_details hd ON hd.place_id = p.id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...args, limit, offset],
    );
    return withCoverImageUrl(rows, this.mediaUrl);
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
      `SELECT hd.star_rating, hd.hotel_type, hd.check_in, hd.check_out,
              hd.star_rating_source_id, hd.star_rating_verified_at,
              s.title AS star_rating_source_title, s.url AS star_rating_source_url
       FROM place_hotel_details hd
       LEFT JOIN sources s ON s.id = hd.star_rating_source_id
       WHERE hd.place_id = $1`,
      [placeId],
    );
    return rows[0] ?? null;
  }

  /**
   * Tạo/cập nhật place_hotel_details cho MỘT place (UPSERT — hàng này không được tạo tự động khi
   * place ra đời, xem InitHotel/module comment).
   *
   * PATCH TỪNG PHẦN THẬT SỰ — phân biệt "không gửi field" (giữ nguyên) với "gửi field = null"
   * (xoá) với "gửi field = giá trị" (ghi). `dto.<field> !== undefined` là phép kiểm ĐÚNG cho việc
   * này (đã xác minh runtime: field bị bỏ qua trong JSON body → class-transformer để nguyên
   * `undefined` trên instance, KHÔNG lẫn với `null`) — cùng khuôn PlacesRepository.
   * updateScalarsIfUnchanged/PricesRepository.updateScalarsIfUnchanged đã dùng. Bug cũ (đã sửa):
   * dùng `input.field ?? null` rồi COALESCE ở SQL xoá mất sự phân biệt này TRƯỚC KHI tới DB —
   * "không gửi" và "gửi null" cùng thành tham số NULL, không thể tách lại được nữa.
   *
   * Nhất quán giá trị/nguồn xác minh: `star_rating` đổi giá trị mà request này KHÔNG đồng thời cấp
   * `star_rating_source_id` mới cho ĐÚNG giá trị đó → xoá cả nguồn lẫn verified_at cũ (chúng xác
   * minh giá trị CŨ, không phải giá trị vừa đổi) — không được phép giữ nhãn "có nguồn" cho một giá
   * trị chưa từng được nguồn đó xác minh.
   *
   * CAS thật (2026-09-30, sửa sau góp ý): `UPDATE places SET content_version = content_version + 1
   * WHERE id = $1 AND content_version = $2 RETURNING content_version` chạy TRƯỚC TIÊN trong cùng
   * transaction — vừa khoá hàng `places` (UPDATE tự khoá), vừa là điều kiện CAS thật so với token
   * client gửi lên. 0 dòng khớp → trả về 'conflict' NGAY, không chạm satellite table, transaction
   * không có gì để rollback (chưa ghi gì). Khớp → tiếp tục UPSERT satellite bên dưới trong CÙNG
   * transaction đó; version cũ (SELECT ... FOR UPDATE trên satellite, không so version) đã bị THAY
   * vì nó không chặn được một request MUỘN (đọc từ lâu, ghi sau) — chỉ chặn hai request ĐỒNG THỜI.
   */
  async upsertDetails(
    placeId: string,
    dto: UpdateHotelDetailsDto,
    expectedVersion: number,
  ): Promise<{ conflict: boolean; newVersion?: number }> {
    return this.ds.transaction(async (m) => {
      // BUG THẬT (2026-09-30, phát hiện qua e2e trên Postgres thật — không phải mock): `UPDATE ...
      // RETURNING` qua `query()` trả về TUPLE `[rows, affectedCount]`, KHÔNG PHẢI mảng rows trực
      // tiếp (khác `INSERT ... RETURNING`) — cùng landmine PlacesRepository.updateScalarsIfUnchanged
      // đã ghi chú. Không destructure đúng `[casRows]` khiến `casRows.length === 0` KHÔNG BAO GIỜ
      // đúng (tuple luôn có 2 phần tử) — CAS "luôn thành công" bất kể có khớp version hay không,
      // đúng lớp lỗi bảo mật/tính đúng đắn nghiêm trọng mà landmine kia đã cảnh báo.
      const [casRows]: [Array<{ content_version: number }>, number] = await m.query(
        `UPDATE places SET content_version = content_version + 1
           WHERE id = $1 AND content_version = $2
           RETURNING content_version`,
        [placeId, expectedVersion],
      );
      if (casRows.length === 0) {
        return { conflict: true };
      }
      const newVersion = casRows[0].content_version;

      const rows = await m.query(
        `SELECT hotel_type, star_rating, star_rating_source_id FROM place_hotel_details WHERE place_id = $1 FOR UPDATE`,
        [placeId],
      );
      const current: { hotel_type: string; star_rating: number | null; star_rating_source_id: string | null } | null =
        rows[0] ?? null;

      const patch: Record<string, unknown> = {};
      if (dto.hotel_type !== undefined) patch.hotel_type = dto.hotel_type;
      if (dto.check_in !== undefined) patch.check_in = dto.check_in;
      if (dto.check_out !== undefined) patch.check_out = dto.check_out;

      const starRatingProvided = dto.star_rating !== undefined;
      const sourceProvided = dto.star_rating_source_id !== undefined;
      if (starRatingProvided || sourceProvided) {
        const currentRating = current?.star_rating ?? null;
        const newRating = starRatingProvided ? (dto.star_rating ?? null) : currentRating;
        const ratingChanged = starRatingProvided && newRating !== currentRating;
        if (starRatingProvided) patch.star_rating = newRating;

        if (ratingChanged) {
          if (sourceProvided && dto.star_rating_source_id != null) {
            patch.star_rating_source_id = dto.star_rating_source_id;
            patch.star_rating_verified_at = new Date();
          } else {
            patch.star_rating_source_id = null;
            patch.star_rating_verified_at = null;
          }
        } else if (sourceProvided) {
          patch.star_rating_source_id = dto.star_rating_source_id ?? null;
          patch.star_rating_verified_at = dto.star_rating_source_id != null ? new Date() : null;
        }
        // Giá trị không đổi và nguồn không được nhắc tới trong request này → không đụng cột nào cả.
      }

      if (Object.keys(patch).length === 0) return { conflict: false, newVersion };

      if (!current) {
        if (!('hotel_type' in patch)) {
          throw new BadRequestException('hotel_type bắt buộc khi tạo thông tin khách sạn lần đầu');
        }
        const cols = ['place_id', ...Object.keys(patch)];
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        await m.query(
          `INSERT INTO "place_hotel_details" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`,
          [placeId, ...Object.values(patch)],
        );
        return { conflict: false, newVersion };
      }

      const setClauses = Object.keys(patch)
        .map((k, i) => `"${k}" = $${i + 2}`)
        .join(', ');
      await m.query(`UPDATE "place_hotel_details" SET ${setClauses} WHERE place_id = $1`, [
        placeId,
        ...Object.values(patch),
      ]);
      return { conflict: false, newVersion };
    });
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
