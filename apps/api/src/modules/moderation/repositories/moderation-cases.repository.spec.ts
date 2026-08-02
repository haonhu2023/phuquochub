import { EntityManager, In, Repository } from 'typeorm';
import { ModerationCasesRepository } from './moderation-cases.repository';
import { ModerationCase } from '../entities/moderation-case.entity';
import {
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationCaseStatus,
  ModerationDecision,
  ModerationTargetType,
} from '../moderation.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('ModerationCasesRepository', () => {
  let repo: LooseMock<Repository<ModerationCase>>;
  let sut: ModerationCasesRepository;

  beforeEach(() => {
    repo = createMock<Repository<ModerationCase>>({ findOne: jest.fn() });
    sut = new ModerationCasesRepository(repo);
  });

  describe('findById', () => {
    it('tra theo id', async () => {
      await sut.findById('c1');
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });
  });

  describe('findOpenCaseForTarget', () => {
    it('chỉ khớp status open/claimed (In), đúng target_type/target_id', async () => {
      await sut.findOpenCaseForTarget(ModerationTargetType.MEDIA, 'm1');
      expect(repo.findOne).toHaveBeenCalledWith({
        where: {
          targetType: ModerationTargetType.MEDIA,
          targetId: 'm1',
          status: In([ModerationCaseStatus.OPEN, ModerationCaseStatus.CLAIMED]),
        },
      });
    });
  });

  describe('createOpenCase', () => {
    it('INSERT có ON CONFLICT khớp đúng partial unique index (INV-3), trả về case khi chèn thành công', async () => {
      const manager = createMock<EntityManager>({
        query: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            target_type: 'media',
            target_id: 'm1',
            status: 'open',
            source: 'new_content',
            severity: 'normal',
            priority: 10,
            report_count: 0,
            assigned_to: null,
            claimed_at: null,
            decision: null,
            reason: null,
            resolved_by: null,
            resolved_at: null,
            ai_score: null,
            ai_labels: null,
            created_at: new Date('2026-08-02T00:00:00Z'),
            updated_at: new Date('2026-08-02T00:00:00Z'),
          },
        ]),
      });

      const result = await sut.createOpenCase(manager, {
        targetType: ModerationTargetType.MEDIA,
        targetId: 'm1',
        source: ModerationCaseSource.NEW_CONTENT,
        severity: ModerationCaseSeverity.NORMAL,
        priority: 10,
      });

      const [query, params] = manager.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('ON CONFLICT (target_type, target_id) WHERE status IN');
      expect(q).toContain("'open','claimed'");
      expect(q).toContain('DO NOTHING');
      expect(params).toEqual([ModerationTargetType.MEDIA, 'm1', ModerationCaseSource.NEW_CONTENT, ModerationCaseSeverity.NORMAL, 10]);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('c1');
      expect(result!.targetType).toBe(ModerationTargetType.MEDIA);
      expect(result!.status).toBe(ModerationCaseStatus.OPEN);
      expect(result!.severity).toBe(ModerationCaseSeverity.NORMAL);
      expect(result!.priority).toBe(10);
    });

    it('conflict (đã có case mở cho target) -> RETURNING không dòng nào -> trả về null, KHÔNG ném lỗi', async () => {
      const manager = createMock<EntityManager>({ query: jest.fn().mockResolvedValue([]) });

      const result = await sut.createOpenCase(manager, {
        targetType: ModerationTargetType.REVIEW,
        targetId: 'r1',
        source: ModerationCaseSource.REPORT,
        severity: ModerationCaseSeverity.NORMAL,
        priority: 10,
      });

      expect(result).toBeNull();
    });
  });

  // M2 — GET /moderation/cases. Mock query builder chainable, cùng khuôn kiểm thử QueryBuilder đã
  // dùng cho BookingsRepository.list() (mock từng method trả về `this` trừ getCount/getMany).
  describe('list', () => {
    function fakeQb(count: number, items: ModerationCase[]) {
      const calls: { andWhere: Array<[string, unknown]>; orderBy: Array<[string, string]> } = {
        andWhere: [],
        orderBy: [],
      };
      const qb: Record<string, jest.Mock> = {};
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest.fn((cond: string, params: unknown) => {
        calls.andWhere.push([cond, params]);
        return qb;
      });
      qb.orderBy = jest.fn((col: string, dir: string) => {
        calls.orderBy.push([col, dir]);
        return qb;
      });
      qb.addOrderBy = jest.fn((col: string, dir: string) => {
        calls.orderBy.push([col, dir]);
        return qb;
      });
      qb.skip = jest.fn().mockReturnValue(qb);
      qb.take = jest.fn().mockReturnValue(qb);
      qb.getCount = jest.fn().mockResolvedValue(count);
      qb.getMany = jest.fn().mockResolvedValue(items);
      return { qb, calls };
    }

    it('mặc định (không filter thêm) chỉ where theo statuses được truyền', async () => {
      const { qb, calls } = fakeQb(0, []);
      repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await sut.list({
        statuses: [ModerationCaseStatus.OPEN, ModerationCaseStatus.CLAIMED],
        limit: 20,
        offset: 0,
      });

      expect(qb.where).toHaveBeenCalledWith('c.status IN (:...statuses)', {
        statuses: [ModerationCaseStatus.OPEN, ModerationCaseStatus.CLAIMED],
      });
      expect(calls.andWhere).toHaveLength(0);
    });

    it('áp đủ 4 filter tuỳ chọn (target_type/source/severity/assigned_to) khi được truyền', async () => {
      const { qb, calls } = fakeQb(0, []);
      repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await sut.list({
        statuses: [ModerationCaseStatus.OPEN],
        targetType: ModerationTargetType.MEDIA,
        source: ModerationCaseSource.REPORT,
        severity: ModerationCaseSeverity.HIGH,
        assignedTo: 'mod-1',
        limit: 20,
        offset: 0,
      });

      expect(calls.andWhere).toEqual([
        ['c.targetType = :targetType', { targetType: ModerationTargetType.MEDIA }],
        ['c.source = :source', { source: ModerationCaseSource.REPORT }],
        ['c.severity = :severity', { severity: ModerationCaseSeverity.HIGH }],
        ['c.assignedTo = :assignedTo', { assignedTo: 'mod-1' }],
      ]);
    });

    it('sắp xếp CỐ ĐỊNH priority DESC, report_count DESC, created_at ASC, id ASC (tie-break)', async () => {
      const { qb, calls } = fakeQb(0, []);
      repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await sut.list({ statuses: [ModerationCaseStatus.OPEN], limit: 20, offset: 0 });

      expect(calls.orderBy).toEqual([
        ['c.priority', 'DESC'],
        ['c.reportCount', 'DESC'],
        ['c.createdAt', 'ASC'],
        ['c.id', 'ASC'],
      ]);
    });

    it('getCount và getMany dùng CHUNG một qb (list/count filter parity — không thể lệch nhau)', async () => {
      const { qb } = fakeQb(7, [{ id: 'c1' } as ModerationCase]);
      repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await sut.list({ statuses: [ModerationCaseStatus.OPEN], limit: 20, offset: 0 });

      expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ items: [{ id: 'c1' }], total: 7 });
    });

    it('phân trang: skip/take đúng offset/limit đã tính', async () => {
      const { qb } = fakeQb(0, []);
      repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await sut.list({ statuses: [ModerationCaseStatus.OPEN], limit: 20, offset: 40 });

      expect(qb.skip).toHaveBeenCalledWith(40);
      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('không kết quả -> mảng rỗng + total 0, không lỗi', async () => {
      const { qb } = fakeQb(0, []);
      repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await sut.list({ statuses: [ModerationCaseStatus.RESOLVED], limit: 20, offset: 0 });
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe('findTargetPreview', () => {
    it('media tồn tại (chưa xoá mềm) -> found=true, KHÔNG có object_key/bucket/checksum (loại trừ nội bộ storage)', async () => {
      repo.query = jest.fn().mockResolvedValue([
        { type: 'image', status: 'pending', uploaded_by: 'u1', created_at: new Date('2026-08-02T00:00:00Z') },
      ]);

      const result = await sut.findTargetPreview(ModerationTargetType.MEDIA, 'm1');

      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).toContain('FROM media WHERE id = $1 AND deleted_at IS NULL');
      expect(sql(query)).not.toContain('object_key');
      expect(sql(query)).not.toContain('bucket');
      expect(sql(query)).not.toContain('checksum');
      expect(params).toEqual(['m1']);
      expect(result).toEqual({
        found: true,
        targetType: ModerationTargetType.MEDIA,
        targetId: 'm1',
        mediaType: 'image',
        status: 'pending',
        uploadedBy: 'u1',
        createdAt: new Date('2026-08-02T00:00:00Z'),
      });
    });

    it('media không tồn tại/đã xoá mềm -> found=false, KHÔNG throw', async () => {
      repo.query = jest.fn().mockResolvedValue([]);
      const result = await sut.findTargetPreview(ModerationTargetType.MEDIA, 'missing');
      expect(result).toEqual({ found: false, targetType: ModerationTargetType.MEDIA, targetId: 'missing' });
    });

    it('review tồn tại -> found=true, có content (cần cho quyết định kiểm duyệt)', async () => {
      repo.query = jest.fn().mockResolvedValue([
        {
          status: 'published',
          rating: 4,
          content: 'Chỗ này ổn',
          place_id: 'p1',
          user_id: 'u1',
          created_at: new Date('2026-08-02T00:00:00Z'),
        },
      ]);

      const result = await sut.findTargetPreview(ModerationTargetType.REVIEW, 'r1');

      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).toContain('FROM reviews WHERE id = $1');
      expect(params).toEqual(['r1']);
      expect(result).toEqual({
        found: true,
        targetType: ModerationTargetType.REVIEW,
        targetId: 'r1',
        status: 'published',
        rating: 4,
        content: 'Chỗ này ổn',
        placeId: 'p1',
        userId: 'u1',
        createdAt: new Date('2026-08-02T00:00:00Z'),
      });
    });

    it('review không tồn tại -> found=false, KHÔNG throw', async () => {
      repo.query = jest.fn().mockResolvedValue([]);
      const result = await sut.findTargetPreview(ModerationTargetType.REVIEW, 'missing');
      expect(result).toEqual({ found: false, targetType: ModerationTargetType.REVIEW, targetId: 'missing' });
    });

    it('target_type=place -> LUÔN found=false, KHÔNG truy vấn DB (chưa đăng ký FSM, MR-4)', async () => {
      repo.query = jest.fn();
      const result = await sut.findTargetPreview(ModerationTargetType.PLACE, 'pl1');
      expect(result).toEqual({ found: false, targetType: ModerationTargetType.PLACE, targetId: 'pl1' });
      expect(repo.query).not.toHaveBeenCalled();
    });
  });

  describe('findByIdForUpdate (T2, M3)', () => {
    it('khoá case bằng pessimistic_write qua manager.getRepository(ModerationCase)', async () => {
      const qb: Record<string, jest.Mock> = {};
      qb.setLock = jest.fn().mockReturnValue(qb);
      qb.where = jest.fn().mockReturnValue(qb);
      qb.getOne = jest.fn().mockResolvedValue({ id: 'c1' });
      const inner = createMock<Repository<ModerationCase>>({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      });
      const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });

      const result = await sut.findByIdForUpdate(manager, 'c1');

      expect(manager.getRepository).toHaveBeenCalledWith(ModerationCase);
      expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(qb.where).toHaveBeenCalledWith('c.id = :id', { id: 'c1' });
      expect(result).toEqual({ id: 'c1' });
    });
  });

  describe('resolve (T2, M3)', () => {
    it('ghi status/decision/reason/resolved_by/resolved_at qua manager, KHÔNG tự kiểm tra tính hợp lệ', async () => {
      const inner = createMock<Repository<ModerationCase>>({ update: jest.fn() });
      const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });
      const resolvedAt = new Date('2026-08-02T00:00:00Z');

      await sut.resolve(manager, 'c1', {
        status: ModerationCaseStatus.RESOLVED,
        decision: ModerationDecision.APPROVE,
        reason: null,
        resolvedBy: 'mod-1',
        resolvedAt,
      });

      expect(inner.update).toHaveBeenCalledWith(
        { id: 'c1' },
        {
          status: ModerationCaseStatus.RESOLVED,
          decision: ModerationDecision.APPROVE,
          reason: null,
          resolvedBy: 'mod-1',
          resolvedAt,
        },
      );
    });

    it('hỗ trợ status=dismissed (decision=dismiss, không đổi trạng thái nội dung)', async () => {
      const inner = createMock<Repository<ModerationCase>>({ update: jest.fn() });
      const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });

      await sut.resolve(manager, 'c1', {
        status: ModerationCaseStatus.DISMISSED,
        decision: ModerationDecision.DISMISS,
        reason: 'report vô căn cứ',
        resolvedBy: 'mod-1',
        resolvedAt: new Date(),
      });

      expect(inner.update).toHaveBeenCalledWith(
        { id: 'c1' },
        expect.objectContaining({ status: ModerationCaseStatus.DISMISSED, decision: ModerationDecision.DISMISS }),
      );
    });
  });
});
