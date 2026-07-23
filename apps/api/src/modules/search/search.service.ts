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
    const [rows, total] = await Promise.all([
      this.placesRepo.searchFullText(dto.q, limit, (page - 1) * limit),
      this.placesRepo.searchCount(dto.q),
    ]);
    const results = rows.map((r) => ({
      type: 'place',
      id: r.id,
      title: r.name,
      slug: r.slug,
      score: r.score !== undefined ? Number(r.score) : 0,
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
