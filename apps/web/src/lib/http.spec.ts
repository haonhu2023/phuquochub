import { ApiError, apiDeleteAuth, apiGetAuth, apiGetPaginated, apiGetPaginatedAuth, apiPatchAuth, apiPost } from './http';

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

describe('apiGetPaginated', () => {
  it('trả cả data và meta (page/pageSize/total/totalPages), không bỏ meta như apiGet', async () => {
    const meta = { timestamp: 't', page: 2, pageSize: 10, total: 25, totalPages: 3 };
    mockFetchOnce(200, { success: true, data: [{ id: 'h1' }], meta });

    const res = await apiGetPaginated<{ id: string }>('/hotels?page=2&limit=10');

    expect(res.data).toEqual([{ id: 'h1' }]);
    expect(res.meta).toEqual(meta);
  });

  it('envelope lỗi → ném ApiError (cùng hành vi apiGet)', async () => {
    mockFetchOnce(400, { success: false, error: { code: 'VALIDATION_ERROR', message: 'Sai tham số' } });

    await expect(apiGetPaginated('/hotels?stars=9')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('apiGetAuth', () => {
  it('gửi Bearer, bóc data từ envelope thành công', async () => {
    mockFetchOnce(200, { success: true, data: { id: 'c1' }, meta: {} });

    const result = await apiGetAuth<{ id: string }>('/moderation/cases/c1', 'tok123');

    expect(result).toEqual({ id: 'c1' });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok123');
    expect(init.method).toBeUndefined(); // GET mặc định, không set method
  });

  it('envelope lỗi 403 → ApiError với status đúng', async () => {
    mockFetchOnce(403, { success: false, error: { code: 'FORBIDDEN', message: 'Thiếu quyền' } });

    await expect(apiGetAuth('/moderation/cases', 'tok')).rejects.toMatchObject({ status: 403 });
  });
});

describe('apiGetPaginatedAuth', () => {
  it('gửi Bearer, trả cả data và meta', async () => {
    const meta = { timestamp: 't', page: 1, pageSize: 20, total: 2, totalPages: 1 };
    mockFetchOnce(200, { success: true, data: [{ id: 'c1' }, { id: 'c2' }], meta });

    const res = await apiGetPaginatedAuth<{ id: string }>('/moderation/cases', 'tok123');

    expect(res.data).toEqual([{ id: 'c1' }, { id: 'c2' }]);
    expect(res.meta).toEqual(meta);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok123');
  });

  it('envelope lỗi 401 → ApiError', async () => {
    mockFetchOnce(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Chưa đăng nhập' } });

    await expect(apiGetPaginatedAuth('/moderation/cases', 'tok')).rejects.toMatchObject({ status: 401 });
  });
});

describe('apiPatchAuth', () => {
  it('gửi Bearer + JSON body bằng method PATCH, bóc data từ envelope thành công', async () => {
    mockFetchOnce(200, { success: true, data: { id: 'p1', name: 'Tên mới' }, meta: {} });

    const result = await apiPatchAuth<{ id: string }>('/places/p1', 'tok123', { name: 'Tên mới' });

    expect(result).toEqual({ id: 'p1', name: 'Tên mới' });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe('Bearer tok123');
    expect(JSON.parse(init.body)).toEqual({ name: 'Tên mới' });
  });

  it('envelope lỗi 403 → ApiError với status đúng', async () => {
    mockFetchOnce(403, { success: false, error: { code: 'FORBIDDEN', message: 'Thiếu quyền' } });

    await expect(apiPatchAuth('/places/p1', 'tok', {})).rejects.toMatchObject({ status: 403 });
  });
});

describe('apiDeleteAuth', () => {
  it('gửi Bearer bằng method DELETE, không có body, bóc data từ envelope (EmptySuccess null)', async () => {
    mockFetchOnce(200, { success: true, data: null, meta: {} });

    const result = await apiDeleteAuth<null>('/places/p1', 'tok123');

    expect(result).toBeNull();
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe('DELETE');
    expect(init.headers.Authorization).toBe('Bearer tok123');
    expect(init.body).toBeUndefined();
  });

  it('envelope lỗi 404 → ApiError.isNotFound', async () => {
    mockFetchOnce(404, { success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy' } });

    await expect(apiDeleteAuth('/places/p1', 'tok')).rejects.toMatchObject({ status: 404, isNotFound: true });
  });
});
