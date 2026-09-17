/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { useAuthenticatedImage } from './useAuthenticatedImage';

// Object URL không có thật trong jsdom — giả lập tối thiểu để hook chạy được và bài test kiểm
// tra được đúng blob nào đã được truyền vào createObjectURL/revokeObjectURL.
const mockCreateObjectURL = jest.fn((blob: unknown) => `blob:${(blob as { __tag: string }).__tag}`);
const mockRevokeObjectURL = jest.fn();

beforeAll(() => {
  global.URL.createObjectURL = mockCreateObjectURL;
  global.URL.revokeObjectURL = mockRevokeObjectURL;
});

function mockFetchOk(tag: string) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    blob: () => Promise.resolve({ __tag: tag }),
  });
}

beforeEach(() => {
  mockCreateObjectURL.mockClear();
  mockRevokeObjectURL.mockClear();
});

describe('useAuthenticatedImage', () => {
  it('url/token hợp lệ -> fetch có header Authorization, trả về Object URL', async () => {
    global.fetch = mockFetchOk('a') as unknown as typeof fetch;
    const { result } = renderHook(() => useAuthenticatedImage('/places/p1/media/m1/file', 'tok'));

    expect(result.current.loading).toBe(true);
    expect(result.current.src).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledWith('/places/p1/media/m1/file', {
      headers: { Authorization: 'Bearer tok' },
    });
    expect(result.current.src).toBe('blob:a');
    expect(result.current.error).toBe(false);
  });

  it('thiếu url -> không gọi fetch, trạng thái rỗng không lỗi', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const { result } = renderHook(() => useAuthenticatedImage(null, 'tok'));

    await waitFor(() => expect(result.current).toEqual({ src: null, loading: false, error: false }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('thiếu accessToken -> không gọi fetch, trạng thái rỗng không lỗi', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const { result } = renderHook(() => useAuthenticatedImage('/places/p1/media/m1/file', undefined));

    await waitFor(() => expect(result.current).toEqual({ src: null, loading: false, error: false }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetch trả về lỗi HTTP (vd 401/403/404) -> trạng thái lỗi, không ném ngoại lệ', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;
    const { result } = renderHook(() => useAuthenticatedImage('/places/p1/media/m1/file', 'tok'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.src).toBeNull();
  });

  it('fetch ném lỗi mạng -> trạng thái lỗi, không ném ngoại lệ ra ngoài', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const { result } = renderHook(() => useAuthenticatedImage('/places/p1/media/m1/file', 'tok'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
  });

  it('đổi url -> thu hồi Object URL CŨ trước khi tải ảnh MỚI', async () => {
    global.fetch = mockFetchOk('first') as unknown as typeof fetch;
    const { result, rerender } = renderHook(({ url }) => useAuthenticatedImage(url, 'tok'), {
      initialProps: { url: '/places/p1/media/m1/file' },
    });
    await waitFor(() => expect(result.current.src).toBe('blob:first'));

    global.fetch = mockFetchOk('second') as unknown as typeof fetch;
    rerender({ url: '/places/p1/media/m2/file' });

    await waitFor(() => expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:first'));
    await waitFor(() => expect(result.current.src).toBe('blob:second'));
  });

  it('unmount -> thu hồi Object URL đang giữ, tránh rò rỉ bộ nhớ', async () => {
    global.fetch = mockFetchOk('x') as unknown as typeof fetch;
    const { result, unmount } = renderHook(() => useAuthenticatedImage('/places/p1/media/m1/file', 'tok'));
    await waitFor(() => expect(result.current.src).toBe('blob:x'));

    unmount();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:x');
  });
});
