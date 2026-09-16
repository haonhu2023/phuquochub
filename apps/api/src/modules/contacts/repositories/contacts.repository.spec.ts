import type { Repository } from 'typeorm';
import { ContactsRepository } from './contacts.repository';
import { Contact } from '../entities/contact.entity';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('ContactsRepository.updateScalarsIfUnchanged — CAS (audit+conflict hardening, 2026-09-16)', () => {
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
    await expect(sut.updateScalarsIfUnchanged('ct1', {}, new Date())).resolves.toBe(true);
    expect(repo.query).not.toHaveBeenCalled();
  });

  it('patch chỉ có key lạ -> lọc hết, coi như rỗng, không gọi query', async () => {
    await expect(
      sut.updateScalarsIfUnchanged('ct1', { notARealColumn: 'x' }, new Date()),
    ).resolves.toBe(true);
    expect(repo.query).not.toHaveBeenCalled();
  });

  it('UPDATE khớp 1 dòng (tuple đúng hình dạng thật) -> true, cắt về milli-giây ở cả hai vế so sánh', async () => {
    repo.query.mockResolvedValue([[{ id: 'ct1' }], 1]);
    const expectedUpdatedAt = new Date('2026-09-16T00:00:00.123Z');

    const result = await sut.updateScalarsIfUnchanged('ct1', { value: 'giá trị mới' }, expectedUpdatedAt);

    expect(result).toBe(true);
    const [query, params] = repo.query.mock.calls[0];
    expect(sql(query)).toContain('UPDATE contacts SET "value" = $3, updated_at = now()');
    expect(sql(query)).toContain("date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz)");
    expect(sql(query)).toContain('deleted_at IS NULL');
    expect(sql(query)).toContain('RETURNING id');
    expect(params).toEqual(['ct1', expectedUpdatedAt, 'giá trị mới']);
  });

  it('UPDATE khớp 0 dòng (tuple [[], 0] — CAS thất bại thật, vd đã xoá mềm hoặc updated_at đã trôi) -> false, KHÔNG throw', async () => {
    repo.query.mockResolvedValue([[], 0]);
    await expect(sut.updateScalarsIfUnchanged('ct1', { value: 'x' }, new Date())).resolves.toBe(false);
  });
});
