import { ContactAuthzResolver } from './contact-authz.resolver';
import { ContactsRepository } from '../repositories/contacts.repository';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

describe('ContactAuthzResolver (ADR-019 D5/D16)', () => {
  let contacts: LooseMock<ContactsRepository>;
  let resolver: ContactAuthzResolver;

  beforeEach(() => {
    contacts = createMock<ContactsRepository>({ findById: jest.fn() });
    resolver = new ContactAuthzResolver(contacts);
  });

  it('contact tồn tại, owner_type=place -> context với businessId = owner_id, ownerId null', async () => {
    contacts.findById.mockResolvedValue({
      id: 'contact-1',
      ownerType: 'place',
      ownerId: 'place-A',
    } as never);

    const ctx = await resolver.resolve({ resourceId: 'contact-1', resourceType: 'contact', userId: 'u1' });

    expect(contacts.findById).toHaveBeenCalledWith('contact-1');
    expect(ctx).toEqual({
      resourceType: 'contact',
      resourceId: 'contact-1',
      businessId: 'place-A',
      ownerId: null,
    });
  });

  it('contact không tồn tại (hoặc đã xoá mềm — findById đã lọc deletedAt) -> null', async () => {
    contacts.findById.mockResolvedValue(null);

    const ctx = await resolver.resolve({ resourceId: 'missing', resourceType: 'contact', userId: 'u1' });

    expect(ctx).toBeNull();
  });

  it('owner_type KHÁC place -> null (không cưỡng chế chính sách, chỉ từ chối phân giải danh tính không khớp giả định)', async () => {
    contacts.findById.mockResolvedValue({
      id: 'contact-2',
      ownerType: 'business',
      ownerId: 'biz-1',
    } as never);

    const ctx = await resolver.resolve({ resourceId: 'contact-2', resourceType: 'contact', userId: 'u1' });

    expect(ctx).toBeNull();
  });

  it('không có side effect: chỉ gọi findById, không gọi save/update/softDelete nào', async () => {
    contacts.findById.mockResolvedValue({ id: 'c1', ownerType: 'place', ownerId: 'p1' } as never);

    await resolver.resolve({ resourceId: 'c1', resourceType: 'contact', userId: 'u1' });

    expect(contacts.findById).toHaveBeenCalledTimes(1);
  });
});
