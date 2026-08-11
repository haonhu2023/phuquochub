import { Repository } from 'typeorm';
import { BusinessClaimsRepository } from './business-claims.repository';
import { BusinessClaim } from '../entities/business-claim.entity';
import { ClaimReasonCode, ClaimStatus } from '../business.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

// GET /business-claims/mine (listByRequester) — security-critical: requester_id PHẢI là điều
// kiện WHERE thật ở CSDL (không phải lọc ở tầng ứng dụng), và evidence/reviewer_id/decision_note
// KHÔNG bao giờ được liệt trong .select() (chốt chặn kép ở tầng CSDL, xem chú thích method).
describe('BusinessClaimsRepository.listByRequester', () => {
  let repo: LooseMock<Repository<BusinessClaim>>;
  let sut: BusinessClaimsRepository;

  function fakeQb(rows: unknown[]) {
    const calls: {
      where: Array<[string, unknown]>;
      select: unknown[][];
      addSelect: unknown[][];
      orderBy: Array<[string, string]>;
    } = { where: [], select: [], addSelect: [], orderBy: [] };
    const qb: Record<string, jest.Mock> = {};
    qb.innerJoin = jest.fn().mockReturnValue(qb);
    qb.withDeleted = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn((cond: string, params: unknown) => {
      calls.where.push([cond, params]);
      return qb;
    });
    qb.select = jest.fn((cols: unknown[]) => {
      calls.select.push(cols);
      return qb;
    });
    qb.addSelect = jest.fn((cols: unknown[]) => {
      calls.addSelect.push(cols);
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
    qb.take = jest.fn().mockReturnValue(qb);
    qb.getMany = jest.fn().mockResolvedValue(rows);
    return { qb, calls };
  }

  function fakeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'claim-1',
      placeId: 'place-1',
      status: ClaimStatus.PENDING,
      reasonCode: null,
      decidedAt: null,
      createdAt: new Date('2026-08-10T00:00:00Z'),
      updatedAt: new Date('2026-08-10T00:00:00Z'),
      place: { id: 'place-1', name: 'Test Place', slug: 'test-place' },
      ...overrides,
    };
  }

  beforeEach(() => {
    repo = createMock<Repository<BusinessClaim>>();
    sut = new BusinessClaimsRepository(repo);
  });

  it('where lọc ĐÚNG requester_id được truyền (self-scope ở tầng CSDL)', async () => {
    const { qb, calls } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.listByRequester({ requesterId: 'user-abc', limit: 100 });

    expect(calls.where).toEqual([['c.requesterId = :requesterId', { requesterId: 'user-abc' }]]);
  });

  it('innerJoin place + withDeleted (place archived sau approve vẫn hiển thị tên/slug)', async () => {
    const { qb } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.listByRequester({ requesterId: 'user-abc', limit: 100 });

    expect(qb.innerJoin).toHaveBeenCalledWith('c.place', 'place');
    expect(qb.withDeleted).toHaveBeenCalled();
  });

  it('select() KHÔNG liệt evidence/reviewerId/decisionNote — không nạp field riêng tư từ CSDL', async () => {
    const { qb, calls } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.listByRequester({ requesterId: 'user-abc', limit: 100 });

    const selected = [...calls.select.flat(), ...calls.addSelect.flat()];
    expect(selected).not.toContain('c.evidence');
    expect(selected).not.toContain('c.reviewerId');
    expect(selected).not.toContain('c.decisionNote');
    expect(selected).toEqual(
      expect.arrayContaining([
        'c.id',
        'c.placeId',
        'c.status',
        'c.reasonCode',
        'c.decidedAt',
        'c.createdAt',
        'c.updatedAt',
        'place.id',
        'place.name',
        'place.slug',
      ]),
    );
  });

  it('sắp xếp CỐ ĐỊNH createdAt DESC, id DESC (mới nhất trước, tie-break xác định)', async () => {
    const { qb, calls } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.listByRequester({ requesterId: 'user-abc', limit: 100 });

    expect(calls.orderBy).toEqual([
      ['c.createdAt', 'DESC'],
      ['c.id', 'DESC'],
    ]);
  });

  it('take(limit) áp giới hạn phòng thủ được truyền vào', async () => {
    const { qb } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.listByRequester({ requesterId: 'user-abc', limit: 42 });

    expect(qb.take).toHaveBeenCalledWith(42);
  });

  it('map đúng place.name/place.slug đã join vào placeName/placeSlug phẳng', async () => {
    const { qb } = fakeQb([
      fakeRow({
        id: 'claim-9',
        status: ClaimStatus.REJECTED,
        reasonCode: ClaimReasonCode.INSUFFICIENT_EVIDENCE,
        decidedAt: new Date('2026-08-11T00:00:00Z'),
        place: { id: 'place-9', name: 'Quán ăn ABC', slug: 'quan-an-abc' },
      }),
    ]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    const result = await sut.listByRequester({ requesterId: 'user-abc', limit: 100 });

    expect(result).toEqual([
      {
        id: 'claim-9',
        placeId: 'place-1',
        placeName: 'Quán ăn ABC',
        placeSlug: 'quan-an-abc',
        status: ClaimStatus.REJECTED,
        reasonCode: ClaimReasonCode.INSUFFICIENT_EVIDENCE,
        decidedAt: new Date('2026-08-11T00:00:00Z'),
        createdAt: new Date('2026-08-10T00:00:00Z'),
        updatedAt: new Date('2026-08-10T00:00:00Z'),
      },
    ]);
    // Kết quả KHÔNG có evidence/reviewerId/decisionNote dưới bất kỳ hình thức nào.
    expect(result[0]).not.toHaveProperty('evidence');
    expect(result[0]).not.toHaveProperty('reviewerId');
    expect(result[0]).not.toHaveProperty('decisionNote');
  });

  it('rỗng -> mảng rỗng (không lỗi khi requester chưa có claim nào)', async () => {
    const { qb } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    const result = await sut.listByRequester({ requesterId: 'user-abc', limit: 100 });

    expect(result).toEqual([]);
  });
});

// GET /business-claims (list) — hàng đợi moderator. Hai tính chất quan trọng ở tầng CSDL:
// (1) `evidence` KHÔNG được nạp cho MỖI dòng hàng đợi (riêng tư + JSONB nặng, chỉ lộ ở detail);
// (2) place/requester được join THẬT để hàng đợi có tên đọc được — không có route tra place theo
// UUID nên thiếu join này thì màn hình duyệt chỉ còn UUID trần.
describe('BusinessClaimsRepository.list (hàng đợi moderator)', () => {
  let repo: LooseMock<Repository<BusinessClaim>>;
  let sut: BusinessClaimsRepository;

  function fakeQb(rows: unknown[], total = rows.length) {
    const calls: {
      andWhere: Array<[string, unknown]>;
      select: unknown[][];
      addSelect: unknown[][];
      orderBy: Array<[string, string]>;
    } = { andWhere: [], select: [], addSelect: [], orderBy: [] };
    const qb: Record<string, jest.Mock> = {};
    qb.innerJoin = jest.fn().mockReturnValue(qb);
    qb.withDeleted = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn((cond: string, params: unknown) => {
      calls.andWhere.push([cond, params]);
      return qb;
    });
    qb.select = jest.fn((cols: unknown[]) => {
      calls.select.push(cols);
      return qb;
    });
    qb.addSelect = jest.fn((cols: unknown[]) => {
      calls.addSelect.push(cols);
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
    qb.getCount = jest.fn().mockResolvedValue(total);
    qb.getMany = jest.fn().mockResolvedValue(rows);
    return { qb, calls };
  }

  function fakeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'claim-1',
      placeId: 'place-1',
      requesterId: 'user-1',
      status: ClaimStatus.PENDING,
      reviewerId: null,
      reasonCode: null,
      decisionNote: null,
      decidedAt: null,
      createdAt: new Date('2026-08-10T00:00:00Z'),
      updatedAt: new Date('2026-08-10T00:00:00Z'),
      place: { id: 'place-1', name: 'Test Place', slug: 'test-place' },
      requester: { id: 'user-1', displayName: 'Người Yêu Cầu' },
      ...overrides,
    };
  }

  beforeEach(() => {
    repo = createMock<Repository<BusinessClaim>>();
    sut = new BusinessClaimsRepository(repo);
  });

  it('innerJoin place + requester + withDeleted (place đã lưu trữ vẫn hiển thị được)', async () => {
    const { qb } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.list({ status: ClaimStatus.PENDING, limit: 20, offset: 0 });

    expect(qb.innerJoin).toHaveBeenCalledWith('c.place', 'place');
    expect(qb.innerJoin).toHaveBeenCalledWith('c.requester', 'requester');
    expect(qb.withDeleted).toHaveBeenCalled();
  });

  it('select() KHÔNG nạp evidence (riêng tư — chỉ lộ ở GET /business-claims/{id})', async () => {
    const { qb, calls } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.list({ status: ClaimStatus.PENDING, limit: 20, offset: 0 });

    const selected = [...calls.select.flat(), ...calls.addSelect.flat()];
    expect(selected).not.toContain('c.evidence');
    expect(selected).toEqual(
      expect.arrayContaining(['c.id', 'c.placeId', 'c.requesterId', 'place.name', 'place.slug', 'requester.displayName']),
    );
  });

  it('KHÔNG nạp email người yêu cầu (chỉ displayName)', async () => {
    const { qb, calls } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.list({ status: ClaimStatus.PENDING, limit: 20, offset: 0 });

    const selected = [...calls.select.flat(), ...calls.addSelect.flat()];
    expect(selected).not.toContain('requester.email');
  });

  it('lọc theo status và place_id khi được truyền', async () => {
    const { qb, calls } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.list({ status: ClaimStatus.APPROVED, placeId: 'place-9', limit: 20, offset: 0 });

    expect(calls.andWhere).toEqual([
      ['c.status = :status', { status: ClaimStatus.APPROVED }],
      ['c.placeId = :placeId', { placeId: 'place-9' }],
    ]);
  });

  it('sắp xếp CỐ ĐỊNH createdAt ASC, id ASC (hàng đợi cũ nhất trước, tie-break xác định)', async () => {
    const { qb, calls } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.list({ status: ClaimStatus.PENDING, limit: 20, offset: 0 });

    expect(calls.orderBy).toEqual([
      ['c.createdAt', 'ASC'],
      ['c.id', 'ASC'],
    ]);
  });

  it('map place/requester đã join thành field phẳng, KHÔNG kèm evidence', async () => {
    const { qb } = fakeQb([fakeRow()], 1);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    const result = await sut.list({ status: ClaimStatus.PENDING, limit: 20, offset: 0 });

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual({
      id: 'claim-1',
      placeId: 'place-1',
      placeName: 'Test Place',
      placeSlug: 'test-place',
      requesterId: 'user-1',
      requesterDisplayName: 'Người Yêu Cầu',
      status: ClaimStatus.PENDING,
      reviewerId: null,
      reasonCode: null,
      decisionNote: null,
      decidedAt: null,
      createdAt: new Date('2026-08-10T00:00:00Z'),
      updatedAt: new Date('2026-08-10T00:00:00Z'),
    });
    expect(result.items[0]).not.toHaveProperty('evidence');
  });
});

// GET /business-claims/{id} — detail PHẢI nạp place/requester (mapper đọc thẳng hai quan hệ này).
describe('BusinessClaimsRepository.findByIdWithRelations', () => {
  let repo: LooseMock<Repository<BusinessClaim>>;
  let sut: BusinessClaimsRepository;

  beforeEach(() => {
    repo = createMock<Repository<BusinessClaim>>();
    sut = new BusinessClaimsRepository(repo);
  });

  it('findOne kèm relations place+requester và withDeleted', async () => {
    repo.findOne = jest.fn().mockResolvedValue(null);

    await sut.findByIdWithRelations('claim-1');

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'claim-1' },
      relations: { place: true, requester: true },
      withDeleted: true,
    });
  });
});
