import { listAttractions } from './attractions.api';

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

describe('listAttractions — query parameter construction', () => {
  it('không truyền tham số nào → gọi /attractions (không có "?" thừa)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listAttractions();
    expect(calledPath()).toBe('/api/attractions');
  });

  it('gắn đủ mọi bộ lọc được backend hỗ trợ', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listAttractions({ page: 2, limit: 10, ward: 'Dương Đông', price_range: 'free', sort: 'name_asc' });

    const params = calledUrl().searchParams;
    expect(params.get('page')).toBe('2');
    expect(params.get('limit')).toBe('10');
    expect(params.get('ward')).toBe('Dương Đông');
    expect(params.get('price_range')).toBe('free');
    expect(params.get('sort')).toBe('name_asc');
  });

  it('chỉ gắn tham số THỰC SỰ có giá trị (bỏ qua undefined)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listAttractions({ price_range: 'high' });

    const path = calledPath();
    expect(path).not.toContain('page=');
    expect(path).not.toContain('ward=');
    expect(path).not.toContain('sort=');
    expect(path).toContain('price_range=high');
  });

  it('ward có dấu/khoảng trắng → mã hoá URL đúng, giải mã lại nguyên vẹn', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listAttractions({ ward: 'Gành Dầu' });

    expect(calledUrl().search).not.toContain(' ');
    expect(calledUrl().searchParams.get('ward')).toBe('Gành Dầu');
  });

  it('mỗi tham số chỉ xuất hiện một lần (không nhân bản khi kết hợp bộ lọc)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listAttractions({ page: 3, ward: 'An Thới', price_range: 'free', sort: 'newest' });

    expect(calledUrl().searchParams.getAll('ward')).toHaveLength(1);
    expect(calledUrl().searchParams.getAll('sort')).toHaveLength(1);
  });

  it('sort=newest đi xuống API nguyên vẹn (không bị đổi thành mặc định)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listAttractions({ sort: 'newest' });
    expect(calledPath()).toContain('sort=newest');
  });

  it('trả cả data và meta (không đánh rơi meta như apiGet)', async () => {
    const meta = { page: 2, pageSize: 20, total: 12, totalPages: 1 };
    mockFetchOnce({ success: true, data: [{ id: 'a1' }], meta });

    const res = await listAttractions({ page: 2 });

    expect(res.data).toEqual([{ id: 'a1' }]);
    expect(res.meta).toEqual(meta);
  });
});
