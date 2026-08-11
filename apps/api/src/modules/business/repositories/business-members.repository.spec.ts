import { Repository } from 'typeorm';
import { BusinessMembersRepository } from './business-members.repository';
import { BusinessMember } from '../entities/business-member.entity';
import { MemberRole } from '../business.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

// GET /business/{id}/managers (listActiveManagers) — security-critical: place_id + role='manager'
// + revoked_at IS NULL PHẢI là điều kiện WHERE thật ở CSDL, và users.password_hash KHÔNG bao giờ
// được liệt trong .select() (chốt chặn kép ở tầng CSDL, xem chú thích method).
describe('BusinessMembersRepository.listActiveManagers', () => {
  let repo: LooseMock<Repository<BusinessMember>>;
  let sut: BusinessMembersRepository;

  function fakeQb(rows: unknown[]) {
    const calls: {
      where: Array<[string, unknown]>;
      andWhere: Array<[string, unknown]>;
      select: unknown[][];
      addSelect: unknown[][];
      orderBy: Array<[string, string]>;
    } = { where: [], andWhere: [], select: [], addSelect: [], orderBy: [] };
    const qb: Record<string, jest.Mock> = {};
    qb.innerJoin = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn((cond: string, params: unknown) => {
      calls.where.push([cond, params]);
      return qb;
    });
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
    qb.getMany = jest.fn().mockResolvedValue(rows);
    return { qb, calls };
  }

  function fakeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'member-1',
      userId: 'user-1',
      grantedAt: new Date('2026-08-10T00:00:00Z'),
      user: { id: 'user-1', email: 'manager@phuquochub.test', displayName: 'Manager One' },
      ...overrides,
    };
  }

  beforeEach(() => {
    repo = createMock<Repository<BusinessMember>>();
    sut = new BusinessMembersRepository(repo);
  });

  it('where lọc ĐÚNG place_id được truyền', async () => {
    const { qb, calls } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.listActiveManagers('place-abc');

    expect(calls.where).toEqual([['m.placeId = :placeId', { placeId: 'place-abc' }]]);
  });

  it('andWhere lọc role=manager và revokedAt IS NULL — owner/revoked KHÔNG lọt qua', async () => {
    const { qb, calls } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.listActiveManagers('place-abc');

    expect(calls.andWhere).toEqual([
      ['m.role = :role', { role: MemberRole.MANAGER }],
      ['m.revokedAt IS NULL', undefined],
    ]);
  });

  it('innerJoin user — cần cho email/display_name hiển thị', async () => {
    const { qb } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.listActiveManagers('place-abc');

    expect(qb.innerJoin).toHaveBeenCalledWith('m.user', 'u');
  });

  it('select() KHÔNG liệt u.passwordHash — không nạp field nhạy cảm từ CSDL', async () => {
    const { qb, calls } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.listActiveManagers('place-abc');

    const selected = [...calls.select.flat(), ...calls.addSelect.flat()];
    expect(selected).not.toContain('u.passwordHash');
    expect(selected).toEqual(
      expect.arrayContaining(['m.id', 'm.userId', 'm.grantedAt', 'u.id', 'u.email', 'u.displayName']),
    );
  });

  it('sắp xếp CỐ ĐỊNH grantedAt ASC, id ASC (tie-break xác định)', async () => {
    const { qb, calls } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    await sut.listActiveManagers('place-abc');

    expect(calls.orderBy).toEqual([
      ['m.grantedAt', 'ASC'],
      ['m.id', 'ASC'],
    ]);
  });

  it('map đúng user.email/user.displayName đã join vào email/displayName phẳng', async () => {
    const { qb } = fakeQb([
      fakeRow({ userId: 'user-9', user: { id: 'user-9', email: 'nguoi@phuquochub.test', displayName: 'Nguyễn Văn A' } }),
    ]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    const result = await sut.listActiveManagers('place-abc');

    expect(result).toEqual([
      {
        userId: 'user-9',
        displayName: 'Nguyễn Văn A',
        email: 'nguoi@phuquochub.test',
        grantedAt: new Date('2026-08-10T00:00:00Z'),
      },
    ]);
    expect(result[0]).not.toHaveProperty('passwordHash');
  });

  it('rỗng -> mảng rỗng (cơ sở chưa có manager nào)', async () => {
    const { qb } = fakeQb([]);
    repo.createQueryBuilder = jest.fn().mockReturnValue(qb);

    const result = await sut.listActiveManagers('place-abc');

    expect(result).toEqual([]);
  });
});
