import { DataSource } from 'typeorm';
import { BeachesRepository } from './beaches.repository';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

import type { MediaUrlService } from '../../../core/media-url/media-url.service';

// Chỉ dùng để dựng URL API của ảnh bìa đã upload (xem core/media-url/cover-image.ts).
const MEDIA_URL = { fileUrl: (id: string) => `https://api.test/api/media/${id}/file` } as MediaUrlService;

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('BeachesRepository — browse (ward/price_range filter, sort, pagination)', () => {
  let ds: LooseMock<DataSource>;
  let sut: BeachesRepository;

  beforeEach(() => {
    ds = createMock<DataSource>({ query: jest.fn() });
    sut = new BeachesRepository(ds, MEDIA_URL);
  });

  describe('listBeaches', () => {
    it('không filter → chỉ published/chưa xoá, ORDER BY rating_desc mặc định + id ASC', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listBeaches(20, 0);

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain("p.deleted_at IS NULL AND p.status = 'published'");
      expect(q).toContain('ORDER BY p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC');
      expect(q).toContain('LIMIT $1 OFFSET $2');
      expect(params).toEqual([20, 0]);
    });

    it('giới hạn đúng danh mục beach qua JOIN categories (không phải mọi Place)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listBeaches(20, 0);

      expect(sql(ds.query.mock.calls[0][0])).toContain(
        "FROM places p JOIN categories c ON c.id = p.category_id AND c.slug = 'beach'",
      );
    });

    it('ward → điều kiện tham số hoá, dịch LIMIT/OFFSET index', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listBeaches(10, 20, { ward: 'Gành Dầu' });

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('p.ward = $1');
      expect(q).toContain('LIMIT $2 OFFSET $3');
      expect(params).toEqual(['Gành Dầu', 10, 20]);
    });

    it('ward chứa ký tự SQL → vẫn là tham số bound, không nối chuỗi', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listBeaches(20, 0, { ward: "An Thới'; DROP TABLE places--" });

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).not.toContain('DROP TABLE');
      expect(params).toEqual(["An Thới'; DROP TABLE places--", 20, 0]);
    });

    it('price_range → p.price_range tham số hoá', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listBeaches(20, 0, { priceRange: 'free' as never });

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain('p.price_range = $1');
      expect(params).toEqual(['free', 20, 0]);
    });

    it('cả ward và price_range → đúng thứ tự tham số', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listBeaches(5, 10, { ward: 'An Thới', priceRange: 'free' as never });

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('p.ward = $1');
      expect(q).toContain('p.price_range = $2');
      expect(q).toContain('LIMIT $3 OFFSET $4');
      expect(params).toEqual(['An Thới', 'free', 5, 10]);
    });

    it('sort=name_asc → ORDER BY name + id ASC (tie-break xác định)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listBeaches(20, 0, { sort: 'name_asc' });

      expect(sql(ds.query.mock.calls[0][0])).toContain('ORDER BY p.name ASC, p.id ASC');
    });

    it('sort=newest → ORDER BY created_at DESC + id ASC', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listBeaches(20, 0, { sort: 'newest' });

      expect(sql(ds.query.mock.calls[0][0])).toContain('ORDER BY p.created_at DESC, p.id ASC');
    });

    it('offset tính theo trang: trang 2 × 5/trang → OFFSET 5', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listBeaches(5, 5);

      expect(ds.query.mock.calls[0][1]).toEqual([5, 5]);
    });

    it('SELECT có cover_image_url + ward/price_range/verification_status, một query duy nhất (không N+1)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listBeaches(20, 0);

      expect(ds.query).toHaveBeenCalledTimes(1);
      const q = sql(ds.query.mock.calls[0][0]);
      // Ảnh bìa dùng mảnh SQL CHUNG (core/media-url/cover-image.ts). Ghim các vị từ BẢO MẬT ngay
      // tại truy vấn này thay vì chép nguyên chuỗi: chỉ ảnh đã duyệt, thuộc đúng cơ sở, chưa xoá
      // mềm mới ra được ảnh bìa; kèm cột id để tầng ứng dụng dựng URL API cho ảnh đã upload.
      expect(q).toContain('AS cover_image_url');
      expect(q).toContain('AS cover_image_media_id');
      expect(q).toContain("m.status = 'published'");
      expect(q).toContain('m.place_id = p.id');
      expect(q).toContain('m.deleted_at IS NULL');
      expect(q).toContain('p.short_description, p.price_range, p.ward');
      expect(q).toContain('p.rating_avg, p.rating_count, p.verification_status');
    });

    it('JOIN categories là N:1 trên khoá chính ⇒ không cần DISTINCT (không nhân dòng)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listBeaches(20, 0);

      expect(sql(ds.query.mock.calls[0][0])).not.toContain('DISTINCT');
    });
  });

  describe('countBeaches', () => {
    it('không filter → đếm mọi beach published, không tham số lọc', async () => {
      ds.query.mockResolvedValue([{ c: 10 }]);

      await expect(sut.countBeaches()).resolves.toBe(10);

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain("c.slug = 'beach'");
      expect(sql(query)).not.toContain('p.ward =');
      expect(params).toEqual([]);
    });

    it('cùng bộ lọc như listBeaches (tổng khớp trang đang hiển thị)', async () => {
      ds.query.mockResolvedValue([{ c: 3 }]);

      await sut.countBeaches({ ward: 'Gành Dầu', priceRange: 'free' as never });

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('p.ward = $1');
      expect(q).toContain('p.price_range = $2');
      expect(params).toEqual(['Gành Dầu', 'free']);
    });

    it('count không có LIMIT/OFFSET (đếm toàn bộ tập đã lọc, không chỉ trang hiện tại)', async () => {
      ds.query.mockResolvedValue([{ c: 10 }]);

      await sut.countBeaches();

      expect(sql(ds.query.mock.calls[0][0])).not.toContain('LIMIT');
    });

    it('không có dòng nào → 0 (không NaN/undefined)', async () => {
      ds.query.mockResolvedValue([]);
      await expect(sut.countBeaches()).resolves.toBe(0);
    });
  });
});
