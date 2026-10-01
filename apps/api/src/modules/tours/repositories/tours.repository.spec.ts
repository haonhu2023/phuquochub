import { DataSource } from 'typeorm';
import { ToursRepository } from './tours.repository';
import { TourDifficultyDto, TourTypeDto } from '../dto/tours.dto';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

import type { MediaUrlService } from '../../../core/media-url/media-url.service';

// Chỉ dùng để dựng URL API của ảnh bìa đã upload (xem core/media-url/cover-image.ts).
const MEDIA_URL = { fileUrl: (id: string) => `https://api.test/api/media/${id}/file` } as MediaUrlService;

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('ToursRepository — browse (filter, sort, pagination)', () => {
  let ds: LooseMock<DataSource>;
  let sut: ToursRepository;

  beforeEach(() => {
    ds = createMock<DataSource>({ query: jest.fn() });
    sut = new ToursRepository(ds, MEDIA_URL);
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
      expect(q).toContain('p.price_range, p.ward, p.verification_status');
      expect(q).toContain('td.tour_type, td.duration_minutes, td.difficulty');
    });

    // Public Beta price trust gate (2026-08-28): TourCard cần verification_status để web quyết
    // định có được hiện price_range thật hay không (canDisplayPrice, apps/web/.../trust.ts).
    it('SELECT có p.verification_status (cần cho price trust gate ở web)', async () => {
      ds.query.mockResolvedValue([]);
      await sut.listTours(20, 0);
      expect(sql(ds.query.mock.calls[0][0])).toContain('p.verification_status');
    });

    it('ảnh bìa lấy qua subquery lọc media chưa xoá (không JOIN nhân dòng)', async () => {
      ds.query.mockResolvedValue([]);

      await sut.listTours(20, 0);

      // Ảnh bìa dùng mảnh SQL CHUNG (core/media-url/cover-image.ts). Ghim các vị từ BẢO MẬT ngay
      // tại truy vấn này thay vì chép nguyên chuỗi: chỉ ảnh đã duyệt, thuộc đúng cơ sở, chưa xoá
      // mềm mới ra được ảnh bìa; kèm cột id để tầng ứng dụng dựng URL API cho ảnh đã upload.
      const coverQ = sql(ds.query.mock.calls[0][0]);
      expect(coverQ).toContain('AS cover_image_url');
      expect(coverQ).toContain('AS cover_image_media_id');
      expect(coverQ).toContain("m.status = 'published'");
      expect(coverQ).toContain('m.place_id = p.id');
      expect(coverQ).toContain('m.deleted_at IS NULL');
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

  // Bug thật đã sửa (2026-09-30): bản cũ dùng COALESCE trên tham số đã `?? null` hoá — omit và
  // "gửi null để xoá" cùng thành NULL, không thể xoá pickup_point/organizer_id/... một khi đã set.
  // Bản mới chỉ đưa vào SET clause đúng cột THỰC SỰ có mặt trong DTO.
  describe('updateDetails', () => {
    function mockTransaction() {
      const managerQuery = jest.fn().mockResolvedValueOnce([{ '?column?': 1 }]).mockResolvedValue(undefined);
      (ds as unknown as { transaction: jest.Mock }).transaction = jest
        .fn()
        .mockImplementation((cb: (m: { query: typeof managerQuery }) => Promise<void>) => cb({ query: managerQuery }));
      return managerQuery;
    }

    it('PATCH một trường -> UPDATE CHỈ đụng cột đó, không tự bịa NULL cho các cột khác', async () => {
      const managerQuery = mockTransaction();

      await sut.updateDetails('p1', { pickup_point: 'Cổng khách sạn' });

      const updateCall = managerQuery.mock.calls[1];
      expect(sql(updateCall[0])).toBe('UPDATE place_tour_details SET "pickup_point" = $2 WHERE place_id = $1');
      expect(updateCall[1]).toEqual(['p1', 'Cổng khách sạn']);
    });

    it('PATCH organizer_id=null (xoá tường minh) -> UPDATE ghi NULL cho đúng cột đó', async () => {
      const managerQuery = mockTransaction();

      await sut.updateDetails('p1', { organizer_id: null });

      const updateCall = managerQuery.mock.calls[1];
      expect(sql(updateCall[0])).toBe('UPDATE place_tour_details SET "organizer_id" = $2 WHERE place_id = $1');
      expect(updateCall[1]).toEqual(['p1', null]);
    });

    it('nhiều trường cùng lúc -> mỗi trường một cột trong SET, đúng thứ tự tham số', async () => {
      const managerQuery = mockTransaction();

      await sut.updateDetails('p1', { tour_type: 'diving', inclusions: 'Vé lặn' });

      const updateCall = managerQuery.mock.calls[1];
      expect(sql(updateCall[0])).toBe('UPDATE place_tour_details SET "tour_type" = $2, "inclusions" = $3 WHERE place_id = $1');
      expect(updateCall[1]).toEqual(['p1', 'diving', 'Vé lặn']);
    });

    it('patch rỗng thật sự -> không UPDATE gì', async () => {
      const managerQuery = mockTransaction();

      await sut.updateDetails('p1', {});

      expect(managerQuery).toHaveBeenCalledTimes(1); // chỉ SELECT FOR UPDATE
    });
  });

  describe('detail', () => {
    it('LEFT JOIN places cho organizer (đơn vị tổ chức)', async () => {
      ds.query.mockResolvedValue([]);
      await sut.detail('p1');
      const q = sql(ds.query.mock.calls[0][0]);
      expect(q).toContain('LEFT JOIN places op ON op.id = td.organizer_id');
      expect(q).toContain('td.pickup_point, td.inclusions, td.exclusions, td.cancellation_policy');
    });
  });

  describe('replaceStops', () => {
    it('xoá hết rồi chèn lại trong transaction, location NULL khi không có toạ độ', async () => {
      const managerQuery = jest.fn().mockResolvedValue(undefined);
      (ds as unknown as { transaction: jest.Mock }).transaction = jest
        .fn()
        .mockImplementation((cb: (m: { query: typeof managerQuery }) => Promise<void>) => cb({ query: managerQuery }));

      await sut.replaceStops('p1', [{ name: 'Cảng An Thới', time: '08:00' }]);

      expect(managerQuery).toHaveBeenCalledWith('DELETE FROM tour_stops WHERE place_id = $1', ['p1']);
      const insertCall = managerQuery.mock.calls.find(([q]) => sql(q).includes('INSERT INTO tour_stops'));
      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toEqual(['p1', 'Cảng An Thới', null, null, 0, '08:00', null]);
    });

    it('có toạ độ → ST_SetSRID(ST_MakePoint(lng,lat))', async () => {
      const managerQuery = jest.fn().mockResolvedValue(undefined);
      (ds as unknown as { transaction: jest.Mock }).transaction = jest
        .fn()
        .mockImplementation((cb: (m: { query: typeof managerQuery }) => Promise<void>) => cb({ query: managerQuery }));

      await sut.replaceStops('p1', [{ name: 'Điểm lặn', location: { lat: 10.05, lng: 104.0 } }]);

      const insertCall = managerQuery.mock.calls.find(([q]) => sql(q).includes('INSERT INTO tour_stops'));
      expect(sql(insertCall![0])).toContain('ST_SetSRID(ST_MakePoint($3,$4),4326)::geography');
      expect(insertCall![1]).toEqual(['p1', 'Điểm lặn', 104.0, 10.05, 0, null, null]);
    });
  });
});
