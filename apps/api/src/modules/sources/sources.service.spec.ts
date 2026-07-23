import { resolveConflict, SourcesService } from './sources.service';
import { AttributionWithSource } from './repositories/source-attributions.repository';
import { SourceAttribution } from './entities/source-attribution.entity';
import { SourceType, SourceKind } from './sources.enums';
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
});
