import { DataSource } from 'typeorm';
import { HotelsRepository } from './hotels.repository';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('HotelsRepository — browse (stars filter, sort, pagination)', () => {
  let ds: LooseMock<DataSource>;
  let sut: HotelsRepository;

  beforeEach(() => {
    ds = createMock<DataSource>({ query: jest.fn() });
    sut = new HotelsRepository(ds);
  });

  describe('listHotels', () => {
    it('không filter → WHERE chỉ published/chưa xoá, ORDER BY rating_desc mặc định + id ASC', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listHotels(20, 0);

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain("p.deleted_at IS NULL AND p.status = 'published'");
      expect(q).toContain('ORDER BY p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC');
      expect(q).toContain('LIMIT $1 OFFSET $2');
      expect(params).toEqual([20, 0]);
    });

    it('stars → thêm điều kiện hd.star_rating tham số hoá, dịch LIMIT/OFFSET index', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listHotels(10, 5, { stars: 4 });

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('hd.star_rating = $1');
      expect(q).toContain('LIMIT $2 OFFSET $3');
      expect(params).toEqual([4, 10, 5]);
    });

    it('sort=name_asc → ORDER BY name + id ASC (tie-break xác định)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listHotels(20, 0, { sort: 'name_asc' });

      const q = sql(ds.query.mock.calls[0][0]);
      expect(q).toContain('ORDER BY p.name ASC, p.id ASC');
    });

    it('SELECT có cover_image_url (subquery media, cùng khuôn mẫu PlacesRepository)', async () => {
      ds.query.mockResolvedValue([]);
      await sut.listHotels(20, 0);
      const q = sql(ds.query.mock.calls[0][0]);
      expect(q).toContain('AS cover_image_url');
    });
  });

  describe('countHotels', () => {
    it('không filter → đếm tất cả published', async () => {
      ds.query.mockResolvedValue([{ c: 3 }]);

      await expect(sut.countHotels()).resolves.toBe(3);

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).not.toContain('star_rating =');
      expect(params).toEqual([]);
    });

    it('stars → cùng điều kiện lọc như listHotels', async () => {
      ds.query.mockResolvedValue([{ c: 1 }]);

      await sut.countHotels({ stars: 5 });

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain('hd.star_rating = $1');
      expect(params).toEqual([5]);
    });
  });
});
