import { DataSource } from 'typeorm';
import { RestaurantsRepository } from './restaurants.repository';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

import type { MediaUrlService } from '../../../core/media-url/media-url.service';

// Chỉ dùng để dựng URL API của ảnh bìa đã upload (xem core/media-url/cover-image.ts).
const MEDIA_URL = { fileUrl: (id: string) => `https://api.test/api/media/${id}/file` } as MediaUrlService;

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('RestaurantsRepository — browse (price_range/cuisine filter, sort, pagination)', () => {
  let ds: LooseMock<DataSource>;
  let sut: RestaurantsRepository;

  beforeEach(() => {
    ds = createMock<DataSource>({ query: jest.fn() });
    sut = new RestaurantsRepository(ds, MEDIA_URL);
  });

  describe('listRestaurants', () => {
    it('không filter → WHERE chỉ published/chưa xoá, ORDER BY rating_desc mặc định + id ASC', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listRestaurants(20, 0);

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain("p.deleted_at IS NULL AND p.status = 'published'");
      expect(q).toContain('ORDER BY p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC');
      expect(q).toContain('LIMIT $1 OFFSET $2');
      expect(params).toEqual([20, 0]);
    });

    it('price_range → điều kiện tham số hoá, dịch LIMIT/OFFSET index', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listRestaurants(10, 5, { priceRange: 'mid' as never });

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('p.price_range = $1');
      expect(q).toContain('LIMIT $2 OFFSET $3');
      expect(params).toEqual(['mid', 10, 5]);
    });

    it('cuisine → EXISTS join place_cuisines/cuisines theo code, tham số hoá', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listRestaurants(20, 0, { cuisine: 'seafood' });

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('EXISTS (SELECT 1 FROM place_cuisines pc JOIN cuisines c ON c.id = pc.cuisine_id WHERE pc.place_id = p.id AND c.code = $1)');
      expect(params).toEqual(['seafood', 20, 0]);
    });

    it('cả price_range và cuisine → cả hai điều kiện, đúng thứ tự tham số', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listRestaurants(20, 0, { priceRange: 'high' as never, cuisine: 'bbq' });

      const [query, params] = ds.query.mock.calls[0];
      expect(params).toEqual(['high', 'bbq', 20, 0]);
      expect(sql(query)).toContain('p.price_range = $1');
      expect(sql(query)).toContain('c.code = $2');
    });

    it('sort=name_asc → ORDER BY name + id ASC (tie-break xác định)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listRestaurants(20, 0, { sort: 'name_asc' });

      expect(sql(ds.query.mock.calls[0][0])).toContain('ORDER BY p.name ASC, p.id ASC');
    });

    it('SELECT có cover_image_url + cuisines (array_agg), không N+1 (một query duy nhất)', async () => {
      ds.query.mockResolvedValue([]);
      await sut.listRestaurants(20, 0);
      expect(ds.query).toHaveBeenCalledTimes(1);
      const q = sql(ds.query.mock.calls[0][0]);
      expect(q).toContain('AS cover_image_url');
      expect(q).toContain('array_agg(c.label_vi ORDER BY c.code)');
    });
  });

  describe('countRestaurants', () => {
    it('không filter → đếm tất cả published', async () => {
      ds.query.mockResolvedValue([{ c: 3 }]);
      await expect(sut.countRestaurants()).resolves.toBe(3);
      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).not.toContain('price_range =');
      expect(params).toEqual([]);
    });

    it('cùng bộ lọc như listRestaurants', async () => {
      ds.query.mockResolvedValue([{ c: 1 }]);
      await sut.countRestaurants({ cuisine: 'vegetarian' });
      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain('c.code = $1');
      expect(params).toEqual(['vegetarian']);
    });
  });
});
