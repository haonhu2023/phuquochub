import type { Repository } from 'typeorm';
import { ContactsRepository } from './contacts.repository';
import { Contact } from '../entities/contact.entity';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('ContactsRepository.updateScalarsIfUnchanged — CAS (audit+conflict hardening, 2026-09-16; xmin 2026-09-17)', () => {
  let repo: LooseMock<Repository<Contact>>;
  let sut: ContactsRepository;

  beforeEach(() => {
    repo = createMock<Repository<Contact>>({ query: jest.fn() });
    sut = new ContactsRepository(repo);
  });

  // BUG THẬT đã xảy ra (phát hiện qua e2e trên Postgres thật, 2026-09-16, xem PlacesRepository.
  // updateScalarsIfUnchanged()'s ghi chú đầy đủ): TypeORM's Repository.query() trả về TUPLE
  // `[rows, affectedCount]` cho UPDATE...RETURNING — mock ở đây CỐ Ý mô phỏng đúng hình dạng đó,
  // không phải mảng rows phẳng, để test có ý nghĩa thật sự.
  it('patch rỗng -> true NGAY, không gọi query', async () => {
    await expect(sut.updateScalarsIfUnchanged('ct1', {}, '100')).resolves.toBe(true);
    expect(repo.query).not.toHaveBeenCalled();
  });

  it('patch chỉ có key lạ -> lọc hết, coi như rỗng, không gọi query', async () => {
    await expect(
      sut.updateScalarsIfUnchanged('ct1', { notARealColumn: 'x' }, '100'),
    ).resolves.toBe(true);
    expect(repo.query).not.toHaveBeenCalled();
  });

  it('UPDATE khớp 1 dòng (tuple đúng hình dạng thật) -> true, so sánh bằng xmin::text (không phải timestamp)', async () => {
    repo.query.mockResolvedValue([[{ id: 'ct1' }], 1]);
    const expectedVersion = '100';

    const result = await sut.updateScalarsIfUnchanged('ct1', { value: 'giá trị mới' }, expectedVersion);

    expect(result).toBe(true);
    const [query, params] = repo.query.mock.calls[0];
    expect(sql(query)).toContain('UPDATE contacts SET "value" = $3, updated_at = now()');
    expect(sql(query)).toContain('xmin::text = $2');
    // KHÔNG còn so sánh timestamp làm tròn — hai ghi thật cùng mili-giây trước đây có thể cùng
    // "khớp" và đè mất nhau (lost update); xem ghi chú đầy đủ tại updateScalarsIfUnchanged().
    expect(sql(query)).not.toContain('date_trunc');
    expect(sql(query)).toContain('deleted_at IS NULL');
    expect(sql(query)).toContain('RETURNING id');
    expect(params).toEqual(['ct1', expectedVersion, 'giá trị mới']);
  });

  it('UPDATE khớp 0 dòng (tuple [[], 0] — CAS thất bại thật, vd đã xoá mềm hoặc version đã trôi) -> false, KHÔNG throw', async () => {
    repo.query.mockResolvedValue([[], 0]);
    await expect(sut.updateScalarsIfUnchanged('ct1', { value: 'x' }, '100')).resolves.toBe(false);
  });
});

describe('ContactsRepository.getVersion / getVersions (2026-09-17)', () => {
  let repo: LooseMock<Repository<Contact>>;
  let sut: ContactsRepository;

  beforeEach(() => {
    repo = createMock<Repository<Contact>>({ query: jest.fn() });
    sut = new ContactsRepository(repo);
  });

  it('getVersion -> SELECT xmin::text đúng id, trả version hoặc null nếu không có dòng', async () => {
    repo.query.mockResolvedValueOnce([{ version: '100' }]);
    await expect(sut.getVersion('ct1')).resolves.toBe('100');
    expect(sql(repo.query.mock.calls[0][0])).toContain('SELECT xmin::text AS version FROM contacts WHERE id = $1');
    expect(repo.query.mock.calls[0][1]).toEqual(['ct1']);

    repo.query.mockResolvedValueOnce([]);
    await expect(sut.getVersion('missing')).resolves.toBeNull();
  });

  it('getVersions -> mảng rỗng không gọi query, trả Map rỗng', async () => {
    await expect(sut.getVersions([])).resolves.toEqual(new Map());
    expect(repo.query).not.toHaveBeenCalled();
  });

  it('getVersions -> một round-trip cho nhiều id, trả Map id->version', async () => {
    repo.query.mockResolvedValueOnce([
      { id: 'ct1', version: '100' },
      { id: 'ct2', version: '101' },
    ]);
    const result = await sut.getVersions(['ct1', 'ct2']);
    expect(result).toEqual(new Map([['ct1', '100'], ['ct2', '101']]));
    expect(sql(repo.query.mock.calls[0][0])).toContain('WHERE id = ANY($1)');
  });
});
