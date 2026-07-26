import { listRestaurants } from './restaurants.api';

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

function calledPath(): string {
  const [url] = (global.fetch as jest.Mock).mock.calls[0];
  return new URL(url).pathname + new URL(url).search;
}

describe('listRestaurants — query parameter construction', () => {
  it('không truyền tham số nào → gọi /restaurants (không có "?" thừa)', async () => {
    mockFetchOnce({ success: true, data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    await listRestaurants();
    expect(calledPath()).toBe('/api/restaurants');
  });

  it('chỉ gắn các tham số THỰC SỰ có giá trị (bỏ qua rỗng/undefined)', async () => {
    mockFetchOnce({ success: true, data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    await listRestaurants({ page: 2, limit: 10, price_range: 'mid', cuisine: 'seafood', sort: 'name_asc' });
    const path = calledPath();
    expect(path).toContain('page=2');
    expect(path).toContain('limit=10');
    expect(path).toContain('price_range=mid');
    expect(path).toContain('cuisine=seafood');
    expect(path).toContain('sort=name_asc');
  });

  it('page=1 mặc định KHÔNG bị gắn vào query string (chỉ gắn khi truyền tường minh khác falsy)', async () => {
    mockFetchOnce({ success: true, data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    await listRestaurants({ cuisine: 'bbq' });
    const path = calledPath();
    expect(path).not.toContain('page=');
    expect(path).toContain('cuisine=bbq');
  });

  it('trả cả data và meta (không đánh rơi meta như apiGet)', async () => {
    const meta = { page: 3, pageSize: 20, total: 45, totalPages: 3 };
    mockFetchOnce({ success: true, data: [{ id: 'r1' }], meta });
    const res = await listRestaurants({ page: 3 });
    expect(res.data).toEqual([{ id: 'r1' }]);
    expect(res.meta).toEqual(meta);
  });
});
