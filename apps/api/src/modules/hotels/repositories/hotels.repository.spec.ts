import { DataSource } from 'typeorm';
import { HotelsRepository } from './hotels.repository';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

import type { MediaUrlService } from '../../../core/media-url/media-url.service';

// Chỉ dùng để dựng URL API của ảnh bìa đã upload (xem core/media-url/cover-image.ts).
const MEDIA_URL = { fileUrl: (id: string) => `https://api.test/api/media/${id}/file` } as MediaUrlService;

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('HotelsRepository — browse (stars filter, sort, pagination)', () => {
  let ds: LooseMock<DataSource>;
  let sut: HotelsRepository;

  beforeEach(() => {
    ds = createMock<DataSource>({ query: jest.fn() });
    sut = new HotelsRepository(ds, MEDIA_URL);
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

  // Bug thật đã sửa (2026-09-30): bản cũ dùng UPSERT tĩnh + COALESCE, xoá mất sự phân biệt
  // "không gửi field" / "gửi field=null" TRƯỚC KHI tới SQL (cả hai cùng thành tham số NULL). Bản
  // mới đọc-sửa-ghi trong transaction, chỉ đưa vào SET/INSERT đúng những cột THỰC SỰ có mặt trong
  // DTO (`!== undefined`) — proof thật trên Postgres nằm ở
  // test/hotel-details-patch-semantics.e2e-spec.ts; các test dưới đây chỉ khoá lại hành vi ở mức
  // đơn vị (mock transaction) để bắt regression nhanh.
  describe('upsertDetails', () => {
    // CAS thật (2026-09-30): câu đầu tiên MỌI transaction giờ là
    // `UPDATE places SET content_version = content_version + 1 WHERE ... RETURNING content_version`
    // — phải resolve khớp version trước khi SELECT FOR UPDATE trên satellite table chạy. `query()`
    // trả TUPLE `[rows, affectedCount]` cho UPDATE...RETURNING (bug thật đã sửa 2026-09-30, xem
    // repository's ghi chú) — mock phải mô phỏng ĐÚNG hình dạng đó, không phải mảng rows trần.
    function mockTransaction(selectResult: unknown[], casRow: unknown[] = [{ content_version: 2 }]) {
      const managerQuery = jest
        .fn()
        .mockResolvedValueOnce([casRow, casRow.length])
        .mockResolvedValueOnce(selectResult)
        .mockResolvedValue(undefined);
      (ds as unknown as { transaction: jest.Mock }).transaction = jest
        .fn()
        .mockImplementation((cb: (m: { query: typeof managerQuery }) => Promise<unknown>) => cb({ query: managerQuery }));
      return managerQuery;
    }

    it('CAS không khớp version -> conflict:true, không chạm satellite table', async () => {
      const managerQuery = mockTransaction([], []);

      const result = await sut.upsertDetails('p1', { hotel_type: 'resort' } as never, 1);

      expect(result).toEqual({ conflict: true });
      expect(managerQuery).toHaveBeenCalledTimes(1); // chỉ CAS UPDATE, không SELECT/INSERT/UPDATE nào khác
    });

    it('chưa có hàng, PATCH chỉ hotel_type -> INSERT chỉ với cột hotel_type (không tự bịa NULL cho các cột khác)', async () => {
      const managerQuery = mockTransaction([]);

      const result = await sut.upsertDetails('p1', { hotel_type: 'resort' } as never, 1);

      const insertCall = managerQuery.mock.calls[2];
      expect(sql(insertCall[0])).toBe('INSERT INTO "place_hotel_details" ("place_id", "hotel_type") VALUES ($1, $2)');
      expect(insertCall[1]).toEqual(['p1', 'resort']);
      expect(result).toEqual({ conflict: false, newVersion: 2 });
    });

    it('đã có hàng, PATCH chỉ hotel_type -> UPDATE chỉ đụng cột hotel_type, KHÔNG đụng star_rating/check_in/check_out', async () => {
      const managerQuery = mockTransaction([
        { hotel_type: 'hotel', star_rating: 4, star_rating_source_id: null },
      ]);

      await sut.upsertDetails('p1', { hotel_type: 'villa' } as never, 1);

      const updateCall = managerQuery.mock.calls[2];
      expect(sql(updateCall[0])).toBe('UPDATE "place_hotel_details" SET "hotel_type" = $2 WHERE place_id = $1');
      expect(updateCall[1]).toEqual(['p1', 'villa']);
    });

    it('PATCH check_in=null (xoá tường minh) -> UPDATE ghi NULL cho đúng cột đó, không đụng cột khác', async () => {
      const managerQuery = mockTransaction([{ hotel_type: 'hotel', star_rating: null, star_rating_source_id: null }]);

      await sut.upsertDetails('p1', { hotel_type: 'hotel', check_in: null } as never, 1);

      const updateCall = managerQuery.mock.calls[2];
      expect(sql(updateCall[0])).toBe('UPDATE "place_hotel_details" SET "hotel_type" = $2, "check_in" = $3 WHERE place_id = $1');
      expect(updateCall[1]).toEqual(['p1', 'hotel', null]);
    });

    it('star_rating đổi giá trị KHÔNG kèm source mới -> xoá source_id/verified_at cũ (nhất quán giá trị-nguồn)', async () => {
      const managerQuery = mockTransaction([{ hotel_type: 'hotel', star_rating: 4, star_rating_source_id: 'old-src' }]);

      await sut.upsertDetails('p1', { hotel_type: 'hotel', star_rating: 5 } as never, 1);

      const updateCall = managerQuery.mock.calls[2];
      const [sql_, params] = updateCall;
      expect(sql(sql_)).toContain('"star_rating" = $');
      expect(sql(sql_)).toContain('"star_rating_source_id" = $');
      expect(sql(sql_)).toContain('"star_rating_verified_at" = $');
      const starRatingIdx = params.indexOf(5);
      expect(starRatingIdx).toBeGreaterThan(0);
      expect(params).toContain(null); // source_id và verified_at cùng bị xoá về null
    });

    it('star_rating đổi giá trị KÈM source mới -> ghi source mới + verified_at (Date)', async () => {
      const managerQuery = mockTransaction([{ hotel_type: 'hotel', star_rating: 4, star_rating_source_id: null }]);

      await sut.upsertDetails('p1', { hotel_type: 'hotel', star_rating: 5, star_rating_source_id: 'new-src' } as never, 1);

      const [, params] = managerQuery.mock.calls[2];
      expect(params).toContain('new-src');
      expect(params.some((p: unknown) => p instanceof Date)).toBe(true);
    });

    it('star_rating KHÔNG đổi và source KHÔNG được nhắc tới -> không đụng 3 cột star_rating*', async () => {
      const managerQuery = mockTransaction([{ hotel_type: 'hotel', star_rating: 4, star_rating_source_id: 'src-1' }]);

      await sut.upsertDetails('p1', { hotel_type: 'villa' } as never, 1);

      const [updateSql] = managerQuery.mock.calls[2];
      expect(sql(updateSql)).not.toContain('star_rating');
    });

    it('patch rỗng thật sự (không có key hợp lệ nào ngoài lookup) -> không UPDATE/INSERT gì, nhưng version vẫn tăng (CAS bump luôn xảy ra khi version khớp)', async () => {
      const managerQuery = mockTransaction([{ hotel_type: 'hotel', star_rating: 4, star_rating_source_id: null }]);

      const result = await sut.upsertDetails('p1', {} as never, 1);

      expect(managerQuery).toHaveBeenCalledTimes(2); // CAS UPDATE + SELECT FOR UPDATE, không có lệnh ghi nào khác
      expect(result).toEqual({ conflict: false, newVersion: 2 });
    });
  });
});
