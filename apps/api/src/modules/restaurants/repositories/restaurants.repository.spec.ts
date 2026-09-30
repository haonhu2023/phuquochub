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

    // Public Beta price trust gate (2026-08-28): RestaurantCard cần verification_status để web
    // quyết định có được hiện price_range thật hay không (canDisplayPrice, apps/web/.../trust.ts).
    it('SELECT có p.verification_status (cần cho price trust gate ở web)', async () => {
      ds.query.mockResolvedValue([]);
      await sut.listRestaurants(20, 0);
      expect(sql(ds.query.mock.calls[0][0])).toContain('p.verification_status');
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

  // Bug thật đã sửa (2026-09-30): bản cũ dùng `?? null` rồi CASE WHEN $3::jsonb IS NOT NULL — omit
  // và "gửi dietary=null để xoá" cùng thành NULL, không thể xoá dietary một khi đã set. Bản mới
  // đọc-sửa-ghi trong transaction, chỉ đụng cột THỰC SỰ có mặt trong DTO (`!== undefined`).
  describe('upsertDetails', () => {
    // CAS thật (2026-09-30): câu đầu tiên trong transaction giờ là CAS UPDATE trên `places` — xem
    // HotelsRepository.upsertDetails's ghi chú đầy đủ, cùng khuôn.
    function mockTransaction(existsRows: unknown[], casRow: unknown[] = [{ content_version: 2 }]) {
      const managerQuery = jest
        .fn()
        .mockResolvedValueOnce(casRow)
        .mockResolvedValueOnce(existsRows)
        .mockResolvedValue(undefined);
      (ds as unknown as { transaction: jest.Mock }).transaction = jest
        .fn()
        .mockImplementation((cb: (m: { query: typeof managerQuery }) => Promise<unknown>) => cb({ query: managerQuery }));
      return managerQuery;
    }

    it('CAS không khớp version -> conflict:true, không chạm place_restaurant_details', async () => {
      const managerQuery = mockTransaction([], []);

      const result = await sut.upsertDetails('p1', { is_local_specialty: true }, 1);

      expect(result).toEqual({ conflict: true });
      expect(managerQuery).toHaveBeenCalledTimes(1);
    });

    it('chưa có hàng, PATCH is_local_specialty+dietary -> INSERT cả hai, cùng place_id', async () => {
      const managerQuery = mockTransaction([]);

      const result = await sut.upsertDetails('p1', { is_local_specialty: true, dietary: { vegetarian: true } }, 1);

      const insertCall = managerQuery.mock.calls[2];
      expect(sql(insertCall[0])).toBe(
        'INSERT INTO "place_restaurant_details" ("place_id", "is_local_specialty", "dietary") VALUES ($1, $2, $3)',
      );
      expect(insertCall[1]).toEqual(['p1', true, JSON.stringify({ vegetarian: true })]);
      expect(result).toEqual({ conflict: false, newVersion: 2 });
    });

    it('chưa có hàng, không gửi is_local_specialty -> INSERT tự điền false (khớp DEFAULT DB)', async () => {
      const managerQuery = mockTransaction([]);

      await sut.upsertDetails('p1', { dietary: { vegan: true } }, 1);

      const insertCall = managerQuery.mock.calls[2];
      expect(insertCall[1]).toEqual(['p1', false, JSON.stringify({ vegan: true })]);
    });

    it('đã có hàng, PATCH chỉ is_local_specialty -> UPDATE chỉ đụng cột đó, KHÔNG đụng dietary', async () => {
      const managerQuery = mockTransaction([{ '?column?': 1 }]);

      await sut.upsertDetails('p1', { is_local_specialty: true }, 1);

      const updateCall = managerQuery.mock.calls[2];
      expect(sql(updateCall[0])).toBe('UPDATE "place_restaurant_details" SET "is_local_specialty" = $2 WHERE place_id = $1');
      expect(updateCall[1]).toEqual(['p1', true]);
    });

    it('PATCH dietary=null (xoá tường minh) -> UPDATE ghi NULL cho dietary, không đụng is_local_specialty', async () => {
      const managerQuery = mockTransaction([{ '?column?': 1 }]);

      await sut.upsertDetails('p1', { dietary: null }, 1);

      const updateCall = managerQuery.mock.calls[2];
      expect(sql(updateCall[0])).toBe('UPDATE "place_restaurant_details" SET "dietary" = $2 WHERE place_id = $1');
      expect(updateCall[1]).toEqual(['p1', null]);
    });

    it('đã có hàng, không gửi field nào -> không UPDATE gì (giữ nguyên toàn bộ), version vẫn tăng', async () => {
      const managerQuery = mockTransaction([{ '?column?': 1 }]);

      const result = await sut.upsertDetails('p1', {}, 1);

      expect(managerQuery).toHaveBeenCalledTimes(2); // CAS UPDATE + SELECT FOR UPDATE
      expect(result).toEqual({ conflict: false, newVersion: 2 });
    });

    // Bug thật tìm thấy khi làm CAS (2026-09-30): bản cũ gọi upsertDetails() rồi setCuisines() ở
    // HAI transaction riêng — mã cuisine không hợp lệ bị từ chối SAU KHI is_local_specialty/dietary
    // đã commit. Giờ cuisine_codes nằm TRONG CÙNG transaction, mã không hợp lệ rollback toàn bộ.
    it('cuisine_codes có mặt -> thay toàn bộ gán cuisine TRONG CÙNG transaction với patch scalar', async () => {
      const managerQuery = mockTransaction([{ '?column?': 1 }]);
      // mockTransaction() ở trên đã xếp sẵn call #1 (CAS) + #2 (SELECT FOR UPDATE); ba dòng dưới
      // xếp tiếp #3 (UPDATE scalar patch) + #4 (SELECT cuisines lookup) + #5/#6 (DELETE/INSERT).
      managerQuery.mockResolvedValueOnce(undefined); // #3 UPDATE scalar patch
      managerQuery.mockResolvedValueOnce([{ id: 'c1', code: 'seafood' }]); // #4 SELECT cuisines lookup
      managerQuery.mockResolvedValueOnce(undefined); // #5 DELETE place_cuisines
      managerQuery.mockResolvedValueOnce(undefined); // #6 INSERT place_cuisines

      const result = await sut.upsertDetails('p1', { is_local_specialty: true, cuisine_codes: ['seafood'] }, 1);

      expect(managerQuery).toHaveBeenCalledWith('DELETE FROM place_cuisines WHERE place_id = $1', ['p1']);
      expect(managerQuery).toHaveBeenCalledWith('INSERT INTO place_cuisines (place_id, cuisine_id) VALUES ($1, $2)', ['p1', 'c1']);
      expect(result).toEqual({ conflict: false, newVersion: 2 });
    });

    it('cuisine_codes chứa mã không tồn tại -> ném BadRequestException, transaction rollback (không audit version bump ở tầng gọi)', async () => {
      const managerQuery = mockTransaction([{ '?column?': 1 }]);
      managerQuery.mockResolvedValueOnce(undefined); // #3 UPDATE scalar patch
      managerQuery.mockResolvedValueOnce([]); // #4 SELECT cuisines lookup — không tìm thấy mã nào

      await expect(sut.upsertDetails('p1', { is_local_specialty: true, cuisine_codes: ['khong_ton_tai'] }, 1)).rejects.toThrow(
        /khong_ton_tai/,
      );
    });
  });

  describe('setCuisines', () => {
    it('mã hợp lệ → xoá gán cũ rồi chèn lại trong transaction, trả invalidCodes rỗng', async () => {
      ds.query.mockResolvedValueOnce([{ id: 'c1', code: 'seafood' }]);
      const managerQuery = jest.fn().mockResolvedValue(undefined);
      (ds as unknown as { transaction: jest.Mock }).transaction = jest
        .fn()
        .mockImplementation((cb: (m: { query: typeof managerQuery }) => Promise<void>) => cb({ query: managerQuery }));

      const res = await sut.setCuisines('p1', ['seafood']);

      expect(res).toEqual({ invalidCodes: [] });
      expect(managerQuery).toHaveBeenCalledWith('DELETE FROM place_cuisines WHERE place_id = $1', ['p1']);
      expect(managerQuery).toHaveBeenCalledWith('INSERT INTO place_cuisines (place_id, cuisine_id) VALUES ($1, $2)', [
        'p1',
        'c1',
      ]);
    });

    it('mã không tồn tại → trả invalidCodes, KHÔNG chạm transaction (không âm thầm bỏ qua)', async () => {
      ds.query.mockResolvedValueOnce([]);
      const transaction = jest.fn();
      (ds as unknown as { transaction: jest.Mock }).transaction = transaction;

      const res = await sut.setCuisines('p1', ['khong_ton_tai']);

      expect(res).toEqual({ invalidCodes: ['khong_ton_tai'] });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('mảng rỗng → xoá toàn bộ gán, không cần tra cuisines', async () => {
      ds.query.mockResolvedValue(undefined);

      const res = await sut.setCuisines('p1', []);

      expect(res).toEqual({ invalidCodes: [] });
      expect(ds.query).toHaveBeenCalledWith('DELETE FROM place_cuisines WHERE place_id = $1', ['p1']);
    });
  });

  describe('listAllCuisines', () => {
    it('đọc toàn bộ từ điển cuisines, order theo code', async () => {
      ds.query.mockResolvedValue([{ id: 'c1', code: 'seafood', label_vi: 'Hải sản', label_en: 'Seafood' }]);

      const res = await sut.listAllCuisines();

      expect(sql(ds.query.mock.calls[0][0])).toBe('SELECT id, code, label_vi, label_en FROM cuisines ORDER BY code');
      expect(res).toEqual([{ id: 'c1', code: 'seafood', label_vi: 'Hải sản', label_en: 'Seafood' }]);
    });
  });
});
