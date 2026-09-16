import type { Repository } from 'typeorm';
import { PricesRepository } from './prices.repository';
import { PriceHistory } from '../entities/price-history.entity';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('PricesRepository', () => {
  let repo: LooseMock<Repository<PriceHistory>>;
  let sut: PricesRepository;

  beforeEach(() => {
    repo = createMock<Repository<PriceHistory>>({
      query: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    });
    sut = new PricesRepository(repo);
  });

  describe('current', () => {
    it('lọc entity_type/entity_id/deleted_at + cửa sổ valid_from/valid_to, tham số hoá', async () => {
      repo.query.mockResolvedValue([]);

      await sut.current('place', 'p1');

      const [query, params] = repo.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('WHERE entity_type = $1 AND entity_id = $2 AND deleted_at IS NULL');
      expect(q).toContain('valid_from IS NULL OR valid_from <= now()');
      expect(q).toContain('valid_to IS NULL OR valid_to >= now()');
      expect(params).toEqual(['place', 'p1']);
    });

    it('DISTINCT ON (service_name), sắp theo service_name rồi created_at DESC (bản mới nhất mỗi dịch vụ)', async () => {
      repo.query.mockResolvedValue([]);
      await sut.current('place', 'p1');
      const q = sql(repo.query.mock.calls[0][0]);
      expect(q).toContain('DISTINCT ON (service_name)');
      expect(q).toContain('ORDER BY service_name, created_at DESC');
    });

    // Price trust gate (2026-08-28): trước đây `SELECT *` trả nguyên tên cột DB (snake_case),
    // khiến property camelCase (serviceName/isFree/validFrom/validTo/verificationStatus) luôn
    // `undefined` ở mọi nơi gọi — bug âm thầm vì JSON.stringify nuốt mất khoá `undefined`. Test
    // này khoá lại: SELECT PHẢI alias tường minh sang đúng property camelCase của PriceHistory.
    it('SELECT alias tường minh mọi cột sang camelCase — khớp property của PriceHistory entity', async () => {
      repo.query.mockResolvedValue([]);
      await sut.current('place', 'p1');
      const q = sql(repo.query.mock.calls[0][0]);
      expect(q).toContain('service_name AS "serviceName"');
      expect(q).toContain('is_free AS "isFree"');
      expect(q).toContain('valid_from AS "validFrom"');
      expect(q).toContain('valid_to AS "validTo"');
      expect(q).toContain('verification_status AS "verificationStatus"');
      expect(q).toContain('entity_type AS "entityType"');
      expect(q).toContain('entity_id AS "entityId"');
      expect(q).toContain('display_order AS "displayOrder"');
      expect(q).toContain('source_id AS "sourceId"');
      expect(q).toContain('verified_at AS "verifiedAt"');
      expect(q).toContain('updated_by AS "updatedBy"');
      expect(q).toContain('created_at AS "createdAt"');
      expect(q).toContain('updated_at AS "updatedAt"');
      expect(q).toContain('deleted_at AS "deletedAt"');
      // KHÔNG còn `SELECT *` — mọi cột phải được liệt kê tường minh.
      expect(q).not.toContain('SELECT DISTINCT ON (service_name) *');
    });

    it('không có dòng nào → mảng rỗng', async () => {
      repo.query.mockResolvedValue([]);
      await expect(sut.current('place', 'missing')).resolves.toEqual([]);
    });
  });

  describe('listByEntity', () => {
    it('lọc theo entityType/entityId/deletedAt IS NULL, sắp displayOrder ASC rồi createdAt DESC', async () => {
      repo.find.mockResolvedValue([]);
      await sut.listByEntity('place', 'p1');
      expect(repo.find).toHaveBeenCalledWith({
        where: { entityType: 'place', entityId: 'p1', deletedAt: expect.anything() },
        order: { displayOrder: 'ASC', createdAt: 'DESC' },
      });
    });
  });

  describe('findById', () => {
    it('lọc deletedAt IS NULL', async () => {
      repo.findOne.mockResolvedValue(null);
      await sut.findById('pr1');
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'pr1', deletedAt: expect.anything() } });
    });
  });
});

describe('PricesRepository.updateScalarsIfUnchanged — CAS (audit+conflict hardening, 2026-09-16; xmin 2026-09-17)', () => {
  let repo: LooseMock<Repository<PriceHistory>>;
  let sut: PricesRepository;

  beforeEach(() => {
    repo = createMock<Repository<PriceHistory>>({ query: jest.fn() });
    sut = new PricesRepository(repo);
  });

  // BUG THẬT đã xảy ra (phát hiện qua e2e trên Postgres thật, 2026-09-16): TypeORM's
  // Repository.query() trả về TUPLE `[rows, affectedCount]` cho UPDATE...RETURNING (khác
  // INSERT...RETURNING, trả rows trực tiếp) — mock ở đây CỐ Ý mô phỏng đúng hình dạng đó.
  it('patch rỗng -> true NGAY, không gọi query', async () => {
    await expect(sut.updateScalarsIfUnchanged('pr1', {}, '100')).resolves.toBe(true);
    expect(repo.query).not.toHaveBeenCalled();
  });

  it('UPDATE khớp 1 dòng (tuple đúng hình dạng thật) -> true, so sánh bằng xmin::text (không phải timestamp)', async () => {
    repo.query.mockResolvedValue([[{ id: 'pr1' }], 1]);
    const expectedVersion = '100';

    const result = await sut.updateScalarsIfUnchanged('pr1', { amount: '99000' }, expectedVersion);

    expect(result).toBe(true);
    const [query, params] = repo.query.mock.calls[0];
    expect(sql(query)).toContain('UPDATE price_history SET "amount" = $3, updated_at = now()');
    expect(sql(query)).toContain('xmin::text = $2');
    expect(sql(query)).not.toContain('date_trunc');
    expect(params).toEqual(['pr1', expectedVersion, '99000']);
  });

  it('UPDATE khớp 0 dòng (tuple [[], 0] — CAS thất bại thật) -> false, KHÔNG throw', async () => {
    repo.query.mockResolvedValue([[], 0]);
    await expect(sut.updateScalarsIfUnchanged('pr1', { amount: '1' }, '100')).resolves.toBe(false);
  });
});

describe('PricesRepository.getVersion (2026-09-17)', () => {
  let repo: LooseMock<Repository<PriceHistory>>;
  let sut: PricesRepository;

  beforeEach(() => {
    repo = createMock<Repository<PriceHistory>>({ query: jest.fn() });
    sut = new PricesRepository(repo);
  });

  it('SELECT xmin::text đúng id, trả version hoặc null nếu không có dòng', async () => {
    repo.query.mockResolvedValueOnce([{ version: '100' }]);
    await expect(sut.getVersion('pr1')).resolves.toBe('100');
    expect(sql(repo.query.mock.calls[0][0])).toContain('SELECT xmin::text AS version FROM price_history WHERE id = $1');

    repo.query.mockResolvedValueOnce([]);
    await expect(sut.getVersion('missing')).resolves.toBeNull();
  });
});
