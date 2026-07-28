import { listBeaches } from './beaches.api';

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

const EMPTY_PAGE = { success: true, data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };

function calledUrl(): URL {
  const [url] = (global.fetch as jest.Mock).mock.calls[0];
  return new URL(url);
}

function calledPath(): string {
  const u = calledUrl();
  return u.pathname + u.search;
}

describe('listBeaches — query parameter construction', () => {
  it('không truyền tham số nào → gọi /beaches (không có "?" thừa)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listBeaches();
    expect(calledPath()).toBe('/api/beaches');
  });

  it('gắn đủ mọi bộ lọc được backend hỗ trợ', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listBeaches({ page: 2, limit: 5, ward: 'An Thới', price_range: 'free', sort: 'name_asc' });

    const params = calledUrl().searchParams;
    expect(params.get('page')).toBe('2');
    expect(params.get('limit')).toBe('5');
    expect(params.get('ward')).toBe('An Thới');
    expect(params.get('price_range')).toBe('free');
    expect(params.get('sort')).toBe('name_asc');
  });

  it('chỉ gắn tham số THỰC SỰ có giá trị (bỏ qua undefined)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listBeaches({ ward: 'Gành Dầu' });

    const path = calledPath();
    expect(path).not.toContain('page=');
    expect(path).not.toContain('price_range=');
    expect(path).not.toContain('sort=');
    expect(path).toContain('ward=');
  });

  it('ward có dấu/khoảng trắng → mã hoá URL đúng, giải mã lại nguyên vẹn', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listBeaches({ ward: 'Cửa Dương' });

    expect(calledUrl().search).not.toContain(' ');
    expect(calledUrl().searchParams.get('ward')).toBe('Cửa Dương');
  });

  it('mỗi tham số chỉ xuất hiện một lần (không nhân bản khi kết hợp bộ lọc)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listBeaches({ page: 2, ward: 'Bãi Thơm', price_range: 'free', sort: 'newest' });

    expect(calledUrl().searchParams.getAll('ward')).toHaveLength(1);
    expect(calledUrl().searchParams.getAll('price_range')).toHaveLength(1);
  });

  it('sort=newest đi xuống API nguyên vẹn (không bị đổi thành mặc định)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listBeaches({ sort: 'newest' });
    expect(calledPath()).toContain('sort=newest');
  });

  it('trả cả data và meta (không đánh rơi meta như apiGet)', async () => {
    const meta = { page: 2, pageSize: 5, total: 10, totalPages: 2 };
    mockFetchOnce({ success: true, data: [{ id: 'b1' }], meta });

    const res = await listBeaches({ page: 2, limit: 5 });

    expect(res.data).toEqual([{ id: 'b1' }]);
    expect(res.meta).toEqual(meta);
  });
});
