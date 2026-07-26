import { ApiError, apiPost } from './http';

const realFetch = global.fetch;

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('apiPost', () => {
  it('gửi Bearer + JSON body, bóc data từ envelope thành công', async () => {
    mockFetchOnce(201, { success: true, data: null, meta: {} });

    const result = await apiPost<null>('/places/p1/reviews', 'tok123', { rating: 5 });

    expect(result).toBeNull();
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok123');
    expect(JSON.parse(init.body)).toEqual({ rating: 5 });
  });

  it('envelope lỗi 409 → ApiError.isConflict', async () => {
    mockFetchOnce(409, { success: false, error: { code: 'CONFLICT', message: 'Đã đánh giá' } });

    await expect(apiPost('/places/p1/reviews', 'tok', { rating: 5 })).rejects.toMatchObject({
      status: 409,
      isConflict: true,
    });
  });

  it('response không phải JSON → ApiError chung', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    }) as unknown as typeof fetch;

    await expect(apiPost('/places/p1/reviews', 'tok', {})).rejects.toBeInstanceOf(ApiError);
  });
});
