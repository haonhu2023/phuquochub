import { listTours } from './tours.api';

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

describe('listTours — query parameter construction', () => {
  it('không truyền tham số nào → gọi /tours (không có "?" thừa)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listTours();
    expect(calledPath()).toBe('/api/tours');
  });

  it('gắn đủ mọi bộ lọc được backend hỗ trợ', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listTours({
      page: 2,
      limit: 10,
      type: 'diving',
      difficulty: 'easy',
      price_range: 'mid',
      max_duration_minutes: 240,
      departure_area: 'An Thới',
      sort: 'duration_asc',
    });

    const params = calledUrl().searchParams;
    expect(params.get('page')).toBe('2');
    expect(params.get('limit')).toBe('10');
    expect(params.get('type')).toBe('diving');
    expect(params.get('difficulty')).toBe('easy');
    expect(params.get('price_range')).toBe('mid');
    expect(params.get('max_duration_minutes')).toBe('240');
    expect(params.get('departure_area')).toBe('An Thới');
    expect(params.get('sort')).toBe('duration_asc');
  });

  it('chỉ gắn tham số THỰC SỰ có giá trị (bỏ qua undefined)', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listTours({ type: 'cruise' });
    const path = calledPath();
    expect(path).not.toContain('page=');
    expect(path).not.toContain('difficulty=');
    expect(path).not.toContain('departure_area=');
    expect(path).toContain('type=cruise');
  });

  it('departure_area có dấu/khoảng trắng → mã hoá URL đúng, giải mã lại nguyên vẹn', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listTours({ departure_area: 'Dương Tơ' });
    expect(calledUrl().search).not.toContain(' ');
    expect(calledUrl().searchParams.get('departure_area')).toBe('Dương Tơ');
  });

  it('max_duration_minutes số → chuỗi trong query string', async () => {
    mockFetchOnce(EMPTY_PAGE);
    await listTours({ max_duration_minutes: 480 });
    expect(calledPath()).toContain('max_duration_minutes=480');
  });

  it('trả cả data và meta (không đánh rơi meta như apiGet)', async () => {
    const meta = { page: 3, pageSize: 20, total: 45, totalPages: 3 };
    mockFetchOnce({ success: true, data: [{ id: 't1' }], meta });
    const res = await listTours({ page: 3 });
    expect(res.data).toEqual([{ id: 't1' }]);
    expect(res.meta).toEqual(meta);
  });
});
