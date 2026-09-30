import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { PriceRange } from '../../places/place.enums';
import { RestaurantSort } from '../dto/restaurants.dto';
import { MediaUrlService } from '../../../core/media-url/media-url.service';
import { COVER_IMAGE_COLS, CoverImageColumns, withCoverImageUrl } from '../../../core/media-url/cover-image';

/** Row thô của truy vấn card — chỉ ghim phần ảnh bìa; các cột khác vẫn được service tự đọc. */
type CardRow = Record<string, unknown> & CoverImageColumns;

export interface MenuSectionInput {
  name: string;
  sort_order?: number;
  items: Array<{
    name: string;
    price?: number | null;
    currency?: string;
    tags?: unknown;
    is_signature?: boolean;
    sort_order?: number;
  }>;
}

export interface RestaurantListFilters {
  priceRange?: PriceRange;
  cuisine?: string;
  sort?: RestaurantSort;
}

// Cùng chủ trương PlacesRepository.list/HotelsRepository.listHotels — ORDER BY cố định phía
// server, `p.id ASC` là khoá phụ chốt cuối cho cả hai nhánh (GAP-12 class, tránh cắt trang không
// xác định khi nhiều nhà hàng hoà rating_avg/name).
const RESTAURANT_ORDER_BY: Record<RestaurantSort, string> = {
  rating_desc: 'p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC',
  name_asc: 'p.name ASC, p.id ASC',
};

function restaurantWhere(filters: RestaurantListFilters, args: unknown[]): string {
  const conds = [`p.deleted_at IS NULL`, `p.status = 'published'`];
  if (filters.priceRange) {
    args.push(filters.priceRange);
    conds.push(`p.price_range = $${args.length}`);
  }
  if (filters.cuisine) {
    args.push(filters.cuisine);
    conds.push(
      `EXISTS (SELECT 1 FROM place_cuisines pc JOIN cuisines c ON c.id = pc.cuisine_id WHERE pc.place_id = p.id AND c.code = $${args.length})`,
    );
  }
  return conds.join(' AND ');
}

