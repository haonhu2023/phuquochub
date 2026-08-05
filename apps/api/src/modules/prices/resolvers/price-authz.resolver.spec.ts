import { PriceAuthzResolver } from './price-authz.resolver';
import { PricesRepository } from '../repositories/prices.repository';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

describe('PriceAuthzResolver (ADR-019 D5/D16)', () => {
  let prices: LooseMock<PricesRepository>;
  let resolver: PriceAuthzResolver;

  beforeEach(() => {
    prices = createMock<PricesRepository>({ findById: jest.fn() });
    resolver = new PriceAuthzResolver(prices);
  });

  it('price tồn tại, entity_type=place -> context với businessId = entity_id, ownerId null', async () => {
    prices.findById.mockResolvedValue({
      id: 'price-1',
      entityType: 'place',
      entityId: 'place-A',
    } as never);

    const ctx = await resolver.resolve({ resourceId: 'price-1', resourceType: 'price', userId: 'u1' });

    expect(prices.findById).toHaveBeenCalledWith('price-1');
    expect(ctx).toEqual({
      resourceType: 'price',
      resourceId: 'price-1',
      businessId: 'place-A',
      ownerId: null,
    });
  });

  it('price không tồn tại (hoặc đã xoá mềm) -> null', async () => {
    prices.findById.mockResolvedValue(null);

    const ctx = await resolver.resolve({ resourceId: 'missing', resourceType: 'price', userId: 'u1' });

    expect(ctx).toBeNull();
  });

  it('entity_type KHÁC place -> null', async () => {
    prices.findById.mockResolvedValue({
      id: 'price-2',
      entityType: 'hotel',
      entityId: 'hotel-1',
    } as never);

    const ctx = await resolver.resolve({ resourceId: 'price-2', resourceType: 'price', userId: 'u1' });

    expect(ctx).toBeNull();
  });

  it('không có side effect: chỉ gọi findById', async () => {
    prices.findById.mockResolvedValue({ id: 'p1', entityType: 'place', entityId: 'pl1' } as never);

    await resolver.resolve({ resourceId: 'p1', resourceType: 'price', userId: 'u1' });

    expect(prices.findById).toHaveBeenCalledTimes(1);
  });
});
