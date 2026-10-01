import { getRestaurant, listAllCuisines, listRestaurants, updateRestaurantDetails } from './restaurants.api';

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

// 2026-09-17 (real-data pass): trước bản sửa này, getRestaurant() không truyền `?locale=` nên
// /en/restaurants/{slug} luôn nhận nội dung mặc định của server bất kể route — API đã hỗ trợ
// `?locale=` từ trước (xác nhận trực tiếp trên production), chỉ web quên gọi.
describe('getRestaurant — locale forwarding', () => {
  it('không truyền locale -> mặc định "vi" (khớp hành vi cũ)', async () => {
    mockFetchOnce({ success: true, data: { id: 'r1' } });
    await getRestaurant('sailing-club-phu-quoc');
    expect(calledPath()).toBe('/api/restaurants/sailing-club-phu-quoc?locale=vi');
  });

  it('truyền locale="en" -> gọi đúng ?locale=en', async () => {
    mockFetchOnce({ success: true, data: { id: 'r1' } });
    await getRestaurant('sailing-club-phu-quoc', 'en');
    expect(calledPath()).toBe('/api/restaurants/sailing-club-phu-quoc?locale=en');
  });
});

describe('listAllCuisines', () => {
  it('gọi GET /restaurants/cuisines (công khai)', async () => {
    mockFetchOnce({ success: true, data: [{ id: 'c1', code: 'seafood', label_vi: 'Hải sản', label_en: 'Seafood' }] });
    const res = await listAllCuisines();
    expect(calledPath()).toBe('/api/restaurants/cuisines');
    expect(res).toEqual([{ id: 'c1', code: 'seafood', label_vi: 'Hải sản', label_en: 'Seafood' }]);
  });
});

// PATCH TỪNG PHẦN thật (product spec, 2026-09-29) — field bỏ qua giữ nguyên, `null` xoá. Kiểm cả
// URL/method/body thật gửi qua fetch (không phải mock @/lib/http) để bắt đúng những gì đi qua dây.
describe('updateRestaurantDetails', () => {
  it('PATCH đúng URL, gửi body nguyên vẹn kể cả field null (xoá dietary) + expected_content_version', async () => {
    mockFetchOnce({ success: true, data: { is_local_specialty: true, dietary: null, cuisines: [], content_version: 2 } });
    await updateRestaurantDetails('r1', { expected_content_version: 1, is_local_specialty: true, dietary: null }, 'token-1');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(new URL(url).pathname).toBe('/api/restaurants/r1/details');
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body)).toEqual({ expected_content_version: 1, is_local_specialty: true, dietary: null });
  });

  it('cuisine_codes vắng mặt -> KHÔNG có key đó trong body (giữ nguyên gán hiện có)', async () => {
    mockFetchOnce({ success: true, data: { content_version: 1, cuisines: [] } });
    await updateRestaurantDetails('r1', { expected_content_version: 1, is_local_specialty: false }, 'token-1');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).not.toHaveProperty('cuisine_codes');
  });
});