@Injectable()
export class RestaurantsRepository {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly mediaUrl: MediaUrlService,
  ) {}

  async listRestaurants(
    limit: number,
    offset: number,
    filters: RestaurantListFilters = {},
  ): Promise<CardRow[]> {
    const args: unknown[] = [];
    const where = restaurantWhere(filters, args);
    const orderBy = RESTAURANT_ORDER_BY[filters.sort ?? 'rating_desc'];
    const limitIdx = args.length + 1;
    const offsetIdx = args.length + 2;
    // Correlated subquery/place cho ảnh bìa + mảng ẩm thực — KHÔNG phải N+1 (không có query riêng
    // theo từng hàng ở tầng application, toàn bộ chạy trong một round-trip SQL).
    const rows: CardRow[] = await this.ds.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.rating_avg, p.rating_count, p.price_range,
              p.verification_status,
              ${COVER_IMAGE_COLS},
              rd.is_local_specialty,
              (SELECT array_agg(c.label_vi ORDER BY c.code) FROM place_cuisines pc
                 JOIN cuisines c ON c.id = pc.cuisine_id WHERE pc.place_id = p.id) AS cuisines,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM places p JOIN place_restaurant_details rd ON rd.place_id = p.id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...args, limit, offset],
    );
    return withCoverImageUrl(rows, this.mediaUrl);
  }

  countRestaurants(filters: RestaurantListFilters = {}): Promise<number> {
    const args: unknown[] = [];
    const where = restaurantWhere(filters, args);
    return this.ds
      .query(
        `SELECT count(*)::int AS c FROM places p JOIN place_restaurant_details rd ON rd.place_id = p.id
         WHERE ${where}`,
        args,
      )
      .then((r) => Number(r[0]?.c ?? 0));
  }

  async detail(placeId: string) {
    const rows = await this.ds.query(
      `SELECT is_local_specialty, dietary FROM place_restaurant_details WHERE place_id = $1`,
      [placeId],
    );
    return rows[0] ?? null;
  }

  listCuisines(placeId: string) {
    return this.ds.query(
      `SELECT c.id, c.code, c.label_vi, c.label_en
       FROM place_cuisines pc JOIN cuisines c ON c.id = pc.cuisine_id
       WHERE pc.place_id = $1 ORDER BY c.code`,
      [placeId],
    );
  }

  /** Toàn bộ từ điển cuisines (cho admin UI chọn — không phải cuisine ĐÃ gán của một place). */
  listAllCuisines() {
    return this.ds.query(`SELECT id, code, label_vi, label_en FROM cuisines ORDER BY code`);
  }

  sections(placeId: string) {
    return this.ds.query(
      `SELECT id, name, sort_order FROM restaurant_menu_sections WHERE place_id = $1 ORDER BY sort_order ASC`,
      [placeId],
    );
  }

  itemsBySection(sectionIds: string[]) {
    if (sectionIds.length === 0) return Promise.resolve([]);
    return this.ds.query(
      `SELECT id, section_id, name, price, currency, tags, is_signature, sort_order
       FROM restaurant_menu_items WHERE section_id = ANY($1) ORDER BY sort_order ASC`,
      [sectionIds],
    );
  }

  /**
   * UPSERT place_restaurant_details — hàng chưa chắc tồn tại (cùng lý do HotelsRepository.
   * upsertDetails). PATCH TỪNG PHẦN thật: `dto.<field> !== undefined` phân biệt "không gửi" (giữ
   * nguyên) với "gửi null" (xoá — chỉ có ý nghĩa với `dietary`, `is_local_specialty` là boolean
   * không có khái niệm "xoá") với "gửi giá trị". Bug đã sửa: bản cũ dùng `?? null` rồi CASE WHEN
   * $3::jsonb IS NOT NULL — omit và "gửi dietary=null để xoá" cùng thành NULL, không thể xoá
   * dietary được nữa một khi đã set.
   *
   * CAS thật (2026-09-30, sửa sau góp ý): `UPDATE places SET content_version = content_version + 1
   * WHERE id = $1 AND content_version = $2` chạy TRƯỚC TIÊN trong transaction — xem ghi chú đầy đủ
   * ở HotelsRepository.upsertDetails (cùng khuôn, cùng lý do "SELECT ... FOR UPDATE" cũ không đủ).
   * 0 dòng khớp → 'conflict' ngay, không chạm bảng nào khác.
   *
   * `cuisine_codes` (nếu có mặt trong dto) được thay TOÀN BỘ trong CÙNG transaction này — sửa một
   * lỗi thật tìm thấy khi làm CAS: bản cũ gọi `upsertDetails()` rồi `setCuisines()` RIÊNG (hai
   * transaction khác nhau) từ RestaurantsService.updateDetails — mã cuisine không hợp lệ bị từ chối
   * SAU KHI is_local_specialty/dietary đã commit, để lại một ghi nửa vời. Gộp vào một transaction
   * duy nhất: mã không hợp lệ throw BadRequestException bên trong callback → toàn bộ transaction
   * (kể cả version bump) tự rollback, không có nội dung nào được ghi.
   */
  async upsertDetails(
    placeId: string,
    dto: { is_local_specialty?: boolean; dietary?: Record<string, unknown> | null; cuisine_codes?: string[] },
    expectedVersion: number,
  ): Promise<{ conflict: boolean; newVersion?: number }> {
    return this.ds.transaction(async (m) => {
      const casRows: Array<{ content_version: number }> = await m.query(
        `UPDATE places SET content_version = content_version + 1
           WHERE id = $1 AND content_version = $2
           RETURNING content_version`,
        [placeId, expectedVersion],
      );
      if (casRows.length === 0) {
        return { conflict: true };
      }
      const newVersion = casRows[0].content_version;

      const rows = await m.query(`SELECT 1 FROM place_restaurant_details WHERE place_id = $1 FOR UPDATE`, [placeId]);
      const exists = rows.length > 0;

      const patch: Record<string, unknown> = {};
      if (dto.is_local_specialty !== undefined) patch.is_local_specialty = dto.is_local_specialty;
      if (dto.dietary !== undefined) patch.dietary = dto.dietary != null ? JSON.stringify(dto.dietary) : null;

      if (!exists) {
        // NOT NULL DEFAULT false ở DB — đặt TRƯỚC dietary trong thứ tự cột cho dễ đọc (Object.keys
        // giữ thứ tự chèn; nếu patch đã có is_local_specialty từ dto thì giữ nguyên giá trị đó).
        const insertPatch: Record<string, unknown> = { is_local_specialty: patch.is_local_specialty ?? false, ...patch };
        const cols = ['place_id', ...Object.keys(insertPatch)];
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        await m.query(
          `INSERT INTO "place_restaurant_details" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`,
          [placeId, ...Object.values(insertPatch)],
        );
      } else if (Object.keys(patch).length > 0) {
        const setClauses = Object.keys(patch)
          .map((k, i) => `"${k}" = $${i + 2}`)
          .join(', ');
        await m.query(`UPDATE "place_restaurant_details" SET ${setClauses} WHERE place_id = $1`, [
          placeId,
          ...Object.values(patch),
        ]);
      }

      if (dto.cuisine_codes !== undefined) {
        await this.replaceCuisinesWithManager(m, placeId, dto.cuisine_codes);
      }

      return { conflict: false, newVersion };
    });
  }

  /** Thân dùng chung giữa `upsertDetails` (trong transaction CAS) và `setCuisines` (standalone, không CAS). */
  private async replaceCuisinesWithManager(m: EntityManager, placeId: string, codes: string[]): Promise<void> {
    if (codes.length === 0) {
      await m.query(`DELETE FROM place_cuisines WHERE place_id = $1`, [placeId]);
      return;
    }
    const found: Array<{ id: string; code: string }> = await m.query(`SELECT id, code FROM cuisines WHERE code = ANY($1)`, [codes]);
    const foundCodes = new Set(found.map((f) => f.code));
    const invalidCodes = codes.filter((c) => !foundCodes.has(c));
    if (invalidCodes.length > 0) {
      throw new BadRequestException(`Mã ẩm thực không tồn tại: ${invalidCodes.join(', ')}`);
    }
    await m.query(`DELETE FROM place_cuisines WHERE place_id = $1`, [placeId]);
    for (const f of found) {
      await m.query(`INSERT INTO place_cuisines (place_id, cuisine_id) VALUES ($1, $2)`, [placeId, f.id]);
    }
  }

  /**
   * Thay TOÀN BỘ gán cuisine của một place theo danh sách MÃ. Mã không tồn tại trong `cuisines` bị
   * từ chối (không âm thầm bỏ qua) — trả về mảng mã không hợp lệ để service ném 400 rõ ràng.
   */
  async setCuisines(placeId: string, codes: string[]): Promise<{ invalidCodes: string[] }> {
    if (codes.length === 0) {
      await this.ds.query(`DELETE FROM place_cuisines WHERE place_id = $1`, [placeId]);
      return { invalidCodes: [] };
    }
    const found: Array<{ id: string; code: string }> = await this.ds.query(
      `SELECT id, code FROM cuisines WHERE code = ANY($1)`,
      [codes],
    );
    const foundCodes = new Set(found.map((f) => f.code));
    const invalidCodes = codes.filter((c) => !foundCodes.has(c));
    if (invalidCodes.length > 0) {
      return { invalidCodes };
    }
    await this.ds.transaction(async (m) => {
      await m.query(`DELETE FROM place_cuisines WHERE place_id = $1`, [placeId]);
      for (const f of found) {
        await m.query(`INSERT INTO place_cuisines (place_id, cuisine_id) VALUES ($1, $2)`, [placeId, f.id]);
      }
    });
    return { invalidCodes: [] };
  }

  /** Thay toàn bộ menu (sections + items) của place. */
  async replaceMenu(placeId: string, sections: MenuSectionInput[]): Promise<void> {
    await this.ds.transaction(async (m) => {
      await m.query(
        `DELETE FROM restaurant_menu_items WHERE section_id IN
           (SELECT id FROM restaurant_menu_sections WHERE place_id = $1)`,
        [placeId],
      );
      await m.query(`DELETE FROM restaurant_menu_sections WHERE place_id = $1`, [placeId]);
      for (const [si, s] of sections.entries()) {
        const secRows = await m.query(
          `INSERT INTO restaurant_menu_sections (place_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id`,
          [placeId, s.name, s.sort_order ?? si],
        );
        const sectionId = secRows[0].id;
        for (const [ii, it] of (s.items ?? []).entries()) {
          await m.query(
            `INSERT INTO restaurant_menu_items (section_id, name, price, currency, tags, is_signature, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              sectionId,
              it.name,
              it.price ?? null,
              it.currency ?? 'VND',
              it.tags ?? null,
              it.is_signature ?? false,
              it.sort_order ?? ii,
            ],
          );
        }
      }
    });
  }
}
