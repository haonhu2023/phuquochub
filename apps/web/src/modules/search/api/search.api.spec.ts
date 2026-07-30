import { searchPlaces } from './search.api';

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

describe('searchPlaces — query parameter construction (Search Filters)', () => {
  it('chỉ q → gọi /search?q=... (không filter thừa)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await searchPlaces({ q: 'bai sao' });
    expect(calledPath()).toBe('/api/search?q=bai+sao');
  });

  it('gắn đủ mọi bộ lọc được backend hỗ trợ (category/ward/price_range + page/limit)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await searchPlaces({
      q: 'resort',
      page: 2,
      limit: 10,
      category: 'c1',
      ward: 'Dương Đông',
      price_range: 'high',
    });

    const params = calledUrl().searchParams;
    expect(params.get('q')).toBe('resort');
    expect(params.get('page')).toBe('2');
    expect(params.get('limit')).toBe('10');
    expect(params.get('category')).toBe('c1');
    expect(params.get('ward')).toBe('Dương Đông');
    expect(params.get('price_range')).toBe('high');
  });

  it('chỉ gắn tham số THỰC SỰ có giá trị (bỏ qua undefined)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await searchPlaces({ q: 'bai sao', price_range: 'high' });

    const path = calledPath();
    expect(path).not.toContain('page=');
    expect(path).not.toContain('category=');
    expect(path).not.toContain('ward=');
    expect(path).toContain('price_range=high');
  });

  it('ward có dấu/khoảng trắng → mã hoá URL đúng, giải mã lại nguyên vẹn', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await searchPlaces({ q: 'bai sao', ward: 'Gành Dầu' });

    expect(calledUrl().search).not.toContain(' ');
    expect(calledUrl().searchParams.get('ward')).toBe('Gành Dầu');
  });

  it('mỗi tham số chỉ xuất hiện một lần (không nhân bản khi kết hợp bộ lọc)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await searchPlaces({ q: 'bai sao', page: 3, category: 'c1', ward: 'An Thới', price_range: 'free' });

    expect(calledUrl().searchParams.getAll('ward')).toHaveLength(1);
    expect(calledUrl().searchParams.getAll('category')).toHaveLength(1);
  });

  it('trả cả data và meta (không đánh rơi meta như apiGet) — khác hành vi cũ trước Search Filters', async () => {
    const meta = { page: 2, pageSize: 20, total: 12, totalPages: 1 };
    mockFetchOnce({ success: true, data: [{ id: 'p1' }], meta });

    const res = await searchPlaces({ q: 'bai sao', page: 2 });

    expect(res.data).toEqual([{ id: 'p1' }]);
    expect(res.meta).toEqual(meta);
  });
});
