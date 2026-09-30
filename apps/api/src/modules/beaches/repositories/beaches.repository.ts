import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PriceRange } from '../../places/place.enums';
import { BeachSort, UpdateBeachDetailsDto } from '../dto/beaches.dto';
import { MediaUrlService } from '../../../core/media-url/media-url.service';
import { COVER_IMAGE_COLS, CoverImageColumns, withCoverImageUrl } from '../../../core/media-url/cover-image';

// "Nhất quán giá trị/nguồn xác minh" (product spec, 2026-09-29 — dùng chung với
// HotelsRepository.upsertDetails's star_rating): field text đổi giá trị mà request này KHÔNG
// đồng thời cấp nguồn mới cho ĐÚNG giá trị đó -> xoá nguồn/verified_at cũ, không giữ nhãn "có
// nguồn" cho một giá trị chưa từng được nguồn đó xác minh.
function computeSourcedFieldPatch(
  valueCol: string,
  sourceCol: string,
  verifiedAtCol: string,
  input: {
    valueProvided: boolean;
    newValue: string | null | undefined;
    sourceProvided: boolean;
    newSourceId: string | null | undefined;
    currentValue: string | null;
  },
  patch: Record<string, unknown>,
): void {
  if (!input.valueProvided && !input.sourceProvided) return;

  if (input.valueProvided) patch[valueCol] = input.newValue ?? null;
  const newValue = input.valueProvided ? (input.newValue ?? null) : input.currentValue;
  const valueChanged = input.valueProvided && newValue !== input.currentValue;

  if (valueChanged) {
    if (input.sourceProvided && input.newSourceId != null) {
      patch[sourceCol] = input.newSourceId;
      patch[verifiedAtCol] = new Date();
    } else {
      patch[sourceCol] = null;
      patch[verifiedAtCol] = null;
    }
  } else if (input.sourceProvided) {
    patch[sourceCol] = input.newSourceId ?? null;
    patch[verifiedAtCol] = input.newSourceId != null ? new Date() : null;
  }
}

/** Row thô của truy vấn card — chỉ ghim phần ảnh bìa; các cột khác vẫn được service tự đọc. */
type CardRow = Record<string, unknown> & CoverImageColumns;

export interface BeachListFilters {
  ward?: string;
  priceRange?: PriceRange;
  sort?: BeachSort;
}

/**
 * Slug danh mục định nghĩa "bãi biển" (seed: SeedInitialPlaces/SeedPlacesExpansion).
 * Hằng số của MÃ NGUỒN, không bao giờ đến từ client — nội suy vào SQL là an toàn và giữ đúng
 * kiểu viết đã có ở các repository browse khác (`p.status = 'published'` cũng nội suy như vậy).
 */
const BEACH_CATEGORY_SLUG = 'beach';

// ORDER BY cố định phía server (client không truyền tên cột), `p.id ASC` là khoá phụ chốt cuối
// cho MỌI nhánh. Với bãi biển điều này KHÔNG phải phòng xa: toàn bộ 10 bãi seed đều có
// rating_avg NULL và created_at chung một `now()`, nên hai khoá đầu hoà hoàn toàn — thiếu khoá
// phụ thì LIMIT/OFFSET cắt trang không xác định (lớp lỗi GAP-12).
const BEACH_ORDER_BY: Record<BeachSort, string> = {
  rating_desc: 'p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC',
  name_asc: 'p.name ASC, p.id ASC',
  newest: 'p.created_at DESC, p.id ASC',
};

// JOIN categories là quan hệ N:1 trên khoá chính (places.category_id → categories.id, và
// categories.slug UNIQUE) ⇒ KHÔNG nhân dòng, nên không cần DISTINCT và count(*) vẫn đúng.
function beachFrom(): string {
  return `places p JOIN categories c ON c.id = p.category_id AND c.slug = '${BEACH_CATEGORY_SLUG}'`;
}

