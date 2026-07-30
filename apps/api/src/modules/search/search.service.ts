import { Injectable } from '@nestjs/common';
import { PlacesRepository } from '../places/repositories/places.repository';
import { clampLimit, clampPage, paginate } from '../../common/pagination';
import { SearchQueryDto, SuggestQueryDto } from './dto/search.dto';

// Search Wave 1: keyword FTS (Postgres) trên Place. Các loại khác (hotel/restaurant/
// tour/event/community) + semantic/geo blend theo search.md thuộc Wave sau.
@Injectable()
export class SearchService {
  constructor(private readonly placesRepo: PlacesRepository) {}

  async search(dto: SearchQueryDto) {
    const page = clampPage(dto.page);
    const limit = clampLimit(dto.limit);
    // Search Filters (category/ward/price_range) — cùng cột places đã lọc ở ListPlacesQueryDto,
    // truyền xuống repo dạng object rời để không phá signature (q, limit, offset) hiện có.
    const filters = { category: dto.category, ward: dto.ward, priceRange: dto.price_range };
    const [rows, total] = await Promise.all([
      this.placesRepo.searchFullText(dto.q, limit, (page - 1) * limit, filters),
      this.placesRepo.searchCount(dto.q, filters),
    ]);
    // F-35 / OD-B4 (PLACE-024, 2026-07-24): `r.score` (ts_rank nội bộ) KHÔNG được ánh xạ ra
    // SearchResult công khai nữa. Nó vẫn quyết định THỨ TỰ hoàn toàn — searchFullText() đã
    // ORDER BY score DESC, p.id ASC ở tầng SQL (places.repository.ts) TRƯỚC KHI rows tới đây —
    // nên bỏ trường này khỏi payload không đổi thứ tự client thấy, chỉ ngừng lộ giá trị
    // ts_rank cụ thể của Postgres ra hợp đồng công khai (không đổi tên/thay thế bằng trường nào
    // khác). Xem findings/F-35.yaml.
    const results = rows.map((r) => ({
      type: 'place',
      id: r.id,
      title: r.name,
      slug: r.slug,
      snippet: r.short_description,
    }));
    return paginate(results, page, limit, total);
  }

  async suggest(dto: SuggestQueryDto) {
    const rows = await this.placesRepo.searchFullText(dto.q, 8, 0);
    return rows.map((r) => ({ id: r.id, title: r.name, slug: r.slug }));
  }

  reindex() {
    // Postgres FTS đánh chỉ mục trực tiếp (GIN), không cần reindex ngoài.
    // Khi chuyển Meilisearch/ES (search.md §12) sẽ enqueue job reindex.
    return { status: 'ok', message: 'Postgres FTS live-indexed; no external reindex required' };
  }
}
