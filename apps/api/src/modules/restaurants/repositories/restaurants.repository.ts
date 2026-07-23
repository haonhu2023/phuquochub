import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface MenuSectionInput {
  name: string;
  sort_order?: number;
  items: Array<{ name: string; price?: number | null; currency?: string; tags?: unknown; sort_order?: number }>;
}

@Injectable()
export class RestaurantsRepository {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  listRestaurants(limit: number, offset: number) {
    return this.ds.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.rating_avg, p.rating_count,
              rd.is_local_specialty,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM places p JOIN place_restaurant_details rd ON rd.place_id = p.id
       WHERE p.deleted_at IS NULL AND p.status = 'published'
       ORDER BY p.rating_avg DESC NULLS LAST, p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
  }

  countRestaurants(): Promise<number> {
    return this.ds
      .query(
        `SELECT count(*)::int AS c FROM places p JOIN place_restaurant_details rd ON rd.place_id = p.id
         WHERE p.deleted_at IS NULL AND p.status = 'published'`,
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
