import { evaluateScopedAccess, grantScopeOf, matchesScopedContext } from './scoped-authorization.util';
import type { AuthorizationContext } from './authorization-context';
import type { ScopedGrant } from './scoped-grant';

function grant(overrides: Partial<ScopedGrant> = {}): ScopedGrant {
  return { code: 'Place.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'place-A', ...overrides };
}

function ctx(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return { resourceType: 'place', resourceId: 'place-A', businessId: 'place-A', ownerId: null, ...overrides };
}

describe('grantScopeOf', () => {
  it('wildcard toàn cục và theo module -> any', () => {
    expect(grantScopeOf('*')).toBe('any');
    expect(grantScopeOf('Place.*')).toBe('any');
  });

  it('hậu tố .Any -> any', () => {
    expect(grantScopeOf('Place.Edit.Any')).toBe('any');
  });

  it('không hậu tố -> any (coi như Any, đúng quy ước authorization.util.ts)', () => {
    expect(grantScopeOf('Media.Moderate')).toBe('any');
    expect(grantScopeOf('Place.Edit')).toBe('any');
  });

  it('hậu tố .Managed / .Own -> đúng scope tương ứng', () => {
    expect(grantScopeOf('Place.Edit.Managed')).toBe('managed');
    expect(grantScopeOf('Place.Edit.Own')).toBe('own');
  });
});

describe('matchesScopedContext', () => {
  it('Managed: businessId khớp -> true', () => {
    expect(matchesScopedContext(grant({ businessId: 'place-A' }), ctx({ businessId: 'place-A' }), 'u1')).toBe(true);
  });

  it('Managed: businessId khác -> false', () => {
    expect(matchesScopedContext(grant({ businessId: 'place-A' }), ctx({ businessId: 'place-B' }), 'u1')).toBe(false);
  });

  it('Managed: businessId null trên grant -> false (fail closed theo cấu trúc, D6)', () => {
    expect(matchesScopedContext(grant({ businessId: null }), ctx({ businessId: 'place-A' }), 'u1')).toBe(false);
  });

  it('Own: ownerId của context khớp userId của người gọi -> true', () => {
    const g = grant({ code: 'Review.Reply.Own', scopeType: 'own', businessId: null });
    expect(matchesScopedContext(g, ctx({ ownerId: 'u1' }), 'u1')).toBe(true);
  });

  it('Own: ownerId khác userId -> false', () => {
    const g = grant({ code: 'Review.Reply.Own', scopeType: 'own', businessId: null });
    expect(matchesScopedContext(g, ctx({ ownerId: 'u2' }), 'u1')).toBe(false);
  });

  it('Own: ownerId null trên context -> false', () => {
    const g = grant({ code: 'Review.Reply.Own', scopeType: 'own', businessId: null });
    expect(matchesScopedContext(g, ctx({ ownerId: null }), 'u1')).toBe(false);
  });
});

describe('evaluateScopedAccess (D2 — hai pha, ngữ cảnh LƯỜI)', () => {
  it('Any grant -> allow, KHÔNG BAO GIỜ gọi contextProvider', async () => {
    const provider = jest.fn();
    const grants = [grant({ code: 'Place.Edit.Any', scopeType: 'global', businessId: null })];

    await expect(evaluateScopedAccess(grants, 'Place.Edit.Managed', 'u1', provider)).resolves.toBe(true);
    expect(provider).not.toHaveBeenCalled();
  });

  it('wildcard `*` -> allow, KHÔNG gọi contextProvider', async () => {
    const provider = jest.fn();
    const grants = [grant({ code: '*', scopeType: 'global', businessId: null })];

    await expect(evaluateScopedAccess(grants, 'Place.Edit.Managed', 'u1', provider)).resolves.toBe(true);
    expect(provider).not.toHaveBeenCalled();
  });

  it('permission không hậu tố scope (Moderation-style, vd Media.Moderate) -> đường cũ, KHÔNG cần context', async () => {
    const provider = jest.fn();
    const grants = [grant({ code: 'Media.Moderate', scopeType: 'global', businessId: null })];

    await expect(evaluateScopedAccess(grants, 'Media.Moderate', 'u1', provider)).resolves.toBe(true);
    expect(provider).not.toHaveBeenCalled();
  });

  it('scope-less permission KHÔNG có grant khớp -> deny, KHÔNG gọi provider', async () => {
    const provider = jest.fn();
    await expect(evaluateScopedAccess([], 'Media.Moderate', 'u1', provider)).resolves.toBe(false);
    expect(provider).not.toHaveBeenCalled();
  });

  it('Managed grant, businessId khớp context -> allow', async () => {
    const provider = jest.fn().mockResolvedValue(ctx({ businessId: 'place-A' }));
    const grants = [grant({ businessId: 'place-A' })];

    await expect(evaluateScopedAccess(grants, 'Place.Edit.Managed', 'u1', provider)).resolves.toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('Managed grant, businessId KHÁC context -> deny', async () => {
    const provider = jest.fn().mockResolvedValue(ctx({ businessId: 'place-B' }));
    const grants = [grant({ businessId: 'place-A' })];

    await expect(evaluateScopedAccess(grants, 'Place.Edit.Managed', 'u1', provider)).resolves.toBe(false);
  });

  it('Managed grant với businessId=null trên chính grant -> deny (fail closed cấu trúc)', async () => {
    const provider = jest.fn().mockResolvedValue(ctx({ businessId: 'place-A' }));
    const grants = [grant({ businessId: null })];

    await expect(evaluateScopedAccess(grants, 'Place.Edit.Managed', 'u1', provider)).resolves.toBe(false);
  });

  it('Managed grant thỏa MÃN required scope Own (Managed ⊃ Own) qua so businessId, không so ownerId', async () => {
    const provider = jest.fn().mockResolvedValue(ctx({ businessId: 'place-A', ownerId: 'someone-else' }));
    const grants = [grant({ code: 'Place.Edit.Managed', businessId: 'place-A' })];

    await expect(evaluateScopedAccess(grants, 'Place.Edit.Own', 'u1', provider)).resolves.toBe(true);
  });

  it('Own grant KHÔNG BAO GIỜ thỏa required scope Managed (hạng 1 < 2)', async () => {
    const provider = jest.fn();
    const grants = [grant({ code: 'Place.Edit.Own', scopeType: 'own', businessId: null })];

    await expect(evaluateScopedAccess(grants, 'Place.Edit.Managed', 'u1', provider)).resolves.toBe(false);
    // Own không lọt qua grantSatisfies() cho required=Managed nên contextBound rỗng -> KHÔNG gọi provider.
    expect(provider).not.toHaveBeenCalled();
  });

  it('Own grant, ownerId khớp người gọi -> allow', async () => {
    const provider = jest.fn().mockResolvedValue(ctx({ ownerId: 'u1' }));
    const grants = [grant({ code: 'Review.Reply.Own', scopeType: 'own', businessId: null })];

    await expect(evaluateScopedAccess(grants, 'Review.Reply.Own', 'u1', provider)).resolves.toBe(true);
  });

  it('Own grant, ownerId KHÔNG khớp người gọi -> deny', async () => {
    const provider = jest.fn().mockResolvedValue(ctx({ ownerId: 'u2' }));
    const grants = [grant({ code: 'Review.Reply.Own', scopeType: 'own', businessId: null })];

    await expect(evaluateScopedAccess(grants, 'Review.Reply.Own', 'u1', provider)).resolves.toBe(false);
  });

  it('deny tường minh thắng allow bao trùm, KHÔNG cần ngữ cảnh (D7)', async () => {
    const provider = jest.fn();
    const grants = [
      grant({ code: '*', effect: 'allow', scopeType: 'global', businessId: null }),
      grant({ code: 'Place.Edit.Managed', effect: 'deny', scopeType: 'managed', businessId: null }),
    ];

    await expect(evaluateScopedAccess(grants, 'Place.Edit.Managed', 'u1', provider)).resolves.toBe(false);
    expect(provider).not.toHaveBeenCalled();
  });

  it('không có grant nào khớp -> deny (deny-by-default)', async () => {
    await expect(evaluateScopedAccess([], 'Place.Edit.Managed', 'u1')).resolves.toBe(false);
  });

  it('grant Managed thỏa mãn nhưng KHÔNG có contextProvider -> deny (INV-A1 fail closed)', async () => {
    const grants = [grant({ businessId: 'place-A' })];
    await expect(evaluateScopedAccess(grants, 'Place.Edit.Managed', 'u1')).resolves.toBe(false);
  });

  it('contextProvider trả null -> deny (INV-A4)', async () => {
    const provider = jest.fn().mockResolvedValue(null);
    const grants = [grant({ businessId: 'place-A' })];

    await expect(evaluateScopedAccess(grants, 'Place.Edit.Managed', 'u1', provider)).resolves.toBe(false);
  });

  it('contextProvider ném lỗi -> deny, KHÔNG throw ra ngoài (INV-A5)', async () => {
    const provider = jest.fn().mockRejectedValue(new Error('resolver crashed'));
    const grants = [grant({ businessId: 'place-A' })];

    await expect(evaluateScopedAccess(grants, 'Place.Edit.Managed', 'u1', provider)).resolves.toBe(false);
  });

  it('nhiều ScopedGrant Managed khác business — chỉ khớp đúng cái trùng context, không rò rỉ sang business khác', async () => {
    const provider = jest.fn().mockResolvedValue(ctx({ businessId: 'place-B' }));
    const grants = [grant({ businessId: 'place-A' }), grant({ businessId: 'place-B' }), grant({ businessId: 'place-C' })];

    await expect(evaluateScopedAccess(grants, 'Place.Edit.Managed', 'u1', provider)).resolves.toBe(true);
  });
});
