import { DataSource } from 'typeorm';
import { AmenitiesRepository } from './amenities.repository';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('AmenitiesRepository', () => {
  let ds: LooseMock<DataSource>;
  let sut: AmenitiesRepository;

  beforeEach(() => {
    ds = createMock<DataSource>({ query: jest.fn() });
    sut = new AmenitiesRepository(ds);
  });

  describe('listAll', () => {
    it('không group → tất cả, order theo group rồi code', async () => {
      ds.query.mockResolvedValue([]);
      await sut.listAll();
      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain('ORDER BY "group", code');
      expect(params).toBeUndefined();
    });

    it('có group → WHERE tham số hoá', async () => {
      ds.query.mockResolvedValue([]);
      await sut.listAll('facility');
      const [query, params] = ds.query.mock.calls[0];
      expect(sql(query)).toContain('WHERE "group" = $1');
      expect(params).toEqual(['facility']);
    });
  });

  // CAS thật (2026-09-30) — `setForPlace` giờ khoá + tăng `places.content_version` TRONG CÙNG
  // transaction với DELETE/INSERT (xem ghi chú đầy đủ ở method). Mã không hợp lệ vẫn được kiểm
  // TRƯỚC khi mở transaction (đọc-only, an toàn tách rời) để không burn version bump vô ích.
  describe('setForPlace', () => {
    function mockTransaction(casRow: unknown[] = [{ content_version: 2 }]) {
      const managerQuery = jest.fn().mockResolvedValueOnce(casRow).mockResolvedValue(undefined);
      (ds as unknown as { transaction: jest.Mock }).transaction = jest
        .fn()
        .mockImplementation((cb: (m: { query: typeof managerQuery }) => Promise<unknown>) => cb({ query: managerQuery }));
      return managerQuery;
    }

    it('mã hợp lệ, version khớp → xoá rồi chèn lại trong transaction, trả newVersion', async () => {
      ds.query.mockResolvedValueOnce([{ id: 'a1', code: 'wifi' }]);
      const managerQuery = mockTransaction();

      const res = await sut.setForPlace('p1', ['wifi'], 1);

      expect(res).toEqual({ invalidCodes: [], conflict: false, newVersion: 2 });
      expect(managerQuery).toHaveBeenCalledWith('DELETE FROM place_amenities WHERE place_id = $1', ['p1']);
      expect(managerQuery).toHaveBeenCalledWith('INSERT INTO place_amenities (place_id, amenity_id) VALUES ($1, $2)', [
        'p1',
        'a1',
      ]);
    });

    it('mã không tồn tại → trả invalidCodes, không mở transaction (không burn version bump)', async () => {
      ds.query.mockResolvedValueOnce([]);
      const transaction = jest.fn();
      (ds as unknown as { transaction: jest.Mock }).transaction = transaction;

      const res = await sut.setForPlace('p1', ['khong_ton_tai'], 1);

      expect(res).toEqual({ invalidCodes: ['khong_ton_tai'], conflict: false });
      expect(transaction).not.toHaveBeenCalled();
    });

    it('mảng rỗng → chỉ xoá trong transaction, không tra amenities', async () => {
      const managerQuery = mockTransaction();
      const res = await sut.setForPlace('p1', [], 1);
      expect(res).toEqual({ invalidCodes: [], conflict: false, newVersion: 2 });
      expect(managerQuery).toHaveBeenCalledWith('DELETE FROM place_amenities WHERE place_id = $1', ['p1']);
    });

    it('version không khớp → conflict:true, không đụng place_amenities', async () => {
      ds.query.mockResolvedValueOnce([{ id: 'a1', code: 'wifi' }]);
      const managerQuery = mockTransaction([]);

      const res = await sut.setForPlace('p1', ['wifi'], 1);

      expect(res).toEqual({ invalidCodes: [], conflict: true });
      expect(managerQuery).toHaveBeenCalledTimes(1); // chỉ CAS UPDATE
    });
  });
});
