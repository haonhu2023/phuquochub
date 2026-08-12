import { EntityManager, In, Repository } from 'typeorm';
import { ModerationCasesRepository } from './moderation-cases.repository';
import { ModerationCase } from '../entities/moderation-case.entity';
import {
  MediaModerationReasonCode,
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
    sut = new ModerationCasesRepository(repo, {
      moderationFileUrl: (id: string) => `https://api.example/api/media/${id}/moderation-file`,
    } as never);
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
    // Owner Place Photos: truy vấn NAY có đọc `object_key` — nhưng CHỈ để biết có object nào để
    // ký URL xem trước hay không. Bất biến bảo mật thật (và là điều test này canh) không phải "SQL
    // không được nhắc tới object_key", mà là "object_key/bucket/checksum KHÔNG BAO GIỜ nằm trong
    // KẾT QUẢ trả ra" — client chỉ nhận một URL API đã gác quyền, không nhận địa chỉ lưu trữ.
    it('media tồn tại -> found=true kèm place/preview_url, KHÔNG rò object_key/bucket/checksum trong kết quả', async () => {
      repo.query = jest.fn().mockResolvedValue([
        {
          type: 'image',
          status: 'pending',
          uploaded_by: 'u1',
          created_at: new Date('2026-08-02T00:00:00Z'),
          place_id: 'place-1',
          place_name: 'Bãi Sao',
          object_key: 'media/abc.jpg',
        },
      ]);

      const result = await sut.findTargetPreview(ModerationTargetType.MEDIA, 'm1');

      const [query, params] = repo.query.mock.calls[0];
      expect(sql(query)).toContain('FROM media m');
      expect(sql(query)).toContain('LEFT JOIN places p ON p.id = m.place_id');
      expect(sql(query)).toContain('m.deleted_at IS NULL');
      expect(params).toEqual(['m1']);

      expect(result).toEqual({
        found: true,
        targetType: ModerationTargetType.MEDIA,
        targetId: 'm1',
        mediaType: 'image',
        status: 'pending',
        uploadedBy: 'u1',
        createdAt: new Date('2026-08-02T00:00:00Z'),
        placeId: 'place-1',
        placeName: 'Bãi Sao',
        previewUrl: 'https://api.example/api/media/m1/moderation-file',
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('media/abc.jpg');
      expect(serialized).not.toContain('bucket');
      expect(serialized).not.toContain('checksum');
    });

    // Ảnh review/mồ côi không gắn cơ sở nào — LEFT JOIN giữ chúng found=true với place null.
    it('media KHÔNG gắn cơ sở -> place_id/place_name null, vẫn found=true', async () => {
      repo.query = jest.fn().mockResolvedValue([
        {
          type: 'image',
          status: 'published',
          uploaded_by: 'u1',
          created_at: new Date('2026-08-02T00:00:00Z'),
          place_id: null,
          place_name: null,
          object_key: 'media/x.jpg',
        },
      ]);

      const result = await sut.findTargetPreview(ModerationTargetType.MEDIA, 'm1');

      expect(result).toMatchObject({ found: true, placeId: null, placeName: null });
    });

    // Dòng legacy/nhúng (YouTube/Vimeo) không có object nào để ký -> không có URL xem trước.
    it('media không có object_key -> previewUrl null (không bịa URL)', async () => {
      repo.query = jest.fn().mockResolvedValue([
        {
          type: 'video',
          status: 'published',
          uploaded_by: null,
          created_at: new Date('2026-08-02T00:00:00Z'),
          place_id: null,
          place_name: null,
          object_key: null,
        },
      ]);

      const result = await sut.findTargetPreview(ModerationTargetType.MEDIA, 'm1');

      expect(result).toMatchObject({ found: true, previewUrl: null });
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

  describe('findOpenCaseForTargetForUpdate (T3, M5)', () => {
    it('khoá case bằng pessimistic_write, lọc đúng target_type/target_id/status open|claimed', async () => {
      const qb: Record<string, jest.Mock> = {};
      qb.setLock = jest.fn().mockReturnValue(qb);
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest.fn().mockReturnValue(qb);
      qb.getOne = jest.fn().mockResolvedValue({ id: 'c1' });
      const inner = createMock<Repository<ModerationCase>>({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      });
      const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });

      const result = await sut.findOpenCaseForTargetForUpdate(manager, ModerationTargetType.REVIEW, 'r1');

      expect(manager.getRepository).toHaveBeenCalledWith(ModerationCase);
      expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(qb.where).toHaveBeenCalledWith('c.targetType = :targetType', { targetType: ModerationTargetType.REVIEW });
      expect(qb.andWhere).toHaveBeenCalledWith('c.targetId = :targetId', { targetId: 'r1' });
      expect(qb.andWhere).toHaveBeenCalledWith('c.status IN (:...statuses)', {
        statuses: [ModerationCaseStatus.OPEN, ModerationCaseStatus.CLAIMED],
      });
      expect(result).toEqual({ id: 'c1' });
    });

    it('không có case mở nào -> null (KHÔNG throw — caller tự quyết định tạo case mới)', async () => {
      const qb: Record<string, jest.Mock> = {};
      qb.setLock = jest.fn().mockReturnValue(qb);
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest.fn().mockReturnValue(qb);
      qb.getOne = jest.fn().mockResolvedValue(null);
      const inner = createMock<Repository<ModerationCase>>({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      });
      const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });

      const result = await sut.findOpenCaseForTargetForUpdate(manager, ModerationTargetType.MEDIA, 'm1');
      expect(result).toBeNull();
    });
  });

  describe('updateReportAggregation (T3, M5)', () => {
    it('ghi report_count/severity/priority ĐÃ ĐƯỢC TÍNH bởi service, qua manager', async () => {
      const inner = createMock<Repository<ModerationCase>>({ update: jest.fn() });
      const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });

      await sut.updateReportAggregation(manager, 'c1', {
        reportCount: 3,
        severity: ModerationCaseSeverity.HIGH,
        priority: 40,
      });

      expect(manager.getRepository).toHaveBeenCalledWith(ModerationCase);
      expect(inner.update).toHaveBeenCalledWith(
        { id: 'c1' },
        { reportCount: 3, severity: ModerationCaseSeverity.HIGH, priority: 40 },
      );
    });
  });

  describe('findReviewForUpdate (T2, M4)', () => {
    it('SELECT ... FOR UPDATE trên reviews, tham số hoá, ánh xạ snake_case -> camelCase', async () => {
      const manager = createMock<EntityManager>({
        query: jest.fn().mockResolvedValue([
          { id: 'r1', place_id: 'place-1', user_id: 'author-1', status: 'published' },
        ]),
      });

      const result = await sut.findReviewForUpdate(manager, 'r1');

      const [query, params] = manager.query.mock.calls[0];
      expect(sql(query)).toContain('SELECT id, place_id, user_id, status FROM reviews WHERE id = $1 FOR UPDATE');
      expect(params).toEqual(['r1']);
      expect(result).toEqual({ id: 'r1', placeId: 'place-1', userId: 'author-1', status: 'published' });
    });

    it('không có dòng khớp -> null (KHÔNG throw — target_id không FK cứng, ADR-018 D9)', async () => {
      const manager = createMock<EntityManager>({ query: jest.fn().mockResolvedValue([]) });
      const result = await sut.findReviewForUpdate(manager, 'missing');
      expect(result).toBeNull();
    });

    // SELECT (khác UPDATE/DELETE) — driver Postgres của TypeORM trả rows trực tiếp, KHÔNG phải
    // tuple [rows, rowCount] (xem MediaRepository.attachAndPublish()/softDeleteOrphanCandidate()
    // cho lớp bug tuple đã sửa ở UPDATE/DELETE...RETURNING). Test này xác nhận rõ ràng để không ai
    // vô tình "sửa" bằng cách destructure một mảng vốn đã đúng.
    it('KHÔNG destructure tuple — kết quả SELECT là mảng rows trực tiếp', async () => {
      const rows = [{ id: 'r1', place_id: 'place-1', user_id: 'author-1', status: 'published' }];
      const manager = createMock<EntityManager>({ query: jest.fn().mockResolvedValue(rows) });
      const result = await sut.findReviewForUpdate(manager, 'r1');
      expect(result).not.toBeNull();
    });
  });

  describe('updateReviewStatus (T2, M4)', () => {
    it('UPDATE reviews SET status, tham số hoá đúng thứ tự [status, id]', async () => {
      const manager = createMock<EntityManager>({ query: jest.fn().mockResolvedValue(undefined) });

      await sut.updateReviewStatus(manager, 'r1', 'hidden' as never);

      const [query, params] = manager.query.mock.calls[0];
      expect(sql(query)).toBe('UPDATE reviews SET status = $1 WHERE id = $2');
      expect(params).toEqual(['hidden', 'r1']);
    });

    it('KHÔNG tự kiểm tra transition hợp lệ — repository chỉ ghi, FSM đã xác nhận ở service (cùng nguyên tắc MediaRepository.updateStatus())', async () => {
      const manager = createMock<EntityManager>({ query: jest.fn().mockResolvedValue(undefined) });
      await expect(sut.updateReviewStatus(manager, 'r1', 'published' as never)).resolves.toBeUndefined();
    });
  });

  describe('resolve (T2, M3)', () => {
    it('ghi status/decision/reason/reason_code/resolved_by/resolved_at qua manager, KHÔNG tự kiểm tra tính hợp lệ', async () => {
      const inner = createMock<Repository<ModerationCase>>({ update: jest.fn() });
      const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });
      const resolvedAt = new Date('2026-08-02T00:00:00Z');

      await sut.resolve(manager, 'c1', {
        status: ModerationCaseStatus.RESOLVED,
        decision: ModerationDecision.APPROVE,
        reason: null,
        reasonCode: null,
        resolvedBy: 'mod-1',
        resolvedAt,
      });

      expect(inner.update).toHaveBeenCalledWith(
        { id: 'c1' },
        {
          status: ModerationCaseStatus.RESOLVED,
          decision: ModerationDecision.APPROVE,
          reason: null,
          reasonCode: null,
          resolvedBy: 'mod-1',
          resolvedAt,
        },
      );
    });

    // Controlled Media Rejection Reason (2026-08-12) — repository ghi ĐÚNG hai trường lý do vào
    // hai cột KHÁC NHAU, không trộn: `reason` (nội bộ) và `reason_code` (owner-safe).
    it('ghi reason_code vào cột riêng, độc lập hoàn toàn với reason free text', async () => {
      const inner = createMock<Repository<ModerationCase>>({ update: jest.fn() });
      const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });

      await sut.resolve(manager, 'c1', {
        status: ModerationCaseStatus.RESOLVED,
        decision: ModerationDecision.REJECT,
        reason: 'ghi chú nội bộ: trùng case #4821',
        reasonCode: MediaModerationReasonCode.LOW_QUALITY,
        resolvedBy: 'mod-1',
        resolvedAt: new Date(),
      });

      expect(inner.update).toHaveBeenCalledWith(
        { id: 'c1' },
        expect.objectContaining({
          reason: 'ghi chú nội bộ: trùng case #4821',
          reasonCode: MediaModerationReasonCode.LOW_QUALITY,
        }),
      );
    });

    it('hỗ trợ status=dismissed (decision=dismiss, không đổi trạng thái nội dung)', async () => {
      const inner = createMock<Repository<ModerationCase>>({ update: jest.fn() });
      const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });

      await sut.resolve(manager, 'c1', {
        status: ModerationCaseStatus.DISMISSED,
        decision: ModerationDecision.DISMISS,
        reason: 'report vô căn cứ',
        reasonCode: null,
        resolvedBy: 'mod-1',
        resolvedAt: new Date(),
      });

      expect(inner.update).toHaveBeenCalledWith(
        { id: 'c1' },
        expect.objectContaining({ status: ModerationCaseStatus.DISMISSED, decision: ModerationDecision.DISMISS }),
      );
    });
  });

  // Controlled Media Rejection Reason (2026-08-12) — đường ĐỌC duy nhất mà chủ cơ sở chạm tới.
  // Mọi bảo đảm an toàn của tính năng này bắt đầu từ hình dạng CÂU SQL ở đây.
  describe('findOwnerSafeReasonCodesForMedia (Controlled Media Rejection Reason)', () => {
    function queryingRepo(rows: unknown[] = []) {
      return createMock<Repository<ModerationCase>>({ query: jest.fn().mockResolvedValue(rows) });
    }

    it('tập rỗng -> KHÔNG truy vấn gì (gallery không có ảnh bị từ chối không tốn thêm query nào)', async () => {
      repo = queryingRepo();
      sut = new ModerationCasesRepository(repo, {} as never);

      await expect(sut.findOwnerSafeReasonCodesForMedia([])).resolves.toEqual(new Map());
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('MỘT truy vấn cho CẢ tập id (chống N+1) — không phải một truy vấn mỗi ảnh', async () => {
      repo = queryingRepo([]);
      sut = new ModerationCasesRepository(repo, {} as never);

      await sut.findOwnerSafeReasonCodesForMedia(['m1', 'm2', 'm3']);

      expect(repo.query).toHaveBeenCalledTimes(1);
      const [, params] = repo.query.mock.calls[0];
      expect(params).toEqual([['m1', 'm2', 'm3']]);
      expect(sql(repo.query.mock.calls[0][0])).toContain('c.target_id = ANY($1)');
    });

    it('CHỈ SELECT target_id/decision/reason_code — không reason, không resolved_by, không id case', async () => {
      repo = queryingRepo([]);
      sut = new ModerationCasesRepository(repo, {} as never);

      await sut.findOwnerSafeReasonCodesForMedia(['m1']);
      const query = sql(repo.query.mock.calls[0][0]);
      const select = query.slice(0, query.indexOf('FROM'));

      expect(select).toContain('c.target_id');
      expect(select).toContain('c.decision');
      expect(select).toContain('c.reason_code');
      // Cột nội bộ KHÔNG được nhắc tới ở mệnh đề SELECT — không có đường nào để chúng lọt ra.
      expect(select).not.toMatch(/c\.reason\b(?!_code)/);
      expect(select).not.toContain('resolved_by');
      expect(select).not.toContain('assigned_to');
      expect(select).not.toContain('c.id');
    });

    it('chỉ case media ĐÃ resolved bằng một quyết định GỠ nội dung (reject|hide)', async () => {
      repo = queryingRepo([]);
      sut = new ModerationCasesRepository(repo, {} as never);

      await sut.findOwnerSafeReasonCodesForMedia(['m1']);
      const query = sql(repo.query.mock.calls[0][0]);

      expect(query).toContain("c.target_type = 'media'");
      expect(query).toContain("c.status = 'resolved'");
      expect(query).toContain("c.decision IN ('reject','hide')");
    });

    it('CHỌN XÁC ĐỊNH: DISTINCT ON + resolved_at DESC, tie-break id DESC (không phụ thuộc planner)', async () => {
      repo = queryingRepo([]);
      sut = new ModerationCasesRepository(repo, {} as never);

      await sut.findOwnerSafeReasonCodesForMedia(['m1']);
      const query = sql(repo.query.mock.calls[0][0]);

      expect(query).toContain('DISTINCT ON (c.target_id)');
      expect(query).toContain('ORDER BY c.target_id, c.resolved_at DESC NULLS LAST, c.id DESC');
    });

    it('KHÔNG lọc reason_code IS NOT NULL — quyết định mới nhất chưa có mã phải trả về null, không tụt về mã CŨ', async () => {
      repo = queryingRepo([]);
      sut = new ModerationCasesRepository(repo, {} as never);

      await sut.findOwnerSafeReasonCodesForMedia(['m1']);
      expect(sql(repo.query.mock.calls[0][0])).not.toContain('reason_code IS NOT NULL');
    });

    it('trả Map theo media id, giữ nguyên decision + reason_code (kể cả null của case lịch sử)', async () => {
      repo = queryingRepo([
        { target_id: 'm1', decision: 'reject', reason_code: 'low_quality' },
        { target_id: 'm2', decision: 'reject', reason_code: null },
        { target_id: 'm3', decision: 'hide', reason_code: null },
      ]);
      sut = new ModerationCasesRepository(repo, {} as never);

      const result = await sut.findOwnerSafeReasonCodesForMedia(['m1', 'm2', 'm3']);

      expect(result.get('m1')).toEqual({
        decision: ModerationDecision.REJECT,
        reasonCode: MediaModerationReasonCode.LOW_QUALITY,
      });
      expect(result.get('m2')).toEqual({ decision: ModerationDecision.REJECT, reasonCode: null });
      expect(result.get('m3')).toEqual({ decision: ModerationDecision.HIDE, reasonCode: null });
    });
  });
});
