import { submitPriceVerification, verifyPriceVerification } from './verifications.api';

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

describe('submitPriceVerification', () => {
  it('POST /verifications đúng target_type=price_history, URL/method/body/token', async () => {
    mockFetchOnce({ success: true, data: { id: 'verif-1', status: 'pending' } });

    const res = await submitPriceVerification('price-1', 'tok', 'ghi chú');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(new URL(url).pathname).toBe('/api/verifications');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ target_type: 'price_history', target_id: 'price-1', note: 'ghi chú' });
    expect(res).toEqual({ id: 'verif-1', status: 'pending' });
  });
});

describe('verifyPriceVerification', () => {
  it('POST /verifications/:id/verify, KHÔNG kèm source_id khi không truyền', async () => {
    mockFetchOnce({ success: true, data: { status: 'verified' } });

    const res = await verifyPriceVerification('verif-1', 'tok');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(new URL(url).pathname).toBe('/api/verifications/verif-1/verify');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ note: undefined });
    expect(res.status).toBe('verified');
  });
});
