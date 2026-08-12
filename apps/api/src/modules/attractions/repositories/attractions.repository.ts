import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PriceRange } from '../../places/place.enums';
import { AttractionSort } from '../dto/attractions.dto';
import { MediaUrlService } from '../../../core/media-url/media-url.service';
import { COVER_IMAGE_COLS, CoverImageColumns, withCoverImageUrl } from '../../../core/media-url/cover-image';

/** Row thô của truy vấn card — chỉ ghim phần ảnh bìa; các cột khác vẫn được service tự đọc. */
type CardRow = Record<string, unknown> & CoverImageColumns;

export interface AttractionListFilters {
  ward?: string;
  priceRange?: PriceRange;
  sort?: AttractionSort;
}

/**
 * Slug danh mục định nghĩa "điểm tham quan" (seed: SeedInitialPlaces/SeedPlacesExpansion).
 * Hằng số của MÃ NGUỒN, không bao giờ đến từ client — nội suy vào SQL là an toàn và giữ đúng
 * kiểu viết đã có ở Hotels/Restaurants/Tours (`p.status = 'published'` cũng nội suy như vậy).
 */
const ATTRACTION_CATEGORY_SLUG = 'attraction';

// Cùng chủ trương PlacesRepository.list/HotelsRepository/RestaurantsRepository/ToursRepository:
// ORDER BY cố định phía server (client không truyền tên cột), `p.id ASC` là khoá phụ chốt cuối
// cho MỌI nhánh — rating_avg là numeric(2,1) với rất nhiều giá trị trùng + cả nhóm NULL, và
// created_at của dữ liệu seed dùng chung một `now()`, nên nếu thiếu khoá phụ thì LIMIT/OFFSET
// cắt trang không xác định (lớp lỗi GAP-12).
const ATTRACTION_ORDER_BY: Record<AttractionSort, string> = {
  rating_desc: 'p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC',
  name_asc: 'p.name ASC, p.id ASC',
  newest: 'p.created_at DESC, p.id ASC',
};

// JOIN categories là quan hệ N:1 trên khoá chính (places.category_id → categories.id, và
// categories.slug UNIQUE) ⇒ KHÔNG nhân dòng, nên không cần DISTINCT và count(*) vẫn đúng.
function attractionFrom(): string {
  return `places p JOIN categories c ON c.id = p.category_id AND c.slug = '${ATTRACTION_CATEGORY_SLUG}'`;
}

function attractionWhere(filters: AttractionListFilters, args: unknown[]): string {
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
 * Repository của trang duyệt "Điểm tham quan".
 *
 * Khác Hotel/Restaurant/Tour: attraction KHÔNG có bảng vệ tinh (ADR-002) — đây là một khung
 * nhìn theo danh mục trên chính `places`. Vì thế repository này chỉ đọc; mọi thao tác GHI của
 * điểm tham quan vẫn đi qua PlacesService (một đường ghi duy nhất, giữ nguyên luồng kiểm
 * duyệt/revision).
 */
@Injectable()
export class AttractionsRepository {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly mediaUrl: MediaUrlService,
  ) {}

  async listAttractions(
    limit: number,
    offset: number,
    filters: AttractionListFilters = {},
  ): Promise<CardRow[]> {
    const args: unknown[] = [];
    const where = attractionWhere(filters, args);
    const orderBy = ATTRACTION_ORDER_BY[filters.sort ?? 'rating_desc'];
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
       FROM ${attractionFrom()}
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...args, limit, offset],
    );
    return withCoverImageUrl(rows, this.mediaUrl);
  }

  countAttractions(filters: AttractionListFilters = {}): Promise<number> {
    const args: unknown[] = [];
    const where = attractionWhere(filters, args);
    return this.ds
      .query(`SELECT count(*)::int AS c FROM ${attractionFrom()} WHERE ${where}`, args)
      .then((r) => Number(r[0]?.c ?? 0));
  }
}
