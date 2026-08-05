import { PrincipalResolver } from './principal.resolver';

describe('PrincipalResolver (ADR-019 D5/D15 — M0.3, zero-query self resolver)', () => {
  it('trả context với resourceId === userId, ownerId === userId, businessId null, KHÔNG thực hiện truy vấn nào', async () => {
    const resolver = new PrincipalResolver();

    const ctx = await resolver.resolve({
      resourceId: 'ignored-should-not-matter',
      resourceType: 'user',
      userId: 'u1',
    });

    expect(ctx).toEqual({
      resourceType: 'user',
      resourceId: 'u1',
      businessId: null,
      ownerId: 'u1',
    });
  });

  it('không phụ thuộc constructor nào (principal thuần — không repository, không DB)', () => {
    expect(PrincipalResolver.length).toBe(0);
  });

  it('không bao giờ trả null (principal luôn phân giải được — danh tính người gọi đã được JwtAuthGuard xác thực)', async () => {
    const resolver = new PrincipalResolver();
    const ctx = await resolver.resolve({ resourceId: 'x', resourceType: 'media', userId: 'u2' });
    expect(ctx).not.toBeNull();
  });

  it('resourceType phản ánh đúng metadata truyền vào (audit/log — D3), không cố định', async () => {
    const resolver = new PrincipalResolver();
    const ctx = await resolver.resolve({ resourceId: 'x', resourceType: 'media', userId: 'u3' });
    expect(ctx?.resourceType).toBe('media');
  });
});