function beachWhere(filters: BeachListFilters, args: unknown[]): string {
  const conds = [`p.deleted_at IS NULL`, `p.status = 'published'`];
  if (filters.ward) {
    args.push(filters.ward);
    conds.push(`p.ward = $${args.length}`);
  }
  if (filters.priceRange) {
    args.push(filters.priceRange);
    conds.push(`p.price_range = $${args.length}`);
  }
  return conds.join(' AND ');
}

/**
 * Repository của trang duyệt "Bãi biển".
 *
 * Giống Attractions và khác Hotel/Restaurant/Tour: bãi biển KHÔNG có bảng vệ tinh (ADR-002) —
 * đây là một khung nhìn theo danh mục trên chính `places`. Repository này chỉ ĐỌC; mọi thao tác
 * ghi vẫn đi qua PlacesService (một đường ghi duy nhất, giữ nguyên luồng kiểm duyệt/revision).
 *
 * Attractions có một repository gần giống hệt (khác đúng hằng số slug). CỐ Ý chưa gộp: mới hai
 * consumer, và một lớp trừu tượng "browse theo category" chỉ đáng dựng khi có consumer thứ ba
 * cùng hợp đồng ổn định — trước đó nó chỉ thêm một tầng gián tiếp cho hai câu SQL đọc được.
 */
