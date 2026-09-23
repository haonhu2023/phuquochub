import { ConfigService } from '@nestjs/config';
import { CacheInvalidationService } from './cache-invalidation.service';

function makeConfig(cfg: { webInternalUrl: string | null; sharedSecret: string | null }): ConfigService {
  return { get: (key: string) => (key === 'cacheInvalidation' ? cfg : undefined) } as unknown as ConfigService;
}

describe('CacheInvalidationService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('WEB_INTERNAL_URL/REVALIDATE_INTERNAL_SECRET chưa cấu hình → không gọi fetch, không throw', async () => {
    const mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
    const sut = new CacheInvalidationService(makeConfig({ webInternalUrl: null, sharedSecret: null }));

    await expect(sut.invalidatePlace('bai-sao')).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('đã cấu hình → POST tới <webInternalUrl>/api/revalidate với header secret và { entityType, slug }', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as unknown as typeof fetch;
    const sut = new CacheInvalidationService(
      makeConfig({ webInternalUrl: 'http://web:3000', sharedSecret: 'shhh-secret' }),
    );

    await sut.invalidatePlace('bai-sao');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://web:3000/api/revalidate');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Revalidate-Secret': 'shhh-secret' },
      body: JSON.stringify({ entityType: 'place', slug: 'bai-sao' }),
    });
  });

  it('bỏ dấu / thừa ở cuối WEB_INTERNAL_URL — không tạo URL có // kép', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as unknown as typeof fetch;
    const sut = new CacheInvalidationService(
      makeConfig({ webInternalUrl: 'http://web:3000/', sharedSecret: 'secret' }),
    );

    await sut.invalidatePlace('x');

    expect(mockFetch.mock.calls[0][0]).toBe('http://web:3000/api/revalidate');
  });

  it('HTTP lỗi (không throw) → retry tới lần thứ 2 rồi bỏ cuộc êm, không throw ra ngoài', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = mockFetch as unknown as typeof fetch;
    const sut = new CacheInvalidationService(
      makeConfig({ webInternalUrl: 'http://web:3000', sharedSecret: 'secret' }),
    );

    await expect(sut.invalidatePlace('bai-sao')).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('fetch throw (mất mạng) → retry tới lần thứ 2 rồi bỏ cuộc êm, không throw ra ngoài', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = mockFetch as unknown as typeof fetch;
    const sut = new CacheInvalidationService(
      makeConfig({ webInternalUrl: 'http://web:3000', sharedSecret: 'secret' }),
    );

    await expect(sut.invalidatePlace('bai-sao')).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('lần đầu thất bại, lần hai thành công → không thử lần thứ 3', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true });
    global.fetch = mockFetch as unknown as typeof fetch;
    const sut = new CacheInvalidationService(
      makeConfig({ webInternalUrl: 'http://web:3000', sharedSecret: 'secret' }),
    );

    await sut.invalidatePlace('bai-sao');

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
