import { DataSource } from 'typeorm';
import { ToursRepository } from './tours.repository';
import { TourDifficultyDto, TourTypeDto } from '../dto/tours.dto';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('ToursRepository — browse (filter, sort, pagination)', () => {
  let ds: LooseMock<DataSource>;
  let sut: ToursRepository;

  beforeEach(() => {
    ds = createMock<DataSource>({ query: jest.fn() });
    sut = new ToursRepository(ds);
  });

  describe('listTours', () => {
    it('không filter → WHERE chỉ published/chưa xoá, ORDER BY rating_desc mặc định + id ASC', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTours(20, 0);

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain("p.deleted_at IS NULL AND p.status = 'published'");
      expect(q).toContain('ORDER BY p.rating_avg DESC NULLS LAST, p.created_at DESC, p.id ASC');
      expect(q).toContain('LIMIT $1 OFFSET $2');
      expect(params).toEqual([20, 0]);
    });

    it('type → điều kiện tham số hoá trên td.tour_type, dịch LIMIT/OFFSET index', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTours(10, 20, { type: TourTypeDto.DIVING });

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('td.tour_type = $1');
      expect(q).toContain('LIMIT $2 OFFSET $3');
      expect(params).toEqual(['diving', 10, 20]);
    });

    it('difficulty → td.difficulty tham số hoá', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTours(20, 0, { difficulty: TourDifficultyDto.EASY });

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain('td.difficulty = $1');
      expect(params).toEqual(['easy', 20, 0]);
    });

    it('priceRange → p.price_range tham số hoá', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTours(20, 0, { priceRange: 'mid' as never });

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain('p.price_range = $1');
      expect(params).toEqual(['mid', 20, 0]);
    });

    it('maxDurationMinutes → so sánh <=, loại tour chưa khai thời lượng (IS NOT NULL)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTours(20, 0, { maxDurationMinutes: 240 });

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain('td.duration_minutes IS NOT NULL AND td.duration_minutes <= $1');
      expect(params).toEqual([240, 20, 0]);
    });

    it('departureArea → khớp p.ward tham số hoá (không nối chuỗi)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTours(20, 0, { departureArea: "An Thới'; DROP TABLE places--" });

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain('p.ward = $1');
      expect(sql(query)).not.toContain('DROP TABLE');
      expect(params).toEqual(["An Thới'; DROP TABLE places--", 20, 0]);
    });

    it('nhiều filter cùng lúc → đúng thứ tự tham số, LIMIT/OFFSET dịch theo', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTours(5, 10, {
        type: TourTypeDto.CRUISE,
        difficulty: TourDifficultyDto.MODERATE,
        priceRange: 'high' as never,
        maxDurationMinutes: 480,
        departureArea: 'Dương Tơ',
      });

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('td.tour_type = $1');
      expect(q).toContain('td.difficulty = $2');
      expect(q).toContain('p.price_range = $3');
      expect(q).toContain('td.duration_minutes <= $4');
      expect(q).toContain('p.ward = $5');
      expect(q).toContain('LIMIT $6 OFFSET $7');
      expect(params).toEqual(['cruise', 'moderate', 'high', 480, 'Dương Tơ', 5, 10]);
    });

    it('sort=name_asc → ORDER BY name + id ASC (tie-break xác định)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTours(20, 0, { sort: 'name_asc' });

      expect(sql(ds.query.mock.calls[0][0])).toContain('ORDER BY p.name ASC, p.id ASC');
    });

    it('sort=duration_asc → duration NULLS LAST + id ASC (tour chưa khai thời lượng xuống cuối)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTours(20, 0, { sort: 'duration_asc' });

      expect(sql(ds.query.mock.calls[0][0])).toContain(
        'ORDER BY td.duration_minutes ASC NULLS LAST, p.id ASC',
      );
    });

    it('SELECT có cover_image_url + price_range/ward + trường tour, không N+1 (một query duy nhất)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTours(20, 0);

      expect(ds.query).toHaveBeenCalledTimes(1);
      const q = sql(ds.query.mock.calls[0][0]);
      expect(q).toContain('AS cover_image_url');
      expect(q).toContain('p.price_range, p.ward');
      expect(q).toContain('td.tour_type, td.duration_minutes, td.difficulty');
    });

    it('ảnh bìa lấy qua subquery lọc media chưa xoá (không JOIN nhân dòng)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTours(20, 0);

      expect(sql(ds.query.mock.calls[0][0])).toContain(
        '(SELECT m.url FROM media m WHERE m.id = p.cover_image_id AND m.deleted_at IS NULL) AS cover_image_url',
      );
    });
  });

  describe('countTours', () => {
    it('không filter → đếm tất cả published, không tham số lọc', async () => {
      ds.query.mockResolvedValue([{ c: 3 }]);

      await expect(sut.countTours()).resolves.toBe(3);

      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).not.toContain('tour_type =');
      expect(params).toEqual([]);
    });

    it('cùng bộ lọc như listTours (tổng khớp với trang đang hiển thị)', async () => {
      ds.query.mockResolvedValue([{ c: 1 }]);

      await sut.countTours({ type: TourTypeDto.TREKKING, departureArea: 'An Thới' });

      const [query, params] = ds.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('td.tour_type = $1');
      expect(q).toContain('p.ward = $2');
      expect(params).toEqual(['trekking', 'An Thới']);
    });

    it('không có dòng nào → 0 (không NaN/undefined)', async () => {
      ds.query.mockResolvedValue([]);
      await expect(sut.countTours()).resolves.toBe(0);
    });
  });
});
