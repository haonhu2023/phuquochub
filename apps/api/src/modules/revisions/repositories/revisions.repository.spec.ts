import { RevisionsRepository } from './revisions.repository';
import { RevisionEntityType, RevisionOrigin, RevisionStatus } from '../revision.enums';
import type { EntityManager, Repository } from 'typeorm';
import type { WikiRevision } from '../entities/wiki-revision.entity';

describe('RevisionsRepository.record — optional EntityManager (ADR-020 §5 transactional participation)', () => {
  const input = {
    entityType: RevisionEntityType.PLACE_TRANSLATION,
    entityId: 'row-1',
    snapshot: { translatedText: 'x' },
    origin: RevisionOrigin.IMPORT,
    status: RevisionStatus.APPROVED,
  };
  const queryResult = [{ id: 'rev-1', revision_number: 1 }];

  it('uses the module-scoped repository manager when no manager is passed (existing behavior unchanged)', async () => {
    const query = jest.fn().mockResolvedValue(queryResult);
    const repo = { manager: { query }, query } as unknown as Repository<WikiRevision>;
    const revisionsRepo = new RevisionsRepository(repo);

    const result = await revisionsRepo.record(input);

    expect(query).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'rev-1', revisionNumber: 1 });
  });

  it('runs the INSERT through the passed manager, not the module-scoped repository, when a manager IS given', async () => {
    const defaultQuery = jest.fn().mockResolvedValue(queryResult);
    const repo = { manager: { query: defaultQuery }, query: defaultQuery } as unknown as Repository<WikiRevision>;
    const revisionsRepo = new RevisionsRepository(repo);

    const txQuery = jest.fn().mockResolvedValue(queryResult);
    const manager = { query: txQuery } as unknown as EntityManager;

    const result = await revisionsRepo.record(input, manager);

    expect(txQuery).toHaveBeenCalledTimes(1);
    expect(defaultQuery).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'rev-1', revisionNumber: 1 });
  });
});

describe('RevisionsRepository.markApproved / findByIdForEntity — content_owner draft/publish (2026-09-16)', () => {
  function makeRepo(queryImpl: jest.Mock, findOneImpl?: jest.Mock) {
    return { query: queryImpl, findOne: findOneImpl ?? jest.fn() } as unknown as Repository<WikiRevision>;
  }

  describe('findByIdForEntity', () => {
    it('khoá CẢ id LẪN entityType/entityId — publishDraft() không thể áp nhầm revision của entity khác', async () => {
      const findOne = jest.fn().mockResolvedValue({ id: 'r1', status: RevisionStatus.PENDING });
      const repo = makeRepo(jest.fn(), findOne);
      const sut = new RevisionsRepository(repo);

      const res = await sut.findByIdForEntity('r1', RevisionEntityType.PLACE, 'p1');

      expect(findOne).toHaveBeenCalledWith({
        where: { id: 'r1', entityType: RevisionEntityType.PLACE, entityId: 'p1' },
      });
      expect(res).toEqual({ id: 'r1', status: RevisionStatus.PENDING });
    });
  });

  describe('markApproved', () => {
    // BUG THẬT đã xảy ra (phát hiện qua e2e trên Postgres thật, 2026-09-16): TypeORM's
    // Repository.query() trả về TUPLE `[rows, affectedCount]` cho UPDATE...RETURNING — mock ở đây
    // CỐ Ý mô phỏng đúng hình dạng đó, không phải mảng rows phẳng, để test này thật sự bắt được
    // lỗi nếu implementation đọc nhầm `result.length` thay vì `result[0].length`.
    it('UPDATE khớp 1 dòng (tuple đúng hình dạng thật [rows, count]) -> true, RETURNING id', async () => {
      const query = jest.fn().mockResolvedValue([[{ id: 'r1' }], 1]);
      const sut = new RevisionsRepository(makeRepo(query));

      const result = await sut.markApproved('r1', 'u1');

      expect(result).toBe(true);
      const [sqlText, params] = query.mock.calls[0];
      expect(sqlText).toContain(`UPDATE wiki_revisions SET status = 'approved'::revision_status`);
      expect(sqlText).toContain(`WHERE id = $1 AND status = 'pending'::revision_status`);
      expect(sqlText).toContain('RETURNING id');
      expect(params).toEqual(['r1', 'u1']);
    });

    it('UPDATE khớp 0 dòng (đã approved/rejected từ trước, tuple [[], 0]) -> false, KHÔNG throw', async () => {
      const query = jest.fn().mockResolvedValue([[], 0]);
      const sut = new RevisionsRepository(makeRepo(query));

      await expect(sut.markApproved('r1', 'u1')).resolves.toBe(false);
    });
  });
});
