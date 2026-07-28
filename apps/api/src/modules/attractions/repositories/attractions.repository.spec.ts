import { DataSource } from 'typeorm';
import { AttractionsRepository } from './attractions.repository';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('AttractionsRepository — browse (ward/price_range filter, sort, pagination)', () => {
  let ds: LooseMock<DataSource>;
  let sut: AttractionsRepository;

  beforeEach(() => {
    ds = createMock<DataSource>({ query: jest.fn() });
    sut = new AttractionsRepository(ds);
  });

  describe('listAttractions', () => {
    it('không filter → chỉ published/chưa xoá, ORDER BY rating_desc mặc định + id ASC', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listAttractions(20, 0);

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain("p.deleted_at IS NULL AND p.status = 'published'");
      expect(q).toContain('ORDER BY p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC');
      expect(q).toContain('LIMIT $1 OFFSET $2');
      expect(params).toEqual([20, 0]);
    });

    it('giới hạn đúng danh mục attraction qua JOIN categories (không phải mọi Place)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listAttractions(20, 0);

      expect(sql(ds.query.mock.calls[0][0])).toContain(
        "FROM places p JOIN categories c ON c.id = p.category_id AND c.slug = 'attraction'",
      );
    });

    it('ward → điều kiện tham số hoá, dịch LIMIT/OFFSET index', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listAttractions(10, 20, { ward: 'Dương Đông' });

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('p.ward = $1');
      expect(q).toContain('LIMIT $2 OFFSET $3');
      expect(params).toEqual(['Dương Đông', 10, 20]);
    });

    it('ward chứa ký tự SQL → vẫn là tham số bound, không nối chuỗi', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listAttractions(20, 0, { ward: "An Thới'; DROP TABLE places--" });

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).not.toContain('DROP TABLE');
      expect(params).toEqual(["An Thới'; DROP TABLE places--", 20, 0]);
    });

    it('price_range → p.price_range tham số hoá', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listAttractions(20, 0, { priceRange: 'free' as never });

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain('p.price_range = $1');
      expect(params).toEqual(['free', 20, 0]);
    });

    it('cả ward và price_range → đúng thứ tự tham số', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listAttractions(5, 10, { ward: 'Gành Dầu', priceRange: 'high' as never });

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('p.ward = $1');
      expect(q).toContain('p.price_range = $2');
      expect(q).toContain('LIMIT $3 OFFSET $4');
      expect(params).toEqual(['Gành Dầu', 'high', 5, 10]);
    });

    it('sort=name_asc → ORDER BY name + id ASC (tie-break xác định)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listAttractions(20, 0, { sort: 'name_asc' });

      expect(sql(ds.query.mock.calls[0][0])).toContain('ORDER BY p.name ASC, p.id ASC');
    });

    it('sort=newest → ORDER BY created_at DESC + id ASC', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listAttractions(20, 0, { sort: 'newest' });

      expect(sql(ds.query.mock.calls[0][0])).toContain('ORDER BY p.created_at DESC, p.id ASC');
    });

    it('offset tính theo trang: trang 3 × 20/trang → OFFSET 40', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listAttractions(20, 40);

      expect(ds.query.mock.calls[0][1]).toEqual([20, 40]);
    });

    it('SELECT có cover_image_url + ward/price_range/verification_status, một query duy nhất (không N+1)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listAttractions(20, 0);

      expect(ds.query).toHaveBeenCalledTimes(1);
      const q = sql(ds.query.mock.calls[0][0]);
      expect(q).toContain(
        '(SELECT m.url FROM media m WHERE m.id = p.cover_image_id AND m.deleted_at IS NULL) AS cover_image_url',
      );
      expect(q).toContain('p.short_description, p.price_range, p.ward');
      expect(q).toContain('p.rating_avg, p.rating_count, p.verification_status');
    });

    it('JOIN categories là N:1 trên khoá chính ⇒ không cần DISTINCT (không nhân dòng)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listAttractions(20, 0);

      expect(sql(ds.query.mock.calls[0][0])).not.toContain('DISTINCT');
    });
  });

  describe('countAttractions', () => {
    it('không filter → đếm mọi attraction published, không tham số lọc', async () => {
      ds.query.mockResolvedValue([{ c: 12 }]);

      await expect(sut.countAttractions()).resolves.toBe(12);

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain("c.slug = 'attraction'");
      expect(sql(query)).not.toContain('p.ward =');
      expect(params).toEqual([]);
    });

    it('cùng bộ lọc như listAttractions (tổng khớp trang đang hiển thị)', async () => {
      ds.query.mockResolvedValue([{ c: 2 }]);

      await sut.countAttractions({ ward: 'An Thới', priceRange: 'free' as never });

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('p.ward = $1');
      expect(q).toContain('p.price_range = $2');
      expect(params).toEqual(['An Thới', 'free']);
    });

    it('count không có LIMIT/OFFSET (đếm toàn bộ tập đã lọc, không chỉ trang hiện tại)', async () => {
      ds.query.mockResolvedValue([{ c: 12 }]);

      await sut.countAttractions();

      expect(sql(ds.query.mock.calls[0][0])).not.toContain('LIMIT');
    });

    it('không có dòng nào → 0 (không NaN/undefined)', async () => {
      ds.query.mockResolvedValue([]);
      await expect(sut.countAttractions()).resolves.toBe(0);
    });
  });
});
