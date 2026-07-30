import { listCategories } from './categories.api';

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

describe('listCategories', () => {
  it('gọi GET /categories, không tham số nào', async () => {
    mockFetchOnce({ success: true, data: [] });
    await listCategories();

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(new URL(url).pathname).toBe('/api/categories');
    expect(new URL(url).search).toBe('');
  });

  it('unwrap envelope → trả thẳng mảng Category (apiGet, không phân trang)', async () => {
    const categories = [{ id: 'c1', slug: 'hotel', name_vi: 'Khách sạn', name_en: 'Hotel', icon: null, parent_id: null }];
    mockFetchOnce({ success: true, data: categories });

    const res = await listCategories();
    expect(res).toEqual(categories);
  });
});
