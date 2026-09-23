import { triggerRevalidate } from './revalidate';

describe('triggerRevalidate', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('gọi đúng route nội bộ với Bearer token và { entityType, slug } — không gửi tag thô', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as unknown as typeof fetch;

    await triggerRevalidate({ entityType: 'place', slug: 'bai-sao' }, 'tok123');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/revalidate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok123' },
        body: JSON.stringify({ entityType: 'place', slug: 'bai-sao' }),
      }),
    );
  });

  it('fetch lỗi (mất mạng) → nuốt lỗi, không throw', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(triggerRevalidate({ entityType: 'place', slug: 'bai-sao' }, 'tok')).resolves.toBeUndefined();
  });
});
