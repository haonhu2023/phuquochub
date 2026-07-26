import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PriceRange } from '../../places/place.enums';
import { RestaurantSort } from '../dto/restaurants.dto';

export interface MenuSectionInput {
  name: string;
  sort_order?: number;
  items: Array<{ name: string; price?: number | null; currency?: string; tags?: unknown; sort_order?: number }>;
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
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  listRestaurants(limit: number, offset: number, filters: RestaurantListFilters = {}) {
    const args: unknown[] = [];
    const where = restaurantWhere(filters, args);
    const orderBy = RESTAURANT_ORDER_BY[filters.sort ?? 'rating_desc'];
    const limitIdx = args.length + 1;
    const offsetIdx = args.length + 2;
    // Một correlated subquery/place cho ảnh bìa + mảng ẩm thực — KHÔNG phải N+1 (không có query
    // riêng theo từng hàng ở tầng application, toàn bộ chạy trong một round-trip SQL).
    return this.ds.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.rating_avg, p.rating_count, p.price_range,
              (SELECT m.url FROM media m WHERE m.id = p.cover_image_id AND m.deleted_at IS NULL) AS cover_image_url,
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

  sections(placeId: string) {
    return this.ds.query(
      `SELECT id, name, sort_order FROM restaurant_menu_sections WHERE place_id = $1 ORDER BY sort_order ASC`,
      [placeId],
    );
  }

  itemsBySection(sectionIds: string[]) {
    if (sectionIds.length === 0) return Promise.resolve([]);
    return this.ds.query(
      `SELECT id, section_id, name, price, currency, tags, sort_order
       FROM restaurant_menu_items WHERE section_id = ANY($1) ORDER BY sort_order ASC`,
      [sectionIds],
    );
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
            `INSERT INTO restaurant_menu_items (section_id, name, price, currency, tags, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [sectionId, it.name, it.price ?? null, it.currency ?? 'VND', it.tags ?? null, it.sort_order ?? ii],
          );
        }
      }
    });
  }
}
