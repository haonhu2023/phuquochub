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