@Injectable()
export class BeachesRepository {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly mediaUrl: MediaUrlService,
  ) {}

  async listBeaches(limit: number, offset: number, filters: BeachListFilters = {}): Promise<CardRow[]> {
    const args: unknown[] = [];
    const where = beachWhere(filters, args);
    const orderBy = BEACH_ORDER_BY[filters.sort ?? 'rating_desc'];
    const limitIdx = args.length + 1;
    const offsetIdx = args.length + 2;
    // Correlated subquery cho ảnh bìa — KHÔNG phải N+1 (không có truy vấn riêng theo từng hàng ở
    // tầng application; tất cả nằm trong một round-trip SQL). `withCoverImageUrl` chỉ dựng URL từ
    // dữ liệu ĐÃ có trong row, cũng không truy vấn thêm.
    const rows: CardRow[] = await this.ds.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.price_range, p.ward,
              p.rating_avg, p.rating_count, p.verification_status,
              ${COVER_IMAGE_COLS},
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM ${beachFrom()}
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...args, limit, offset],
    );
    return withCoverImageUrl(rows, this.mediaUrl);
  }

  countBeaches(filters: BeachListFilters = {}): Promise<number> {
    const args: unknown[] = [];
    const where = beachWhere(filters, args);
    return this.ds
      .query(`SELECT count(*)::int AS c FROM ${beachFrom()} WHERE ${where}`, args)
      .then((r) => Number(r[0]?.c ?? 0));
  }

  // place_beach_details (InitBeachDetails1720007700000) — LEFT JOIN nguồn cho 3 trường "có nguồn"
  // để trang chi tiết hiện được title/url mà không cần round-trip thứ hai (cùng khuôn
  // HotelsRepository.detail's star_rating_source).
  async detail(placeId: string) {
    const rows = await this.ds.query(
      `SELECT bd.access_route, bd.characteristics, bd.services,
              bd.best_season, bd.best_season_source_id, bd.best_season_verified_at,
              bs.title AS best_season_source_title, bs.url AS best_season_source_url,
              bd.lifeguard_info, bd.lifeguard_info_source_id, bd.lifeguard_info_verified_at,
              ls.title AS lifeguard_info_source_title, ls.url AS lifeguard_info_source_url,
              bd.sourced_notes, bd.sourced_notes_source_id, bd.sourced_notes_verified_at,
              ns.title AS sourced_notes_source_title, ns.url AS sourced_notes_source_url
       FROM place_beach_details bd
       LEFT JOIN sources bs ON bs.id = bd.best_season_source_id
       LEFT JOIN sources ls ON ls.id = bd.lifeguard_info_source_id
       LEFT JOIN sources ns ON ns.id = bd.sourced_notes_source_id
       WHERE bd.place_id = $1`,
      [placeId],
    );
    return rows[0] ?? null;
  }

  /**
   * UPSERT place_beach_details — cùng nguyên tắc HotelsRepository.upsertDetails (xem ghi chú đầy
   * đủ ở đó): PATCH TỪNG PHẦN thật, `dto.<field> !== undefined` phân biệt "không gửi" (giữ
   * nguyên) với "gửi null" (xoá) với "gửi giá trị" (ghi) — chỉ những cột THỰC SỰ có mặt trong
   * patch mới xuất hiện trong câu SQL. 3 trường "có nguồn" (best_season/lifeguard_info/
   * sourced_notes) áp `computeSourcedFieldPatch` — đổi giá trị mà không kèm nguồn mới cho ĐÚNG
   * giá trị đó thì xoá nguồn/verified_at cũ, không giữ nhãn "có nguồn" cho giá trị chưa được xác
   * minh. `SELECT ... FOR UPDATE` khoá đúng hàng cho suốt read-modify-write, chặn lost-update khi
   * hai admin sửa cùng bãi biển đồng thời.
   */
  async upsertDetails(placeId: string, dto: UpdateBeachDetailsDto): Promise<void> {
    await this.ds.transaction(async (m) => {
      const rows = await m.query(
        `SELECT access_route, characteristics, services,
                best_season, best_season_source_id,
                lifeguard_info, lifeguard_info_source_id,
                sourced_notes, sourced_notes_source_id
         FROM place_beach_details WHERE place_id = $1 FOR UPDATE`,
        [placeId],
      );
      const current: {
        best_season: string | null;
        lifeguard_info: string | null;
        sourced_notes: string | null;
      } | null = rows[0] ?? null;

      const patch: Record<string, unknown> = {};
      if (dto.access_route !== undefined) patch.access_route = dto.access_route;
      if (dto.characteristics !== undefined) patch.characteristics = dto.characteristics;
      if (dto.services !== undefined) patch.services = dto.services;

      computeSourcedFieldPatch(
        'best_season',
        'best_season_source_id',
        'best_season_verified_at',
        {
          valueProvided: dto.best_season !== undefined,
          newValue: dto.best_season,
          sourceProvided: dto.best_season_source_id !== undefined,
          newSourceId: dto.best_season_source_id,
          currentValue: current?.best_season ?? null,
        },
        patch,
      );
      computeSourcedFieldPatch(
        'lifeguard_info',
        'lifeguard_info_source_id',
        'lifeguard_info_verified_at',
        {
          valueProvided: dto.lifeguard_info !== undefined,
          newValue: dto.lifeguard_info,
          sourceProvided: dto.lifeguard_info_source_id !== undefined,
          newSourceId: dto.lifeguard_info_source_id,
          currentValue: current?.lifeguard_info ?? null,
        },
        patch,
      );
      computeSourcedFieldPatch(
        'sourced_notes',
        'sourced_notes_source_id',
        'sourced_notes_verified_at',
        {
          valueProvided: dto.sourced_notes !== undefined,
          newValue: dto.sourced_notes,
          sourceProvided: dto.sourced_notes_source_id !== undefined,
          newSourceId: dto.sourced_notes_source_id,
          currentValue: current?.sourced_notes ?? null,
        },
        patch,
      );

      if (Object.keys(patch).length === 0) return;

      if (!current) {
        const cols = ['place_id', ...Object.keys(patch)];
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        await m.query(
          `INSERT INTO "place_beach_details" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`,
          [placeId, ...Object.values(patch)],
        );
        return;
      }

      const setClauses = Object.keys(patch)
        .map((k, i) => `"${k}" = $${i + 2}`)
        .join(', ');
      await m.query(`UPDATE "place_beach_details" SET ${setClauses} WHERE place_id = $1`, [
        placeId,
        ...Object.values(patch),
      ]);
    });
  }
}
