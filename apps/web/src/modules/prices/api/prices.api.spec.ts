import { createPlacePrice, listPlacePrices } from './prices.api';

const realFetch = global.fetch;

function mockFetchOnce(body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

function calledUrl(): string {
  const [url] = (global.fetch as jest.Mock).mock.calls[0];
  return new URL(url).pathname;
}

describe('listPlacePrices', () => {
  it('GET /places/:id/prices (công khai, không cần token)', async () => {
    mockFetchOnce({
      success: true,
      data: [{ id: 'p1', service_name: 'Giá phòng/đêm', amount: 800000, currency: 'VND', unit: 'đêm', is_free: false, valid_from: null, valid_to: null, verification_status: 'verified' }],
    });
    const res = await listPlacePrices('place-1');
    expect(calledUrl()).toBe('/api/places/place-1/prices');
    expect(res[0].service_name).toBe('Giá phòng/đêm');
    expect(res[0].amount).toBe(800000);
  });
});

// Đặc quyền, append-only (ADR-006) — response KHÔNG bị redact (khác listPlacePrices công khai).
describe('createPlacePrice', () => {
  it('POST /places/:id/prices, đúng URL/method/body/token, trả bản ghi vừa tạo KHÔNG bị redact', async () => {
    mockFetchOnce({
      success: true,
      data: { id: 'p1', service_name: 'Giá/người', amount: 150000, currency: 'VND', unit: 'người', is_free: false, valid_from: null, valid_to: null, verification_status: 'pending' },
    });

    const res = await createPlacePrice('place-1', { service_name: 'Giá/người', amount: 150000, unit: 'người' }, 'tok');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(new URL(url).pathname).toBe('/api/places/place-1/prices');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ service_name: 'Giá/người', amount: 150000, unit: 'người' });
    // pending nhưng amount vẫn có giá trị thật — đây là response đặc quyền, không phải public list.
    expect(res.amount).toBe(150000);
    expect(res.verification_status).toBe('pending');
  });
});
