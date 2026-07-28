import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PriceRange } from '../../places/place.enums';
import { BeachSort } from '../dto/beaches.dto';

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
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  listBeaches(limit: number, offset: number, filters: BeachListFilters = {}) {
    const args: unknown[] = [];
    const where = beachWhere(filters, args);
    const orderBy = BEACH_ORDER_BY[filters.sort ?? 'rating_desc'];
    const limitIdx = args.length + 1;
    const offsetIdx = args.length + 2;
    // Một correlated subquery cho ảnh bìa — KHÔNG phải N+1 (không có truy vấn riêng theo từng
    // hàng ở tầng application; tất cả nằm trong một round-trip SQL).
    return this.ds.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.price_range, p.ward,
              p.rating_avg, p.rating_count, p.verification_status,
              (SELECT m.url FROM media m WHERE m.id = p.cover_image_id AND m.deleted_at IS NULL) AS cover_image_url,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM ${beachFrom()}
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...args, limit, offset],
    );
  }

  countBeaches(filters: BeachListFilters = {}): Promise<number> {
    const args: unknown[] = [];
    const where = beachWhere(filters, args);
    return this.ds
      .query(`SELECT count(*)::int AS c FROM ${beachFrom()} WHERE ${where}`, args)
      .then((r) => Number(r[0]?.c ?? 0));
  }
}
