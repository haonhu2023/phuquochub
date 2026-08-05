import { IdentityPlaceResolver } from './identity-place.resolver';

describe('IdentityPlaceResolver (ADR-019 D5/D16 — zero-query identity resolver)', () => {
  it('trả context với businessId === resourceId, ownerId null, KHÔNG thực hiện truy vấn nào', async () => {
    const resolver = new IdentityPlaceResolver();

    const ctx = await resolver.resolve({
      resourceId: 'place-A',
      resourceType: 'place',
      userId: 'u1',
    });

    expect(ctx).toEqual({
      resourceType: 'place',
      resourceId: 'place-A',
      businessId: 'place-A',
      ownerId: null,
    });
  });

  it('không phụ thuộc constructor nào (identity thuần — không repository, không DB)', () => {
    expect(IdentityPlaceResolver.length).toBe(0);
  });

  it('không bao giờ trả null (identity luôn phân giải được — id CHÍNH LÀ businessId)', async () => {
    const resolver = new IdentityPlaceResolver();
    const ctx = await resolver.resolve({ resourceId: 'any-id', resourceType: 'place', userId: 'u2' });
    expect(ctx).not.toBeNull();
  });
});
