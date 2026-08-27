import { Injectable } from '@nestjs/common';
import { BeachesRepository } from './repositories/beaches.repository';
import { ListBeachesQueryDto } from './dto/beaches.dto';
import { paginate, clampLimit, clampPage } from '../../common/pagination';
import { redactUntrustedPriceRange } from '../../common/price-trust';

/**
 * Beach = Place có `categories.slug = 'beach'` — KHÔNG có bảng vệ tinh riêng, nên module này chỉ
 * bổ sung một đường ĐỌC cho trang duyệt. Chi tiết bãi biển vẫn là `GET /places/{slug}` (một URL
 * chi tiết duy nhất cho mỗi Place, không nhân bản nội dung sang `/beaches/{slug}`), và mọi thao
 * tác ghi vẫn đi qua PlacesService.
 */
@Injectable()
export class BeachesService {
  constructor(private readonly repo: BeachesRepository) {}

  async list(query: ListBeachesQueryDto = {}) {
    const p = clampPage(query.page);
    const l = clampLimit(query.limit);
    const filters = { ward: query.ward, priceRange: query.price_range, sort: query.sort };
    const [rows, total] = await Promise.all([
      this.repo.listBeaches(l, (p - 1) * l, filters),
      this.repo.countBeaches(filters),
    ]);
    const items = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      short_description: r.short_description,
      cover_image_url: r.cover_image_url,
      rating_avg: r.rating_avg !== null ? Number(r.rating_avg) : null,
      rating_count: r.rating_count,
      price_range: r.price_range,
      ward: r.ward,
      verification_status: r.verification_status,
      location: { lat: Number(r.lat), lng: Number(r.lng) },
      // Public Beta price trust gate (2026-08-28): raw price_range chỉ lộ khi trạng thái tin cậy.
    })).map(redactUntrustedPriceRange);
    return paginate(items, p, l, total);
  }
}
