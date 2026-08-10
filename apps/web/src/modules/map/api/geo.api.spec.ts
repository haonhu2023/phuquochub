import { bbox } from './geo.api';

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

const EMPTY = { success: true, data: [] };

function calledUrl(): URL {
  const [url] = (global.fetch as jest.Mock).mock.calls[0];
  return new URL(url);
}

describe('bbox — query parameter construction (Search Filters trên bản đồ)', () => {
  const BASE = { minLng: 103.8, minLat: 10.0, maxLng: 104.1, maxLat: 10.4, zoom: 12 };

  it('không filter → chỉ minLng/minLat/maxLng/maxLat/zoom, không có category/ward', async () => {
    mockFetchOnce(EMPTY);
    await bbox(BASE);

    const params = calledUrl().searchParams;
    expect(params.get('minLng')).toBe('103.8');
    expect(params.get('zoom')).toBe('12');
    expect(params.has('category')).toBe(false);
    expect(params.has('ward')).toBe(false);
  });

  it('có category/ward → gắn vào query string', async () => {
    mockFetchOnce(EMPTY);
    await bbox({ ...BASE, category: 'c1', ward: 'An Thới' });

    const params = calledUrl().searchParams;
    expect(params.get('category')).toBe('c1');
    expect(params.get('ward')).toBe('An Thới');
  });
});
