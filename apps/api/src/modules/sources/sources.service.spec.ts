import { resolveConflict, SourcesService } from './sources.service';
import { AttributionWithSource } from './repositories/source-attributions.repository';
import { SourceAttribution } from './entities/source-attribution.entity';
import { SourceType, SourceKind } from './sources.enums';
import { CreateAttributionDto } from './dto/sources.dto';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function attribution(overrides: Partial<SourceAttribution> = {}): SourceAttribution {
  return {
    id: overrides.id ?? 'attr-1',
    sourceId: 'src-1',
    entityType: 'place',
    entityId: 'place-1',
    field: null,
    confidence: null,
    note: null,
    isPrimary: false,
    verifiedBy: null,
    verifiedAt: null,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as SourceAttribution;
}

function candidate(overrides: Partial<AttributionWithSource> = {}): AttributionWithSource {
  return {
    attribution: attribution(),
    reliability: 50,
    retrievedAt: null,
    ...overrides,
  };
}

// source.md §7 — thuật toán 4 bước: is_primary → reliability → retrieved_at → moderator.
describe('resolveConflict (source.md §7)', () => {
  it('nhánh 1 — is_primary=true thắng ngay cả khi reliability thấp hơn', () => {
    const primaryLowReliability = candidate({
      attribution: attribution({ id: 'a-primary', isPrimary: true }),
      reliability: 30,
    });
    const nonPrimaryHighReliability = candidate({
      attribution: attribution({ id: 'a-other' }),
      reliability: 95,
    });

    const result = resolveConflict([primaryLowReliability, nonPrimaryHighReliability]);

    expect(result).toEqual({ status: 'resolved', reason: 'primary', attribution: primaryLowReliability.attribution });
  });

  it('nhánh 2 — không ai is_primary → reliability cao nhất thắng', () => {
    const low = candidate({ attribution: attribution({ id: 'a-low' }), reliability: 50 });
    const high = candidate({ attribution: attribution({ id: 'a-high' }), reliability: 90 });

    const result = resolveConflict([low, high]);

    expect(result).toEqual({ status: 'resolved', reason: 'reliability', attribution: high.attribution });
  });

  it('nhánh 3 — reliability hòa → retrieved_at mới hơn thắng', () => {
    const older = candidate({
      attribution: attribution({ id: 'a-older' }),
      reliability: 75,
      retrievedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const newer = candidate({
      attribution: attribution({ id: 'a-newer' }),
      reliability: 75,
      retrievedAt: new Date('2026-06-01T00:00:00Z'),
    });

    const result = resolveConflict([older, newer]);

    expect(result).toEqual({ status: 'resolved', reason: 'freshness', attribution: newer.attribution });
  });

  it('nhánh 4 — hòa cả reliability lẫn retrieved_at (kể cả null) → đưa vào hàng chờ moderator', () => {
    const a = candidate({ attribution: attribution({ id: 'a-1' }), reliability: 75, retrievedAt: null });
    const b = candidate({ attribution: attribution({ id: 'a-2' }), reliability: 75, retrievedAt: null });

    const result = resolveConflict([a, b]);

    expect(result?.status).toBe('needs_moderator');
    expect(result).toMatchObject({ candidates: [a, b] });
  });

  it('không có ứng viên nào → null (không có gì để phân xử)', () => {
    expect(resolveConflict([])).toBeNull();
  });

  it('một ứng viên duy nhất → thắng mặc định (không cần so sánh)', () => {
    const only = candidate({ attribution: attribution({ id: 'a-only' }) });
    expect(resolveConflict([only])).toEqual({ status: 'resolved', reason: 'primary', attribution: only.attribution });
  });
});

describe('SourcesService', () => {
  type Deps = ConstructorParameters<typeof SourcesService>;
  let sourcesRepo: LooseMock<Deps[0]>;
  let attributionsRepo: LooseMock<Deps[1]>;
  let service: SourcesService;

  beforeEach(() => {
    sourcesRepo = createMock<Deps[0]>({
      create: jest.fn((d) => d),
      save: jest.fn(async (s) => ({ id: 'src-new', ...s })),
      findById: jest.fn(),
    });
    attributionsRepo = createMock<Deps[1]>({
      create: jest.fn((d) => d),
      save: jest.fn(async (a) => ({ id: 'attr-new', ...a })),
      clearPrimary: jest.fn(),
      listWithSourceReliability: jest.fn(),
      listByEntity: jest.fn(),
      findById: jest.fn(),
      // Idempotency-key lookup (2026-09-09 fix) — default MISS (no existing row) so the pre-existing
      // is_primary tests below (which never mock this) keep exercising the "create new" path
      // unchanged.
      findByUniqueKey: jest.fn().mockResolvedValue(null),
    });
    service = new SourcesService(sourcesRepo, attributionsRepo);
  });

  afterEach(() => jest.clearAllMocks());

  it('createSource: dùng SOURCE_TYPE_DEFAULT_RELIABILITY khi không truyền reliability', async () => {
    await service.createSource({ type: SourceType.OPENSTREETMAP, kind: SourceKind.URL } as never);

    expect(sourcesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ reliability: 75 }));
  });

  it('createSource: giữ reliability truyền vào (moderator tinh chỉnh — source.md §4.1)', async () => {
    await service.createSource({ type: SourceType.OPENSTREETMAP, kind: SourceKind.URL, reliability: 60 } as never);

    expect(sourcesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ reliability: 60 }));
  });

  it('attachAttribution: is_primary=true → gọi clearPrimary trước khi tạo mới', async () => {
    sourcesRepo.findById.mockResolvedValue({ id: 'src-1' });

    await service.attachAttribution({
      source_id: 'src-1',
      entity_type: 'place',
      entity_id: 'place-1',
      is_primary: true,
    } as never);

    expect(attributionsRepo.clearPrimary).toHaveBeenCalledWith('place', 'place-1', null);
  });

  it('attachAttribution: is_primary bỏ trống → KHÔNG gọi clearPrimary', async () => {
    sourcesRepo.findById.mockResolvedValue({ id: 'src-1' });

    await service.attachAttribution({
      source_id: 'src-1',
      entity_type: 'place',
      entity_id: 'place-1',
    } as never);

    expect(attributionsRepo.clearPrimary).not.toHaveBeenCalled();
  });

  // Idempotency contract (fixed 2026-09-09, PR #25 audit — originally found broken 2026-09-08).
  // attachAttribution's idempotency key is exactly the four columns of the real DB constraint
  // `uq_source_attr_entity_field_source` (entity_type, entity_id, field, source_id) — the SAME
  // columns already governing uniqueness in production, not a new/invented key. THIS describe
  // block replaces a prior version of this test that asserted `save()` is called twice on replay —
  // that old test only DOCUMENTED the bug (it certified duplicate-row creation as expected
  // behavior); it was never a completion criterion. The tests below assert the actual desired
  // contract: replay is a no-op that returns the existing row, never a second row.
  describe('attachAttribution — idempotency (uq_source_attr_entity_field_source)', () => {
    const dto: CreateAttributionDto = {
      source_id: 'src-1',
      entity_type: 'place_field',
      entity_id: 'place-1',
      field: 'opening_hours',
      is_primary: true,
    };

    beforeEach(() => {
      sourcesRepo.findById.mockResolvedValue({ id: 'src-1' });
    });

    it('lần gọi đầu tiên: chưa có bản ghi nào theo khoá → tạo mới đúng MỘT lần', async () => {
      attributionsRepo.findByUniqueKey.mockResolvedValue(null);

      await service.attachAttribution(dto);

      expect(attributionsRepo.findByUniqueKey).toHaveBeenCalledWith('place_field', 'place-1', 'opening_hours', 'src-1');
      expect(attributionsRepo.save).toHaveBeenCalledTimes(1);
    });

    it('gọi lại với ĐÚNG khoá cũ (entity_type, entity_id, field, source_id) → no-op, trả về bản ghi đã có, KHÔNG gọi save() lần hai, KHÔNG gọi lại clearPrimary', async () => {
      const existing = attribution({ id: 'attr-existing', entityType: 'place_field', entityId: 'place-1', field: 'opening_hours', sourceId: 'src-1', isPrimary: true });
      attributionsRepo.findByUniqueKey.mockResolvedValue(existing);

      const first = await service.attachAttribution(dto);
      const second = await service.attachAttribution(dto);

      expect(first).toBe(existing);
      expect(second).toBe(existing);
      expect(attributionsRepo.save).not.toHaveBeenCalled();
      // clearPrimary phải KHÔNG chạy khi đây thực ra là no-op — chạy nó sẽ là một side effect thật
      // (xoá cờ primary của các attribution KHÁC) xảy ra dù attribution NÀY không hề thay đổi gì.
      expect(attributionsRepo.clearPrimary).not.toHaveBeenCalled();
    });

    it('hai lời gọi CẠNH TRANH cùng khoá (race): findByUniqueKey miss ở cả hai, save() thứ hai va UNIQUE violation → đọc lại và trả về đúng bản ghi bên thắng đã tạo, KHÔNG ném lỗi, KHÔNG tạo dòng thứ hai', async () => {
      const winnerRow = attribution({ id: 'attr-winner', entityType: 'place_field', entityId: 'place-1', field: 'opening_hours', sourceId: 'src-1', isPrimary: true });
      // Cả hai lời gọi đều MISS ở lần tra đầu (mô phỏng đúng race thật: cả hai đọc "chưa có" trước
      // khi cái nào kịp ghi).
      attributionsRepo.findByUniqueKey.mockResolvedValueOnce(null); // gọi 1: pre-check
      attributionsRepo.save.mockResolvedValueOnce(winnerRow); // gọi 1: thắng race, ghi thành công

      attributionsRepo.findByUniqueKey.mockResolvedValueOnce(null); // gọi 2: pre-check cũng miss
      const uniqueViolation = Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
        constraint: 'uq_source_attr_entity_field_source',
      });
      attributionsRepo.save.mockRejectedValueOnce(uniqueViolation); // gọi 2: thua race, DB chặn
      attributionsRepo.findByUniqueKey.mockResolvedValueOnce(winnerRow); // gọi 2: đọc lại sau khi bắt lỗi, thấy đúng bản ghi bên thắng

      const [resultA, resultB] = await Promise.all([service.attachAttribution(dto), service.attachAttribution(dto)]);

      // Không quan tâm ai "gọi 1"/"gọi 2" theo thứ tự thời gian thật — chỉ cần CẢ HAI kết quả cuối
      // cùng đều là đúng MỘT bản ghi (bên thắng), và save() chỉ thực sự tạo được đúng MỘT dòng.
      expect(resultA).toBe(winnerRow);
      expect(resultB).toBe(winnerRow);
      expect(attributionsRepo.save).toHaveBeenCalledTimes(2); // gọi 1 thành công + gọi 2 va lỗi (không tạo dòng thứ hai — save() thứ hai NÉM lỗi, không trả về row mới)
    });

    it('lỗi DB KHÔNG PHẢI unique violation (vd mất kết nối) vẫn được NÉM RA NGUYÊN VẸN, không bị nuốt nhầm thành "no-op"', async () => {
      attributionsRepo.findByUniqueKey.mockResolvedValueOnce(null);
      const connectionError = new Error('connection terminated unexpectedly');
      attributionsRepo.save.mockRejectedValueOnce(connectionError);

      await expect(service.attachAttribution(dto)).rejects.toBe(connectionError);
    });

    it('khác source_id cùng (entity_type, entity_id, field) → KHÔNG bị coi là trùng, tạo bản ghi mới hợp lệ', async () => {
      attributionsRepo.findByUniqueKey.mockResolvedValue(null); // khoá khác source_id -> luôn miss
      const otherSourceDto: CreateAttributionDto = { ...dto, source_id: 'src-2' };

      await service.attachAttribution(dto);
      await service.attachAttribution(otherSourceDto);

      expect(attributionsRepo.findByUniqueKey).toHaveBeenNthCalledWith(1, 'place_field', 'place-1', 'opening_hours', 'src-1');
      expect(attributionsRepo.findByUniqueKey).toHaveBeenNthCalledWith(2, 'place_field', 'place-1', 'opening_hours', 'src-2');
      expect(attributionsRepo.save).toHaveBeenCalledTimes(2);
    });

    it('khác field cùng (entity_type, entity_id, source_id) → KHÔNG bị coi là trùng, tạo bản ghi mới hợp lệ', async () => {
      attributionsRepo.findByUniqueKey.mockResolvedValue(null);
      const otherFieldDto: CreateAttributionDto = { ...dto, field: 'address' };

      await service.attachAttribution(dto);
      await service.attachAttribution(otherFieldDto);

      expect(attributionsRepo.findByUniqueKey).toHaveBeenNthCalledWith(1, 'place_field', 'place-1', 'opening_hours', 'src-1');
      expect(attributionsRepo.findByUniqueKey).toHaveBeenNthCalledWith(2, 'place_field', 'place-1', 'address', 'src-1');
      expect(attributionsRepo.save).toHaveBeenCalledTimes(2);
    });

    it('retry sau lỗi KHÔNG unique-violation: bản ghi trước đó không được tạo (save reject), lần retry sau tạo đúng MỘT dòng — không nhân đôi', async () => {
      attributionsRepo.findByUniqueKey.mockResolvedValueOnce(null);
      attributionsRepo.save.mockRejectedValueOnce(new Error('connection terminated unexpectedly'));
      await expect(service.attachAttribution(dto)).rejects.toThrow('connection terminated unexpectedly');

      // Retry thật: lần đọc lại vẫn miss (lần ghi trước THẬT SỰ đã thất bại, không có gì tồn tại) —
      // lần retry này phải tạo được, và chỉ một lần.
      attributionsRepo.findByUniqueKey.mockResolvedValueOnce(null);
      const created = attribution({ id: 'attr-retry', entityType: 'place_field', entityId: 'place-1', field: 'opening_hours', sourceId: 'src-1' });
      attributionsRepo.save.mockResolvedValueOnce(created);
      const result = await service.attachAttribution(dto);

      expect(result).toBe(created);
      expect(attributionsRepo.save).toHaveBeenCalledTimes(2); // 1 lỗi (không tạo dòng) + 1 thành công
    });
  });
});
