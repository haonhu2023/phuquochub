import { listAllAmenities, listPlaceAmenities, updatePlaceAmenities } from './amenities.api';

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

function calledUrl(): string {
  const [url] = (global.fetch as jest.Mock).mock.calls[0];
  return new URL(url).pathname + new URL(url).search;
}

describe('listAllAmenities', () => {
  it('không group -> GET /amenities không query', async () => {
    mockFetchOnce({ success: true, data: [] });
    await listAllAmenities();
    expect(calledUrl()).toBe('/api/amenities');
  });

  it('có group -> gắn ?group=', async () => {
    mockFetchOnce({ success: true, data: [] });
    await listAllAmenities('facility');
    expect(calledUrl()).toBe('/api/amenities?group=facility');
  });
});

describe('listPlaceAmenities', () => {
  it('GET /places/:id/amenities (công khai)', async () => {
    mockFetchOnce({ success: true, data: [{ id: 'a1', code: 'wifi', label_vi: 'Wi-Fi miễn phí', label_en: null, icon: null, group: 'connectivity' }] });
    const res = await listPlaceAmenities('p1');
    expect(calledUrl()).toBe('/api/places/p1/amenities');
    expect(res[0].code).toBe('wifi');
  });
});

describe('updatePlaceAmenities', () => {
  it('PUT thay TOÀN BỘ gán, đúng URL/method/body (kèm expected_content_version)/token', async () => {
    mockFetchOnce({ success: true, data: { amenities: [], content_version: 3 } });
    await updatePlaceAmenities('p1', ['wifi', 'pool'], 2, 'token-1');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(new URL(url).pathname).toBe('/api/places/p1/amenities');
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body)).toEqual({ amenity_codes: ['wifi', 'pool'], expected_content_version: 2 });
  });
});
